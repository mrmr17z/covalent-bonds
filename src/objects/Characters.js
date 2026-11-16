// ============================================================================
//  الشخصيات ثلاثية الأبعاد (GLB) — تحميل، نسخ مستقلة بهيكل عظمي، حركات، معدات
//  سلامة إجرائية (نظارة + معطف مختبر مثبتة على العظام)، وIK لذراع يمنى.
//  إذا تعذّر التحميل تعود المشاهد تلقائيًا إلى الشخصيات الإجرائية القديمة.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_URLS } from '../assetsManifest.js';
import { sampleBody, buildLabCoat, fitGoggles, measurePenetration } from './Apparel.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class CharacterLibrary {
  constructor() { this.gltfs = {}; this.errors = []; }
  async load(onProgress = null) {
    const loader = new GLTFLoader();
    const keys = Object.keys(MODEL_URLS);
    let done = 0;
    await Promise.all(keys.map(async (k) => {
      try {
        const url = new URL(MODEL_URLS[k], document.baseURI).href;
        this.gltfs[k] = await loader.loadAsync(url);
      } catch (e) {
        this.errors.push(`${k}: ${e.message || e}`);
        console.warn('تعذّر تحميل الشخصية', k, e);
      }
      onProgress?.(++done / keys.length);
    }));
    return this;
  }
  has(k) { return !!this.gltfs[k]; }
  create(k) { return this.has(k) ? new Character(this.gltfs[k], k) : null; }
}

/** شخصية مستقلة: نسخة بهيكل عظمي خاص وخامات خاصة ومشغّل حركات */
export class Character extends THREE.Group {
  constructor(gltf, key) {
    super();
    this.key = key;
    this.model = cloneSkinned(gltf.scene);
    this.add(this.model);
    this.materials = [];
    this.model.traverse(o => {
      if (o.isMesh) {
        // الهندسة والصور مشتركة مع المكتبة: لا تُحرَّر عند الخروج من المشهد
        o.geometry.userData.shared = true;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) {
          if (o.material[k]) o.material[k].userData.shared = true;
        }
        o.material = o.material.clone();
        this.materials.push(o.material);
        o.frustumCulled = false; // الحركة قد تُخرج الشبكة من حدود وضعية الربط
      }
    });
    this.bones = {};
    this.model.traverse(o => { if (o.isBone) this.bones[o.name.replace(/^Bip0\d_?/, '')] = o; });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.userData.onDispose = () => this.dispose();
    this.clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
    this.current = null;
    this.armTarget = null;
    this.gear = {};
    this.play('idle', { fade: 0 });
    this.mixer.update(0);
    this.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model, true);
    this.height = box.max.y - box.min.y;
    this.scaleRef = this.height / 1.78;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current && this._then) this.play(this._then);
    });
  }

  bone(n) { return this.bones[n] || null; }
  hasClip(n) { return !!this.clips[n]; }

  /** تشغيل حركة مع انتقال ناعم؛ once=true تعود بعدها إلى then */
  play(name, { fade = 0.35, once = false, then = 'idle', timeScale = 1 } = {}) {
    const clip = this.clips[name];
    if (!clip) return false;
    const action = this.mixer.clipAction(clip);
    if (this.current === action && !once) return true;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.timeScale = timeScale;
    action.enabled = true;
    if (this.current && fade > 0) action.crossFadeFrom(this.current, fade, false);
    else if (this.current) this.current.stop();
    action.play();
    this.current = action;
    this.currentName = name;
    this._then = once ? then : null;
    return true;
  }

  setHighlight(hex) {
    for (const m of this.materials) if (m.emissive) m.emissive.setHex(hex);
    for (const g of Object.values(this.gear)) g?.traverse(o => { if (o.material?.emissive) o.material.emissive.setHex(hex); });
  }

  /** هدف لليد اليمنى كل إطار: fn() → { target: Vector3(عالمي), pole: Vector3(عالمي) } */
  setArmTarget(fn) { this.armTarget = fn; }

  update(dt) {
    this.mixer.update(dt);
    if (this.armTarget) {
      this.updateMatrixWorld(true);
      const t = this.armTarget(this);
      if (t) this.solveRightArm(t.target, t.pole);
    }
  }

  // ------------------------------------------------------------ IK بعظمتين
  _aim(bone, child, target) {
    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(false, false);
    const bp = bone.getWorldPosition(_a);
    const cur = child.getWorldPosition(_b).sub(bp).normalize();
    const des = _c.copy(target).sub(bp).normalize();
    const delta = _q.setFromUnitVectors(cur, des);
    const wq = bone.getWorldQuaternion(_q2);
    const nw = delta.multiply(wq);
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(pq.multiply(nw));
    bone.updateMatrixWorld(true);
  }
  solveRightArm(target, poleW) {
    const up = this.bones.R_UpperArm, fo = this.bones.R_Forearm, ha = this.bones.R_Hand;
    if (!up || !fo || !ha) return;
    const S = up.getWorldPosition(new THREE.Vector3());
    const E = fo.getWorldPosition(new THREE.Vector3());
    const H = ha.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E), b = E.distanceTo(H);
    const D = target.clone().sub(S);
    const d = THREE.MathUtils.clamp(D.length(), 0.05, a + b - 0.002);
    const dir = D.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const p = poleW.clone().sub(S);
    p.addScaledVector(dir, -p.dot(dir));
    if (p.lengthSq() < 1e-8) p.set(0, -1, 0);
    p.normalize();
    const elbow = S.clone().addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
    this._aim(up, fo, elbow);
    this._aim(fo, ha, S.clone().addScaledVector(dir, d));
  }

  /** نقاط مرجعية في الفضاء العالمي */
  worldOf(n) { const b = this.bones[n]; return b ? b.getWorldPosition(new THREE.Vector3()) : null; }
  forward() { return new THREE.Vector3(0, 0, 1).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion())); }
  right() { return new THREE.Vector3(-1, 0, 0).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion())); } // يمين الشخصية
  mouth() {
    const r = this.worldOf('RMouthCorner'), l = this.worldOf('LMouthCorner');
    if (r && l) return r.add(l).multiplyScalar(0.5);
    return this.worldOf('Head').add(new THREE.Vector3(0, 0.05, 0.1));
  }

  // ------------------------------------------------------------ معدات السلامة
  /** يجب استدعاؤها والشخصية في وضعها الأصلي (قبل إضافتها إلى المشهد) */
  setGear({ goggles = null, coat = null } = {}) {
    if (goggles !== null) {
      if (goggles && !this.gear.goggles) this.gear.goggles = this._buildGoggles();
      if (this.gear.goggles) this.gear.goggles.visible = goggles;
    }
    if (coat !== null) {
      if (coat && !this.gear.coat) this.gear.coat = this._buildCoat();
      if (this.gear.coat) this.gear.coat.visible = coat;
    }
  }

  /** يبني المعدات في الوضع المرجعي ثم يثبتها على العظام */
  _withRestPose(fn) {
    const parent = this.parent, pos = this.position.clone(), quat = this.quaternion.clone();
    // ملاحظة: لا نستخدم skeleton.pose() لأن العظمة الجذرية تحت عقدة مُصغّرة (0.01)
    // فيتضاعف التصغير؛ نبني المعدات في الوضعية الحالية وهي تتبع العظام بعد ذلك.
    parent?.remove(this);
    this.position.set(0, 0, 0); this.quaternion.identity();
    this.updateMatrixWorld(true);
    const out = fn();
    this.position.copy(pos); this.quaternion.copy(quat);
    parent?.add(this);
    this.updateMatrixWorld(true);
    return out;
  }

  _buildGoggles() {
    return this._withRestPose(() => {
      const g = fitGoggles(this, sampleBody(this));
      this.add(g);
      g.updateMatrixWorld(true);
      this.bones.Head.attach(g);
      return g;
    });
  }

  /** معطف مختبر طويل مُفصّل على الجسم + قميص وبنطال داكنان (شبكات مربوطة بالهيكل) */
  _buildCoat() {
    return this._withRestPose(() => {
      const g = buildLabCoat(this, sampleBody(this));
      this.model.add(g);
      return g;
    });
  }

  /** فحص الاختراق في الوضعية الحالية (للاختبارات) */
  measureFit() { return measurePenetration(this); }

  /** صندوق تصادم غير مرئي للتأشير على الشخصية */
  makeHitBox() {
    const w = 0.5 * this.scaleRef + 0.1, d = 0.45;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w, this.height, d), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = this.height / 2;
    this.add(hit);
    return hit;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
