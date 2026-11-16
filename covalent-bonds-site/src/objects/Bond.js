// الروابط: عصا (أحادية) أو زنبركات (وصلة لكل زنبرك) — تتبع مواضع الذرات واتجاهاتها
import * as THREE from 'three';

const shared = (x) => { x.userData.shared = true; return x; };

function helixGeometry() {
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const turns = 9, r = 0.0058;
      const a = t * turns * Math.PI * 2;
      return target.set(Math.cos(a) * r, t - 0.5, Math.sin(a) * r);
    }
  }
  return new THREE.TubeGeometry(new Helix(), 160, 0.0017, 5, false);
}

export const BOND_GEO = {
  stick: shared(new THREE.CylinderGeometry(0.0058, 0.0058, 1, 12)),
  thin: shared(new THREE.CylinderGeometry(0.0034, 0.0034, 1, 8)),
  spring: shared(helixGeometry()),
  springCore: shared(new THREE.CylinderGeometry(0.0062, 0.0062, 1, 8)), // هدف تفاعل غير مرئي
};
export const BOND_MATS = {
  stick: shared(new THREE.MeshPhongMaterial({ color: 0xe8e8e8, shininess: 40 })),
  spring: shared(new THREE.MeshPhongMaterial({ color: 0xb8c4d0, shininess: 120, specular: 0xffffff })),
  hover: shared(new THREE.MeshBasicMaterial({ color: 0x6fe3ff })),
  hit: shared(new THREE.MeshBasicMaterial({ visible: false })),
  staticStick: shared(new THREE.MeshPhongMaterial({ color: 0xd9d9d9, shininess: 30 })),
};

const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _mid = new THREE.Vector3();

export class BondView {
  constructor(a, b, order = 1, kind = 'stick') {
    this.a = a; this.b = b; this.order = order; this.kind = kind;
    this.group = new THREE.Group();
    this.group.name = 'bond';
    this.visuals = [];
    this.hitMesh = null;
    this.handler = null;
    this.hover = false;
  }
  involves(atom) { return this.a === atom || this.b === atom; }
  other(atom) { return this.a === atom ? this.b : this.a; }

  rebuild(registerFn, unregisterFn) {
    for (const v of this.visuals) this.group.remove(v);
    if (this.hitMesh) { unregisterFn?.(this.hitMesh); this.group.remove(this.hitMesh); }
    this.visuals = [];
    const n = this.kind === 'stick' ? 1 : this.order;
    for (let i = 0; i < n; i++) {
      const m = this.kind === 'stick'
        ? new THREE.Mesh(BOND_GEO.stick, BOND_MATS.stick)
        : new THREE.Mesh(BOND_GEO.spring, BOND_MATS.spring);
      this.visuals.push(m);
      this.group.add(m);
    }
    this.hitMesh = new THREE.Mesh(BOND_GEO.springCore, BOND_MATS.hit);
    this.hitMesh.scale.x = this.hitMesh.scale.z = this.order >= 2 ? 3.2 : 1.6;
    this.group.add(this.hitMesh);
    if (this.handler) registerFn?.(this.hitMesh, this.handler);
    this.setHover(this.hover);
    this.updateTransform();
  }

  setHover(on) {
    this.hover = on;
    for (const v of this.visuals) v.material = on ? BOND_MATS.hover : (this.kind === 'stick' ? BOND_MATS.stick : BOND_MATS.spring);
  }

  /** يحسب مواضع الوصلات بين الذرتين (في فضاء مجموعة الجزيء) */
  updateTransform() {
    const pa = this.a.root.position, pb = this.b.root.position;
    _d.subVectors(pb, pa);
    const L = _d.length();
    if (L < 1e-5) return;
    _d.divideScalar(L);
    const start = this.a.r * 0.82, end = L - this.b.r * 0.82;
    const len = Math.max(0.002, end - start);
    _mid.copy(pa).addScaledVector(_d, (start + end) / 2);
    // متجه عمودي لفصل الوصلات المتعددة
    _p.crossVectors(_d, Math.abs(_d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    const n = this.visuals.length;
    const gap = n === 2 ? 0.0095 : 0.0125;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, _d);
    this.visuals.forEach((m, i) => {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * gap * (n === 2 ? 2 : 1);
      m.position.copy(_mid).addScaledVector(_p, off);
      m.quaternion.copy(q);
      m.scale.set(1, len, 1);
    });
    if (this.hitMesh) {
      this.hitMesh.position.copy(_mid);
      this.hitMesh.quaternion.copy(q);
      this.hitMesh.scale.y = len;
    }
  }
}
