// ============================================================================
//  بيئة المختبر الدائمة — أرضية، جدران، إضاءة، خزائن وأرفف، طاولات المحطات،
//  شاشة العرض، لافتات عربية. تُبنى مرة واحدة وتبقى بين المشاهد.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Panel } from '../ui/VRPanel.js';
import { drawText, fillRound, COLORS } from '../ui/text.js';
import { CONFIG } from '../config.js';
import { BRAND, drawLogo } from '../ui/brand.js';

export const BENCH_H = CONFIG.lab.benchHeight;

export const ZONES = {
  intro:  { origin: new THREE.Vector3(-5, 0, 0),    title: 'التهيئة',        num: '١', spawnZ: 0.95, pitch: -0.05 },
  safety: { origin: new THREE.Vector3(-5, 0, -5.2), title: 'محطة السلامة',    num: '١', spawnZ: 0.9,  pitch: -0.2 },
  hypo:   { origin: new THREE.Vector3(0, 0, 0),     title: 'الفرضية',        num: '٢', spawnZ: 0.55, pitch: -0.26 },
  exper:  { origin: new THREE.Vector3(5, 0, 0),     title: 'التجربة',        num: '٣', spawnZ: 0.55, pitch: -0.26 },
  concl:  { origin: new THREE.Vector3(0, 0, -5.2),  title: 'الاستنتاج',      num: '٤', spawnZ: 0.9,  pitch: -0.12 },
  exam:   { origin: new THREE.Vector3(5, 0, -5.2),  title: 'الاختبار الختامي', num: '٥', spawnZ: 0.85, pitch: -0.05 },
};

const _matCache = new Map();
const lam = (color, extra = {}) => {
  if (extra.map) return new THREE.MeshLambertMaterial({ color, ...extra });
  const key = color + JSON.stringify(extra);
  if (!_matCache.has(key)) _matCache.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return _matCache.get(key);
};

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export class Lab {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = 'Lab';
    this.obstacles = [];
    this.surfaces = [];
    this.zoneRoots = {};
    app.scene.add(this.root);
    this._lights();
    this._room();
    this._perimeter();
    this._zones();
    this._mergeStatic();
  }

  /** دمج الأجسام الثابتة ذات الخامة الواحدة في شبكة واحدة لتقليل Draw Calls على Quest */
  _mergeStatic() {
    this.root.updateMatrixWorld(true);
    const groups = new Map();
    this.root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.material.map || o.material.transparent) return;
      if (!o.geometry.index) return;
      const k = o.material.uuid;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    });
    let removed = 0;
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const geos = meshes.map(m => {
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, meshes[0].material);
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      for (const m of meshes) { m.parent.remove(m); m.geometry.dispose(); removed++; }
    }
    this.mergedCount = removed;
  }

  zone(name) { return ZONES[name]; }
  /** جذر محلي لمحتوى المشهد في محطة معينة */
  zoneRoot(name) {
    if (!this.zoneRoots[name]) {
      const g = new THREE.Group();
      g.name = 'zone_' + name;
      g.position.copy(ZONES[name].origin);
      this.app.scene.add(g);
      this.zoneRoots[name] = g;
    }
    return this.zoneRoots[name];
  }
  spawnOf(name) {
    const z = ZONES[name];
    return { pos: new THREE.Vector3(z.origin.x, 0, z.origin.z + z.spawnZ), yaw: 0, pitch: z.pitch };
  }

  _lights() {
    const s = this.app.scene;
    s.background = new THREE.Color(0xdfe6ee);
    s.fog = new THREE.Fog(0xdfe6ee, 14, 30);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa6b4, 1.9);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(-3, 8, 4);
    const fill = new THREE.DirectionalLight(0xcfe3ff, 0.5);
    fill.position.set(5, 4, -6);
    s.add(hemi, dir, fill);
  }

  _room() {
    const W = 16.4, D = 13, H = 3.4, cz = -2.7;
    // الأرضية: بلاط مختبر فاتح
    const floorTex = canvasTex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#c9d1d9'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const g = ctx.createLinearGradient(i * 256, j * 256, i * 256 + 256, j * 256 + 256);
        g.addColorStop(0, (i + j) % 2 ? '#cfd6de' : '#c4ccd5'); g.addColorStop(1, (i + j) % 2 ? '#c7cfd8' : '#bec7d0');
        ctx.fillStyle = g; ctx.fillRect(i * 256 + 2, j * 256 + 2, 252, 252);
      }
      ctx.strokeStyle = '#aab3bd'; ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, 256, 256); ctx.strokeRect(256, 0, 256, 256); ctx.strokeRect(0, 256, 256, 256); ctx.strokeRect(256, 256, 256, 256);
    }, [W / 1.2, D / 1.2]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lam(0xffffff, { map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, cz);
    this.root.add(floor);

    const wallTex = canvasTex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#e9eef3'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#dde4eb';
      for (let x = 0; x < w; x += 128) ctx.fillRect(x, 0, 2, h);
    }, [6, 1]);
    const wallMat = lam(0xffffff, { map: wallTex });
    const mkWall = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      m.position.set(x, H / 2, z); m.rotation.y = ry; this.root.add(m);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.03), lam(0x4a6078));
      base.position.set(x, 0.06, z); base.rotation.y = ry; base.translateZ(0.015); this.root.add(base);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.02), lam(0x2f8fd0));
      band.position.set(x, 1.15, z); band.rotation.y = ry; band.translateZ(0.01); this.root.add(band);
    };
    mkWall(W, 0, cz - D / 2, 0);
    mkWall(W, 0, cz + D / 2, Math.PI);
    mkWall(D, -W / 2, cz, Math.PI / 2);
    mkWall(D, W / 2, cz, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lam(0xf3f5f7));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, cz);
    this.root.add(ceil);
    // ألواح إضاءة سقفية
    const lightGeo = new THREE.BoxGeometry(1.4, 0.04, 0.5);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lights = new THREE.InstancedMesh(lightGeo, lightMat, 12);
    let k = 0;
    for (const x of [-5, 0, 5]) for (const z of [1.5, -1.5, -4.5, -7.5]) {
      lights.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x, H - 0.02, z));
    }
    this.root.add(lights);
    // نوافذ على الجدار الأيسر
    const winMat = new THREE.MeshBasicMaterial({ color: 0xbfe3ff });
    const frameMat = lam(0x8b98a6);
    for (const z of [-0.5, -4.5]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), winMat);
      win.position.set(-W / 2 + 0.02, 2.1, z); win.rotation.y = Math.PI / 2; this.root.add(win);
      for (const dz of [-1.2, 0, 1.2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.36, 0.05), frameMat);
        bar.position.set(-W / 2 + 0.04, 2.1, z + dz); this.root.add(bar);
      }
      for (const dy of [-0.65, 0.65]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.45), frameMat);
        bar.position.set(-W / 2 + 0.04, 2.1 + dy, z); this.root.add(bar);
      }
    }
    // ملصق الجدول الدوري على الجدار الخلفي
    const pt = new Panel({ width: 2.6, height: 1.4, ppm: 500, bg: '#f7f9fb', border: '#2f8fd0', draw: (ctx, w, h) => drawPeriodicPoster(ctx, w, h) });
    pt.position.set(-1.6, 2.15, cz - D / 2 + 0.02);
    this.root.add(pt);
    // لوحة شعار الأمد على الجدار الخلفي (مرئية من معظم المحطات)
    if (BRAND.logo) {
      const plaque = new Panel({
        width: 1.9, height: 0.82, ppm: 600, bg: '#ffffff', border: '#7c3aed', borderWidth: 10, radius: 40,
        draw: (ctx, w, h) => {
          ctx.fillStyle = '#7c3aed'; ctx.fillRect(0, h - 26, w, 26);
          const lh = h * 0.62, lw = (lh * BRAND.logo.width) / BRAND.logo.height;
          drawLogo(ctx, BRAND.logo, (w - lw) / 2, (h - 26 - lh) / 2, lh);
        },
      });
      plaque.position.set(1.7, 2.68, cz - D / 2 + 0.03);
      this.root.add(plaque);
      this.brandPlaque = plaque;
    }
    const sp = new Panel({ width: 1.3, height: 1.5, ppm: 500, bg: '#fff8e6', border: '#e0a100', draw: (ctx, w, h) => drawSafetyPoster(ctx, w, h) });
    sp.position.set(-W / 2 + 0.02, 1.9, -6.8); sp.rotation.y = Math.PI / 2;
    this.root.add(sp);
    // الباب
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.06), lam(0x5f7590));
    door.position.set(6.6, 1.1, cz + D / 2 - 0.03); this.root.add(door);
    const exitSign = new Panel({ width: 0.5, height: 0.18, ppm: 600, bg: '#167a3e', border: '#0e5a2c', draw: (ctx, w, h) => drawText(ctx, 'مخرج', w / 2, 14, { size: 60, weight: 800, align: 'center', color: '#fff' }) });
    exitSign.position.set(6.6, 2.45, cz + D / 2 - 0.04); exitSign.rotation.y = Math.PI;
    this.root.add(exitSign);
  }

  _perimeter() {
    const cabMat = lam(0x5b7086), topMat = lam(0x2b3440), doorMat = lam(0x6d8399);
    const addCounter = (x0, x1, z0, z1) => {
      const w = x1 - x0, d = z1 - z0;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.86, d), cabMat);
      body.position.set((x0 + x1) / 2, 0.43, (z0 + z1) / 2);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), topMat);
      top.position.set((x0 + x1) / 2, 0.88, (z0 + z1) / 2);
      this.root.add(body, top);
      this.obstacles.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
      return { body, top };
    };
    addCounter(-7.6, 7.6, -9.2, -8.55);     // الخلف
    addCounter(-8.2, -7.55, -8.5, -6.0);    // يسار خلفي
    addCounter(7.55, 8.2, -8.5, 2.2);       // يمين
    // أبواب الخزائن (خطوط زخرفية)
    for (let x = -7.2; x < 7.4; x += 0.6) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.7, 0.01), doorMat);
      d.position.set(x + 0.1, 0.43, -8.54); this.root.add(d);
    }
    // رفوف علوية وزجاجيات (Instancing)
    const shelfMat = lam(0xd5dde5);
    const shelves = [];
    for (const y of [1.55, 1.95]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.03, 0.3), shelfMat);
      s.position.set(0, y, -8.98); this.root.add(s); shelves.push(y);
    }
    const bottleGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.2, 10);
    bottleGeo.translate(0, 0.1, 0);
    const bottleMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, shininess: 80 });
    const count = 70;
    const bottles = new THREE.InstancedMesh(bottleGeo, bottleMat, count);
    const palette = [0x9ad8ff, 0xffc8a0, 0xb8f0c8, 0xf0f0f0, 0xd0b8ff, 0xffe28a, 0x8ad0c8];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let i = 0;
    for (const y of shelves) {
      for (let x = -7.1; x < 7.2 && i < count; x += 0.42) {
        const s = 0.75 + ((i * 37) % 10) / 20;
        m4.compose(new THREE.Vector3(x + ((i * 13) % 5) * 0.02, y + 0.015, -8.98), new THREE.Quaternion(), new THREE.Vector3(1, s, 1));
        bottles.setMatrixAt(i, m4);
        bottles.setColorAt(i, col.setHex(palette[i % palette.length]));
        i++;
      }
    }
    bottles.count = i;
    this.root.add(bottles);
    // دورق ومخبار على الطاولة الخلفية
    const flaskMat = new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.55, shininess: 100 });
    for (let k2 = 0; k2 < 6; k2++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 14, 1, true), flaskMat);
      f.position.set(-6 + k2 * 2.3, 1.0, -8.85); this.root.add(f);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10, 1, true), flaskMat);
      neck.position.set(-6 + k2 * 2.3, 1.14, -8.85); this.root.add(neck);
    }
    // خزانة شفط الأبخرة
    const hood = new THREE.Group();
    const hb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 0.75), lam(0xdfe5eb));
    hb.position.y = 1.55;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.75), new THREE.MeshPhongMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.35 }));
    glass.position.set(0, 1.5, 0.38);
    const hl = new Panel({ width: 0.9, height: 0.14, ppm: 600, bg: '#2b3440', border: '#2f8fd0', draw: (ctx, w, h) => drawText(ctx, 'خزانة شفط الأبخرة', w / 2, 14, { size: 50, weight: 700, align: 'center' }) });
    hl.position.set(0, 2.1, 0.385);
    hood.add(hb, glass, hl);
    hood.position.set(4.2, 0, -8.85);
    this.root.add(hood);
    // حوض غسيل
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.4), lam(0x9aa8b6));
    sink.position.set(1.8, 0.9, -8.85); this.root.add(sink);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 8, 16, Math.PI), lam(0xc0c8d0));
    tap.position.set(1.8, 1.0, -9.02); this.root.add(tap);
  }

  _bench(parent, width, depth = 0.8, z = -0.3, { color = 0xf4f6f8 } = {}) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), lam(color));
    top.position.y = BENCH_H - 0.02;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, BENCH_H - 0.12, depth - 0.12), lam(0x5b7086));
    body.position.y = (BENCH_H - 0.12) / 2 + 0.04;
    const kick = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.06, depth - 0.16), lam(0x2b3440));
    kick.position.y = 0.03;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.02), lam(0x2f8fd0));
    edge.position.set(0, BENCH_H - 0.03, depth / 2);
    g.add(top, body, kick, edge);
    g.position.z = z;
    parent.add(g);
    const o = parent.position;
    const rect = { minX: o.x - width / 2, maxX: o.x + width / 2, minZ: o.z + z - depth / 2, maxZ: o.z + z + depth / 2 };
    this.obstacles.push(rect);
    this.surfaces.push(this.app.physics.addSurface({ ...rect, y: BENCH_H, name: 'bench' }));
    return g;
  }

  _sign(parent, z, text, num) {
    const p = new Panel({
      width: 2.1, height: 0.3, ppm: 600, bg: '#13314f', border: '#39b6ff',
      draw: (ctx, w, h) => {
        fillRound(ctx, w - 160, 20, 130, h - 40, 30, '#39b6ff');
        drawText(ctx, num, w - 95, 22, { size: 90, weight: 800, align: 'center', color: '#0b2036' });
        ctx.font = `800 70px Cairo`;
        const size = Math.min(70, Math.floor(70 * (w - 220) / Math.max(1, ctx.measureText(text).width)));
        drawText(ctx, text, w - 190, (h - size * 1.3) / 2, { size, weight: 800, color: '#ffffff', maxW: w * 2 });
      },
    });
    p.position.set(0, 2.85, z);
    const rodMat = lam(0x9aa8b6);
    for (const dx of [-0.9, 0.9]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6), rodMat);
      r.position.set(dx, 3.2, z); parent.add(r);
    }
    parent.add(p);
    return p;
  }

  _spot(parent, z) {
    const s = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 36), new THREE.MeshBasicMaterial({ color: 0x2f8fd0, transparent: true, opacity: 0.55 }));
    s.rotation.x = -Math.PI / 2; s.position.set(0, 0.005, z);
    parent.add(s);
    const foot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 30), new THREE.MeshBasicMaterial({ color: 0x2f8fd0, transparent: true, opacity: 0.12 }));
    foot.rotation.x = -Math.PI / 2; foot.position.set(0, 0.004, z);
    parent.add(foot);
  }

  _zones() {
    const zr = n => { const g = new THREE.Group(); g.position.copy(ZONES[n].origin); this.root.add(g); return g; };
    // 1. التهيئة: شاشة كبيرة + منصة تحكم
    const intro = zr('intro');
    this._sign(intro, -2.45, 'التهيئة — ما الذي يمسك الذرات؟', ZONES.intro.num);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.64, 0.08), lam(0x1e2733));
    frame.position.set(0, 1.75, -2.3);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.66, 1.5), new THREE.MeshBasicMaterial({ color: 0x0a1626 }));
    screen.position.set(0, 1.75, -2.255);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), lam(0x3a4656));
    stand.position.set(0, 0.47, -2.3);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.5), lam(0x3a4656));
    foot.position.set(0, 0.025, -2.3);
    intro.add(frame, screen, stand, foot);
    this.introScreen = screen;
    // شعار صغير في زاوية الشاشة
    if (BRAND.logoLight) {
      const bug = new Panel({
        width: 0.42, height: 0.15, ppm: 900, bg: null, border: null,
        draw: (ctx, w, h) => drawLogo(ctx, BRAND.logoLight, 8, 6, h - 12),
      });
      bug.position.set(-1.08, 1.13, -2.25);
      intro.add(bug);
    }
    this.obstacles.push({ minX: -5.5, maxX: -4.5, minZ: -2.55, maxZ: -2.05 });
    // منصة (Lectern)
    const lect = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.4), lam(0x5b7086));
    lect.position.set(0, 0.5, -0.1);
    const lt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.5), lam(0x2b3440));
    lt.position.set(0, 1.02, -0.1); lt.rotation.x = 0.35;
    intro.add(lect, lt);
    this.obstacles.push({ minX: -5.35, maxX: -4.65, minZ: -0.35, maxZ: 0.15 });
    this._spot(intro, ZONES.intro.spawnZ);

    // 1ب. السلامة
    const saf = zr('safety');
    this._sign(saf, -2.2, 'محطة السلامة', '!');
    this._bench(saf, 1.6, 0.7, -1.3);
    this._spot(saf, ZONES.safety.spawnZ);

    // 2. الفرضية
    const hy = zr('hypo');
    this._sign(hy, -1.9, 'الفرضية — كيف نمثل الرابطة؟', ZONES.hypo.num);
    this._bench(hy, 2.0);
    this._spot(hy, ZONES.hypo.spawnZ);

    // 3. التجربة
    const ex = zr('exper');
    this._sign(ex, -1.9, 'التجربة — نبني الجزيئات', ZONES.exper.num);
    this._bench(ex, 2.6);
    this._spot(ex, ZONES.exper.spawnZ);

    // 4. الاستنتاج: منصة المستوى المجهري
    const co = zr('concl');
    this._sign(co, -2.6, 'الاستنتاج — شد الحبل', ZONES.concl.num);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.4, 0.04, 48), lam(0x1a2433));
    plat.position.set(0, 0.02, -0.9);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.33, 0.02, 6, 64), new THREE.MeshBasicMaterial({ color: 0x39b6ff }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.045, -0.9);
    co.add(plat, ring);
    this._spot(co, ZONES.concl.spawnZ);

    // 5. الاختبار: سبورة
    const exm = zr('exam');
    this._sign(exm, -2.6, 'الاختبار الختامي والاستخلاص', ZONES.exam.num);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.9, 0.06), lam(0x24493a));
    board.position.set(0, 1.6, -2.35);
    const bf = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 0.04), lam(0x9a7b55));
    bf.position.set(0, 1.6, -2.39);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.04, 0.1), lam(0x9a7b55));
    tray.position.set(0, 0.64, -2.3);
    exm.add(board, bf, tray);
    this.obstacles.push({ minX: 3.5, maxX: 6.5, minZ: -7.65, maxZ: -7.45 });
    this._spot(exm, ZONES.exam.spawnZ);
  }
}

function drawPeriodicPoster(ctx, w, h) {
  drawText(ctx, 'الجدول الدوري للعناصر', w / 2, 18, { size: 54, weight: 800, align: 'center', color: '#13314f' });
  const syms = {
    '1,1': 'H', '1,18': 'He', '2,1': 'Li', '2,2': 'Be', '2,13': 'B', '2,14': 'C', '2,15': 'N', '2,16': 'O', '2,17': 'F', '2,18': 'Ne',
    '3,1': 'Na', '3,2': 'Mg', '3,13': 'Al', '3,14': 'Si', '3,15': 'P', '3,16': 'S', '3,17': 'Cl', '3,18': 'Ar',
  };
  const cell = (w - 60) / 18, top = 100, ch = (h - top - 20) / 7;
  for (let p = 1; p <= 7; p++) for (let g = 1; g <= 18; g++) {
    if (p === 1 && g > 1 && g < 18) continue;
    if ((p === 2 || p === 3) && g > 2 && g < 13) continue;
    const x = 30 + (g - 1) * cell, y = top + (p - 1) * ch;
    const metal = g <= 2 || (g >= 3 && g <= 12) || (p >= 4 && g === 13);
    const color = g === 18 ? '#c9b8ff' : g === 17 ? '#b9f0c9' : metal ? '#ffd9b0' : '#bfe1ff';
    fillRound(ctx, x + 2, y + 2, cell - 4, ch - 4, 6, color, '#7a8ea3', 1.5);
    const s = syms[`${p},${g}`];
    if (s) drawText(ctx, s, x + cell / 2, y + ch * 0.22, { size: ch * 0.45, weight: 800, align: 'center', color: '#13314f', dir: 'ltr' });
  }
}

function drawSafetyPoster(ctx, w, h) {
  fillRound(ctx, 20, 20, w - 40, 110, 20, '#e0a100');
  drawText(ctx, 'قواعد السلامة', w / 2, 38, { size: 60, weight: 800, align: 'center', color: '#2b1d00' });
  const rules = ['ارتدِ النظارة الواقية دائمًا', 'ارتدِ معطف المختبر', 'استخدم الأدوات المناسبة (الكماشة)', 'لا تضع أي أداة في فمك', 'أعد الأدوات إلى أماكنها'];
  let y = 170;
  for (const r of rules) {
    fillRound(ctx, w - 90, y + 8, 50, 50, 25, '#167a3e');
    drawText(ctx, '✓', w - 65, y + 8, { size: 40, weight: 800, align: 'center', color: '#fff' });
    y = drawText(ctx, r, w - 110, y + 6, { size: 40, weight: 700, color: '#2b1d00', maxW: w - 160 }) + 26;
  }
}
