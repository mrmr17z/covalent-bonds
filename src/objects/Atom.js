// الكرات الذرية: كرة + فتحات اتصال حقيقية (تُستهلك عند الربط) + هالة تمييز
import * as THREE from 'three';
import { ELEMENTS, idealDirections } from '../chemistryEngine.js';

const shared = (x) => { x.userData.shared = true; return x; };

export const GEO = {
  sphere: shared(new THREE.SphereGeometry(1, 28, 20)),
  sphereLow: shared(new THREE.SphereGeometry(1, 12, 8)),
  hole: shared(new THREE.CylinderGeometry(0.0078, 0.0078, 0.006, 16)),
  holeRim: shared(new THREE.TorusGeometry(0.0085, 0.0018, 6, 16)),
};
const ELEMENT_MATS = {};
export function elementMaterial(el) {
  if (!ELEMENT_MATS[el]) {
    ELEMENT_MATS[el] = shared(new THREE.MeshPhongMaterial({ color: ELEMENTS[el].color, shininess: 70, specular: 0x444444 }));
  }
  return ELEMENT_MATS[el];
}
export const MATS = {
  hole: shared(new THREE.MeshBasicMaterial({ color: 0x050505 })),
  holeRim: shared(new THREE.MeshLambertMaterial({ color: 0x888888 })),
  haloHover: shared(new THREE.MeshBasicMaterial({ color: 0x6fe3ff, side: THREE.BackSide, transparent: true, opacity: 0.55, depthWrite: false })),
  haloSuccess: shared(new THREE.MeshBasicMaterial({ color: 0x45ff9a, side: THREE.BackSide, transparent: true, opacity: 0.65, depthWrite: false })),
  haloPreview: shared(new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.BackSide, transparent: true, opacity: 0.7, depthWrite: false })),
  haloError: shared(new THREE.MeshBasicMaterial({ color: 0xff6b6b, side: THREE.BackSide, transparent: true, opacity: 0.7, depthWrite: false })),
};

const LABEL_TEX = {};
function labelTexture(el) {
  if (!LABEL_TEX[el]) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(10,18,30,0.78)';
    ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = "800 64px 'Segoe UI', Arial"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(el, 64, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.userData.shared = true;
    LABEL_TEX[el] = shared(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  }
  return LABEL_TEX[el];
}

let NEXT_ID = 1;
const UP = new THREE.Vector3(0, 1, 0);

export class AtomView {
  constructor(el, { label = true } = {}) {
    this.id = NEXT_ID++;
    this.el = el;
    this.def = ELEMENTS[el];
    this.r = this.def.radius;
    this.root = new THREE.Group();
    this.root.name = 'atom_' + el;
    this.ball = new THREE.Mesh(GEO.sphere, elementMaterial(el));
    this.ball.scale.setScalar(this.r);
    this.halo = new THREE.Mesh(GEO.sphere, MATS.haloHover);
    this.halo.scale.setScalar(this.r * 1.25);
    this.halo.visible = false;
    this.root.add(this.ball, this.halo);
    this.holes = [];
    for (let i = 0; i < this.def.valence; i++) {
      const h = new THREE.Group();
      const disc = new THREE.Mesh(GEO.hole, MATS.hole);
      const rim = new THREE.Mesh(GEO.holeRim, MATS.holeRim);
      rim.rotation.x = Math.PI / 2;
      h.add(disc, rim);
      this.root.add(h);
      this.holes.push(h);
    }
    if (label) {
      this.label = new THREE.Sprite(labelTexture(el));
      this.label.scale.setScalar(0.03);
      this.label.position.set(0, this.r + 0.024, 0);
      this.root.add(this.label);
    }
    this.molecule = null;
    this.preview = false;
    // اتجاهات الفتحات الافتراضية للذرة الحرة
    const sn = this.def.valence + this.def.lonePairs;
    this.setHoleDirs(idealDirections(Math.min(4, sn)).slice(0, this.def.valence).map(a => new THREE.Vector3(...a)));
  }
  /** يضع الفتحات الحرة في الاتجاهات المعطاة ويخفي المستهلكة */
  setHoleDirs(dirs) {
    this.holes.forEach((h, i) => {
      const d = dirs[i];
      if (!d) { h.visible = false; return; }
      h.visible = true;
      h.position.copy(d).multiplyScalar(this.r * 0.985);
      h.quaternion.setFromUnitVectors(UP, d);
    });
  }
  setHalo(kind) {
    if (!kind) { this.halo.visible = false; return; }
    this.halo.visible = true;
    this.halo.material = kind === 'success' ? MATS.haloSuccess : kind === 'preview' ? MATS.haloPreview : kind === 'error' ? MATS.haloError : MATS.haloHover;
  }
  worldPos(out = new THREE.Vector3()) { return this.root.getWorldPosition(out); }
}
