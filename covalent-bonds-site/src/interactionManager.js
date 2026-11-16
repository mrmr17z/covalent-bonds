// ============================================================================
//  مدير التفاعل — مستقل عن المشاهد.
//  مؤشرات: وحدتا تحكم Quest (شعاع + إمساك مباشر + لمس الأزرار) والفأرة (المعاينة).
//  الالتقاط الحقيقي: الجسم يُربط بوحدة التحكم ويتبع موضعها ودورانها، ويُفلت عند الترك.
// ============================================================================
import * as THREE from 'three';
import { registry, isShown, handlerEnabled } from './core/registry.js';

const _m = new THREE.Matrix4();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

class Pointer {
  constructor(id, kind) {
    this.id = id; this.kind = kind;
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.hit = null;
    this.hoverHandler = null;
    this.held = null;
    this.tool = null;
    this.entry = null;
    this.prevButtons = [];
    this.touching = new Set();
  }
  get gamepad() { return this.entry?.inputSource?.gamepad || null; }
  get handedness() { return this.kind === 'mouse' ? 'right' : this.entry?.handedness || 'none'; }
  pulse(intensity = 0.4, ms = 40) {
    try { this.gamepad?.hapticActuators?.[0]?.pulse?.(intensity, ms); } catch (e) { /* لا اهتزاز */ }
  }
}

export class InteractionManager extends EventTarget {
  constructor(app) {
    super();
    this.app = app;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 10;
    this.mouse = new Pointer('mouse', 'mouse');
    this.mouse.ndc = new THREE.Vector2(0, 0);
    this.mouse.inside = false;
    this.mouseHand = new THREE.Object3D();
    this.mouseHand.name = 'MouseHand';
    app.scene.add(this.mouseHand);
    this.xrPointers = app.vr.controllers.map((entry, i) => {
      const p = new Pointer('xr' + i, 'xr');
      p.entry = entry;
      const c = entry.controller;
      c.addEventListener('selectstart', () => this.press(p, 'trigger'));
      c.addEventListener('selectend', () => this.pressEnd(p, 'trigger'));
      c.addEventListener('squeezestart', () => this.press(p, 'grip'));
      c.addEventListener('squeezeend', () => this.pressEnd(p, 'grip'));
      return p;
    });
    this.hoverCounts = new Map();
    this.keys = new Set();
    this.enabled = true;
    this._targets = [];
    this._setupMouse();
  }

  get allPointers() { return [this.mouse, ...this.xrPointers]; }
  get activePointers() {
    return this.app.vr.presenting ? this.xrPointers.filter(p => p.entry.connected) : [this.mouse];
  }
  pointerByHand(h) { return this.xrPointers.find(p => p.entry.connected && p.entry.handedness === h) || null; }
  isHolding(p) { return !!p?.held; }

  // -------------------------------------------------------------- الفأرة
  _setupMouse() {
    const el = this.app.vr.renderer.domElement;
    const setNdc = (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.mouse.inside = true;
    };
    el.addEventListener('pointermove', setNdc);
    el.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.app.vr.presenting || !this.app.started) return;
      setNdc(e);
      this._refreshTargets();
      this.press(this.mouse, 'trigger');
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || this.app.vr.presenting) return;
      this.pressEnd(this.mouse, 'trigger');
    });
    el.addEventListener('wheel', (e) => {
      const held = this.mouse.held;
      if (held) {
        if (held.plane != null) held.plane = THREE.MathUtils.clamp(held.plane - e.deltaY * 0.0004, 0.05, 2.2); // رفع/خفض
        else held.dist = THREE.MathUtils.clamp(held.dist - e.deltaY * 0.0012, 0.25, 3);
        e.preventDefault();
      }
    }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'Backspace') {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        this.cancel(this.mouse);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // -------------------------------------------------------------- الضغط
  press(p, source) {
    if (!this.enabled || !this.app.started) return;
    if (p.kind === 'xr' && !p.entry.connected) return;
    if (p.held) return;
    if (source === 'grip' && p.kind === 'xr') {
      const near = this.findNear(p);
      if (near) {
        const h = near.userData.handler;
        if (h.kind === 'tool') return this.equip(p, h);
        return this.startGrab(p, h, near, 'direct', source, 0);
      }
    }
    this._updateRay(p);
    const hit = p.hit;
    if (!hit) return;
    const h = hit.object.userData.handler;
    if (!h || !handlerEnabled(h)) return;
    if (p.tool && h.onTool && h.onTool(p, p.tool.toolType)) { p.pulse(0.5, 40); return; }
    switch (h.kind) {
      case 'button':
      case 'pick':
        if (source === 'trigger') h.onPress?.(p);
        break;
      case 'tool':
        this.equip(p, h);
        break;
      case 'grab':
      case 'handle':
        this.startGrab(p, h, hit.object, 'ray', source, hit.distance);
        break;
      default: break;
    }
  }
  pressEnd(p, source) {
    if (p.held && p.held.source === source) this.release(p);
  }

  /** أقرب جسم قابل للإمساك المباشر من يد التحكم */
  findNear(p) {
    const gp = new THREE.Vector3();
    p.entry.grip.getWorldPosition(gp);
    const ws = new THREE.Vector3();
    let best = null, bestD = 0.085;
    for (const m of registry.targets) {
      const h = m.userData.handler;
      if (!h || !['grab', 'handle', 'tool'].includes(h.kind) || !handlerEnabled(h) || !isShown(m)) continue;
      m.getWorldPosition(_v2);
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.getWorldScale(ws);
      const r = m.geometry.boundingSphere.radius * Math.max(ws.x, ws.y, ws.z);
      const d = gp.distanceTo(_v2) - r;
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  startGrab(p, h, mesh, mode, source, dist) {
    const obj = h.kind === 'handle' ? null : h.object;
    if (obj) {
      for (const q of this.allPointers) if (q !== p && q.held && q.held.object === obj) { q.held = null; }
      this.app.physics.stop(obj);
    }
    if (p.kind === 'mouse') {
      // السحب بالفأرة يكون في مستوى أفقي عند ارتفاع نقطة الإمساك (مناسب للبناء على الطاولة)
      const plane = p.dir.y < -0.08 && obj ? p.origin.y + p.dir.y * dist : null;
      p.held = { handler: h, object: obj, mode: 'mouse', source, dist: Math.max(0.3, dist), plane };
      this._updateMouseHand(p);
      if (obj) this.mouseHand.attach(obj);
    } else {
      p.held = { handler: h, object: obj, mode, source, dist: Math.max(0.02, dist) };
      if (obj) p.entry.controller.attach(obj);
    }
    if (obj) obj.userData.heldBy = p;
    this.app.audio.play('grab');
    p.pulse(0.45, 35);
    h.onGrab?.(p);
  }

  release(p) {
    const held = p.held;
    if (!held) return;
    p.held = null;
    const { handler: h, object: obj } = held;
    if (obj) {
      obj.userData.heldBy = null;
      (h.homeParent || this.app.scene).attach(obj);
    }
    this.app.audio.play('release');
    p.pulse(0.2, 20);
    const consumed = h.onRelease?.(p);
    if (obj && !consumed && h.gravity !== false) this.app.physics.drop(obj, { onRest: h.onRest || null });
  }

  /** نقطة اليد الحالية (للمقابض المقيدة مثل غطاء الصندوق والمنزلق) */
  handPoint(p, out = new THREE.Vector3()) {
    if (p.held?.mode === 'direct') return p.entry.grip.getWorldPosition(out);
    const d = p.held?.dist ?? 0.5;
    return out.copy(p.origin).addScaledVector(p.dir, d);
  }

  // -------------------------------------------------------------- الأدوات
  equip(p, h) {
    if (p.tool === h) return;
    if (p.tool) this.unequip(p, false);
    for (const q of this.allPointers) if (q !== p && q.tool === h) this.unequip(q, false);
    const obj = h.object;
    this.app.physics.stop(obj);
    const anchor = p.kind === 'xr' ? p.entry.grip : this.app.camera;
    anchor.add(obj);
    const pose = p.kind === 'xr' ? h.holdPose.xr : h.holdPose.mouse;
    obj.position.copy(pose.pos);
    obj.rotation.copy(pose.rot);
    p.tool = h;
    h.equippedBy = p;
    this.app.audio.play('grab');
    p.pulse(0.5, 40);
    h.onEquip?.(p);
    this.dispatchEvent(new Event('toolchange'));
  }
  unequip(p, sound = true) {
    const h = p.tool;
    if (!h) return;
    p.tool = null;
    h.equippedBy = null;
    const obj = h.object;
    if (h.homeParent) {
      h.homeParent.add(obj);
      obj.position.copy(h.restPos);
      obj.quaternion.copy(h.restQuat);
    } else obj.parent?.remove(obj);
    if (sound) this.app.audio.play('release');
    h.onUnequip?.(p);
    this.dispatchEvent(new Event('toolchange'));
  }
  unequipAll() { for (const p of this.allPointers) this.unequip(p, false); }
  releaseAll() { for (const p of this.allPointers) if (p.held) this.release(p); }

  /** نوع أداة الربط النشطة: الأولوية لليد الأخرى ثم اليد نفسها */
  activeBondTool(holder = null) {
    const ps = this.app.vr.presenting ? this.xrPointers : [this.mouse];
    const order = [...ps.filter(p => p !== holder), ...ps.filter(p => p === holder)];
    for (const p of order) if (p.tool && (p.tool.toolType === 'stick' || p.tool.toolType === 'spring')) return p.tool.toolType;
    return null;
  }
  currentToolType() {
    const ps = this.app.vr.presenting ? this.xrPointers : [this.mouse];
    const t = ps.find(p => p.tool);
    return t ? t.tool.toolType : null;
  }

  cancel(p) {
    if (p.held) { this.release(p); return true; }
    if (p.tool) { this.unequip(p); return true; }
    return false;
  }

  // -------------------------------------------------------------- التحديث
  _updateRay(p) {
    if (p.kind === 'mouse') {
      this.raycaster.setFromCamera(p.ndc, this.app.camera);
      p.origin.copy(this.raycaster.ray.origin);
      p.dir.copy(this.raycaster.ray.direction);
    } else {
      const c = p.entry.controller;
      c.updateMatrixWorld();
      p.origin.setFromMatrixPosition(c.matrixWorld);
      _m.extractRotation(c.matrixWorld);
      p.dir.set(0, 0, -1).applyMatrix4(_m).normalize();
    }
    if (p.held) { p.hit = null; return; }
    this.raycaster.ray.origin.copy(p.origin);
    this.raycaster.ray.direction.copy(p.dir);
    const hits = this.raycaster.intersectObjects(this._targets, false);
    p.hit = null;
    for (const h of hits) {
      const hd = h.object.userData.handler;
      if (hd && handlerEnabled(hd)) { p.hit = h; break; }
    }
  }

  _setHover(p, handler) {
    if (p.hoverHandler === handler) return;
    const old = p.hoverHandler;
    if (old) {
      const n = (this.hoverCounts.get(old) || 1) - 1;
      this.hoverCounts.set(old, n);
      if (n <= 0) { this.hoverCounts.delete(old); old.onHover?.(false, p); }
    }
    p.hoverHandler = handler;
    if (handler) {
      const n = (this.hoverCounts.get(handler) || 0) + 1;
      this.hoverCounts.set(handler, n);
      if (n === 1) handler.onHover?.(true, p);
      if (p.kind === 'xr') p.pulse(0.08, 10);
    }
  }

  _updateMouseHand(p) {
    const cam = this.app.camera;
    const held = p.held;
    if (held.plane != null && p.dir.y < -0.05) {
      const t = (held.plane - p.origin.y) / p.dir.y;
      if (t > 0.15 && t < 4) held.dist = t;
    }
    this.mouseHand.position.copy(p.origin).addScaledVector(p.dir, held.dist);
    cam.getWorldQuaternion(this.mouseHand.quaternion);
    this.mouseHand.updateMatrixWorld();
  }

  _refreshTargets() {
    this._targets.length = 0;
    for (const m of registry.targets) if (isShown(m)) this._targets.push(m);
  }

  update(dt) {
    // قائمة الأهداف المرئية فقط
    this._refreshTargets();

    const xr = this.app.vr.presenting;
    for (const p of this.allPointers) {
      const active = xr ? (p.kind === 'xr' && p.entry.connected) : p.kind === 'mouse';
      if (!active) { this._setHover(p, null); if (p.entry) p.entry.cursor.visible = false; continue; }
      if (p.kind === 'mouse' && !this.mouse.inside && !p.held) { this._setHover(p, null); continue; }
      this._updateRay(p);
      if (p.held) {
        this._setHover(p, null);
        this._updateHeld(p, dt);
      } else {
        const h = p.hit ? p.hit.object.userData.handler : null;
        this._setHover(p, h);
      }
      if (p.kind === 'xr') this._updateRayVisual(p);
      if (p.kind === 'xr') this._pollButtons(p);
    }
    if (xr) this._updatePoke();
    // تحريك أزرار (رسوم الضغط)
    for (const m of registry.buttons) m.userData.handler.owner?.update?.(dt);
    // المؤشر في وضع المعاينة
    if (!xr) {
      const el = this.app.vr.renderer.domElement;
      const h = this.mouse.hoverHandler;
      el.style.cursor = this.mouse.held ? 'grabbing' : h ? (h.kind === 'grab' || h.kind === 'handle' ? 'grab' : 'pointer') : 'default';
    }
  }

  _updateHeld(p, dt) {
    const held = p.held;
    const obj = held.object;
    if (p.kind === 'mouse') {
      this._updateMouseHand(p);
      if (obj) {
        const rs = 2.2 * dt;
        const k = this.keys;
        const rotWorld = (axis, ang) => {
          obj.parent.getWorldQuaternion(_q).invert();
          const a = axis.clone().applyQuaternion(_q).normalize();
          obj.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(a, ang));
        };
        if (k.has('KeyQ')) rotWorld(new THREE.Vector3(0, 1, 0), rs);
        if (k.has('KeyE')) rotWorld(new THREE.Vector3(0, 1, 0), -rs);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.app.camera.getWorldQuaternion(new THREE.Quaternion()));
        if (k.has('KeyR')) rotWorld(right, rs);
        if (k.has('KeyF')) rotWorld(right, -rs);
      }
    } else if (obj && held.mode === 'ray') {
      // عصا التحكم: تقريب/إبعاد الجسم الممسوك ودورانه
      const ax = p.gamepad?.axes || [];
      const y = ax[3] || 0, x = ax[2] || 0;
      if (Math.abs(y) > 0.2) {
        const delta = -y * 1.2 * dt;
        const local = obj.position;
        const len = local.length();
        const nl = THREE.MathUtils.clamp(len + delta, 0.08, 3);
        if (len > 1e-4) local.multiplyScalar(nl / len);
        held.dist = nl;
      }
      if (Math.abs(x) > 0.3) {
        obj.parent.getWorldQuaternion(_q).invert();
        const a = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
        obj.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(a, -x * 2.5 * dt));
      }
    }
    held.handler.onHeldUpdate?.(p, this.handPoint(p, new THREE.Vector3()), dt);
  }

  _updateRayVisual(p) {
    const { line, cursor } = p.entry;
    const isHand = p.entry.isHand;
    line.visible = !isHand || !!p.hit;
    if (p.held) {
      line.scale.z = p.held.mode === 'direct' ? 0.001 : p.held.dist;
      cursor.visible = false;
      line.material.color.set(0xffd166);
      return;
    }
    if (p.hit) {
      line.scale.z = p.hit.distance;
      cursor.visible = true;
      cursor.position.copy(p.hit.point);
      cursor.lookAt(p.origin);
      const k = p.hit.object.userData.handler.kind;
      line.material.color.set(k === 'button' || k === 'pick' ? 0x7fffb0 : 0x7fd4ff);
    } else {
      line.scale.z = 1.6;
      cursor.visible = false;
      line.material.color.set(0x9fb6cc);
    }
  }

  /** لمس الأزرار مباشرة بطرف وحدة التحكم */
  _updatePoke() {
    for (const p of this.xrPointers) {
      if (!p.entry.connected || p.held) { p.touching.clear(); continue; }
      const tip = new THREE.Vector3();
      p.entry.grip.getWorldPosition(tip);
      tip.addScaledVector(p.dir, 0.06);
      const now = new Set();
      for (const m of registry.buttons) {
        const h = m.userData.handler;
        if (!handlerEnabled(h) || !isShown(m)) continue;
        m.getWorldPosition(_v2);
        if (_v2.distanceToSquared(tip) > 0.16) continue;
        const local = m.worldToLocal(tip.clone());
        const g = m.geometry.parameters;
        if (Math.abs(local.x) < g.width / 2 && Math.abs(local.y) < g.height / 2 && local.z < 0.025 && local.z > -0.05) {
          now.add(m);
          if (!p.touching.has(m)) h.onPress?.(p);
        }
      }
      p.touching = now;
    }
  }

  /** أزرار A/B/X/Y: الحافة الصاعدة تُبث كحدث */
  _pollButtons(p) {
    const gp = p.gamepad;
    if (!gp) return;
    gp.buttons.forEach((b, i) => {
      const was = p.prevButtons[i] || false;
      if (b.pressed && !was) this.dispatchEvent(new CustomEvent('gamepadbutton', { detail: { pointer: p, index: i, hand: p.entry.handedness } }));
      p.prevButtons[i] = b.pressed;
    });
  }
}
