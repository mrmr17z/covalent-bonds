// ============================================================================
//  المشهد الثاني: الفرضية — كيف نمثل الرابطة؟ (≈ 1:30)
//  صندوق نماذج بغطاء حقيقي، أدوات قابلة للالتقاط، بناء CO2 بزنبركين لكل رابطة
//  (بند حرج 20)، ثم المقارنة بين الكرة والعصا وتركيب لويس (10).
// ============================================================================
import * as THREE from 'three';
import { BaseScene } from '../sceneManager.js';
import { TextPanel, Panel, Button } from '../ui/VRPanel.js';
import { QuizPanel } from '../ui/QuizPanel.js';
import { drawText, fillRound, COLORS } from '../ui/text.js';
import { drawLewis } from '../ui/Lewis.js';
import { Workspace, buildStaticMolecule } from '../objects/Molecule.js';
import { createModelBox, createTool, createBoard } from '../objects/LabTools.js';
import { registerTarget } from '../core/registry.js';
import { analyzeCO2, bestAnalysis, ELEMENTS, EN, ionicPercent } from '../chemistryEngine.js';
import { CO2 } from '../data/molecules.js';
import { Q } from '../data/questions.js';
import { BENCH_H } from '../environment/Lab.js';
import { CONFIG } from '../config.js';

export function drawENTable(ctx, w, h) {
  drawText(ctx, 'جدول الكهروسالبية (باولنغ)', w / 2, 20, { size: 44, weight: 800, align: 'center', color: '#13314f' });
  const els = CONFIG.enTableElements;
  const cw = (w - 60) / els.length;
  els.forEach((el, i) => {
    const x = w - 30 - (i + 1) * cw;
    const col = '#' + ELEMENTS[el].color.toString(16).padStart(6, '0');
    const u = cw / 140;
    fillRound(ctx, x + 6, 90, cw - 12, h - 120, 18, '#e8eef5', col, 6);
    drawText(ctx, el, x + cw / 2, 110, { size: 62 * u, weight: 800, align: 'center', color: '#13314f', dir: 'ltr' });
    drawText(ctx, EN[el].toFixed(2), x + cw / 2, 110 + 90 * u, { size: 44 * u, weight: 800, align: 'center', color: '#1b6fb3', dir: 'ltr' });
    drawText(ctx, ELEMENTS[el].name, x + cw / 2, 110 + 160 * u, { size: 25 * u, weight: 700, align: 'center', color: '#3a4a5c' });
  });
}
export function drawIonicTable(ctx, w, h) {
  drawText(ctx, 'النسبة المئوية للخاصية الأيونية', w / 2, 20, { size: 42, weight: 800, align: 'center', color: '#13314f' });
  const rows = [0, 0.4, 0.96, 1.24, 1.7, 1.8, 2.23, 3.0];
  const top = 90, rh = (h - top - 20) / (rows.length + 1);
  drawText(ctx, 'ΔEN', w * 0.75, top, { size: 34, weight: 800, align: 'center', color: '#3a4a5c', dir: 'ltr' });
  drawText(ctx, 'الخاصية الأيونية', w * 0.32, top, { size: 32, weight: 800, align: 'center', color: '#3a4a5c' });
  rows.forEach((d, i) => {
    const y = top + (i + 1) * rh;
    const p = ionicPercent(d);
    drawText(ctx, d.toFixed(2), w * 0.75, y, { size: 32, weight: 700, align: 'center', color: '#13314f', dir: 'ltr' });
    fillRound(ctx, w * 0.08, y + 4, w * 0.48, rh * 0.6, 8, '#dde6ef');
    fillRound(ctx, w * 0.08, y + 4, Math.max(10, w * 0.48 * p / 100), rh * 0.6, 8, p > 50 ? '#d8322f' : p > 4 ? '#e0a100' : '#2fae4f');
    drawText(ctx, p + '%', w * 0.62, y, { size: 30, weight: 800, align: 'center', color: '#13314f', dir: 'ltr' });
  });
}

export class Scene2_Hypothesis extends BaseScene {
  static stage = 2;
  static title = 'الفرضية';

  async enter() {
    this.mount('hypo');
    this.addTask('open', 'افتح غطاء صندوق النماذج');
    this.addTask('co2', 'ابنِ CO₂ برابطتين ثنائيتين: O=C=O (20 نقطة)');
    this.addTask('hyp', 'اختر العبارة الصحيحة للمقارنة بين النموذجين (10 نقاط)');
    const r = this.root;
    const app = this.app;

    // الصندوق
    this.box = createModelBox(app, { onOpen: () => this._onOpen() });
    this.box.position.set(0.5, BENCH_H, -0.33);
    r.add(this.box);
    this.onUpdate((dt) => this.box.userData.update(dt));
    const o = this.zoneRoot.position;
    this.boxSurface = app.physics.addSurface({ minX: o.x + 0.18, maxX: o.x + 0.82, minZ: o.z - 0.53, maxZ: o.z - 0.13, y: BENCH_H + 0.012 });

    // مساحة البناء
    this.ws = new Workspace(app, r, { onChange: () => this._onChange() });
    this.ws.enabled = false;
    this.workspaces.push(this.ws);
    const bp = (x, z) => new THREE.Vector3(x, BENCH_H + 0.045, z);
    // داخل الصندوق: الحجرة اليمنى (ذرات المهمة)
    this.ws.createAtom('C', bp(0.72, -0.42));
    this.ws.createAtom('O', bp(0.68, -0.26));
    this.ws.createAtom('O', bp(0.77, -0.24));
    // ذرات إضافية في الحجرة اليسرى للتجريب
    this.ws.createAtom('H', bp(0.28, -0.44));
    this.ws.createAtom('H', bp(0.36, -0.44));
    this.ws.createAtom('N', bp(0.3, -0.3));
    this.ws.createAtom('Cl', bp(0.36, -0.22));

    // الأدوات في الحجرة الوسطى (تعود إلى الصندوق)
    const toolPos = [['stick', -0.12], ['spring', 0.0], ['pliers', 0.12]];
    this.tools = toolPos.map(([type, z]) => {
      const h = createTool(app, type, this.box, new THREE.Vector3(0, 0.03, z), Math.PI / 2);
      const base = h.enabled;
      h.enabled = () => this.box.userData.state.open && base();
      return h;
    });

    // جدولا الكهروسالبية والخاصية الأيونية (ألواح قابلة للالتقاط)
    const boards = [createBoard(drawENTable, { width: 0.46, height: 0.24 }), createBoard(drawIonicTable, { width: 0.3, height: 0.32 })];
    boards[0].position.set(-0.72, BENCH_H + 0.125, -0.58); boards[0].rotation.x = -0.15;
    boards[1].position.set(-0.28, BENCH_H + 0.165, -0.6); boards[1].rotation.x = -0.15;
    boards.forEach(b => {
      r.add(b);
      registerTarget(b.userData.panel.mesh, { kind: 'grab', object: b, homeParent: r });
    });

    // بساط البناء
    const mat = new Panel({ width: 0.62, height: 0.36, ppm: 800, bg: 'rgba(31,95,153,0.18)', border: '#39b6ff', draw: (ctx, w, h) => drawText(ctx, 'منطقة البناء', w / 2, h - 70, { size: 44, weight: 800, align: 'center', color: '#1f5f99' }) });
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(-0.25, BENCH_H + 0.002, -0.22);
    r.add(mat);

    // جدول العناصر (الرمز وعدد الروابط)
    this.legend = new Panel({
      width: 0.8, height: 0.5, draw: (ctx, w, h) => {
        drawText(ctx, 'الذرات في الصندوق', w - 36, 26, { size: 40, weight: 800 });
        const rows = [['C', 4], ['N', 3], ['O', 2], ['H', 1], ['Cl', 1]];
        const head = ['العنصر', 'الرمز', 'عدد الروابط المعتاد'];
        const cols = [w - 60, w * 0.5, w * 0.2];
        head.forEach((t, i) => drawText(ctx, t, cols[i], 92, { size: 28, weight: 800, color: COLORS.muted, align: i ? 'center' : 'right' }));
        rows.forEach(([el, n], k) => {
          const y = 140 + k * 54;
          const col = '#' + ELEMENTS[el].color.toString(16).padStart(6, '0');
          ctx.beginPath(); ctx.arc(cols[0] + 22 - 2, y + 18, 14, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
          drawText(ctx, ELEMENTS[el].name, cols[0] - 20, y, { size: 32, weight: 700 });
          drawText(ctx, el, cols[1], y, { size: 34, weight: 800, align: 'center', dir: 'ltr' });
          drawText(ctx, String(n), cols[2], y, { size: 34, weight: 800, align: 'center', color: COLORS.gold });
        });
      },
    });
    this.legend.position.set(0.55, 1.4, -0.82);
    r.add(this.legend);

    // لوحة المهمة
    this.taskSlot = new THREE.Group();
    this.taskSlot.position.set(-0.5, 1.82, -0.85);
    r.add(this.taskSlot);
    this.taskPanel = new TextPanel({
      title: 'المهمة: مثّل الرابطة الثنائية',
      body: '1) افتح الصندوق وارفع الغطاء بالمقبض الأصفر.\n2) ضع ذرة كربون وذرتي أكسجين في منطقة البناء.\n3) التقط أداة الربط المناسبة بيد، وقرّب الذرات باليد الأخرى ثم أفلتها لتلتصق.\n4) لإضافة وصلة ثانية: وجّه الزنبرك إلى الرابطة واضغط الزناد.',
      width: 0.95, height: 0.6, titleSize: 36, bodySize: 27,
    });
    this.taskPanel.position.y = -0.3;
    this.taskSlot.add(this.taskPanel);
    this.statusPanel = new TextPanel({ title: '', body: 'لم تبدأ البناء بعد.', width: 0.95, height: 0.13, bodySize: 28, bg: COLORS.bgSoft });
    this.statusPanel.position.y = -0.68;
    this.taskSlot.add(this.statusPanel);
    this.checkBtn = new Button({ label: 'تحقّق من النموذج', width: 0.34, height: 0.075, style: 'primary', onClick: () => this._check(true) });
    this.checkBtn.position.set(0.28, -0.8, 0);
    this.resetBtn = new Button({ label: 'إعادة الذرات', width: 0.3, height: 0.075, onClick: () => this._resetAtoms() });
    this.resetBtn.position.set(-0.3, -0.8, 0);
    this.taskSlot.add(this.checkBtn, this.resetBtn);
  }

  start() {
    const t = this.app.teacher;
    t.placeAt(this.zoneRoot, new THREE.Vector3(-1.45, 0, -0.5), new THREE.Vector3(0, 0, 0.55));
    t.say('أمامك صندوق نماذج جزيئية. افتح غطاءه بالمقبض الأصفر لترى الكرات والعصي والزنابرك والكماشة.');
  }

  _onOpen() {
    this.ws.enabled = true;
    this.done('open');
    this.app.teacher.say('العصا تمثّل رابطة أحادية، والزنبرك يمثّل وصلة واحدة في رابطة متعددة. ابنِ جزيء CO₂: كل أكسجين يرتبط بالكربون برابطة ثنائية.');
  }

  _resetAtoms() {
    if (this.isDone('co2')) return;
    this.ws.clear();
    const bp = (x, z) => new THREE.Vector3(x, BENCH_H + 0.06, z);
    this.ws.createAtom('C', bp(-0.25, -0.22));
    this.ws.createAtom('O', bp(-0.4, -0.15));
    this.ws.createAtom('O', bp(-0.1, -0.15));
    for (const m of this.ws.molecules) this.ws._drop(m);
    this.app.toast('أُعيدت ثلاث ذرات (C, O, O) إلى منطقة البناء.', 'info');
  }

  _onChange() {
    if (this.isDone('co2')) return;
    this._check(false);
  }

  _check(explicit) {
    if (this.isDone('co2')) return;
    const res = bestAnalysis(this.ws.graphs(), analyzeCO2);
    if (res.ok) return this._success(res);
    this.statusPanel.setText({ body: res.msg, accent: res.progress ? COLORS.accent : COLORS.warn });
    if (explicit) {
      this.app.audio.play(res.progress ? 'click' : 'error');
      if (!res.progress && res.graph) this.app.scoring.addMistake('doubleBond');
      this.app.toast(res.msg, res.progress ? 'info' : 'warn');
    }
  }

  _success(res) {
    const mol = res.graph.molecule;
    mol.setSuccess(true);
    mol.structureLocked = true;
    this.app.effects.burst(mol.worldCenter());
    this.app.scoring.recordCompletion('doubleBond', 'O=C=O بزنبركين لكل رابطة');
    this.statusPanel.setText({ body: res.msg, accent: COLORS.good });
    this.statusPanel.border = COLORS.good; this.statusPanel.redraw();
    this.app.toast('أحسنت! لقد بنيت جزيء CO₂ بصورة صحيحة', 'good');
    this.done('co2');
    this.app.teacher.say('أحسنت! لقد بنيت جزيء CO₂ بصورة صحيحة. لاحظ أن الذرات الثلاث على خط واحد: الشكل خطي بزاوية 180°.');
    setTimeout(() => { if (this.alive) this._showHypothesis(); }, 2500);
  }

  _showHypothesis() {
    // استبدال لوحة الجدول بمقارنة لويس + نموذج ثابت
    this.legend.visible = false;
    const cmp = new Panel({
      width: 0.8, height: 0.42, draw: (ctx, w, h) => {
        drawText(ctx, 'تركيب لويس لـ CO₂', w - 36, 24, { size: 36, weight: 800 });
        drawLewis(ctx, 'CO2', 40, 80, w - 80, h - 110, { scale: 1.25 });
      },
    });
    cmp.position.set(0.55, 1.62, -0.82);
    this.root.add(cmp);
    const label = new TextPanel({ title: '', body: 'نموذج الكرة والعصا', width: 0.4, height: 0.08, bodySize: 30, align: 'center' });
    label.position.set(0.55, 1.33, -0.8);
    this.root.add(label);
    const model = buildStaticMolecule(CO2, { scale: 0.11, atomScale: 0.6 });
    model.position.set(0.55, 1.2, -0.72);
    this.root.add(model);
    this.onUpdate((dt) => { model.rotation.y += dt * 0.6; });

    for (const c of [...this.taskSlot.children]) c.visible = false;
    this.taskSlot.position.y = 2.02;
    const q = Q.hypothesis;
    const quiz = new QuizPanel({
      title: 'صياغة الفرضية (10 نقاط)', question: q.text, options: q.options, correct: q.correct, explanation: q.explanation,
      mode: 'feedback', width: 0.98, bodySize: 30, optionHeight: 0.085,
      onAnswer: (i) => {
        const r = this.app.assessment.answerMCQ('hypothesis', i, q.correct, 10);
        this.done('hyp', { sound: r.correct });
        if (!r.correct) this.app.audio.play('error');
        this.makeNextButton(quiz, new THREE.Vector3(0, -quiz.totalHeight - 0.06, 0), 'المرحلة الثالثة: التجربة ⟵');
      },
    });
    quiz.position.set(0, 0, 0);
    this.taskSlot.add(quiz);
    this.app.teacher.say('قارن نموذج الكرة والعصا الذي بنيته بتركيب لويس. ما الذي يوضحه كل نموذج؟');
  }

  onExit() { this.app.physics.removeSurface(this.boxSurface); }
}
