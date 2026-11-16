// ============================================================================
//  مدير الفيزياء الخفيف — جاذبية وهبوط على الأسطح الأفقية (الطاولات، الصندوق، الأرض).
//  اخترنا محركًا مخصصًا خفيفًا بدل Rapier/Cannon لأن التفاعلات المطلوبة (إفلات
//  واستقرار على سطح) لا تحتاج محاكاة أجسام صلبة كاملة، وهذا يوفّر الأداء على Quest 3.
// ============================================================================
import * as THREE from 'three';

const G = 9.81;
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

export class PhysicsManager {
  constructor(app) {
    this.app = app;
    this.surfaces = new Set();      // {minX,maxX,minZ,maxZ,y}
    this.bodies = new Map();        // obj -> state
    this.addSurface({ minX: -50, maxX: 50, minZ: -50, maxZ: 50, y: 0, name: 'floor' });
  }
  /** سطح أفقي بإحداثيات عالمية */
  addSurface(s) { this.surfaces.add(s); return s; }
  removeSurface(s) { this.surfaces.delete(s); }

  /** أعلى سطح تحت النقطة (x,z) لا يعلو bottom + tolerance */
  surfaceBelow(x, z, bottom, tol = 0.06) {
    let best = -Infinity;
    for (const s of this.surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (s.y <= bottom + tol && s.y > best) best = s.y;
    }
    return best === -Infinity ? 0 : best;
  }

  /** يبدأ إسقاط الجسم حتى يستقر على السطح */
  drop(obj, { onRest = null, home = null } = {}) {
    obj.updateMatrixWorld(true);
    _box.setFromObject(obj);
    if (_box.isEmpty()) return;
    obj.getWorldPosition(_v);
    const cx = (_box.min.x + _box.max.x) / 2, cz = (_box.min.z + _box.max.z) / 2;
    const bottom = _box.min.y;
    const target = this.surfaceBelow(cx, cz, bottom);
    this.bodies.set(obj, { vel: 0, bottom, target, onRest, home });
  }
  stop(obj) { this.bodies.delete(obj); }
  isFalling(obj) { return this.bodies.has(obj); }

  update(dt) {
    for (const [obj, b] of this.bodies) {
      if (!obj.parent) { this.bodies.delete(obj); continue; }
      let dy;
      if (b.bottom < b.target) {           // تداخل مع السطح: ارفعه فورًا
        dy = b.target - b.bottom;
        b.bottom = b.target;
      } else {
        b.vel = Math.min(b.vel + G * dt, 6);
        const nb = Math.max(b.target, b.bottom - b.vel * dt);
        dy = nb - b.bottom;
        b.bottom = nb;
      }
      obj.position.y += dy; // الآباء مسطحون (بلا ميلان/تحجيم) لذا الإزاحة العالمية = المحلية
      if (b.bottom <= b.target + 1e-4) {
        this.bodies.delete(obj);
        if (b.vel > 0.6) this.app.audio?.play('land');
        b.onRest?.(obj);
      }
    }
  }
}
