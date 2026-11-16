// ============================================================================
//  التحكم بحركة اللاعب
//  VR: الانتقال الفوري (Teleport) افتراضيًا بقوس ومؤشر أرضي، دوران متقطع،
//      وحركة سلسة اختيارية. ضمن حدود المختبر وتجنّب الأثاث.
//  المعاينة: WASD للمشي، السحب بالزر الأيمن أو الأسهم للنظر.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class PlayerController {
  constructor(app) {
    this.app = app;
    this.rig = app.vr.rig;
    this.camera = app.camera;
    this.mode = CONFIG.locomotion.defaultMode;
    this.bounds = { ...CONFIG.lab.bounds };
    this.obstacles = [];
    this.desktopPitch = 0;
    this.keys = new Set();
    this.dragLook = null;
    this.snapReady = new Map();
    this.teleport = { active: false, pointer: null, valid: false, target: new THREE.Vector3() };
    this._buildTeleportVisuals();
    this._setupDesktop();
    this.resetDesktopCamera();
  }

  setMode(m) { this.mode = m; }
  toggleMode() { this.setMode(this.mode === 'teleport' ? 'smooth' : 'teleport'); return this.mode; }

  resetDesktopCamera() {
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.set(this.desktopPitch, 0, 0, 'YXZ');
  }

  // -------------------------------------------------------------- الإعداد
  _buildTeleportVisuals() {
    const N = 48;
    this.arcPositions = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.arcPositions, 3));
    this.arc = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x5cf0a0, transparent: true, opacity: 0.9 }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arcN = N;
    const ring = new THREE.Group();
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 40), new THREE.MeshBasicMaterial({ color: 0x5cf0a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    r1.rotation.x = -Math.PI / 2;
    const r2 = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ color: 0x5cf0a0, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    r2.rotation.x = -Math.PI / 2;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 3), r1.material);
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.01, -0.33);
    ring.add(r1, r2, arrow);
    ring.position.y = 0.01;
    ring.visible = false;
    this.marker = ring;
    this.app.scene.add(this.arc, ring);
  }

  _setupDesktop() {
    const el = this.app.vr.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) { this.dragLook = { x: e.clientX, y: e.clientY }; el.setPointerCapture?.(e.pointerId); }
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragLook || this.app.vr.presenting) return;
      const dx = e.clientX - this.dragLook.x, dy = e.clientY - this.dragLook.y;
      this.dragLook = { x: e.clientX, y: e.clientY };
      this.rig.rotation.y -= dx * 0.0042;
      this.desktopPitch = THREE.MathUtils.clamp(this.desktopPitch - dy * 0.0035, -1.2, 1.2);
    });
    window.addEventListener('pointerup', (e) => { if (e.button === 2 || e.button === 1) this.dragLook = null; });
    // نقر مزدوج على الأرض: الانتقال إلى تلك النقطة (وضع المعاينة)
    el.addEventListener('dblclick', (e) => {
      if (this.app.vr.presenting || !this.app.started) return;
      if (this.app.interaction.mouse.hoverHandler || this.app.interaction.mouse.held) return; // نقر على زر أو جسم
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, this.camera);
      const d = rc.ray.direction, o = rc.ray.origin;
      if (d.y > -0.02) return;
      const t = -o.y / d.y;
      const x = o.x + d.x * t, z = o.z + d.z * t;
      if (t > 12 || !this.isWalkable(x, z)) { this.app.toast('لا يمكن الوقوف هنا.', 'warn'); return; }
      this.walkTarget = new THREE.Vector3(x, 0, z);
    });
  }

  // -------------------------------------------------------------- الحدود
  setObstacles(list) { this.obstacles = list; }
  isWalkable(x, z, margin = 0.22) {
    const b = this.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    for (const o of this.obstacles) {
      if (x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin) return false;
    }
    return true;
  }

  headWorld(out = new THREE.Vector3()) { return this.camera.getWorldPosition(out); }

  /** ينقل اللاعب بحيث يقف رأسه عند (x,z) ويتجه نحو yaw (0 = نحو −Z) */
  teleportTo(pos, yaw = null, pitch = null) {
    if (pitch !== null && !this.app.vr.presenting) {
      this.desktopPitch = pitch;
      this.camera.rotation.set(pitch, 0, 0, 'YXZ');
    }
    const headLocal = this.camera.position.clone();
    if (yaw !== null) {
      // اتجاه الرأس داخل المنصة (في VR يتحكم به المستخدم)
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      const headYaw = this.app.vr.presenting ? e.y : 0;
      this.rig.rotation.y = yaw - headYaw;
    }
    const off = new THREE.Vector3(headLocal.x, 0, headLocal.z).applyAxisAngle(UP, this.rig.rotation.y);
    this.rig.position.set(pos.x - off.x, 0, pos.z - off.z);
    this.rig.updateMatrixWorld(true);
  }

  /** نقل بحركة الرأس فقط (للانتقال الفوري) */
  _teleportHeadTo(x, z) {
    const head = this.headWorld(_v);
    this.rig.position.x += x - head.x;
    this.rig.position.z += z - head.z;
  }

  _snapTurn(deg) {
    const head = this.headWorld(new THREE.Vector3());
    const ang = THREE.MathUtils.degToRad(deg);
    this.rig.rotation.y += ang;
    // دوران حول موضع الرأس لا حول مركز المنصة
    const p = this.rig.position.clone().sub(head).applyAxisAngle(UP, ang).add(head);
    this.rig.position.set(p.x, this.rig.position.y, p.z);
  }

  // -------------------------------------------------------------- التحديث
  update(dt) {
    if (this.app.vr.presenting) this._updateXR(dt);
    else this._updateDesktop(dt);
  }

  _updateDesktop(dt) {
    if (!this.app.started) return;
    const k = this.keys;
    const kb = this.app.interaction.keys;
    // الأسهم للنظر
    if (k.has('ArrowLeft')) this.rig.rotation.y += 1.6 * dt;
    if (k.has('ArrowRight')) this.rig.rotation.y -= 1.6 * dt;
    if (k.has('ArrowUp')) this.desktopPitch = Math.min(1.2, this.desktopPitch + 1.2 * dt);
    if (k.has('ArrowDown')) this.desktopPitch = Math.max(-1.2, this.desktopPitch - 1.2 * dt);
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.set(this.desktopPitch, 0, 0, 'YXZ');
    if (this.app.keyboardCaptured) return;
    // المشي التلقائي نحو نقطة النقر المزدوج
    if (this.walkTarget) {
      const head = this.headWorld(new THREE.Vector3());
      const v = new THREE.Vector3(this.walkTarget.x - head.x, 0, this.walkTarget.z - head.z);
      const dist = v.length();
      if (dist < 0.05 || [...k].some(c => /^Key[WASD]$/.test(c))) this.walkTarget = null;
      else {
        const before = this.rig.position.clone();
        this._tryMove(v.normalize().multiplyScalar(Math.min(dist, CONFIG.locomotion.desktopSpeed * 1.3 * dt)));
        if (this.rig.position.distanceTo(before) < 1e-5) this.walkTarget = null; // عائق في الطريق
      }
    }
    let fx = 0, fz = 0;
    if (k.has('KeyW')) fz -= 1;
    if (k.has('KeyS')) fz += 1;
    if (k.has('KeyA')) fx -= 1;
    if (k.has('KeyD')) fx += 1;
    if (fx || fz) {
      const sp = CONFIG.locomotion.desktopSpeed * (k.has('ShiftLeft') ? 1.6 : 1);
      const v = new THREE.Vector3(fx, 0, fz).normalize().multiplyScalar(sp * dt).applyAxisAngle(UP, this.rig.rotation.y);
      this._tryMove(v);
    }
  }

  _tryMove(v) {
    const head = this.headWorld(new THREE.Vector3());
    if (this.isWalkable(head.x + v.x, head.z + v.z, 0.18)) { this.rig.position.x += v.x; this.rig.position.z += v.z; return; }
    if (this.isWalkable(head.x + v.x, head.z, 0.18)) { this.rig.position.x += v.x; return; }
    if (this.isWalkable(head.x, head.z + v.z, 0.18)) { this.rig.position.z += v.z; }
  }

  _updateXR(dt) {
    const im = this.app.interaction;
    const left = im.pointerByHand('left');
    const right = im.pointerByHand('right');
    const ax = p => p?.gamepad?.axes || [];

    // الدوران المتقطع بالعصا اليمنى (عندما لا تمسك اليد اليمنى شيئًا)
    if (right && !right.held) {
      const x = ax(right)[2] || 0;
      const ready = this.snapReady.get(right) !== false;
      if (Math.abs(x) > 0.75 && ready) {
        this._snapTurn(x > 0 ? -CONFIG.locomotion.snapTurnDeg : CONFIG.locomotion.snapTurnDeg);
        this.snapReady.set(right, false);
        this.app.audio.play('click');
      } else if (Math.abs(x) < 0.3) this.snapReady.set(right, true);
    }

    // الحركة السلسة الاختيارية باليسرى
    if (this.mode === 'smooth' && left && !left.held) {
      const a = ax(left);
      const x = a[2] || 0, y = a[3] || 0;
      if (Math.hypot(x, y) > 0.2) {
        const e = new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(_q), 'YXZ');
        const v = new THREE.Vector3(x, 0, y).multiplyScalar(CONFIG.locomotion.smoothSpeed * dt).applyAxisAngle(UP, e.y);
        this._tryMove(v);
      }
    }

    // الانتقال الفوري: ادفع العصا للأمام، وجّه، ثم اترك العصا
    const tp = this.teleport;
    const candidates = [];
    if (this.mode === 'teleport' && left && !left.held) candidates.push(left);
    if (right && !right.held) candidates.push(right);
    if (!tp.active) {
      for (const p of candidates) {
        const y = ax(p)[3] || 0;
        if (y < -0.7) { tp.active = true; tp.pointer = p; break; }
      }
    }
    if (tp.active) {
      const p = tp.pointer;
      const y = ax(p)[3] || 0;
      if (!p.entry.connected || p.held) { this.cancelTeleport(); return; }
      this._computeArc(p);
      if (y > -0.25) {
        if (tp.valid) {
          this._teleportHeadTo(tp.target.x, tp.target.z);
          this.app.audio.play('teleport');
          this.app.fader?.flash();
        }
        this.cancelTeleport();
      }
    }
  }

  cancelTeleport() {
    this.teleport.active = false;
    this.teleport.pointer = null;
    this.arc.visible = false;
    this.marker.visible = false;
  }

  _computeArc(p) {
    const o = p.origin.clone();
    const v = p.dir.clone().multiplyScalar(7);
    const g = -9.8;
    const pos = this.arcPositions;
    let hit = null, n = 0;
    const dt = 0.035;
    for (let i = 0; i < this.arcN; i++) {
      const t = i * dt;
      const x = o.x + v.x * t, y = o.y + v.y * t + 0.5 * g * t * t, z = o.z + v.z * t;
      pos[i * 3] = x; pos[i * 3 + 1] = Math.max(0, y); pos[i * 3 + 2] = z;
      n = i + 1;
      if (y <= 0) { hit = new THREE.Vector3(x, 0, z); break; }
    }
    this.arc.geometry.setDrawRange(0, n);
    this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.visible = true;
    const tp = this.teleport;
    tp.valid = !!hit && this.isWalkable(hit.x, hit.z);
    const col = tp.valid ? 0x5cf0a0 : 0xff6b6b;
    this.arc.material.color.set(col);
    this.marker.children[0].material.color.set(col);
    this.marker.children[1].material.color.set(col);
    if (hit) {
      tp.target.copy(hit);
      this.marker.visible = true;
      this.marker.position.set(hit.x, 0.01, hit.z);
      const e = new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(_q), 'YXZ');
      this.marker.rotation.y = e.y;
    } else this.marker.visible = false;
  }
}
