// ============================================================================
//  أدوات المختبر: صندوق النماذج (غطاء بمفصل حقيقي)، العصي، الزنابرك، الكماشة،
//  بطاقات الخطوات، ألواح الجداول، شخصيات الطلاب، والمعلم الافتراضي.
// ============================================================================
import * as THREE from 'three';
import { registerTarget } from '../core/registry.js';
import { BOND_GEO, BOND_MATS } from './Bond.js';
import { Panel } from '../ui/VRPanel.js';
import { drawText, fillRound, COLORS } from '../ui/text.js';

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const phong = (c, extra = {}) => new THREE.MeshPhongMaterial({ color: c, shininess: 60, ...extra });
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
hitMat.userData.shared = true;

function setEmissive(root, hex) {
  root.traverse(o => { if (o.material && o.material.emissive && !o.material.userData.shared) o.material.emissive.setHex(hex); });
}

// ---------------------------------------------------------------- صندوق النماذج
export function createModelBox(app, { onOpen = null } = {}) {
  const box = new THREE.Group();
  box.name = 'ModelBox';
  const W = 0.66, D = 0.42, H = 0.11, t = 0.012;
  const shell = phong(0x1f5f99);
  const inner = lam(0xe9eef3);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, t, D), inner);
  bottom.position.y = t / 2;
  box.add(bottom);
  const wall = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shell); m.position.set(x, y, z); box.add(m); };
  wall(W, H, t, 0, H / 2, D / 2 - t / 2);
  wall(W, H, t, 0, H / 2, -D / 2 + t / 2);
  wall(t, H, D, W / 2 - t / 2, H / 2, 0);
  wall(t, H, D, -W / 2 + t / 2, H / 2, 0);
  // فواصل الحجرات
  const div = lam(0xb9c6d3);
  for (const x of [-0.11, 0.11]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, H * 0.7, D - 0.03), div); m.position.set(x, H * 0.35, 0); box.add(m); }
  // لافتة أمامية
  const label = new Panel({ width: 0.5, height: 0.07, ppm: 1200, bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', draw: (ctx, w, h) => drawText(ctx, 'صندوق النماذج الجزيئية', w / 2, 8, { size: 52, weight: 800, align: 'center', color: '#ffffff' }) });
  label.position.set(0, H / 2, D / 2 + 0.002);
  box.add(label);
  // الغطاء بمفصل خلفي
  const hinge = new THREE.Group();
  hinge.position.set(0, H, -D / 2);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.014, D + 0.01), shell);
  lid.position.set(0, 0.007, D / 2);
  const lidTop = new Panel({ width: 0.4, height: 0.12, ppm: 1000, bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', draw: (ctx, w, h) => drawText(ctx, 'افتح الغطاء ⬆', w / 2, 20, { size: 60, weight: 800, align: 'center', color: '#ffffff' }) });
  lidTop.rotation.x = -Math.PI / 2; lidTop.position.set(0, 0.0145, D / 2);
  const handleMat = phong(0xffc145, { emissive: 0x000000 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.035), handleMat);
  handle.position.set(0, 0.018, D + 0.012);
  const handleHit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.1), hitMat);
  handleHit.position.copy(handle.position);
  hinge.add(lid, lidTop, handle, handleHit);
  box.add(hinge);
  const state = { angle: 0, target: 0, open: false, grabbed: false, moved: 0, a0: null, start: null };
  registerTarget(handleHit, {
    kind: 'handle',
    enabled: () => !state.open,
    onHover: (on) => handleMat.emissive.setHex(on ? 0x664400 : 0),
    onGrab: () => { state.grabbed = true; state.moved = 0; state.a0 = null; state.start = null; },
    onHeldUpdate: (p, hand) => {
      // الغطاء يدور حول المفصل الخلفي حسب حركة اليد (نسبةً إلى نقطة الإمساك)
      const local = box.worldToLocal(hand.clone());
      const hl = hinge.position;
      const ang = Math.atan2(local.y - hl.y, local.z - hl.z);
      if (state.a0 === null) { state.a0 = ang; state.start = local.clone(); }
      state.angle = THREE.MathUtils.clamp(ang - state.a0, 0, 1.95);
      state.moved = Math.max(state.moved, local.distanceTo(state.start));
    },
    onRelease: () => {
      state.grabbed = false;
      // نقرة بلا سحب تفتح الغطاء (وضع المعاينة)، والرفع لما بعد 40° يفتحه بالكامل
      if (state.angle > 0.7 || state.moved < 0.03) open();
      else state.target = 0;
      return true;
    },
    gravity: false,
  });
  function open() {
    if (state.open) return;
    state.open = true; state.target = 1.9;
    app.audio.play('open');
    onOpen?.();
  }
  box.userData.update = (dt) => {
    if (!state.grabbed) state.angle += (state.target - state.angle) * Math.min(1, dt * 7);
    hinge.rotation.x = -state.angle;
  };
  box.userData.state = state;
  box.userData.open = open;
  box.userData.size = { W, D, H };
  return box;
}

// ---------------------------------------------------------------- أدوات الربط والفك
function buildToolMesh(type) {
  const g = new THREE.Group();
  if (type === 'stick') {
    const mat = phong(0xeeeeee);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(BOND_GEO.stick, mat);
      s.rotation.x = Math.PI / 2; s.scale.set(1.2, 0.13, 1.2);
      s.position.set((i - 1) * 0.014, 0, 0);
      g.add(s);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.016, 0.02), phong(0x2f8fd0));
    g.add(band);
  } else if (type === 'spring') {
    const mat = phong(0xb8c4d0, { shininess: 120, specular: 0xffffff });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(BOND_GEO.spring, mat);
      s.rotation.x = Math.PI / 2; s.scale.set(1.3, 0.13, 1.3);
      s.position.set((i - 1) * 0.017, 0, 0);
      g.add(s);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.02), phong(0xe0a100));
    g.add(band);
  } else if (type === 'pliers') {
    const red = phong(0xc8323a), metal = phong(0x9aa6b2, { shininess: 120, specular: 0xffffff });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.007, 0.11, 10), red);
      h.rotation.x = Math.PI / 2; h.rotation.z = s * 0.12;
      h.position.set(s * 0.012, 0, 0.05);
      g.add(h);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), metal);
      jaw.position.set(s * 0.004, 0, -0.035); jaw.rotation.y = -s * 0.06;
      g.add(jaw);
    }
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 12), metal);
    pivot.rotation.z = Math.PI / 2; pivot.position.z = -0.004;
    g.add(pivot);
  }
  return g;
}

export const TOOL_INFO = {
  stick: { name: 'عصا', desc: 'رابطة أحادية' },
  spring: { name: 'زنبرك', desc: 'وصلة في رابطة متعددة' },
  pliers: { name: 'كماشة', desc: 'فك الروابط والذرات' },
};

/** أداة قابلة للالتقاط: تُثبَّت في اليد حتى يُضغط زر الإلغاء (B/Y أو Esc) */
export function createTool(app, type, homeParent, restPos, restRotY = 0) {
  const obj = new THREE.Group();
  obj.name = 'tool_' + type;
  const mesh = buildToolMesh(type);
  obj.add(mesh);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.17), hitMat);
  obj.add(hit);
  homeParent.add(obj);
  obj.position.copy(restPos);
  obj.rotation.y = restRotY;
  const handler = {
    kind: 'tool', toolType: type, object: obj, homeParent,
    restPos: restPos.clone(), restQuat: obj.quaternion.clone(),
    holdPose: {
      xr: { pos: new THREE.Vector3(0, -0.005, -0.07), rot: new THREE.Euler(0, 0, 0) },
      mouse: { pos: new THREE.Vector3(0.2, -0.17, -0.42), rot: new THREE.Euler(0.35, -0.5, 0) },
    },
    equippedBy: null,
    enabled: () => !handler.equippedBy,
    onHover: (on) => setEmissive(mesh, on ? 0x335566 : 0x000000),
    onEquip: () => {
      setEmissive(mesh, 0);
      app.toast(`أمسكت ${TOOL_INFO[type].name}: ${TOOL_INFO[type].desc}. اضغط B/Y (أو Esc) لإعادتها.`, 'info');
    },
  };
  registerTarget(hit, handler);
  return handler;
}

// ---------------------------------------------------------------- البطاقات
export function createCard(text, { index = null, color = '#13314f' } = {}) {
  const g = new THREE.Group();
  g.name = 'card';
  const W = 0.2, D = 0.12;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.006, D), lam(0xf7f9fb));
  g.add(base);
  const face = new Panel({
    width: W - 0.008, height: D - 0.008, ppm: 1600, bg: '#ffffff', border: color, radius: 22, borderWidth: 10,
    draw: (ctx, w, h) => {
      if (index != null) { fillRound(ctx, w - 90, 18, 70, 70, 35, color); drawText(ctx, String(index), w - 55, 22, { size: 50, weight: 800, align: 'center', color: '#fff' }); }
      drawText(ctx, text, w / 2, h * 0.32, { size: 46, weight: 800, align: 'center', color: '#13314f', maxW: w - 50, lineH: 1.35 });
    },
  });
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.0035;
  g.add(face);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, D), hitMat);
  g.add(hit);
  g.userData.hit = hit;
  g.userData.base = base;
  return g;
}

// ---------------------------------------------------------------- ألواح الجداول
export function createBoard(drawFn, { width = 0.36, height = 0.26, ppm = 1600, border = COLORS.accent } = {}) {
  const g = new THREE.Group();
  const p = new Panel({ width, height, ppm, bg: '#f7f9fb', border, radius: 18, borderWidth: 8, draw: drawFn, doubleSided: true });
  const back = new THREE.Mesh(new THREE.BoxGeometry(width + 0.01, height + 0.01, 0.006), lam(0x2b3440));
  back.position.z = -0.004;
  g.add(back, p);
  g.userData.panel = p;
  return g;
}

// ---------------------------------------------------------------- الشخصيات
const SKIN = 0xd9a77e;

/** شخصية طالب منخفضة التفاصيل (لا تؤثر على الأداء) */
export function createStudent({ coat = false, goggles = false, hair = 'short', shirt = 0x3b7dd8, pose = 'idle', hairColor = 0x2a1a10 } = {}) {
  const g = new THREE.Group();
  const skin = lam(SKIN);
  const pants = lam(0x2b3440);
  const shirtMat = lam(shirt);
  const coatMat = lam(0xf4f6f8);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.82, 10), pants);
    leg.position.set(s * 0.085, 0.41, 0); g.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), lam(0x1b1b1b));
    shoe.position.set(s * 0.085, 0.03, 0.04); g.add(shoe);
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.6, 14), shirtMat);
  torso.position.y = 1.12; g.add(torso);
  const coatMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.24, 0.85, 14, 1, true), coatMat);
  coatMesh.position.y = 1.0; coatMesh.visible = coat; g.add(coatMesh);
  coatMat.side = THREE.DoubleSide;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), skin);
  neck.position.y = 1.46; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), skin);
  head.position.y = 1.6; head.scale.set(1, 1.1, 1); g.add(head);
  const hairMat = lam(hairColor);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hairCap.position.y = 1.62; g.add(hairCap);
  if (hair === 'long') {
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 12, 1, true, Math.PI * 0.5, Math.PI), hairMat);
    back.position.set(0, 1.5, -0.01); hairMat.side = THREE.DoubleSide; g.add(back);
  }
  const gog = new THREE.Group();
  const lensMat = new THREE.MeshPhongMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.6, shininess: 120 });
  const goggleBand = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.008, 6, 24), lam(0x1f5f99));
  goggleBand.rotation.x = Math.PI / 2; goggleBand.position.y = 1.63;
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.03), lensMat);
  lens.position.set(0, 1.63, 0.105);
  gog.add(goggleBand, lens);
  gog.visible = goggles;
  g.add(gog);
  // الذراعان
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.22, 1.38, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.6, 8), coat ? coatMat : shirtMat);
    arm.position.y = -0.3;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
    hand.position.y = -0.62;
    shoulder.add(arm, hand);
    shoulder.rotation.z = s * 0.12;
    g.add(shoulder);
    arms.push({ shoulder, arm });
  }
  if (pose === 'mouth') {
    // يرفع اليد اليمنى نحو الفم ممسكًا زنبركًا
    const r = arms[0];
    const mouth = new THREE.Vector3(-0.02, 1.53, 0.16);
    const dir = mouth.clone().sub(r.shoulder.position).normalize();
    r.shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    r.shoulder.scale.set(1, 0.6, 1);
    const spring = new THREE.Mesh(BOND_GEO.spring, new THREE.MeshPhongMaterial({ color: 0xd0d8e0, shininess: 120, emissive: 0x222222 }));
    spring.scale.set(2.6, 0.13, 2.6); spring.rotation.z = Math.PI / 2;
    spring.position.set(0, 1.535, 0.13);
    g.add(spring);
    g.userData.spring = spring;
  }
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.45), hitMat);
  hit.position.y = 0.9;
  g.add(hit);
  g.userData = { ...g.userData, hit, coatMesh, goggles: gog, arms, coatMat, shirtMat, setHighlight: (c) => setEmissive(g, c) };
  // ذراعا المعطف تتغيران عند ارتداء المعطف
  g.userData.wearCoat = () => { coatMesh.visible = true; arms.forEach(a => { a.arm.material = coatMat; }); };
  return g;
}

/** المعلم الافتراضي: شخصية منخفضة التفاصيل مع فقاعة كلام وحركة خفيفة */
export class Teacher extends THREE.Group {
  constructor(app) {
    super();
    this.app = app;
    this.name = 'Teacher';
    // شخصية GLB (المحاضر) إن توفرت، وإلا الشخصية الإجرائية
    this.char = app.characters?.create('teacher') || null;
    let body;
    if (this.char) {
      body = this.char;
      const tag = new Panel({ width: 0.12, height: 0.04, ppm: 2000, bg: '#2f8fd0', border: '#ffffff', radius: 12, borderWidth: 3, draw: (ctx, w, h) => drawText(ctx, 'المعلم', w / 2, 10, { size: 40, weight: 800, align: 'center', color: '#fff' }) });
      tag.position.set(0.1, 1.33, 0.155);
      tag.rotation.y = 0.12;
      body.add(tag);
    } else {
      body = createStudent({ coat: true, goggles: false, hair: 'short', shirt: 0x2f6f9f, hairColor: 0x3a3a3a });
      const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), lam(0x111111));
      glasses.position.set(-0.04, 1.62, 0.108);
      const g2 = glasses.clone(); g2.position.x = 0.04;
      body.add(glasses, g2);
      const tag = new Panel({ width: 0.12, height: 0.04, ppm: 2000, bg: '#2f8fd0', border: '#ffffff', radius: 12, borderWidth: 3, draw: (ctx, w, h) => drawText(ctx, 'المعلم', w / 2, 10, { size: 40, weight: 800, align: 'center', color: '#fff' }) });
      tag.position.set(0.09, 1.28, 0.22);
      body.add(tag);
      body.userData.hit.visible = false;
    }
    this.body = body;
    this.add(body);
    this.text = '';
    this.bubble = new Panel({ width: 1.0, height: 0.36, bg: 'rgba(255,255,255,0.96)', border: '#2f8fd0', draw: (ctx, w, h) => this._drawBubble(ctx, w, h) });
    this.bubble.position.set(0, 2.15, 0);
    this.bubble.visible = false;
    this.add(this.bubble);
    this.text = '';
    this.talking = false;
    this.t = 0;
    this._token = 0;
  }
  _drawBubble(ctx, w, h) {
    drawText(ctx, 'المعلم', w - 30, 16, { size: 30, weight: 800, color: '#2f8fd0' });
    drawText(ctx, this.text, w - 30, 60, { size: 33, weight: 600, color: '#13314f', maxW: w - 60, lineH: 1.45, maxLines: 6 });
  }
  placeAt(parent, pos, faceTarget = null) {
    parent.add(this);
    this.position.copy(pos);
    if (faceTarget) {
      const ang = Math.atan2(faceTarget.x - pos.x, faceTarget.z - pos.z);
      this.rotation.y = ang;
    }
    this.visible = true;
  }
  /** يعرض النص دائمًا، ويقرؤه بصوت عربي إن توفر */
  async say(text, { minMs = 0 } = {}) {
    const token = ++this._token;
    this.text = text;
    const lines = Math.ceil(text.length / 38);
    const h = Math.min(0.62, 0.16 + lines * 0.052);
    if (Math.abs(h - this.bubble.height) > 0.02) {
      const old = this.bubble;
      this.bubble = new Panel({ width: 1.0, height: h, bg: 'rgba(255,255,255,0.96)', border: '#2f8fd0', draw: (ctx, w, hh) => this._drawBubble(ctx, w, hh) });
      this.bubble.position.copy(old.position);
      this.remove(old); old.dispose();
      this.add(this.bubble);
    } else this.bubble.redraw();
    this.bubble.position.set(-0.35, 1.9 + h / 2, 0.05);
    this.bubble.visible = true;
    this.talking = true;
    const subEl = document.getElementById('subtitle');
    if (subEl) { subEl.textContent = 'المعلم: ' + text; subEl.classList.add('show'); }
    const start = performance.now();
    await this.app.audio.speak(text);
    const rest = minMs - (performance.now() - start);
    if (rest > 0) await new Promise(r => setTimeout(r, rest));
    if (token === this._token) this.talking = false;
    return token === this._token;
  }
  hideBubble() {
    this.bubble.visible = false;
    document.getElementById('subtitle')?.classList.remove('show');
  }
  /** ردّة فعل قصيرة: 'nod' عند الإجابة الصحيحة، 'shake' عند الخطأ */
  react(kind) {
    if (!this.char || !this.visible || this.talking) return;
    const near = this.app.camera.getWorldPosition(new THREE.Vector3()).distanceTo(this.getWorldPosition(new THREE.Vector3())) < 6;
    if (near) this.char.play(kind, { once: true, fade: 0.25 });
  }
  update(dt) {
    this.t += dt;
    if (this.char) {
      if (!this.visible) return;
      const busy = this.char._then && this.char.current?.isRunning();
      if (this.talking) {
        if (!this.char.currentName?.startsWith('talk')) this.char.play(this._talkClip = this._talkClip === 'talk1' ? 'talk2' : 'talk1');
      } else if (!busy && this.char.currentName !== 'idle') this.char.play('idle', { fade: 0.5 });
      this.char.update(dt);
    } else {
      const arms = this.body.userData.arms;
      this.body.position.y = Math.sin(this.t * 1.7) * 0.004;
      if (this.talking) {
        arms[1].shoulder.rotation.x = -0.5 + Math.sin(this.t * 3.2) * 0.25;
        arms[1].shoulder.rotation.z = 0.25;
      } else {
        arms[1].shoulder.rotation.x *= 0.9;
        arms[1].shoulder.rotation.z = 0.12;
      }
    }
    // الفقاعة تواجه الطالب
    const cam = this.app.camera.getWorldPosition(new THREE.Vector3());
    const bp = this.bubble.getWorldPosition(new THREE.Vector3());
    const yaw = Math.atan2(cam.x - bp.x, cam.z - bp.z);
    this.bubble.rotation.y = yaw - this.rotation.y - (this.parent ? new THREE.Euler().setFromQuaternion(this.parent.getWorldQuaternion(new THREE.Quaternion())).y : 0);
  }
}

// ---------------------------------------------------------------- شخصيات محطة السلامة
const SAFETY_KEYS = { noGear: 'boy1', correct: 'boy2', teeth: 'girl1' };

/**
 * شخصية لمحطة السلامة بواجهة موحّدة:
 * { obj, hit, setHighlight(hex), update(dt), fix({ pliers, springSpotWorld }) }
 * تستخدم نماذج GLB إن توفرت، وإلا الشخصيات الإجرائية.
 */
export function createSafetyFigure(app, role) {
  const ch = app.characters?.create(SAFETY_KEYS[role]) || null;
  return ch ? glbSafetyFigure(app, role, ch) : proceduralSafetyFigure(role);
}

function makeSpring() {
  const m = new THREE.Mesh(BOND_GEO.spring, new THREE.MeshPhongMaterial({ color: 0xd0d8e0, shininess: 120, emissive: 0x222222 }));
  m.scale.set(2.4, 0.11, 2.4);
  return m;
}

function glbSafetyFigure(app, role, ch) {
  if (role !== 'noGear') ch.setGear({ goggles: true, coat: true });
  const hit = ch.makeHitBox();
  const fig = { obj: ch, hit, character: ch, setHighlight: (h) => ch.setHighlight(h), update: (dt) => ch.update(dt) };
  const V = THREE.Vector3;
  if (role === 'teeth') {
    // اليد اليمنى عند الفم ممسكة بزنبرك (IK)
    ch.setArmTarget((c) => ({
      target: c.mouth().addScaledVector(c.forward(), 0.07).addScaledVector(c.right(), 0.02).add(new V(0, -0.02, 0)),
      pole: c.worldOf('R_UpperArm').addScaledVector(c.right(), 0.35).add(new V(0, -0.45, 0)).addScaledVector(c.forward(), -0.15),
    }));
    ch.update(0);
    const spring = makeSpring();
    spring.position.copy(ch.mouth().addScaledVector(ch.forward(), 0.035));
    spring.quaternion.setFromUnitVectors(new V(0, 1, 0), ch.right());
    ch.add(spring);
    spring.updateMatrixWorld(true);
    ch.bone('R_Hand').attach(spring);
    fig.spring = spring;
  }
  fig.wearGoggles = () => { ch.setGear({ goggles: true }); ch.play('look', { once: true }); };
  fig.headWorld = () => {
    const re = ch.worldOf('REye'), le = ch.worldOf('LEye');
    return re && le ? re.add(le).multiplyScalar(0.5) : ch.worldOf('Head');
  };
  fig.fix = ({ pliers = null, springSpotWorld = null } = {}) => {
    if (role === 'noGear') {
      // المعطف يُلبس فورًا؛ النظارة يلبسها الطالب لزميله بيده (التقاط وإفلات قرب رأسه)
      ch.setGear({ coat: true });
    } else if (role === 'teeth') {
      // الزنبرك يوضع على الطاولة والكماشة في اليد
      if (fig.spring && springSpotWorld) {
        app.scene.attach(fig.spring);
        fig.spring.position.copy(springSpotWorld);
        fig.spring.quaternion.setFromUnitVectors(new V(0, 1, 0), new V(1, 0, 0));
        ch.parent.attach(fig.spring);
      }
      ch.setArmTarget((c) => ({
        target: c.worldOf('Spine2').addScaledVector(c.forward(), 0.3).addScaledVector(c.right(), 0.1).add(new V(0, -0.12, 0)),
        pole: c.worldOf('R_UpperArm').addScaledVector(c.right(), 0.3).add(new V(0, -0.5, 0)).addScaledVector(c.forward(), -0.25),
      }));
      ch.update(0);
      if (pliers) {
        pliers.parent?.remove(pliers);
        const hand = ch.bone('R_Hand');
        app.scene.add(pliers);
        pliers.position.copy(hand.getWorldPosition(new V()).addScaledVector(ch.forward(), 0.05));
        pliers.quaternion.copy(ch.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
        pliers.updateMatrixWorld(true);
        hand.attach(pliers);
      }
    }
  };
  return fig;
}

function proceduralSafetyFigure(role) {
  const opts = {
    noGear: { coat: false, goggles: false, shirt: 0xc0392b, hair: 'short' },
    correct: { coat: true, goggles: true, shirt: 0x2e86c1, hair: 'short', hairColor: 0x4a2f1a },
    teeth: { coat: true, goggles: true, shirt: 0x8e44ad, hair: 'long', pose: 'mouth', hairColor: 0x1b1008 },
  }[role];
  const f = createStudent(opts);
  const fig = { obj: f, hit: f.userData.hit, setHighlight: (h) => f.userData.setHighlight(h), update: () => {} };
  fig.wearGoggles = () => { f.userData.goggles.visible = true; };
  fig.headWorld = () => f.localToWorld(new THREE.Vector3(0, 1.62, 0.1));
  fig.fix = ({ pliers = null } = {}) => {
    if (role === 'noGear') { f.userData.wearCoat(); }
    if (role === 'teeth') {
      const sp = f.userData.spring;
      if (sp) { sp.position.set(-0.05, 0.95, 0.62); sp.scale.set(2.2, 0.11, 2.2); }
      const sh = f.userData.arms[0].shoulder;
      sh.quaternion.setFromEuler(new THREE.Euler(-0.9, 0, -0.15));
      sh.scale.set(1, 1, 1);
      if (pliers) {
        pliers.parent?.remove(pliers);
        f.add(pliers);
        pliers.position.set(-0.2, 0.97, 0.5);
        pliers.rotation.set(0, Math.PI / 2, 0);
      }
    }
  };
  return fig;
}
