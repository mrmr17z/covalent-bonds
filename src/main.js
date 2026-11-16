// ============================================================================
//  COVALENT BONDS — نقطة الدخول: يربط الأنظمة المستقلة ببعضها ويشغّل حلقة الإطارات.
// ============================================================================
import * as THREE from 'three';
import { VRManager } from './vrManager.js';
import { InteractionManager } from './interactionManager.js';
import { PlayerController } from './playerController.js';
import { PhysicsManager } from './physicsManager.js';
import { AudioManager } from './audioManager.js';
import { ScoringSystem } from './scoringSystem.js';
import { AssessmentManager } from './assessmentManager.js';
import { SceneManager } from './sceneManager.js';
import { Lab } from './environment/Lab.js';
import { Teacher } from './objects/LabTools.js';
import { Effects, Fader, Toaster } from './objects/Effects.js';
import { cloudTime } from './objects/ElectronCloud.js';
import { CharacterLibrary } from './objects/Characters.js';
import { loadBrand } from './ui/brand.js';
import { ProgressHUD } from './ui/ProgressPanel.js';
import { uiContext, Panel, Button } from './ui/VRPanel.js';
import { loadFonts, drawText, COLORS } from './ui/text.js';
import { CONFIG } from './config.js';
import { Scene1_Introduction } from './scenes/Scene1_Introduction.js';
import { Scene2_Hypothesis } from './scenes/Scene2_Hypothesis.js';
import { Scene3_Experiment } from './scenes/Scene3_Experiment.js';
import { Scene4_Conclusion } from './scenes/Scene4_Conclusion.js';
import { Scene5_Assessment } from './scenes/Scene5_Assessment.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

class App {
  constructor(characters = null) {
    this.characters = characters;
    this.started = false;
    this.keyboardCaptured = false;
    this.vr = new VRManager(document.getElementById('app'));
    this.renderer = this.vr.renderer;
    this.scene = this.vr.scene;
    this.camera = this.vr.camera;
    this.audio = new AudioManager();
    uiContext.audio = this.audio;
    uiContext.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.scoring = new ScoringSystem();
    this.assessment = new AssessmentManager(this.scoring);
    this.physics = new PhysicsManager(this);
    this.interaction = new InteractionManager(this);
    this.player = new PlayerController(this);
    this.effects = new Effects(this);
    this.fader = new Fader(this.camera);
    this.toaster = new Toaster(this);
    this.lab = new Lab(this);
    this.player.setObstacles(this.lab.obstacles);
    this.teacher = new Teacher(this);
    // المعلم يومئ عند الإجابة الصحيحة ويهز رأسه عند الخطأ
    const play = this.audio.play.bind(this.audio);
    this.audio.play = (name) => {
      play(name);
      if (name === 'correct' || name === 'success') this.teacher.react('nod');
      else if (name === 'error') this.teacher.react('shake');
    };
    this._addTechnician();
    this._addCompanion();
    this.hud = new ProgressHUD(this);
    this.sceneManager = new SceneManager(this, [Scene1_Introduction, Scene2_Hypothesis, Scene3_Experiment, Scene4_Conclusion, Scene5_Assessment]);
    this.clock = new THREE.Clock();
    this._hudT = 0;
    this._buildWristMenu();
    this._bindEvents();
    this.renderer.setAnimationLoop((t, frame) => this.loop(t, frame));
    // معاينة افتتاحية: الكاميرا تدور ببطء داخل المختبر
    this.player.desktopPitch = -0.12;
    if (DEBUG) window.app = this;
    window.__lab = this; // لاختبارات الأتمتة
  }

  toast(msg, type = 'info') { this.toaster.show(msg, type); }

  /** ارتداء الطالب للنظارة الواقية: إطار شفاف خفيف عند أطراف الرؤية (مريح في VR) */
  setPlayerGoggles(on) {
    this.playerWearsGoggles = on;
    if (on && !this._gogOverlay) {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
      const ctx = c.getContext('2d');
      // إطار بلاستيكي شفاف مائل للزرقة عند الحواف، والمركز صافٍ تمامًا
      const g = ctx.createRadialGradient(512, 300, 250, 512, 300, 620);
      g.addColorStop(0, 'rgba(200,230,255,0)');
      g.addColorStop(0.72, 'rgba(200,230,255,0.10)');
      g.addColorStop(1, 'rgba(170,205,235,0.42)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 576);
      ctx.strokeStyle = 'rgba(235,245,255,0.55)'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.ellipse(512, 300, 560, 330, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(15,15,15,0.55)';
      ctx.fillRect(0, 230, 26, 120); ctx.fillRect(998, 230, 26, 120); // الشريط الأسود عند الصدغين
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.225), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      m.position.z = -0.11; m.renderOrder = 9990;
      this.camera.add(m);
      this._gogOverlay = m;
    }
    if (this._gogOverlay) this._gogOverlay.visible = on;
    this.hud.set({ goggles: on });
  }

  /** ارتداء الطالب لمعطف المختبر: أكمام بيضاء على اليدين (VR) وعند أطراف الرؤية (المعاينة) */
  setPlayerCoat(on) {
    this.playerWearsCoat = on;
    if (on && !this._coatSleeves) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xf3f5f7 });
      const cuffMat = new THREE.MeshLambertMaterial({ color: 0xd9dfe6 });
      const mkSleeve = (len, r) => {
        const g = new THREE.Group();
        const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, len, 14, 1, true), mat);
        s.material.side = THREE.DoubleSide;
        s.rotation.x = Math.PI / 2; s.position.z = len / 2;
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.006, 6, 18), cuffMat);
        g.add(s, cuff);
        return g;
      };
      // VR: كُمّ خلف كل يد (يمتد نحو المرفق)
      this._coatSleeves = this.vr.controllers.map((c) => {
        const sl = mkSleeve(0.24, 0.042);
        sl.position.set(0, -0.015, 0.09);
        sl.rotation.x = 0.35;
        c.grip.add(sl);
        return sl;
      });
      // المعاينة: كُمّان عند أسفل زاويتي الشاشة
      this._deskSleeves = [-1, 1].map((sd) => {
        const sl = mkSleeve(0.35, 0.06);
        sl.position.set(sd * 0.34, -0.36, -0.42);
        sl.rotation.set(-0.25, sd * 0.35, 0);
        this.camera.add(sl);
        return sl;
      });
    }
    this.hud.set({ coat: on });
    this._syncSleeves();
  }
  _syncSleeves() {
    const on = !!this.playerWearsCoat, xr = this.vr.presenting;
    (this._coatSleeves || []).forEach((s) => { s.visible = on && xr; });
    (this._deskSleeves || []).forEach((s) => { s.visible = on && !xr; });
  }

  /** كرة الأمد المرافقة: تطفو بجانب كتف المستخدم الأيمن وتتبعه بنعومة أينما ذهب */
  _addCompanion() {
    const g = this.characters?.gltfs?.sphere;
    if (!g) return;
    const holder = new THREE.Group();
    const model = g.scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);                       // تمركز حول الأصل
    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.scale.setScalar(0.16 / Math.max(size.x, size.y, size.z)); // قطر 16 سم
    holder.add(pivot);
    holder.visible = false;
    this.scene.add(holder);
    this.companion = { holder, pivot, t: 0, ready: false };
  }
  _updateCompanion(dt) {
    const c = this.companion;
    if (!c) return;
    c.holder.visible = this.started;
    if (!this.started) return;
    c.t += dt;
    const cam = this.camera;
    const head = cam.getWorldPosition(new THREE.Vector3());
    const e = new THREE.Euler().setFromQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    const yaw = e.y;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    // الموضع المستهدف: يمين الكتف وأمامه قليلًا، مع تأرجح خفيف
    const target = head.clone().addScaledVector(right, 0.42).addScaledVector(fwd, 0.58);
    target.y = head.y - 0.2 + Math.sin(c.t * 1.6) * 0.03;
    const p = c.holder.position;
    if (!c.ready || p.distanceTo(target) > 4) { p.copy(target); c.ready = true; } // قفزة عند الانتقال الفوري البعيد
    else p.lerp(target, 1 - Math.exp(-dt * 2.6));                                 // تتبّع ناعم
    // النجمة تواجه المستخدم مع تمايل لطيف
    const toHead = Math.atan2(head.x - p.x, head.z - p.z);
    c.holder.rotation.y = toHead + Math.sin(c.t * 0.7) * 0.45;
    c.pivot.rotation.x = Math.sin(c.t * 0.9) * 0.08;
  }

  /** فني المختبر: شخصية خلفية قرب خزانة الأبخرة تضيف حياة للمختبر */
  _addTechnician() {
    const t = this.characters?.create('technician');
    if (!t) return;
    t.position.set(3.0, 0, -7.85);
    t.rotation.y = -0.35;
    this.scene.add(t);
    this.lab.obstacles.push({ minX: 2.7, maxX: 3.3, minZ: -8.15, maxZ: -7.55 });
    this.technician = t;
    this._techT = 0;
  }
  _updateTechnician(dt) {
    const t = this.technician;
    if (!t) return;
    this._techT += dt;
    if (this._techT > 9) { this._techT = 0; t.play(Math.random() < 0.5 ? 'look' : 'talk', { once: true }); }
    t.update(dt);
  }

  updateHUD() {
    const sm = this.sceneManager, c = sm.current;
    if (!c) return;
    this.hud.set({
      stage: c.stage, total: 5, title: c.title,
      task: c.currentTask ? c.currentTask.label : 'أُنجزت مهام هذه المرحلة ✓',
      progress: sm.overallProgress(),
      tool: this.interaction.currentToolType(),
    });
  }

  // ------------------------------------------------------------ قائمة المعصم (زر X)
  _buildWristMenu() {
    const m = new THREE.Group();
    m.visible = false;
    const skip = CONFIG.preview.allowSkip && CONFIG.preview.showNav;
    const bg = new Panel({ width: 0.3, height: skip ? 0.44 : 0.36, ppm: 1400, draw: (ctx, w, h) => drawText(ctx, 'القائمة', w - 30, 20, { size: 44, weight: 800 }) });
    bg.position.y = skip ? -0.04 : 0;
    m.add(bg);
    const mk = (label, y, fn) => { const b = new Button({ label, width: 0.26, height: 0.06, ppm: 1600, fontSize: 30, onClick: fn }); b.position.set(0, y, 0.004); m.add(b); return b; };
    this.menuMode = mk(this._modeLabel(), 0.09, () => { this.player.toggleMode(); this.menuMode.setLabel(this._modeLabel()); });
    this.menuSound = mk('الصوت: يعمل', 0.02, () => { const muted = this.audio.toggleMute(); this.menuSound.setLabel(muted ? 'الصوت: مكتوم' : 'الصوت: يعمل'); this._syncSoundButtons(); });
    mk('العودة إلى محطة المهمة', -0.05, () => { this.sceneManager.returnToStation(); m.visible = false; });
    this.menuRestart = mk('إعادة التجربة', -0.12, () => {
      if (this._confirmRestart) { this._confirmRestart = false; this.menuRestart.setLabel('إعادة التجربة'); m.visible = false; this.sceneManager.restart(); }
      else { this._confirmRestart = true; this.menuRestart.setLabel('اضغط مجددًا للتأكيد'); setTimeout(() => { this._confirmRestart = false; this.menuRestart.setLabel('إعادة التجربة'); }, 4000); }
    });
    if (skip) {
      const pv = new Button({ label: '⟶ السابق', width: 0.125, height: 0.06, ppm: 1600, fontSize: 28, onClick: () => { m.visible = false; this.sceneManager.prev(); } });
      pv.position.set(0.068, -0.19, 0.004);
      const nx = new Button({ label: 'التالي ⟵', width: 0.125, height: 0.06, ppm: 1600, fontSize: 28, style: 'primary', onClick: () => { m.visible = false; this.sceneManager.next(); } });
      nx.position.set(-0.068, -0.19, 0.004);
      m.add(pv, nx);
    }
    this.wristMenu = m;
  }
  _modeLabel() { return this.player.mode === 'teleport' ? 'الحركة: انتقال فوري فقط' : 'الحركة: مشي بالعصا'; }

  _bindEvents() {
    this.interaction.addEventListener('toolchange', () => this.updateHUD());
    this.interaction.addEventListener('gamepadbutton', (e) => {
      const { pointer, index, hand } = e.detail;
      if (index === 5) { // B / Y: إلغاء
        if (!this.interaction.cancel(pointer)) this.player.cancelTeleport();
      } else if (index === 4) {
        if (hand === 'left') this.wristMenu.visible = !this.wristMenu.visible; // X
        else this.sceneManager.returnToStation();                             // A
      }
    });
    this.vr.addEventListener('controllerconnected', (e) => {
      const entry = e.detail;
      if (entry.handedness === 'left') {
        this.hud.attachToGrip(entry.grip);
        entry.grip.add(this.wristMenu);
        this.wristMenu.position.set(0, 0.2, -0.02);
        this.wristMenu.rotation.set(-0.5, 0, 0);
      }
    });
    this.vr.addEventListener('sessionstart', () => {
      document.body.classList.add('in-vr');
      this._syncSleeves();
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      const sp = this.sceneManager.current?.spawn();
      if (sp) this.player.teleportTo(sp.pos, sp.yaw);
      setTimeout(() => this.toast(this.player.mode === 'smooth'
        ? 'امشِ بالعصا اليسرى · ادفع العصا اليمنى للأمام ثم اتركها للانتقال الفوري · يمين/يسار للدوران'
        : 'ادفع العصا للأمام ثم اتركها للانتقال الفوري · العصا اليمنى يمين/يسار للدوران', 'info'), 2500);
    });
    this.vr.addEventListener('sessionend', () => {
      document.body.classList.remove('in-vr');
      this._syncSleeves();
      this.interaction.releaseAll();
      this.player.cancelTeleport();
      this.player.resetDesktopCamera();
      const sp = this.sceneManager.current?.spawn();
      if (sp) this.player.teleportTo(sp.pos, sp.yaw, sp.pitch);
      this.toast('خرجت من الواقع الافتراضي — تستطيع المتابعة في وضع المعاينة.', 'info');
    });
    window.addEventListener('keydown', (e) => {
      if (!this.started || this.keyboardCaptured) return;
      if (e.code === 'KeyM') { this.audio.toggleMute(); this._syncSoundButtons(); }
      if (e.code === 'KeyT') this.sceneManager.returnToStation();
      if (CONFIG.preview.showNav && e.code === 'PageDown') this.sceneManager.next();
      if (CONFIG.preview.showNav && e.code === 'PageUp') this.sceneManager.prev();
      if (DEBUG && e.code === 'KeyN') this._debugSkip();
    });
  }
  _syncSoundButtons() {
    const muted = this.audio.muted;
    document.querySelectorAll('[data-sound]').forEach(b => { b.textContent = muted ? '🔇 الصوت مكتوم' : '🔊 الصوت يعمل'; });
    this.menuSound?.setLabel(muted ? 'الصوت: مكتوم' : 'الصوت: يعمل');
  }
  _debugSkip() {
    const c = this.sceneManager.current;
    if (!c) return;
    c.tasks.forEach(t => { t.done = true; });
    this.sceneManager.next();
  }

  // ------------------------------------------------------------ البدء
  async startDesktop() {
    this.audio.init();
    this._begin();
  }
  async startVR() {
    this.audio.init();
    try {
      await this.vr.enterVR();          // يُستدعى مباشرة من نقرة المستخدم
      this._begin();
    } catch (e) {
      console.error(e);
      showError('تعذّر بدء جلسة الواقع الافتراضي: ' + (e.message || e));
    }
  }
  _begin() {
    document.body.classList.add('started');
    if (this.started) return;
    this.started = true;
    this.player.resetDesktopCamera();
    this.sceneManager.goTo(0);
    setTimeout(() => {
      if (this.vr.presenting) return;
      this.toast('امشِ في المختبر بـ W A S D، وانظر حولك بسحب زر الفأرة الأيمن، أو انقر مرتين على الأرض للانتقال إليها.', 'info');
    }, 2500);
  }
  onFinished() { renderLastResult(); }

  // ------------------------------------------------------------ الحلقة
  /** للاختبارات الآلية فقط: تقديم n إطارات بزمن ثابت (يعمل حتى لو كانت الصفحة مخفية) */
  step(n = 1, dt = 1 / 30) {
    for (let i = 0; i < n; i++) { this._forcedDt = dt; this.loop(); }
    this._forcedDt = null;
  }

  loop(time, frame) {
    const real = Math.min(0.05, this.clock.getDelta());
    const dt = this._forcedDt ?? real;
    if (this._forcedDt) this.clock.elapsedTime += dt;
    const t = this.clock.elapsedTime;
    cloudTime.value = t;
    if (!this.started && !this.vr.presenting) {
      const a = t * 0.06;
      this.vr.rig.position.set(Math.sin(a) * 4.2, 0, -2.6 + Math.cos(a) * 4.2);
      this.vr.rig.rotation.y = a;
      this.camera.position.set(0, 1.9, 0);
      this.camera.rotation.set(-0.12, 0, 0, 'YXZ');
    } else {
      this.player.update(dt);
    }
    this.interaction.update(dt);
    this.physics.update(dt);
    this.sceneManager.update(dt, t);
    this.teacher.update(dt);
    this._updateTechnician(dt);
    this._updateCompanion(dt);
    this.effects.update(dt);
    this.fader.update(dt);
    this.toaster.update(dt);
    this._hudT += dt;
    countFrame();
    if (this._hudT > 0.25) { this._hudT = 0; this.updateHUD(); this.hud.update(); if (DEBUG) updateFps(); }
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------------------------------------------------------------- الواجهة الافتتاحية
function showError(msg) {
  const el = document.getElementById('xr-status');
  el.textContent = msg;
  el.className = 'status bad';
}
let _fpsLast = performance.now(), _fpsFrames = 0;
function countFrame() { _fpsFrames++; }
function updateFps() {
  const el = document.getElementById('fps');
  if (!el) return;
  const now = performance.now();
  el.style.display = 'block';
  el.textContent = `${Math.round((_fpsFrames * 1000) / Math.max(1, now - _fpsLast))} fps`;
  _fpsLast = now; _fpsFrames = 0;
}
function renderLastResult() {
  const el = document.getElementById('last-result');
  const last = ScoringSystem.loadLast();
  if (!el) return;
  if (!last) { el.style.display = 'none'; return; }
  const s = last.summary;
  el.style.display = 'block';
  el.innerHTML = `<strong>آخر نتيجة محفوظة على هذا الجهاز</strong> (${new Date(last.date).toLocaleString('ar')}):
    الأداء العملي ${s.practical.pct.toFixed(1)}% · الاختبار ${s.exam.pct.toFixed(1)}% · النهائية <b>${s.final.toFixed(1)}%</b> — ${s.passed ? '<span class="ok">ناجح</span>' : '<span class="no">لم يتحقق الاجتياز</span>'}`;
}

async function boot() {
  const loading = document.getElementById('loading');
  await loadFonts();
  await loadBrand();
  const characters = new CharacterLibrary();
  await characters.load((p) => { loading.textContent = `جارٍ تحميل الشخصيات… ${Math.round(p * 100)}%`; });
  if (characters.errors.length) console.warn('استُخدمت الشخصيات البديلة لبعض الأدوار:', characters.errors);
  let app;
  try {
    app = new App(characters);
  } catch (e) {
    console.error(e);
    loading.textContent = 'حدث خطأ أثناء تحميل المختبر: ' + e.message;
    return;
  }
  loading.style.display = 'none';
  document.getElementById('menu').classList.add('ready');
  renderLastResult();

  const support = await app.vr.checkSupport();
  const vrBtn = document.getElementById('btn-vr');
  const startBtn = document.getElementById('btn-start');
  const status = document.getElementById('xr-status');
  const hudVr = document.getElementById('hud-vr');
  if (support.supported) {
    vrBtn.style.display = '';
    hudVr.style.display = '';
    status.textContent = '✓ جهاز الواقع الافتراضي جاهز (WebXR immersive-vr مدعوم).';
    status.className = 'status ok';
  } else {
    vrBtn.style.display = 'none'; // لا نعرض زر الدخول دون إمكانية فعلية
    hudVr.style.display = 'none';
    status.textContent = support.reason + ' يمكنك استخدام وضع المعاينة على الكمبيوتر.';
    status.className = 'status warn';
  }
  startBtn.addEventListener('click', () => (support.supported ? app.startVR() : app.startDesktop()));
  vrBtn.addEventListener('click', () => app.startVR());
  hudVr.addEventListener('click', () => app.startVR());
  document.getElementById('btn-desktop').addEventListener('click', () => app.startDesktop());
  document.querySelectorAll('[data-sound]').forEach(b => b.addEventListener('click', () => { app.audio.init(); app.audio.toggleMute(); app._syncSoundButtons(); }));
  document.getElementById('hud-station').addEventListener('click', () => app.sceneManager.returnToStation());
  if (CONFIG.preview.allowSkip && CONFIG.preview.showNav) {
    document.getElementById('hud-prev').addEventListener('click', () => app.sceneManager.prev());
    document.getElementById('hud-next').addEventListener('click', () => app.sceneManager.next());
  } else document.getElementById('hud-nav').style.display = 'none';
  document.getElementById('hud-min').addEventListener('click', (e) => {
    const h = document.getElementById('hud');
    h.classList.toggle('min');
    e.currentTarget.textContent = h.classList.contains('min') ? '▸' : '▾';
  });
  document.getElementById('hud-help').addEventListener('click', () => document.getElementById('help').classList.toggle('open'));
  document.getElementById('help-close').addEventListener('click', () => document.getElementById('help').classList.remove('open'));
  if (params.has('autostart')) app.startDesktop();
}

boot();
