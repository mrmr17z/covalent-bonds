// مؤثرات بصرية خفيفة: جسيمات نجاح، تلاشي الانتقال، رسائل عائمة
import * as THREE from 'three';
import { Panel } from '../ui/VRPanel.js';
import { drawText, COLORS } from '../ui/text.js';

export class Effects {
  constructor(app) {
    this.app = app;
    this.bursts = [];
    this.tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
  }
  /** انفجار جسيمات صغير عند النجاح (40 جسيمًا، ثانية واحدة) */
  burst(worldPos, color = 0x5cf0a0, n = 40) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([worldPos.x, worldPos.y, worldPos.z], i * 3);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(0.4 + Math.random() * 0.6);
      vel.push(v);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.025, map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.app.scene.add(pts);
    this.bursts.push({ pts, vel, t: 0 });
  }
  update(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const a = b.pts.geometry.attributes.position;
      for (let k = 0; k < b.vel.length; k++) {
        b.vel[k].y -= 1.2 * dt;
        a.setXYZ(k, a.getX(k) + b.vel[k].x * dt, a.getY(k) + b.vel[k].y * dt, a.getZ(k) + b.vel[k].z * dt);
      }
      a.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.t / 1.1);
      if (b.t > 1.1) {
        this.app.scene.remove(b.pts);
        b.pts.geometry.dispose(); b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}

/** تلاشٍ أسود حول الكاميرا (يعمل في VR والمعاينة) */
export class Fader {
  constructor(camera) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.mesh.renderOrder = 10000;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.target = 0; this.resolve = null; this.speed = 3.5;
  }
  _to(v) {
    this.target = v; this.mesh.visible = true;
    return new Promise(r => { this.resolve = r; });
  }
  fadeOut() { return this._to(1); }
  fadeIn() { return this._to(0); }
  flash() { this.mesh.material.opacity = 0.55; this.mesh.visible = true; this.target = 0; }
  update(dt) {
    const m = this.mesh.material;
    const d = this.target - m.opacity;
    if (Math.abs(d) < 0.01) {
      m.opacity = this.target;
      this.mesh.visible = m.opacity > 0.001;
      if (this.resolve) { const r = this.resolve; this.resolve = null; r(); }
      return;
    }
    m.opacity += Math.sign(d) * Math.min(Math.abs(d), dt * this.speed);
  }
}

/** رسائل عائمة قصيرة أمام الطالب (تعمل داخل VR) + نسخة HTML للمعاينة */
export class Toaster {
  constructor(app) {
    this.app = app;
    this.panel = null;
    this.t = 0;
    this.dom = document.getElementById('toast');
  }
  show(text, type = 'info', ms = 3800) {
    const color = type === 'good' ? COLORS.good : type === 'warn' ? COLORS.warn : type === 'bad' ? COLORS.bad : COLORS.accent;
    if (this.panel) { this.panel.parent?.remove(this.panel); this.panel.dispose(); }
    const lines = Math.ceil(text.length / 44);
    const h = 0.09 + lines * 0.045;
    const p = new Panel({ width: 0.8, height: h, bg: 'rgba(10,18,30,0.94)', border: color, draw: (ctx, w, hh) => drawText(ctx, text, w / 2, 26, { size: 34, weight: 700, align: 'center', maxW: w - 50, lineH: 1.4 }) });
    p.material.depthTest = false;
    p.renderOrder = 900;
    // يوضع أمام الرأس ثم يبقى ثابتًا في مكانه
    const cam = this.app.camera;
    const head = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    fwd.y = 0; fwd.normalize();
    p.position.copy(head).addScaledVector(fwd, 0.95);
    p.position.y = head.y - 0.32;
    p.lookAt(head.x, p.position.y, head.z);
    this.app.scene.add(p);
    this.panel = p;
    this.t = ms / 1000;
    if (this.dom) {
      this.dom.textContent = text;
      this.dom.className = 'show ' + type;
      clearTimeout(this._domT);
      this._domT = setTimeout(() => { this.dom.className = ''; }, ms);
    }
  }
  update(dt) {
    if (!this.panel) return;
    this.t -= dt;
    if (!this.app.vr.presenting) this.panel.visible = false; // في المعاينة نستخدم رسالة HTML
    else this.panel.visible = true;
    if (this.t <= 0) { this.panel.parent?.remove(this.panel); this.panel.dispose(); this.panel = null; }
  }
}
