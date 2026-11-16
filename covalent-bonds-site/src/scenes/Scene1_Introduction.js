// ============================================================================
//  المشهد الأول: التهيئة — ما الذي يمسك الذرات؟ (≈ 1:32)
//  عرض الأسبرين من القرص إلى المستوى الجزيئي، محطة السلامة (بند حرج 20)،
//  والسؤال القبلي غير المحتسب.
// ============================================================================
import * as THREE from 'three';
import { BaseScene } from '../sceneManager.js';
import { TextPanel, Panel, Button } from '../ui/VRPanel.js';
import { QuizPanel } from '../ui/QuizPanel.js';
import { drawText, fillRound, COLORS } from '../ui/text.js';
import { buildStaticMolecule } from '../objects/Molecule.js';
import { GEO, elementMaterial } from '../objects/Atom.js';
import { ASPIRIN } from '../data/molecules.js';
import { createSafetyFigure } from '../objects/LabTools.js';
import { buildPropGoggles } from '../objects/Apparel.js';
import { registerTarget, disposeTree } from '../core/registry.js';
import { Q } from '../data/questions.js';
import { CONFIG } from '../config.js';
import { ELEMENTS } from '../chemistryEngine.js';

const hitMat = new THREE.MeshBasicMaterial({ visible: false });

export class Scene1_Introduction extends BaseScene {
  static stage = 1;
  static title = 'التهيئة';

  async enter() {
    this.mount('intro');
    this.activeZone = 'intro';
    this.addTask('watch', 'شاهد عرض الأسبرين واستمع إلى المعلم');
    this.addTask('safety', 'محطة السلامة: حدّد الخطأين واختر التصرف الصحيح');
    this.addTask('selfGear', 'ارتدِ معطف المختبر ونظارتك الواقية');
    this.addTask('pre', 'أجب عن السؤال القبلي');
    this._buildIntro();
    this.safetyRoot = new THREE.Group();
    this.app.lab.zoneRoot('safety').add(this.safetyRoot);
    this._buildSafety();
  }
  onExit() { disposeTree(this.safetyRoot); }

  start() {
    const t = this.app.teacher;
    t.placeAt(this.app.lab.zoneRoot('intro'), new THREE.Vector3(1.25, 0, -1.0), new THREE.Vector3(0, 0, 0.95));
    t.say('أهلًا بك في مختبر الكيمياء الافتراضي! أنا معلمك اليوم. انظر إلى الشاشة واضغط زر «ابدأ العرض» على المنصة أمامك.');
  }

  // ---------------------------------------------------------------- العرض
  _buildIntro() {
    const r = this.root;
    // عنوان أعلى الشاشة
    this.caption = new TextPanel({ title: '', body: 'ما الذي يمسك الذرات معًا؟', width: 2.4, height: 0.2, bodySize: 64, align: 'center', bg: 'rgba(10,22,38,0.0)', border: 'rgba(0,0,0,0)' });
    this.caption.position.set(0, 2.36, -2.2);
    r.add(this.caption);

    // قرص المسكّن
    const tabMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true });
    this.tablet = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 48), tabMat);
    disc.rotation.x = Math.PI / 2;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.01), new THREE.MeshLambertMaterial({ color: 0xd8dde3, transparent: true }));
    groove.position.z = 0.036;
    this.tablet.add(disc, groove);
    this.tablet.position.set(0, 1.7, -2.1);
    this.tabMats = [tabMat, groove.material];
    r.add(this.tablet);

    // حقل الجزيئات المجهري (Instancing: جزيئات أسبرين حقيقية مصغّرة)
    const N = 26, A = ASPIRIN.atoms.length;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    this.field = new THREE.InstancedMesh(GEO.sphereLow, mat, N * A);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
    this.fieldMols = [];
    let k = 0;
    for (let i = 0; i < N; i++) {
      const center = new THREE.Vector3((Math.random() - 0.5) * 2.3, (Math.random() - 0.5) * 1.15, (Math.random() - 0.5) * 0.25);
      const rot = new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.fieldMols.push({ center, rot, spin: (Math.random() - 0.5) * 0.6 });
      for (let j = 0; j < A; j++) {
        c.setHex(ELEMENTS[ASPIRIN.atoms[j][0]].color);
        this.field.setColorAt(k++, c);
      }
    }
    this.field.position.set(0, 1.75, -2.15);
    this.field.frustumCulled = false;
    this.field.visible = false;
    r.add(this.field);
    this._layoutField(0);

    // الجزيء الكبير (كرة وعصا) — قابل للإمساك والتدوير بعد العرض
    this.aspirin = new THREE.Group();
    const mol = buildStaticMolecule(ASPIRIN, { scale: 0.1, atomScale: 0.55 });
    this.aspirin.add(mol);
    this.aspirin.position.set(0, 1.72, -1.95);
    this.aspirin.scale.setScalar(0.001);
    this.aspirin.visible = false;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), hitMat);
    this.aspirin.add(hit);
    r.add(this.aspirin);
    this.aspirinGrabbable = false;
    registerTarget(hit, {
      kind: 'grab', object: this.aspirin, homeParent: r, gravity: false,
      enabled: () => this.aspirinGrabbable,
      onGrab: () => { this.aspirinSpin = false; },
      onRelease: () => { this.aspirinSpin = true; return true; },
    });
    this.aspirinSpin = true;

    // الصيغة + مفتاح الألوان
    this.formula = new Panel({
      width: 2.5, height: 0.42, bg: 'rgba(10,22,38,0.85)', border: COLORS.accent,
      draw: (ctx, w, h) => {
        drawText(ctx, 'C₉H₈O₄', w * 0.82, 70, { size: 140, weight: 800, align: 'center', color: '#ffffff', dir: 'ltr' });
        drawText(ctx, 'الأسبرين: ذرات مختلفة مرتبطة معًا', w * 0.82, 260, { size: 44, weight: 700, align: 'center', color: COLORS.muted });
        const legend = [['C', 'كربون'], ['H', 'هيدروجين'], ['O', 'أكسجين'], ['N', 'نيتروجين'], ['Cl', 'كلور']];
        legend.forEach(([el, name], i) => {
          const x = w * 0.6 - i * (w * 0.115), y = 120;
          const col = '#' + ELEMENTS[el].color.toString(16).padStart(6, '0');
          ctx.beginPath(); ctx.arc(x - 40, y + 24, 30, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
          drawText(ctx, el, x - 40, y + 70, { size: 40, weight: 800, align: 'center', dir: 'ltr' });
          drawText(ctx, name, x - 40, y + 120, { size: 32, weight: 600, align: 'center', color: COLORS.muted });
        });
      },
    });
    this.formula.position.set(0, 1.18, -2.18);
    this.formula.visible = false;
    r.add(this.formula);

    // منصة التحكم
    const consoleG = new THREE.Group();
    consoleG.position.set(0, 1.1, -0.05);
    consoleG.rotation.x = -0.6;
    r.add(consoleG);
    const info = new TextPanel({ title: 'منصة العرض', body: 'وجّه الشعاع إلى الزر واضغط الزناد، أو المسه بيدك.', width: 0.62, height: 0.2, titleSize: 34, bodySize: 26 });
    info.position.set(0, 0.17, 0);
    consoleG.add(info);
    this.playBtn = new Button({ label: '▶ ابدأ العرض', width: 0.3, height: 0.08, style: 'primary', onClick: () => this.playShow() });
    this.playBtn.position.set(0.16, 0.0, 0);
    this.goSafetyBtn = new Button({ label: 'محطة السلامة ⟵', width: 0.3, height: 0.08, enabled: false, onClick: () => this.goSafety() });
    this.goSafetyBtn.position.set(-0.16, 0.0, 0);
    consoleG.add(this.playBtn, this.goSafetyBtn);

    this.show = { t: 0, playing: false, done: false };
    this.onUpdate((dt) => this._tickShow(dt));
  }

  _layoutField(t) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const atomScale = 0.012;
    let k = 0;
    for (const fm of this.fieldMols) {
      const e = new THREE.Euler(fm.rot.x + t * fm.spin, fm.rot.y + t * fm.spin * 0.7, fm.rot.z);
      q.setFromEuler(e);
      for (const [el, x, y, z] of ASPIRIN.atoms) {
        const p = new THREE.Vector3(x - 1.5, y - 1, z).multiplyScalar(0.022).applyQuaternion(q).add(fm.center).add(new THREE.Vector3(0, Math.sin(t * 0.6 + fm.center.x * 3) * 0.02, 0));
        sc.setScalar(el === 'H' ? atomScale * 0.7 : atomScale);
        m4.compose(p, new THREE.Quaternion(), sc);
        this.field.setMatrixAt(k++, m4);
      }
    }
    this.field.instanceMatrix.needsUpdate = true;
  }

  async playShow() {
    if (this.show.playing) return;
    this.show = { t: 0, playing: true, done: this.show.done };
    this.playBtn.setLabel('↻ أعد العرض');
    this.aspirinGrabbable = false;
    const t = this.app.teacher;
    await t.say('هذا قرص مسكّن للألم. لنقترب منه أكثر فأكثر حتى نرى مما يتكوّن.');
  }

  _tickShow(dt) {
    const s = this.show;
    if (this.aspirin.visible && this.aspirinSpin) this.aspirin.rotation.y += dt * 0.35;
    if (!s.playing) return;
    s.t += dt;
    const t = s.t;
    const cap = (txt) => { if (this._cap !== txt) { this._cap = txt; this.caption.setText({ body: txt }); } };
    const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
    // 1) القرص
    if (t < 3) cap('قرص مسكّن للألم');
    else if (t < 6) cap('تكبير… ننتقل إلى المستوى المجهري');
    else if (t < 10.5) cap('المستوى المجهري: جزيئات الأسبرين');
    else if (t < 14) cap('نموذج الكرة والعصا لجزيء واحد');
    else cap('الصيغة الجزيئية للأسبرين');
    const tabScale = 1 + smooth(3, 6, t) * 4;
    this.tablet.scale.setScalar(tabScale);
    const tabOp = 1 - smooth(4.5, 6.2, t);
    this.tabMats.forEach(m => { m.opacity = tabOp; });
    this.tablet.visible = tabOp > 0.01;
    // 2) الحقل المجهري
    const fOp = smooth(5, 7, t) * (1 - smooth(10, 11.5, t));
    this.field.material.opacity = fOp;
    this.field.visible = fOp > 0.01;
    if (this.field.visible) this._layoutField(t);
    // 3) الجزيء الكبير
    const aS = smooth(10.5, 13, t);
    this.aspirin.visible = aS > 0.001;
    this.aspirin.scale.setScalar(Math.max(0.001, aS));
    // 4) الصيغة
    this.formula.visible = t > 14;
    if (t > 14 && !s.formulaSaid) {
      s.formulaSaid = true;
      this.app.audio.play('correct');
      this._afterShow();
    }
    if (t > 16) { s.playing = false; this.aspirinGrabbable = true; }
  }

  async _afterShow() {
    const t = this.app.teacher;
    await t.say('الأسبرين C₉H₈O₄ يتكوّن من 9 ذرات كربون و8 ذرات هيدروجين و4 ذرات أكسجين مرتبطة معًا. يمكنك الإمساك بالنموذج وتدويره.');
    if (!this.alive) return;
    await t.say('سؤالي لك: كيف ترتبط الذرات مع بعضها دون أن تتحول إلى أيونات؟');
    if (!this.alive) return;
    await t.say('في هذا الدرس سنكتشف الروابط التساهمية: ذرات تتشارك أزواجًا من الإلكترونات. لكن أولًا — السلامة! توجّه إلى محطة السلامة.');
    if (!this.alive) return;
    this.done('watch');
    this.goSafetyBtn.setEnabled(true);
    this.goSafetyBtn.setStyle('primary');
  }

  async goSafety() {
    this.activeZone = 'safety';
    await this.app.sceneManager.moveTo('safety');
    if (!this.alive) return;
    const t = this.app.teacher;
    // المعلم يقف بجانب لوحة التعليمات (يسارها) لا خلفها، ومواجهًا للطالب
    t.placeAt(this.app.lab.zoneRoot('safety'), new THREE.Vector3(-1.95, 0, -0.45), new THREE.Vector3(0, 0, 0.9));
    t.say('انظر إلى زملائك خلف الطاولة. هناك موقفان خاطئان. وجّه الشعاع إلى الشخص الذي يرتكب خطأً واضغط الزناد.');
  }

  // ---------------------------------------------------------------- السلامة
  _buildSafety() {
    const r = this.safetyRoot;
    const z = -2.0;
    const mk = (role, hazard) => ({ fig: createSafetyFigure(this.app, role), hazard, resolved: false });
    this.figures = { noGear: mk('noGear', true), correct: mk('correct', false), teeth: mk('teeth', true) };
    const xs = { noGear: -0.6, correct: 0, teeth: 0.6 };
    for (const [id, f] of Object.entries(this.figures)) {
      f.obj = f.fig.obj;
      f.obj.position.set(xs[id], 0, z);
      r.add(f.obj);
      registerTarget(f.fig.hit, {
        kind: 'pick',
        enabled: () => !f.resolved && !this.safetyDone,
        onHover: (on) => f.fig.setHighlight(on ? 0x333322 : 0),
        onPress: () => this._onFigure(id),
      });
    }
    this.onUpdate((dt) => { for (const f of Object.values(this.figures)) f.fig.update(dt); });
    // أدوات على الطاولة: كماشة وزنبرك وكؤوس
    const bench = new THREE.Group();
    bench.position.set(0, 0.92, -1.3);
    r.add(bench);
    const plMetal = new THREE.MeshPhongMaterial({ color: 0x9aa6b2, shininess: 100 });
    const plRed = new THREE.MeshPhongMaterial({ color: 0xc8323a });
    this.pliers = new THREE.Group();
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.12, 8), plRed);
      h.rotation.z = Math.PI / 2; h.rotation.y = s * 0.15; h.position.set(0.06, 0.01, s * 0.01);
      const j = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.009, 0.009), plMetal);
      j.position.set(-0.03, 0.01, s * 0.004);
      this.pliers.add(h, j);
    }
    this.pliers.position.set(0.5, 0, 0.1);
    bench.add(this.pliers);
    const plLabel = new Panel({ width: 0.16, height: 0.05, ppm: 1600, bg: 'rgba(10,18,30,0.85)', border: COLORS.warn, radius: 14, draw: (ctx, w, h) => drawText(ctx, 'كماشة', w / 2, 10, { size: 46, weight: 800, align: 'center' }) });
    plLabel.position.set(0.5, 0.06, 0.1);
    bench.add(plLabel);
    const glass = new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.5, shininess: 100 });
    for (const x of [-0.5, -0.3, 0.1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.11, 14, 1, true), glass);
      b.position.set(x, 0.055, 0); bench.add(b);
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.033, 0.05, 14), new THREE.MeshLambertMaterial({ color: x < 0 ? 0x7fd0ff : 0xffb37f }));
      liq.position.set(x, 0.03, 0); bench.add(liq);
    }

    // نظارتان واقيتان قابلتان للالتقاط: واحدة لزميلك وواحدة لك
    this.goggleProps = {};
    const mkProp = (which, x, label) => {
      const prop = buildPropGoggles(0.95);
      prop.position.set(x, 0.92 + 0.034, -1.08);
      prop.rotation.y = which === 'peer' ? 0.35 : -0.2;
      prop.name = 'goggles_' + which;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.22), new THREE.MeshBasicMaterial({ visible: false }));
      prop.add(hit);
      r.add(prop);
      const lensMats = [];
      prop.traverse(o => { if (o.material?.emissive && o !== hit) lensMats.push(o.material); });
      registerTarget(hit, {
        kind: 'grab', object: prop, homeParent: r,
        onHover: (on) => lensMats.forEach(m => m.emissive.setHex(on ? 0x335577 : 0)),
        onGrab: () => { prop.userData.grabStart = prop.getWorldPosition(new THREE.Vector3()); },
        onRelease: (p) => this._onGogglesReleased(which, prop, p),
      });
      const tag = new Panel({ width: 0.16, height: 0.045, ppm: 1600, bg: 'rgba(10,18,30,0.85)', border: COLORS.accent, radius: 12, draw: (ctx, w, h) => drawText(ctx, label, w / 2, 8, { size: 40, weight: 800, align: 'center' }) });
      tag.rotation.x = -Math.PI / 2.6;
      tag.position.set(x, 0.925, -0.97);
      r.add(tag);
      this.goggleProps[which] = { prop, tag };
    };
    mkProp('peer', -0.42, 'نظارة لزميلك');
    mkProp('self', 0.12, 'نظارتك');
    this.noGearAwaiting = false;
    this._buildCoatStand(r);

    // لوحة التعليمات (يسار) ولوحة القرار (يمين)
    this.safetyInfo = new TextPanel({
      title: 'محطة السلامة — 20 نقطة (بند حرج)',
      body: 'حدّد الموقفين الخاطئين: وجّه الشعاع إلى الشخص واضغط الزناد.\nتنبيه: اختيار شخص يلتزم بالسلامة يُحسب خطأً.',
      width: 0.9, height: 0.42, titleSize: 36, bodySize: 30,
    });
    this.safetyInfo.position.set(-1.0, 1.55, -0.35);
    this.safetyInfo.rotation.y = 0.7;
    r.add(this.safetyInfo);
    this.decisionSlot = new THREE.Group();
    this.decisionSlot.position.set(0.95, 1.85, -0.3);
    this.decisionSlot.rotation.y = -0.7;
    r.add(this.decisionSlot);
    this.safetyErrors = 0;
    this.safetyDone = false;
  }

  _setDecision(obj) {
    for (const c of [...this.decisionSlot.children]) disposeTree(c);
    if (obj) this.decisionSlot.add(obj);
  }

  _onFigure(id) {
    const f = this.figures[id];
    const t = this.app.teacher;
    if (id === 'noGear' && this.noGearAwaiting) {
      this.app.toast('التقط «نظارة لزميلك» من الطاولة وقرّبها من رأسه ثم أفلتها.', 'info');
      return;
    }
    if (!f.hazard) {
      this.safetyErrors++;
      this.app.scoring.addMistake('safety');
      this.app.audio.play('error');
      f.fig.setHighlight(0x550000);
      setTimeout(() => f.fig.setHighlight(0), 700);
      this.app.toast('هذه الطالبة/الطالب يرتدي النظارة والمعطف ويعمل بأمان — ليس خطأً. ابحث عن موقف آخر.', 'warn');
      t.say('تلميح: انظر إلى ما يرتديه كل شخص، وإلى ما يفعله بيديه وفمه.');
      return;
    }
    this.app.audio.play('correct');
    const defs = {
      noGear: {
        q: 'هذا الطالب لا يرتدي النظارة الواقية ولا معطف المختبر. ما التصرف الصحيح؟',
        options: ['يرتدي النظارة الواقية ومعطف المختبر قبل بدء أي عمل.', 'يكمل العمل بسرعة ثم يرتديهما لاحقًا.', 'يكتفي بالوقوف بعيدًا قليلًا عن الطاولة.'],
        hints: [null, 'الخطر قائم منذ اللحظة الأولى؛ الرذاذ لا ينتظر.', 'الابتعاد لا يحمي العينين ولا الجلد من الرذاذ.'],
        exp: 'النظارة تحمي العينين من الرذاذ والشظايا، والمعطف يحمي الجلد والملابس من المواد الكيميائية.',
      },
      teeth: {
        q: 'هذه الطالبة تحاول نزع زنبرك عالق بأسنانها رغم وجود كماشة بجانبها. ما التصرف الصحيح؟',
        options: ['تستخدم الكماشة الموجودة بجانبها لفك الزنبرك.', 'تستمر بأسنانها لكن بحذر أكبر.', 'تطلب من زميلها سحبه بيده بقوة.'],
        hints: [null, 'وضع الأدوات في الفم خطر مهما كان الحذر.', 'السحب العنيف باليد قد يُطلق الزنبرك ويؤذي أحدًا.'],
        exp: 'وضع الأدوات في الفم يعرّضك للتلوث الكيميائي ويؤذي الأسنان؛ الكماشة هي الأداة المناسبة لفك الزنبرك العالق.',
      },
    }[id];
    const quiz = new QuizPanel({
      title: 'اختر التصرف الصحيح', question: defs.q, options: defs.options, correct: 0,
      explanation: defs.exp, hints: defs.hints, mode: 'retry', width: 0.95, bodySize: 30, optionHeight: 0.09,
      onAnswer: (i, ok) => {
        if (!ok) { this.safetyErrors++; this.app.scoring.addMistake('safety'); this.app.audio.play('error'); return; }
        this.app.audio.play('correct');
        this._fixFigure(id);
        if (id === 'noGear') {
          // خطوة عملية: يلبس الطالب زميله النظارة بيده
          this.noGearAwaiting = true;
          this.safetyInfo.setText({ title: 'ألبس زميلك النظارة الواقية', body: 'التقط «نظارة لزميلك» من الطاولة، وقرّبها من رأسه ثم أفلتها.\nفي وضع المعاينة: يكفي النقر عليها.' });
          t.say('أحسنت، لبس المعطف. الآن التقط النظارة الواقية من الطاولة وألبسها لزميلك: قرّبها من رأسه ثم أفلتها.');
          return;
        }
        f.resolved = true;
        t.say(defs.exp);
        this._checkSafety();
      },
    });
    this._setDecision(quiz);
    f.fig.setHighlight(0x224422);
  }

  _fixFigure(id) {
    const f = this.figures[id];
    // مكان الزنبرك على الطاولة أمام الطالبة بعد استخدام الكماشة
    const springSpot = this.safetyRoot.localToWorld(new THREE.Vector3(0.55, 0.935, -1.15));
    f.fig.fix({ pliers: id === 'teeth' ? this.pliers : null, springSpotWorld: springSpot });
    f.fig.setHighlight(0x0a3a1a);
    this.app.effects.burst(f.obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.6, 0)));
  }

  /** إفلات نظارة: قرب رأس الزميل ← يلبسها، قرب رأسك ← تلبسها أنت، وإلا تسقط على الطاولة */
  _onGogglesReleased(which, prop, p) {
    const wp = prop.getWorldPosition(new THREE.Vector3());
    const start = prop.userData.grabStart || wp;
    const click = p.kind === 'mouse' && wp.distanceTo(start) < 0.03; // نقرة بلا سحب في المعاينة
    const head = this.app.camera.getWorldPosition(new THREE.Vector3());
    const peer = this.figures.noGear;
    const nearPeer = peer.fig.headWorld().distanceTo(wp) < 0.35;
    if (which === 'peer' && (nearPeer || click)) {
      if (!this.noGearAwaiting) {
        this.app.toast(peer.resolved ? 'زميلك يرتدي نظارته بالفعل.' : 'حدّد الموقف الخاطئ أولًا واختر التصرف الصحيح، ثم ألبس زميلك النظارة.', 'warn');
        return false;
      }
      this._removeProp('peer');
      peer.fig.wearGoggles();
      peer.resolved = true;
      this.noGearAwaiting = false;
      this.app.audio.play('success');
      this.app.effects.burst(peer.fig.headWorld(), 0x7fd4ff, 30);
      this.app.teacher.say('ممتاز! الآن يرتدي زميلك النظارة الواقية ومعطف المختبر. النظارة تحمي العينين من الرذاذ والشظايا.');
      this.safetyInfo.setText({ title: 'محطة السلامة — 20 نقطة (بند حرج)', body: 'أحسنت! زميلك يرتدي النظارة والمعطف الآن.\nابحث عن الموقف الخاطئ الآخر. ولا تنسَ: التقط «نظارتك» وارتدها.' });
      this._checkSafety();
      return true;
    }
    if (which === 'self' && (wp.distanceTo(head) < 0.32 || click)) {
      this._removeProp('self');
      this.app.setPlayerGoggles(true);
      this.app.audio.play('success');
      this.app.toast('ارتديت النظارة الواقية ✓ — احرص على ارتدائها طوال العمل في المختبر.', 'good');
      this._checkSelfGear();
      return true;
    }
    if (which === 'self' && wp.distanceTo(head) < 0.6) this.app.toast('قرّب النظارة أكثر من وجهك ثم أفلتها لترتديها.', 'info');
    return false;
  }

  /** معطف مختبر معلّق على حامل بجانب الطاولة — يلتقطه الطالب ويلبسه */
  _buildCoatStand(r) {
    const stand = new THREE.Group();
    stand.position.set(1.25, 0, -1.05);
    stand.rotation.y = -0.5;
    r.add(stand);
    const metal = new THREE.MeshLambertMaterial({ color: 0x8a96a3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.75, 10), metal);
    pole.position.y = 0.875;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 20), metal);
    base.position.y = 0.015;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8), metal);
    arm.rotation.x = Math.PI / 2; arm.position.set(0, 1.68, 0.1);
    stand.add(pole, base, arm);
    // المعطف المعلّق (أبيض طويل بأكمام وجيوب)
    const coat = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf3f5f7, side: THREE.DoubleSide, emissive: 0x000000 });
    const trim = new THREE.MeshLambertMaterial({ color: 0xc9d1da, emissive: 0x000000 });
    const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 24, Math.PI), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
    hanger.position.y = 0.0;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 12, Math.PI * 1.4), metal);
    hook.position.y = 0.19;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 0.9, 20, 1, true), white);
    body.scale.set(0.2, 1, 0.07); body.position.y = -0.45;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), white);
    shoulders.scale.set(0.2, 0.05, 0.07); shoulders.position.y = 0;
    const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.004), trim);
    lapelL.position.set(0.03, -0.1, 0.073); lapelL.rotation.z = 0.25;
    const lapelR = lapelL.clone(); lapelR.position.x = -0.03; lapelR.rotation.z = -0.25;
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.66, 0.004), trim);
    placket.position.set(0, -0.56, 0.075);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.004), trim);
    pocket.position.set(0.1, -0.18, 0.073);
    coat.add(hanger, hook, body, shoulders, lapelL, lapelR, placket, pocket);
    for (const s of [-1, 1]) {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.55, 10, 1, true), white);
      sleeve.position.set(s * 0.215, -0.3, 0); sleeve.rotation.z = s * 0.08;
      coat.add(sleeve);
    }
    coat.position.set(0, 1.62, 0.1);
    stand.add(coat);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.25), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = -0.42;
    coat.add(hit);
    const tag = new Panel({ width: 0.28, height: 0.06, ppm: 1400, bg: 'rgba(10,18,30,0.88)', border: COLORS.accent, radius: 14, draw: (ctx, w, h) => drawText(ctx, 'معطفك — التقطه والبسه', w / 2, 10, { size: 38, weight: 800, align: 'center' }) });
    tag.position.set(0, 1.83, 0.12);
    stand.add(tag);
    this.coatProp = { stand, coat, tag };
    registerTarget(hit, {
      kind: 'grab', object: coat, homeParent: r, gravity: false,
      onHover: (on) => { white.emissive.setHex(on ? 0x223344 : 0); trim.emissive.setHex(on ? 0x223344 : 0); },
      onGrab: () => { coat.userData.grabStart = coat.getWorldPosition(new THREE.Vector3()); },
      onRelease: (p) => {
        const wp = coat.getWorldPosition(new THREE.Vector3());
        const head = this.app.camera.getWorldPosition(new THREE.Vector3());
        const click = p.kind === 'mouse' && wp.distanceTo(coat.userData.grabStart || wp) < 0.03;
        // قرّبه من صدرك/رأسك ثم أفلته (أو انقر عليه في المعاينة)
        if (wp.distanceTo(head) < 0.75 || click) { this._wearCoat(); return true; }
        // يعود إلى الحامل إن أُفلت بعيدًا
        stand.attach(coat);
        coat.position.set(0, 1.62, 0.1); coat.rotation.set(0, 0, 0);
        this.app.toast('قرّب المعطف من جسمك ثم أفلته لترتديه.', 'info');
        return true;
      },
    });
  }

  _wearCoat() {
    if (!this.coatProp) return;
    disposeTree(this.coatProp.coat);
    disposeTree(this.coatProp.tag);
    this.coatProp = null;
    this.app.setPlayerCoat(true);
    this.app.audio.play('success');
    this.app.toast('ارتديت معطف المختبر ✓', 'good');
    this._checkSelfGear();
  }

  _checkSelfGear() {
    const a = this.app;
    if (this.isDone('selfGear')) return;
    if (a.playerWearsCoat && a.playerWearsGoggles) {
      this.done('selfGear');
      a.teacher.say('أحسنت! أنت الآن ترتدي معطف المختبر والنظارة الواقية؛ هكذا نبدأ أي عمل في المختبر بأمان.');
    } else if (a.playerWearsCoat) a.teacher.say('أحسنت، لبست المعطف. لا تنسَ نظارتك الواقية الموجودة على الطاولة.');
    else if (a.playerWearsGoggles) a.teacher.say('أحسنت، لبست النظارة. التقط معطفك من الحامل وارتدِه أيضًا.');
  }

  _removeProp(which) {
    const g = this.goggleProps[which];
    if (!g) return;
    disposeTree(g.prop);
    disposeTree(g.tag);
    this.goggleProps[which] = null;
  }

  _checkSafety() {
    if (!Object.values(this.figures).every(f => !f.hazard || f.resolved)) {
      this.app.toast('أحسنت! بقي موقف خاطئ آخر.', 'good');
      return;
    }
    this.safetyDone = true;
    const maxErr = CONFIG.scoring.safetyMaxErrorsForCredit;
    const credit = this.safetyErrors <= maxErr;
    this.app.scoring.record('safety', credit ? 20 : 0, { detail: `أخطاء: ${this.safetyErrors}` });
    this.safetyInfo.setText({
      title: credit ? 'السلامة: 20/20 ✓' : 'السلامة: 0/20',
      body: credit ? 'حدّدت الخطأين واخترت التصرف الصحيح دون أخطاء. اجتزت البند الحرج.'
        : `حدّدت الخطأين في النهاية، لكن البند الحرج يُمنح فقط عند التحديد دون أخطاء (عدد الأخطاء: ${this.safetyErrors}). تذكّر القواعد جيدًا.`,
      accent: credit ? COLORS.good : COLORS.bad,
    });
    this.done('safety');
    setTimeout(() => { if (this.alive) this._showPreTest(); }, 1800);
  }

  _showPreTest() {
    const q = Q.preHCl;
    const quiz = new QuizPanel({
      title: 'سؤال قبلي (غير محتسب)', question: q.text, options: q.options, correct: q.correct, mode: 'silent', width: 0.95, bodySize: 32,
      onAnswer: (i) => {
        this.app.assessment.setPreTest(i);
        this.app.toast('سُجّلت إجابتك. سنعود إلى هذا السؤال في نهاية التجربة لنقارن.', 'info');
        this.done('pre');
        const next = this.makeNextButton(quiz, new THREE.Vector3(0, -quiz.totalHeight - 0.08, 0), 'المرحلة الثانية: الفرضية ⟵');
        this.app.teacher.say('ممتاز. انتقل الآن إلى المرحلة الثانية لنتعلم كيف نمثّل الرابطة.');
      },
    });
    this._setDecision(quiz);
    this.app.teacher.say('قبل أن نبدأ: أجب عن هذا السؤال حسب معرفتك الحالية. لن يُحتسب في الدرجة.');
  }
}
