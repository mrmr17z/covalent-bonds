// ============================================================================
//  المشهد الرابع: الاستنتاج — شد الحبل (≈ 1:56)
//  المستوى المجهري: سحب إلكترونية للماء، تفسير المشاركة (30)، محاكاة شد الحبل
//  ELECTRON CLOUD TUG OF WAR لـ Cl2/HCl/NaCl (20)، والربط بالحياة اليومية.
// ============================================================================
import * as THREE from 'three';
import { BaseScene } from '../sceneManager.js';
import { TextPanel, Panel, Button, autoHeight } from '../ui/VRPanel.js';
import { QuizPanel } from '../ui/QuizPanel.js';
import { drawText, fillRound, COLORS } from '../ui/text.js';
import { buildStaticMolecule } from '../objects/Molecule.js';
import { GEO, elementMaterial } from '../objects/Atom.js';
import { ElectronCloud } from '../objects/ElectronCloud.js';
import { registerTarget, disposeTree } from '../core/registry.js';
import { WATER, ASPIRIN } from '../data/molecules.js';
import { Q } from '../data/questions.js';
import { EN, ELEMENTS, deltaEN, ionicCharacter, BOND_CLASS_LABEL } from '../chemistryEngine.js';
import { CONFIG } from '../config.js';

const hitMat = new THREE.MeshBasicMaterial({ visible: false });

const TOW_MODELS = {
  Cl2: { title: 'Cl₂', A: 'Cl', B: 'Cl', cls: 'pure' },
  HCl: { title: 'HCl', A: 'Cl', B: 'H', cls: 'polar' },     // A = الأعلى كهروسالبية (يسارًا)
  NaCl: { title: 'NaCl', A: 'Cl', B: 'Na', cls: 'ionic' },
};

export class Scene4_Conclusion extends BaseScene {
  static stage = 4;
  static title = 'الاستنتاج';

  async enter() {
    this.mount('concl');
    this.addTask('clouds', 'فعّل وضع السحب الإلكترونية حول جزيء الماء');
    this.addTask('sharing', 'أجب: لماذا تتشارك الذرات بالإلكترونات؟ (30 نقطة)');
    this.addTask('tug', 'شد الحبل: استكشف Cl₂ وHCl وNaCl وصنّف كلًّا منها (20 نقطة)');
    this.addTask('life', 'الربط بالحياة اليومية');
    this.clouds = [];
    this.onUpdate((dt, t) => { for (const c of this.clouds) c.update(dt, t); });
    this._buildEnvironment();
    this._buildWater();
    this.centerSlot = new THREE.Group();
    this.centerSlot.position.set(0, 2.1, -1.05);
    this.root.add(this.centerSlot);
    this._buildTug();
  }

  start() {
    this.app.teacher.placeAt(this.zoneRoot, new THREE.Vector3(-1.7, 0, -0.2), new THREE.Vector3(0, 0, 0.9));
    this.app.teacher.say('مرحبًا بك في المستوى المجهري! أمامك جزيء الماء H₂O. أمسكه وأدره، ثم فعّل وضع السحب الإلكترونية.');
  }

  _setCenter(obj) {
    for (const c of [...this.centerSlot.children]) disposeTree(c);
    if (obj) this.centerSlot.add(obj);
  }

  _buildEnvironment() {
    // قبة داكنة تمثّل "داخل المادة" + جسيمات خافتة
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 20), new THREE.MeshBasicMaterial({ color: 0x050b18, side: THREE.BackSide }));
    dome.position.set(0, 0.2, -0.6);
    this.root.add(dome);
    const N = 400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.1, Math.random() - 0.5).normalize().multiplyScalar(1.9 + Math.random() * 0.6);
      pos.set([v.x, v.y + 0.2, v.z - 0.6], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x6fb8ff, size: 0.012, transparent: true, opacity: 0.7 }));
    this.root.add(pts);
    this.onUpdate((dt) => { pts.rotation.y += dt * 0.02; });
    const light = new THREE.PointLight(0x9fd0ff, 2.5, 6);
    light.position.set(0, 2.2, -0.6);
    this.root.add(light);
  }

  // ---------------------------------------------------------------- الماء
  _buildWater() {
    const r = this.root;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.0, 24), new THREE.MeshLambertMaterial({ color: 0x1e2c40 }));
    ped.position.set(-0.8, 0.5, -1.0);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24), new THREE.MeshBasicMaterial({ color: 0x39b6ff }));
    glow.position.set(-0.8, 1.0, -1.0);
    r.add(ped, glow);
    this.water = new THREE.Group();
    this.waterHome = new THREE.Vector3(-0.8, 1.38, -1.0);
    this.water.position.copy(this.waterHome);
    r.add(this.water);
    const S = 0.2;
    const mol = buildStaticMolecule(WATER, { scale: S, atomScale: 0.5 });
    this.water.add(mol);
    // مواضع الذرات بعد التمركز
    const pO = mol.children[0].position.clone(), pH1 = mol.children[1].position.clone(), pH2 = mol.children[2].position.clone();
    this.waterClouds = new THREE.Group();
    this.waterClouds.visible = true;
    this.water.add(this.waterClouds);
    const add = (c) => { this.waterClouds.add(c); this.clouds.push(c); c.userData.target = c.targetOpacity; c.setOpacity(0); c.material.uniforms.uOpacity.value = 0; return c; };
    // سحابة الأكسجين: كثيفة
    const cO = add(new ElectronCloud({ low: 0x3f6bff, high: 0xff3d6e, width: 1.2, base: 0.55, opacity: 0.55 }));
    cO.position.copy(pO); cO.baseScale.setScalar(0.17); cO.scale.setScalar(0.17);
    // سحب الهيدروجين: خفيفة
    for (const ph of [pH1, pH2]) {
      const cH = add(new ElectronCloud({ low: 0x3fa9ff, high: 0x9fd0ff, width: 1.0, base: 0.2, opacity: 0.2 }));
      cH.position.copy(ph); cH.baseScale.setScalar(0.085); cH.scale.setScalar(0.085);
    }
    // سحب الروابط O–H: منحازة نحو الأكسجين (−X محليًا = جهة O)
    this.bondClouds = [];
    for (const ph of [pH1, pH2]) {
      const cb = add(new ElectronCloud({ low: 0x3fa9ff, high: 0xff4fd8, width: 0.55, base: 0.15, opacity: 0.5, shift: -0.45 }));
      cb.spanBetween(pO, ph, 0.065);
      this.bondClouds.push({ cloud: cb, mid: pO.clone().add(ph).multiplyScalar(0.5) });
    }
    // زوجان غير رابطين على الأكسجين
    for (const s of [-1, 1]) {
      const lp = add(new ElectronCloud({ low: 0x5f6bff, high: 0xff7fd0, width: 0.8, base: 0.3, opacity: 0.32 }));
      const dir = new THREE.Vector3(s * 0.55, 0.75, s * 0.3).normalize();
      lp.spanBetween(pO, pO.clone().addScaledVector(dir, 0.16), 0.05, 0.0);
    }
    this.waterCloudList = [...this.clouds];
    this.cloudsOn = false;
    // إمساك وتدوير
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), hitMat);
    this.water.add(hit);
    registerTarget(hit, { kind: 'grab', object: this.water, homeParent: r, gravity: false, onRelease: () => true });
    this.onUpdate((dt) => { if (!this.water.userData.heldBy && this.autoSpin) this.water.rotation.y += dt * 0.3; });
    this.autoSpin = true;

    // لوحة التحكم
    const ctrl = new THREE.Group();
    ctrl.position.set(-0.8, 1.02, -0.62);
    ctrl.rotation.x = -0.7;
    r.add(ctrl);
    this.cloudBtn = new Button({ label: 'إظهار السحب الإلكترونية', width: 0.36, height: 0.07, style: 'primary', onClick: () => this._toggleClouds() });
    this.cloudBtn.position.set(0, 0.05, 0);
    const zin = new Button({ label: 'تكبير +', width: 0.17, height: 0.065, onClick: () => this._zoom(1.25) });
    zin.position.set(0.095, -0.03, 0);
    const zout = new Button({ label: 'تصغير −', width: 0.17, height: 0.065, onClick: () => this._zoom(0.8) });
    zout.position.set(-0.095, -0.03, 0);
    const reset = new Button({ label: 'إعادة الوضع', width: 0.2, height: 0.055, onClick: () => { this.water.position.copy(this.waterHome); this.water.rotation.set(0, 0, 0); this.water.scale.setScalar(1); } });
    reset.position.set(0, -0.1, 0);
    ctrl.add(this.cloudBtn, zin, zout, reset);

    this.waterInfo = new TextPanel({
      title: 'جزيء الماء H₂O', body: 'أمسك الجزيء وأدره، واقترب منه. استخدم أزرار التكبير والتصغير.',
      width: 0.7, height: 0.3, titleSize: 34, bodySize: 27,
    });
    this.waterInfo.position.set(-1.0, 1.95, -1.15);
    this.waterInfo.rotation.y = 0.35;
    r.add(this.waterInfo);
  }

  _zoom(f) {
    const s = THREE.MathUtils.clamp(this.water.scale.x * f, 0.5, 3);
    this.water.scale.setScalar(s);
  }

  _toggleClouds() {
    this.cloudsOn = !this.cloudsOn;
    this.waterCloudList.forEach(c => c.setOpacity(this.cloudsOn ? c.userData.target : 0));
    this.cloudBtn.setLabel(this.cloudsOn ? 'إخفاء السحب الإلكترونية' : 'إظهار السحب الإلكترونية');
    if (this.cloudsOn) {
      this.waterInfo.setText({ body: 'السحب تمثل مناطق احتمال وجود الإلكترونات، لا مسارات لكرات تدور. لاحظ: السحابة أكثف قرب الأكسجين (الأعلى كهروسالبية 3.44) وأخف حول الهيدروجين (2.20).' });
      if (!this.isDone('clouds')) {
        this.done('clouds');
        this.app.teacher.say('لاحظ كيف تتكثف السحابة الإلكترونية قرب الأكسجين. الآن أجب عن السؤال أمامك.');
        this._showSharingQuiz();
      }
    }
  }

  _showSharingQuiz() {
    const q = Q.sharing;
    const quiz = new QuizPanel({
      title: 'تفسير المشاركة الإلكترونية (30 نقطة)', question: q.text, options: q.options, correct: q.correct, explanation: q.explanation,
      mode: 'feedback', width: 1.1, bodySize: 32,
      onAnswer: (i) => {
        const r = this.app.assessment.answerMCQ('sharing', i, q.correct, 30);
        this.app.audio.play(r.correct ? 'correct' : 'error');
        this._showSharedPairs();
        this.done('sharing', { sound: false });
        setTimeout(() => {
          if (!this.alive) return;
          this.app.teacher.say('الآن إلى محاكاة شد الحبل على اليمين: اسحب المقبض لترى كيف تشد الذرة الأعلى كهروسالبية السحابة الإلكترونية.');
          this._enableTug();
        }, 2500);
      },
    });
    this._setCenter(quiz);
  }

  /** شرح مرئي: نبض في منطقتي الزوجين المشتركين + تسمية */
  _showSharedPairs() {
    if (!this.cloudsOn) this._toggleClouds();
    for (const { cloud, mid } of this.bondClouds) {
      cloud.material.uniforms.uBase.value = 0.35;
      const tag = new Panel({ width: 0.24, height: 0.06, ppm: 1400, bg: 'rgba(10,18,30,0.85)', border: COLORS.gold, radius: 14, draw: (ctx, w, h) => drawText(ctx, 'زوج إلكتروني مشترك', w / 2, 12, { size: 40, weight: 800, align: 'center', color: COLORS.gold }) });
      tag.position.copy(mid).add(new THREE.Vector3(0, -0.07, 0.06));
      this.water.add(tag);
    }
    this.onUpdate((dt, t) => {
      for (const { cloud } of this.bondClouds) cloud.material.uniforms.uOpacity.value = 0.45 + 0.25 * Math.sin(t * 4);
    });
  }

  // ---------------------------------------------------------------- شد الحبل
  _buildTug() {
    const r = this.root;
    const base = new THREE.Group();
    base.position.set(0.85, 0, -1.0);
    r.add(base);
    this.tugRoot = base;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.35), new THREE.MeshLambertMaterial({ color: 0x1e2c40 }));
    ped.position.set(0, 0.5, -0.05);
    base.add(ped);
    const title = new Panel({ width: 0.8, height: 0.09, ppm: 1200, bg: 'rgba(10,18,30,0.0)', border: 'rgba(0,0,0,0)', draw: (ctx, w, h) => drawText(ctx, 'ELECTRON CLOUD TUG OF WAR — شد الحبل', w / 2, 14, { size: 46, weight: 800, align: 'center', color: COLORS.accent }) });
    title.position.set(0, 1.72, 0);
    base.add(title);
    this.towDisplay = new THREE.Group();
    this.towDisplay.position.set(0, 1.42, 0);
    base.add(this.towDisplay);
    this.towInfo = new TextPanel({ title: 'شد الحبل', body: 'أجب عن سؤال المشاركة أولًا لتفعيل المحاكاة.', width: 0.78, height: 0.42, titleSize: 34, bodySize: 26 });
    this.towInfo.position.set(0.95, 1.55, 0.1);
    this.towInfo.rotation.y = -0.45;
    base.add(this.towInfo);
    // أزرار النماذج
    this.modelBtns = Object.keys(TOW_MODELS).map((k, i) => {
      const b = new Button({ label: TOW_MODELS[k].title, width: 0.2, height: 0.07, fontSize: 36, enabled: false, onClick: () => this._loadModel(k) });
      b.position.set(0.24 - i * 0.24, 1.13, 0.13);
      base.add(b);
      return { k, b };
    });
    // المنزلق (السكة + المقبض)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.014, 0.03), new THREE.MeshLambertMaterial({ color: 0x39b6ff }));
    rail.position.set(0, 1.03, 0.14);
    base.add(rail);
    this.railLen = 0.46;
    this.handleMat = new THREE.MeshPhongMaterial({ color: 0xffc145, emissive: 0x000000 });
    this.sliderHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 16), this.handleMat);
    this.sliderHandle.rotation.x = Math.PI / 2;
    base.add(this.sliderHandle);
    const handleHit = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), hitMat);
    this.sliderHandle.add(handleHit);
    const sliderLabel = new Panel({ width: 0.5, height: 0.05, ppm: 1400, bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', draw: (ctx, w, h) => drawText(ctx, 'اسحب المقبض ← لشد الحبل', w / 2, 8, { size: 40, weight: 700, align: 'center', color: COLORS.muted }) });
    sliderLabel.position.set(0, 0.97, 0.16);
    base.add(sliderLabel);
    this.slider = 0;
    this._placeHandle();
    this.tugEnabled = false;
    registerTarget(handleHit, {
      kind: 'handle', gravity: false,
      enabled: () => this.tugEnabled && !!this.model,
      onHover: (on) => this.handleMat.emissive.setHex(on ? 0x664400 : 0),
      onHeldUpdate: (p, hand) => {
        const local = base.worldToLocal(hand.clone());
        // 0 عند اليمين و1 عند اليسار (اتجاه RTL)
        const v = THREE.MathUtils.clamp((this.railLen / 2 - local.x) / this.railLen, 0, 1);
        this._setSlider(v);
      },
      onRelease: () => true,
    });
    this.towResults = {};
    this.onUpdate((dt, t) => this._tickTug(dt, t));
  }

  _placeHandle() { this.sliderHandle.position.set(this.railLen / 2 - this.slider * this.railLen, 1.03, 0.16); }

  _enableTug() {
    this.tugEnabled = true;
    this.modelBtns.forEach(m => m.b.setEnabled(true));
    this.towInfo.setText({ body: 'اختر نموذجًا (Cl₂ أو HCl أو NaCl)، ثم اسحب المقبض الأصفر حتى نهاية السكة وراقب السحابة الإلكترونية.' });
    this._loadModel('Cl2');
  }

  _loadModel(k) {
    for (const c of [...this.towDisplay.children]) disposeTree(c);
    this.clouds = this.clouds.filter(c => !c.userData.tow);
    const m = TOW_MODELS[k];
    this.modelKey = k;
    this.modelBtns.forEach(x => x.b.setStyle(x.k === k ? 'selected' : (this.towResults[x.k] ? 'correct' : 'default')));
    const d = deltaEN(m.A, m.B);
    const half = 0.17;
    const atoms = {};
    const mk = (el, x) => {
      const s = new THREE.Mesh(GEO.sphere, elementMaterial(el));
      const rad = el === 'H' ? 0.045 : el === 'Na' ? 0.075 : 0.065;
      s.scale.setScalar(rad);
      s.position.set(x, 0, 0);
      this.towDisplay.add(s);
      const lbl = new Panel({ width: 0.17, height: 0.075, ppm: 1400, bg: 'rgba(10,18,30,0.85)', border: 'rgba(0,0,0,0)', radius: 14, draw: (ctx, w, h) => drawText(ctx, `${el}  EN ${EN[el].toFixed(2)}`, w / 2, 16, { size: 40, weight: 800, align: 'center', dir: 'ltr' }) });
      lbl.position.set(x, 0.16, 0);
      this.towDisplay.add(lbl);
      return { mesh: s, rad, lbl, x };
    };
    atoms.A = mk(m.A, -half);   // الأعلى كهروسالبية على اليسار
    atoms.B = mk(m.B, half);
    const cloud = new ElectronCloud({ low: 0x3fa9ff, high: 0xff4fd8, width: 0.5, base: 0.2, opacity: 0.55 });
    cloud.userData.tow = true;
    // المحور المحلي +X من A إلى B: الإزاحة السالبة نحو A
    cloud.spanBetween(new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0), 0.085, 0.06);
    this.towDisplay.add(cloud);
    this.clouds.push(cloud);
    // الحبل والعقدة (مركز الكثافة)
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, half * 2 + 0.2, 8), new THREE.MeshLambertMaterial({ color: 0xd9c08a }));
    rope.rotation.z = Math.PI / 2;
    this.towDisplay.add(rope);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4f6e }));
    this.towDisplay.add(knot);
    // تسميات الشحنات
    const mkCharge = () => {
      const p = new Panel({ width: 0.2, height: 0.06, ppm: 1400, bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', draw: (ctx, w, h, self) => drawText(ctx, self.userData.text || '', w / 2, 6, { size: 48, weight: 800, align: 'center', dir: 'ltr', color: self.userData.color || '#fff' }) });
      p.visible = false;
      this.towDisplay.add(p);
      return p;
    };
    const chA = mkCharge(), chB = mkCharge();
    chA.position.set(-half, -0.13, 0.02); chB.position.set(half, -0.13, 0.02);
    // الإلكترون المنتقل (لـ NaCl فقط — تمثيل تعليمي)
    const electron = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffff66 }));
    electron.visible = false;
    this.towDisplay.add(electron);
    // خطوط التجاذب
    const attract = new THREE.Group();
    for (const y of [-0.04, 0, 0.04]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.2, 6), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8 }));
      l.rotation.z = Math.PI / 2; l.position.y = y;
      attract.add(l);
    }
    attract.visible = false;
    this.towDisplay.add(attract);

    this.model = { k, def: m, d, atoms, cloud, rope, knot, chA, chB, electron, attract, half, transferred: false, transferT: 0, classified: !!this.towResults[k] };
    this.slider = 0;
    this._placeHandle();
    this._lastChargeText = null;
    this._clearClassify();
    this._updateTowInfo();
  }

  _setSlider(v) {
    this.slider = v;
    this._placeHandle();
    const M = this.model;
    if (!M) return;
    if (M.k === 'NaCl' && v >= 0.7 && !M.transferred) {
      M.transferred = true; M.transferT = 0;
      this.app.audio.play('transfer');
    }
    if (v >= 0.95 && !M.classified && !this.classifyShown) this._showClassify();
  }

  _tickTug(dt, t) {
    const M = this.model;
    if (!M) return;
    const v = this.slider;
    const half = M.half;
    // الإزاحة مرتبطة بفرق الكهروسالبية (ليست عشوائية)
    const maxShift = Math.min(0.78, M.d * 0.55);
    if (!M.transferred) {
      const shift = -v * maxShift; // سالب = نحو A الأعلى كهروسالبية
      M.cloud.setShift(shift);
      M.cloud.visible = true;
      // مركز الكثافة على الحبل
      M.knot.position.set(shift * (half + 0.06), 0, 0);
      const delta = v * ionicCharacter(M.d);
      if (M.d > 0 && v > 0.02) {
        this._charges(`δ− ${delta.toFixed(2)}`, `δ+ ${delta.toFixed(2)}`, '#ff8fb0', '#8fd0ff');
      } else {
        this._charges(M.d === 0 && v > 0.3 ? 'لا شحنات' : '', '', '#cccccc', '#cccccc');
      }
      M.attract.visible = false;
      M.electron.visible = false;
      M.atoms.A.mesh.position.x = -half; M.atoms.B.mesh.position.x = half;
      M.rope.visible = true;
    } else {
      // NaCl: انتقال إلكترون ثم أيونات يجذب بعضها بعضًا
      M.transferT = Math.min(1, M.transferT + dt / 1.4);
      const e = M.transferT;
      M.electron.visible = e < 1;
      M.electron.position.set(THREE.MathUtils.lerp(half, -half, e), Math.sin(e * Math.PI) * 0.08, 0.02);
      const sep = THREE.MathUtils.lerp(half, half + 0.05, e);
      M.atoms.A.mesh.position.x = -sep; M.atoms.B.mesh.position.x = sep;
      M.atoms.B.mesh.scale.setScalar(M.atoms.B.rad * (1 - 0.35 * e)); // Na+ أصغر
      M.atoms.A.mesh.scale.setScalar(M.atoms.A.rad * (1 + 0.15 * e));  // Cl− أكبر
      M.cloud.setOpacity(0.55 * (1 - e));
      if (!M.ionClouds && e > 0.5) {
        M.ionClouds = [];
        const cA = new ElectronCloud({ low: 0x3f6bff, high: 0xff3d6e, width: 1.3, base: 0.6, opacity: 0.5 });
        cA.position.set(-sep, 0, 0); cA.baseScale.setScalar(0.12);
        const cB = new ElectronCloud({ low: 0x3fa9ff, high: 0x9fd0ff, width: 1.3, base: 0.6, opacity: 0.25 });
        cB.position.set(sep, 0, 0); cB.baseScale.setScalar(0.06);
        for (const c of [cA, cB]) { c.userData.tow = true; c.material.uniforms.uOpacity.value = 0; this.towDisplay.add(c); this.clouds.push(c); M.ionClouds.push(c); }
      }
      M.rope.visible = false;
      M.knot.position.set(-sep, 0, 0);
      M.attract.visible = e > 0.8;
      if (M.attract.visible) M.attract.children.forEach((l, i) => { l.material.opacity = 0.5 + 0.4 * Math.sin(t * 5 + i); });
      this._charges('Cl⁻', 'Na⁺', '#ff8fb0', '#8fd0ff');
    }
    M.atoms.A.lbl.position.x = M.atoms.A.mesh.position.x;
    M.atoms.B.lbl.position.x = M.atoms.B.mesh.position.x;
  }

  _charges(a, b, ca, cb) {
    const M = this.model;
    const key = a + '|' + b;
    if (this._lastChargeText === key) return;
    this._lastChargeText = key;
    M.chA.userData.text = a; M.chA.userData.color = ca; M.chA.visible = !!a; M.chA.redraw();
    M.chB.userData.text = b; M.chB.userData.color = cb; M.chB.visible = !!b; M.chB.redraw();
  }

  _updateTowInfo() {
    const M = this.model;
    const d = M.d;
    const txt = {
      Cl2: `ذرتا كلور متماثلتان (ΔEN = ${d.toFixed(2)}). كل ذرة تشد بالقوة نفسها، فتبقى السحابة متماثلة ولا تظهر شحنات جزئية.`,
      HCl: `الكلور (3.16) أقوى شدًا من الهيدروجين (2.20)، ΔEN = ${d.toFixed(2)}. تنحاز السحابة نحو Cl فتظهر δ− عند Cl و δ+ عند H (القيم توضيحية).`,
      NaCl: `ΔEN = ${d.toFixed(2)} كبير جدًا. في التمثيل التعليمي ينتقل إلكترون من Na إلى Cl فيتكون أيونا Na⁺ و Cl⁻. الرابطة الأيونية تجاذب كهروستاتيكي بين أيونات، وهي تختلف في طبيعتها عن مشاركة زوج إلكتروني.`,
    }[M.k];
    this.towInfo.setText({ title: `النموذج: ${M.def.title}`, body: txt });
  }

  _clearClassify() {
    if (this.classifyGroup) { disposeTree(this.classifyGroup); this.classifyGroup = null; }
    this.classifyShown = false;
  }

  _showClassify() {
    this.classifyShown = true;
    const M = this.model;
    const g = new THREE.Group();
    g.position.set(0, 0.82, 0.2);
    g.rotation.x = -0.5;
    const q = new TextPanel({ title: '', body: `ما نوع الرابطة في ${M.def.title}؟`, width: 0.7, height: 0.08, bodySize: 32, align: 'center' });
    q.position.y = 0.06;
    g.add(q);
    ['pure', 'polar', 'ionic'].forEach((cls, i) => {
      const b = new Button({ label: BOND_CLASS_LABEL[cls].replace('رابطة ', ''), width: 0.22, height: 0.065, onClick: () => this._classify(cls, b, g) });
      b.position.set(0.235 - i * 0.235, -0.03, 0);
      g.add(b);
    });
    this.tugRoot.add(g);
    this.classifyGroup = g;
    this.app.audio.play('click');
  }

  _classify(cls, btn, g) {
    const M = this.model;
    if (M.classified) return;
    M.classified = true;
    const ok = cls === M.def.cls;
    const idx = Object.keys(TOW_MODELS).indexOf(M.k);
    const pts = ok ? CONFIG.scoring.tugOfWarParts[idx] : 0;
    if (!ok) this.app.scoring.addMistake('tugOfWar');
    this.app.scoring.addPartial('tugOfWar', pts, { detail: `${M.def.title}: ${ok ? 'صحيح' : 'خطأ'}` });
    this.towResults[M.k] = { ok };
    btn.setStyle(ok ? 'correct' : 'wrong');
    this.app.audio.play(ok ? 'correct' : 'error');
    this.app.toast(ok ? `صحيح: ${M.def.title} — ${BOND_CLASS_LABEL[M.def.cls]}` : `الإجابة الصحيحة: ${BOND_CLASS_LABEL[M.def.cls]}`, ok ? 'good' : 'warn');
    this.modelBtns.forEach(x => x.b.setStyle(x.k === M.k ? 'selected' : (this.towResults[x.k] ? 'correct' : 'default')));
    setTimeout(() => {
      if (!this.alive) return;
      if (this.classifyGroup === g) this._clearClassify();
      const remaining = Object.keys(TOW_MODELS).filter(k => !this.towResults[k]);
      if (remaining.length) { this.app.toast(`انتقل إلى النموذج التالي: ${TOW_MODELS[remaining[0]].title}`, 'info'); }
      else if (!this.isDone('tug')) { this.done('tug'); this._dailyLife(); }
    }, 1600);
  }

  // ---------------------------------------------------------------- الحياة اليومية
  _dailyLife() {
    const t = this.app.teacher;
    t.placeAt(this.zoneRoot, new THREE.Vector3(-0.3, 0, -0.45), new THREE.Vector3(0, 0, 0.9));
    t.say('المركبات التساهمية حولنا في كل مكان: في الأدوية مثل الأسبرين، وفي الوقود والبلاستيك والأطعمة.');
    const g = new THREE.Group();
    const info = new TextPanel({
      title: 'الربط بالحياة اليومية',
      body: 'الأسبرين C₉H₈O₄ مركب جزيئي تساهمي.\nمقارنة درجات الانصهار التقريبية: النفثالين (جزيئي تساهمي) 80.2°C مقابل كلوريد الصوديوم (أيوني) 801°C.\nعند انصهار النفثالين نتغلب على قوى ضعيفة بين الجزيئات، أما في NaCl فنتغلب على تجاذب قوي بين أيونات في شبكة بلورية. لذلك الفرق يعود إلى طبيعة البنية والقوى، وليس لأن كل المركبات التساهمية منخفضة الانصهار (الماس تساهمي شبكي ويتجاوز 3500°C).',
      width: 1.15, height: 0.7, titleSize: 36, bodySize: 27,
    });
    info.position.y = -0.35;
    g.add(info);
    const ok = new Button({ label: 'فهمت ✓', width: 0.3, height: 0.08, style: 'primary', onClick: () => {
      if (this.isDone('life')) return;
      this.done('life');
      this.makeNextButton(g, new THREE.Vector3(0, -0.88, 0), 'المرحلة الخامسة: الاختبار ⟵');
      ok.visible = false;
    } });
    ok.position.set(0, -0.76, 0);
    g.add(ok);
    this._setCenter(g);
    // أعمدة درجات الانصهار (1 مم لكل درجة)
    const bars = new THREE.Group();
    bars.position.set(0, 0, -1.55);
    const mkBar = (x, h, color, label) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
      b.position.set(x, h / 2 + 0.04, 0);
      bars.add(b);
      const l = new Panel({ width: 0.36, height: 0.11, ppm: 1200, bg: 'rgba(10,18,30,0.85)', border: 'rgba(0,0,0,0)', draw: (ctx, w, hh) => { drawText(ctx, label[0], w / 2, 6, { size: 40, weight: 800, align: 'center' }); drawText(ctx, label[1], w / 2, 62, { size: 36, weight: 700, align: 'center', color: COLORS.gold }); } });
      l.position.set(x, h + 0.13, 0.02);
      bars.add(l);
    };
    mkBar(-0.32, 0.0802, 0x7fd0ff, ['النفثالين', '80.2°C']);
    mkBar(0.32, 0.801, 0xff8f6b, ['كلوريد الصوديوم', '801°C']);
    this.root.add(bars);
    // نموذج الأسبرين
    const asp = buildStaticMolecule(ASPIRIN, { scale: 0.045, atomScale: 0.55 });
    this.water.visible = false;
    asp.position.copy(this.waterHome);
    this.waterInfo.setText({ title: 'الأسبرين C₉H₈O₄', body: 'دواء شائع يتكون جزيئه من ذرات C وH وO مرتبطة بروابط تساهمية أحادية وثنائية.' });
    this.root.add(asp);
    this.onUpdate((dt) => { asp.rotation.y += dt * 0.4; });
  }
}
