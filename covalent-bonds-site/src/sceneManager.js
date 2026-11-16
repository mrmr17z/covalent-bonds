// ============================================================================
//  مدير المشاهد — خمس مراحل متتابعة داخل المختبر نفسه دون إعادة تحميل الصفحة.
//  كل مشهد يُنشأ عند الدخول ويُحرَّر بالكامل عند الخروج (لا تسرب للذاكرة).
// ============================================================================
import * as THREE from 'three';
import { disposeTree } from './core/registry.js';
import { Button, Panel } from './ui/VRPanel.js';
import { drawText, COLORS } from './ui/text.js';
import { CONFIG } from './config.js';

export class BaseScene {
  static stage = 1;
  static title = '';
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.tasks = [];
    this.alive = true;
    this.updaters = [];
    this.timeouts = new Set();
    this.workspaces = [];
    this.zoneName = null;
    this.nextButtons = [];
  }
  get stage() { return this.constructor.stage; }
  get title() { return this.constructor.title; }

  mount(zoneName) {
    this.zoneName = zoneName;
    this.zoneRoot = this.app.lab.zoneRoot(zoneName);
    this.zoneRoot.add(this.root);
  }
  spawn() { return this.app.lab.spawnOf(this.zoneName); }

  addTask(id, label, required = true) { this.tasks.push({ id, label, done: false, required }); }
  isDone(id) { return !!this.tasks.find(t => t.id === id)?.done; }
  done(id, { sound = true } = {}) {
    const t = this.tasks.find(x => x.id === id);
    if (!t || t.done) return;
    t.done = true;
    if (sound) this.app.audio.play('success');
    this.app.updateHUD();
    this._refreshNext();
    this.onTaskDone?.(id);
  }
  get currentTask() { return this.tasks.find(t => !t.done && t.required) || null; }
  get progress() {
    const req = this.tasks.filter(t => t.required);
    return req.length ? req.filter(t => t.done).length / req.length : 1;
  }
  canProceed() { return this.tasks.every(t => !t.required || t.done); }

  /** زر الانتقال للمرحلة التالية — يُفعَّل فقط بعد إتمام المهام الأساسية */
  makeNextButton(parent, pos, label = 'المرحلة التالية ⟵') {
    const b = new Button({ label, width: 0.42, height: 0.1, style: 'primary', onClick: () => this.app.sceneManager.next() });
    b.position.copy(pos);
    parent.add(b);
    this.nextButtons.push(b);
    this._refreshNext();
    return b;
  }
  _refreshNext() {
    const ok = this.canProceed();
    const skip = CONFIG.preview.allowSkip;
    for (const b of this.nextButtons) { b.setEnabled(ok || skip); b.setLabel(b.label, ok ? '' : skip ? 'تخطٍّ — وضع المراجعة' : 'أكمل المهام أولًا'); }
  }

  wait(ms) {
    return new Promise(res => {
      const id = setTimeout(() => { this.timeouts.delete(id); if (this.alive) res(); }, ms);
      this.timeouts.add(id);
    });
  }
  onUpdate(fn) { this.updaters.push(fn); return fn; }
  async enter() {}
  start() {}
  update(dt, t) {
    for (const ws of this.workspaces) ws.update(dt);
    for (const fn of this.updaters) fn(dt, t);
  }
  exit() {
    this.alive = false;
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    this.app.interaction.releaseAll();
    this.app.interaction.unequipAll();
    for (const ws of this.workspaces) ws.dispose();
    this.workspaces = [];
    this.app.teacher.hideBubble();
    this.app.audio.stopSpeech();
    disposeTree(this.root);
    this.onExit?.();
  }
}

export class SceneManager {
  constructor(app, sceneClasses) {
    this.app = app;
    this.classes = sceneClasses;
    this.index = -1;
    this.current = null;
    this.busy = false;
    if (CONFIG.preview.allowSkip && CONFIG.preview.showNav) this._buildPreviewNav();
  }

  /** لوحة تنقل عائمة (وضع المراجعة): السابق / التالي في كل مشهد */
  _buildPreviewNav() {
    const g = new THREE.Group();
    g.name = 'PreviewNav';
    const title = new Panel({
      width: 0.46, height: 0.06, ppm: 1400, bg: 'rgba(90,40,10,0.88)', border: COLORS.warn, radius: 14,
      draw: (ctx, w, h) => drawText(ctx, 'وضع المراجعة: تنقّل بين المشاهد', w / 2, 12, { size: 38, weight: 800, align: 'center', color: '#ffe2b8' }),
    });
    title.position.y = 0.075;
    this.navPrev = new Button({ label: '⟶ المشهد السابق', width: 0.22, height: 0.075, fontSize: 30, onClick: () => this.prev() });
    this.navPrev.position.set(0.12, 0, 0);
    this.navNext = new Button({ label: 'المشهد التالي ⟵', width: 0.22, height: 0.075, fontSize: 30, style: 'primary', onClick: () => this.next() });
    this.navNext.position.set(-0.12, 0, 0);
    g.add(title, this.navPrev, this.navNext);
    g.visible = false;
    this.app.scene.add(g);
    this.nav = g;
  }
  /** يضع لوحة التنقل يمين الطالب أمامه قليلًا في المحطة الحالية */
  _placeNav(zoneName) {
    if (!this.nav) return;
    const sp = this.app.lab.spawnOf(zoneName);
    this.nav.position.set(sp.pos.x + 0.72, 1.32, sp.pos.z - 0.38);
    this.nav.rotation.set(0, -0.75, 0);
    this.nav.visible = true;
    this.navPrev.setEnabled(this.index > 0);
    this.navNext.setEnabled(this.index < this.classes.length - 1);
  }
  async goTo(i) {
    if (this.busy) return;
    this.busy = true;
    const app = this.app;
    await app.fader.fadeOut();
    app.audio.play('whoosh');
    if (this.current) this.current.exit();
    this.index = i;
    const Cls = this.classes[i];
    this.current = new Cls(app);
    await this.current.enter();
    const sp = this.current.spawn();
    app.player.teleportTo(sp.pos, sp.yaw, sp.pitch);
    this._placeNav(this.current.zoneName);
    app.updateHUD();
    await app.fader.fadeIn();
    this.busy = false;
    this.current.start();
  }
  /** نقل داخل المشهد نفسه إلى محطة أخرى */
  async moveTo(zoneName) {
    const app = this.app;
    await app.fader.fadeOut();
    const sp = app.lab.spawnOf(zoneName);
    app.player.teleportTo(sp.pos, sp.yaw, sp.pitch);
    this._placeNav(zoneName);
    await app.fader.fadeIn();
  }
  next() {
    if (!this.current || this.busy) return;
    if (!this.current.canProceed() && !CONFIG.preview.allowSkip) { this.app.toast('أكمل المهام المطلوبة في هذه المرحلة أولًا.', 'warn'); return; }
    if (this.index < this.classes.length - 1) this.goTo(this.index + 1);
    else this.app.toast('هذا هو المشهد الأخير.', 'info');
  }
  prev() {
    if (!this.current || this.busy) return;
    if (this.index > 0) this.goTo(this.index - 1);
    else this.app.toast('هذا هو المشهد الأول.', 'info');
  }
  restart() {
    this.app.scoring.reset();
    this.app.assessment.reset();
    this.app.setPlayerGoggles?.(false);
    this.app.setPlayerCoat?.(false);
    this.goTo(0);
  }
  /** العودة إلى محطة المهمة الحالية */
  returnToStation() {
    const c = this.current;
    if (!c) return;
    const z = c.activeZone || c.zoneName;
    this.moveTo(z);
  }
  overallProgress() {
    if (!this.current) return 0;
    return (this.index + this.current.progress) / this.classes.length;
  }
  update(dt, t) { this.current?.update(dt, t); }
}
