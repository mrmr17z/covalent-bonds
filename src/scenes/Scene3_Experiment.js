// ============================================================================
//  المشهد الثالث: التجربة — نبني الجزيئات (≈ 2:40)
//  1) ترتيب بطاقات خطوات العمل (20)  2) عد الثقوب وقاعدة الثمانية (20، حرج)
//  3) بناء CH4 وCO2 ومطابقة لويس (20)  4) حساب فرق الكهروسالبية وتصنيف الروابط (20)
// ============================================================================
import * as THREE from 'three';
import { BaseScene } from '../sceneManager.js';
import { TextPanel, Panel, Button, autoHeight } from '../ui/VRPanel.js';
import { drawText, fillRound, COLORS } from '../ui/text.js';
import { drawLewis } from '../ui/Lewis.js';
import { Workspace } from '../objects/Molecule.js';
import { createCard, createTool, createBoard } from '../objects/LabTools.js';
import { registerTarget, disposeTree } from '../core/registry.js';
import { analyzeCH4, analyzeCO2, ELEMENTS, EN, deltaEN, classifyDelta, explainPair, BOND_CLASS_LABEL, sub } from '../chemistryEngine.js';
import { BENCH_H } from '../environment/Lab.js';
import { CONFIG } from '../config.js';
import { drawENTable, drawIonicTable } from './Scene2_Hypothesis.js';

const STEPS = [
  'صنع النموذج الجزيئي',
  'حساب فرق الكهروسالبية',
  'تحديد نوع الرابطة',
  'رسم تركيب لويس',
  'فحص النموذج ثم فكه وإعادة الأدوات إلى أماكنها',
];
const STEP_HINTS = [
  'نبدأ دائمًا بصنع النموذج الجزيئي؛ فهو أساس كل ما بعده.',
  'بعد صنع النموذج نحسب فرق الكهروسالبية بين الذرات المرتبطة.',
  'نوع الرابطة يُحدَّد من قيمة فرق الكهروسالبية المحسوبة، لذا يأتي بعد الحساب.',
  'نرسم تركيب لويس بعد أن نعرف الروابط ونوعها.',
  'فحص النموذج وفكه وإعادة الأدوات هي آخر خطوة دائمًا.',
];

export class Scene3_Experiment extends BaseScene {
  static stage = 3;
  static title = 'التجربة';

  async enter() {
    this.mount('exper');
    this.addTask('cards', 'رتّب بطاقات خطوات العمل (20 نقطة)');
    this.addTask('holes', 'عُدّ ثقوب كل ذرة وسجّلها في الجدول (20 نقطة)');
    this.addTask('build', 'ابنِ CH₄ وCO₂ ثم طابق كل نموذج مع تركيب لويس (20 نقطة)');
    this.addTask('en', 'احسب فرق الكهروسالبية وصنّف الروابط الأربع (20 نقطة)');
    this.stageRoot = new THREE.Group();
    this.root.add(this.stageRoot);
    this.anims = [];
    this.onUpdate((dt) => this._tickAnims(dt));
    // لوحة التعليمات
    this.infoSlot = new THREE.Group();
    this.infoSlot.position.set(-0.78, 1.95, -0.86);
    this.infoSlot.rotation.y = 0.12;
    this.root.add(this.infoSlot);
    this.sideSlot = new THREE.Group();
    this.sideSlot.position.set(0.68, 1.98, -0.86);
    this.sideSlot.rotation.y = -0.12;
    this.root.add(this.sideSlot);
  }

  start() {
    this.app.teacher.placeAt(this.zoneRoot, new THREE.Vector3(-1.75, 0, -0.35), new THREE.Vector3(0, 0, 0.55));
    this._startCards();
  }

  _info(title, body, height = null) {
    for (const c of [...this.infoSlot.children]) disposeTree(c);
    const h = height || Math.max(0.3, autoHeight(body, 1.0, 29, 900, 150));
    const p = new TextPanel({ title, body, width: 1.0, height: h, titleSize: 36, bodySize: 29 });
    p.position.y = -h / 2;
    this.infoSlot.add(p);
    this.infoPanel = p;
    return p;
  }
  _clearStage() {
    for (const c of [...this.stageRoot.children]) disposeTree(c);
    for (const c of [...this.sideSlot.children]) disposeTree(c);
    for (const ws of this.workspaces) ws.dispose();
    this.workspaces = [];
    this.app.interaction.unequipAll();
  }
  _animTo(obj, pos, quat = null, dur = 0.35, done = null) {
    this.anims.push({ obj, from: obj.position.clone(), to: pos.clone(), qf: obj.quaternion.clone(), qt: quat ? quat.clone() : obj.quaternion.clone(), t: 0, dur, done });
  }
  _tickAnims(dt) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = 1 - Math.pow(1 - a.t, 3);
      a.obj.position.lerpVectors(a.from, a.to, e);
      a.obj.quaternion.slerpQuaternions(a.qf, a.qt, e);
      if (a.t >= 1) { this.anims.splice(i, 1); a.done?.(); }
    }
  }

  /** نظام بطاقات وفتحات عام (للخطوات ولمطابقة لويس) */
  _cardSlots({ cards, slots, scoreId, hintFor, onAllDone }) {
    const flatQ = new THREE.Quaternion();
    for (const s of slots) s.filled = null;
    for (const c of cards) {
      c.start = c.group.position.clone();
      c.locked = false;
      registerTarget(c.group.userData.hit, {
        kind: 'grab', object: c.group, homeParent: this.stageRoot,
        enabled: () => !c.locked,
        onHover: (on) => c.group.userData.base.material.emissive?.setHex(on ? 0x224466 : 0),
        onRelease: () => {
          const wp = c.group.getWorldPosition(new THREE.Vector3());
          let best = null, bd = 0.16;
          for (const s of slots) {
            if (s.filled) continue;
            const sp = s.obj.getWorldPosition(new THREE.Vector3());
            const d = Math.hypot(wp.x - sp.x, wp.z - sp.z);
            if (d < bd) { bd = d; best = s; }
          }
          if (!best) return false;
          if (best.key === c.key) {
            best.filled = c; c.locked = true;
            this._animTo(c.group, best.obj.position.clone().add(new THREE.Vector3(0, 0.004, 0)), flatQ, 0.25);
            this.app.audio.play('snap');
            this.app.effects.burst(best.obj.getWorldPosition(new THREE.Vector3()), 0x5cf0a0, 18);
            if (slots.every(s => s.filled)) setTimeout(() => this.alive && onAllDone(), 600);
          } else {
            this.app.scoring.addMistake(scoreId);
            this.app.audio.play('error');
            this.app.toast(hintFor(c, best), 'warn');
            this._animTo(c.group, c.start, flatQ, 0.45);
          }
          return true;
        },
      });
    }
  }

  // ======================================================== 1) ترتيب الخطوات
  _startCards() {
    this._clearStage();
    this._info('المهمة 1: رتّب خطوات العمل', 'التقط البطاقات من مقدمة الطاولة وضع كل بطاقة في الفتحة المرقّمة الصحيحة (من اليمين إلى اليسار: 1 ← 5).');
    this.app.teacher.say('قبل أي تجربة نخطط لخطواتها. رتّب بطاقات خطوات العمل بالترتيب الصحيح.');
    const slots = [], cards = [];
    for (let i = 0; i < 5; i++) {
      const x = 0.92 - i * 0.46;
      const slot = new Panel({
        width: 0.22, height: 0.14, ppm: 1200, bg: 'rgba(31,95,153,0.15)', border: '#39b6ff', borderWidth: 6,
        draw: (ctx, w, h) => drawText(ctx, String(i + 1), w / 2, h / 2 - 50, { size: 90, weight: 800, align: 'center', color: 'rgba(31,95,153,0.6)' }),
      });
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(x, BENCH_H + 0.002, -0.47);
      this.stageRoot.add(slot);
      slots.push({ obj: slot, key: i });
    }
    const order = [3, 0, 4, 1, 2]; // ترتيب مخلوط ثابت
    order.forEach((stepIdx, k) => {
      const g = createCard(STEPS[stepIdx]);
      g.position.set(0.92 - k * 0.46, BENCH_H + 0.004, -0.12);
      g.rotation.y = (k % 2 ? 1 : -1) * 0.08;
      this.stageRoot.add(g);
      cards.push({ group: g, key: stepIdx });
    });
    this._cardSlots({
      cards, slots, scoreId: 'stepsOrder',
      hintFor: (c, s) => `ليست في مكانها: «${STEPS[c.key]}». ${STEP_HINTS[c.key]}`,
      onAllDone: () => {
        this.app.scoring.recordCompletion('stepsOrder', `أخطاء: ${this.app.scoring.mistakeCount('stepsOrder')}`);
        this.app.toast('ترتيب صحيح! 1 صنع النموذج ← 2 حساب الفرق ← 3 نوع الرابطة ← 4 لويس ← 5 الفحص والفك', 'good');
        this.done('cards');
        setTimeout(() => this.alive && this._startHoles(), 2500);
      },
    });
  }

  // ======================================================== 2) عد الثقوب
  _startHoles() {
    this._clearStage();
    this._info('المهمة 2: عُدّ فتحات الاتصال', 'التقط كل كرة وأدرها لترى ثقوبها. عُدّ الفتحات ثم اختر العدد في الجدول على اليمين، واضغط «تحقّق».\nبند حرج: يُحتسب التحقق الأول.');
    this.app.teacher.say('كل ثقب في الكرة يمثّل رابطة يمكن أن تكوّنها الذرة. أمسك كل كرة وأدرها وعُدّ ثقوبها.');
    const ws = new Workspace(this.app, this.stageRoot, { labels: true });
    ws.joinEnabled = false;
    this.workspaces.push(ws);
    const els = ['C', 'N', 'O', 'H', 'Cl'];
    els.forEach((el, i) => {
      ws.createAtom(el, new THREE.Vector3(0.6 - i * 0.3, BENCH_H + 0.04, -0.2));
      const tag = new Panel({ width: 0.26, height: 0.06, ppm: 1400, bg: 'rgba(10,18,30,0.85)', border: 'rgba(0,0,0,0)', draw: (ctx, w, h) => drawText(ctx, `${ELEMENTS[el].name} ${el}`, w / 2, 14, { size: 44, weight: 700, align: 'center' }) });
      tag.rotation.x = -Math.PI / 2.4;
      tag.position.set(0.6 - i * 0.3, BENCH_H + 0.01, -0.04);
      this.stageRoot.add(tag);
    });
    // جدول البيانات
    const table = new Panel({
      width: 0.95, height: 0.68, draw: (ctx, w, h) => {
        drawText(ctx, 'جدول البيانات: عدد الروابط المعتاد', w - 36, 24, { size: 36, weight: 800 });
        drawText(ctx, 'العنصر', w - 40, 86, { size: 28, weight: 800, color: COLORS.muted });
        drawText(ctx, 'عدد الثقوب', w * 0.4, 86, { size: 28, weight: 800, color: COLORS.muted, align: 'center' });
        els.forEach((el, k) => drawText(ctx, `${ELEMENTS[el].name} (${el})`, w - 40, 140 + k * 82, { size: 32, weight: 700 }));
      },
    });
    table.position.set(0, -0.34, 0);
    this.sideSlot.add(table);
    this.holeAnswers = {};
    this.holeButtons = {};
    const correct = { C: 4, N: 3, O: 2, H: 1, Cl: 1 };
    els.forEach((el, k) => {
      this.holeButtons[el] = [];
      for (let n = 1; n <= 4; n++) {
        const b = new Button({ label: String(n), width: 0.075, height: 0.065, fontSize: 40, onClick: () => {
          if (this.holesLocked) return;
          this.holeAnswers[el] = n;
          this.holeButtons[el].forEach((bb, j) => bb.setStyle(j + 1 === n ? 'selected' : 'default'));
        } });
        // ترتيب RTL: 1 على اليمين
        b.position.set(0.12 - (n - 1) * 0.088, -0.175 - k * 0.091, 0.005);
        this.sideSlot.add(b);
        this.holeButtons[el].push(b);
      }
    });
    this.holeAttempts = 0;
    this.holesLocked = false;
    const check = new Button({ label: 'تحقّق ✓', width: 0.3, height: 0.075, style: 'primary', onClick: () => {
      if (this.holesLocked) return;
      if (els.some(e => !this.holeAnswers[e])) { this.app.toast('اختر عددًا لكل عنصر أولًا.', 'warn'); return; }
      this.holeAttempts++;
      const right = els.filter(e => this.holeAnswers[e] === correct[e]);
      els.forEach(e => this.holeButtons[e].forEach((bb, j) => {
        if (j + 1 === this.holeAnswers[e]) bb.setStyle(this.holeAnswers[e] === correct[e] ? 'correct' : 'wrong');
      }));
      if (this.holeAttempts === 1) {
        const pts = right.length * CONFIG.scoring.holeRowWeight;
        if (right.length < els.length) this.app.scoring.addMistake('holeCount', els.length - right.length);
        this.app.scoring.record('holeCount', pts, { detail: `${right.length}/5 صحيحة في المحاولة الأولى` });
      }
      if (right.length === els.length) {
        this.holesLocked = true;
        this.app.audio.play('correct');
        this._showOctet();
      } else {
        this.app.audio.play('error');
        this.app.toast(`${els.length - right.length} من الإجابات غير صحيحة. أعد عدّ ثقوب الكرات المعلَّمة بالأحمر وصحّحها.`, 'warn');
      }
    } });
    check.position.set(0, -0.73, 0.005);
    this.sideSlot.add(check);
  }

  _showOctet() {
    const body = 'قاعدة الثمانية: تميل ذرات C وN وO وCl في النماذج البسيطة إلى تكوين روابط حتى يحيط بها 8 إلكترونات في غلافها الخارجي (إلكترونات الروابط + الأزواج غير الرابطة).\n'
      + '• C: 4 روابط  • N: 3 روابط + زوج غير رابط  • O: رابطتان + زوجان  • Cl: رابطة + 3 أزواج\n'
      + 'استثناء مهم — الهيدروجين: لا تنطبق عليه قاعدة الثمانية؛ يستقر بإلكترونين فقط (قاعدة الثنائية Duet Rule)، لذلك له ثقب واحد ورابطة واحدة.';
    const p = this._info('أحسنت! قاعدة الثمانية وقاعدة الثنائية', body);
    p.border = COLORS.good; p.redraw();
    this.app.teacher.say('لاحظ: الهيدروجين يكتفي بإلكترونين وفق قاعدة الثنائية، بينما الكربون والنيتروجين والأكسجين والكلور تتبع غالبًا قاعدة الثمانية.');
    this.done('holes');
    const go = new Button({ label: 'متابعة: بناء الجزيئات ⟵', width: 0.5, height: 0.085, style: 'primary', onClick: () => this._startBuild() });
    go.position.set(0, -p.height - 0.07, 0);
    this.infoSlot.add(go);
  }

  // ======================================================== 3) بناء CH4 و CO2 + لويس
  _startBuild() {
    this._clearStage();
    this._info('المهمة 3: ابنِ CH₄ وCO₂', 'أ) الميثان: ضع الكربون في المنتصف، ثم صِل 4 ذرات هيدروجين بعصيّ (روابط أحادية).\nب) ثاني أكسيد الكربون: صِل ذرتي أكسجين بالكربون، بزنبركين لكل رابطة.\nأدر كل جزيء لترى شكله الفراغي. الكماشة تفك الروابط.');
    this.app.teacher.say('الآن نبني الميثان وثاني أكسيد الكربون. التقط العصا للروابط الأحادية، والزنبرك للروابط المتعددة.');
    const ws = new Workspace(this.app, this.stageRoot, { onChange: () => this._checkBuild() });
    this.workspaces.push(ws);
    this.buildWs = ws;
    this._supply();
    // حامل الأدوات
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.2), new THREE.MeshLambertMaterial({ color: 0x2b3440 }));
    rack.position.set(-1.0, BENCH_H + 0.01, -0.2);
    this.stageRoot.add(rack);
    ['stick', 'spring', 'pliers'].forEach((t, i) => createTool(this.app, t, this.stageRoot, new THREE.Vector3(-0.85 - i * 0.15, BENCH_H + 0.035, -0.2), 0));
    const rackLabel = new Panel({ width: 0.46, height: 0.06, ppm: 1400, bg: 'rgba(10,18,30,0.85)', border: 'rgba(0,0,0,0)', draw: (ctx, w, h) => drawText(ctx, 'عصا · زنبرك · كماشة', w / 2, 12, { size: 46, weight: 700, align: 'center' }) });
    rackLabel.rotation.x = -Math.PI / 2.4; rackLabel.position.set(-1.0, BENCH_H + 0.01, -0.04);
    this.stageRoot.add(rackLabel);
    // لوحة الحالة
    this.buildState = { CH4: null, CO2: null };
    this.buildStatus = new TextPanel({ title: 'حالة البناء', body: '', width: 0.95, height: 0.42, titleSize: 34, bodySize: 30 });
    this.buildStatus.position.y = -0.21;
    this.sideSlot.add(this.buildStatus);
    this._refreshBuildStatus('');
    const reset = new Button({ label: 'إعادة الذرات', width: 0.3, height: 0.07, onClick: () => this._supply(true) });
    reset.position.set(0, -0.5, 0);
    this.sideSlot.add(reset);
    this.geomLabels = [];
    this.onUpdate(() => this._updateGeomLabels());
  }

  _supply(reset = false) {
    const ws = this.buildWs;
    if (reset) {
      for (const m of [...ws.molecules]) if (!m.structureLocked) ws.removeMolecule(m);
    }
    const y = BENCH_H + 0.04;
    const done = this.buildState || {};
    const add = (el, x, z) => ws.createAtom(el, new THREE.Vector3(x, y, z));
    if (!done.CH4) { add('C', 0.0, -0.25); ['H', 'H', 'H', 'H'].forEach((el, i) => add(el, 0.65 + i * 0.09, -0.08)); add('H', 1.05, -0.08); }
    if (!done.CO2) { add('C', 0.3, -0.45); add('O', 0.75, -0.35); add('O', 0.9, -0.35); add('O', 1.05, -0.35); }
    if (reset) this.app.toast('أُعيدت الذرات إلى الطاولة.', 'info');
  }

  _refreshBuildStatus(msg) {
    const s = this.buildState;
    const line = (k, label, geo) => s[k] ? `✓ ${label}: ${geo}` : `○ ${label}: لم يكتمل بعد`;
    this.buildStatus.setText({
      body: `${line('CH4', 'CH₄', 'رباعي السطوح · 109.5°')}\n${line('CO2', 'CO₂', 'خطي · 180°')}${msg ? '\n' + msg : ''}`,
    });
  }

  _checkBuild() {
    const graphs = this.buildWs.graphs();
    let msg = '';
    for (const g of graphs) {
      const m = g.molecule;
      if (m.structureLocked) continue;
      const a1 = analyzeCH4(g), a2 = analyzeCO2(g);
      if (a1.ok && !this.buildState.CH4) { this._buildOk('CH4', m, 'رباعي السطوح', '109.5°'); continue; }
      if (a2.ok && !this.buildState.CO2) { this._buildOk('CO2', m, 'خطي', '180°'); continue; }
      if (g.atoms.length > 1) {
        const c = g.atoms.some(a => a.el === 'O') ? a2 : a1;
        msg = c.msg;
      }
    }
    this._refreshBuildStatus(msg);
  }

  _buildOk(key, mol, geo, angle) {
    this.buildState[key] = mol;
    mol.setSuccess(true);
    mol.structureLocked = true;
    this.app.effects.burst(mol.worldCenter());
    this.app.audio.play('success');
    this.app.toast(key === 'CH4' ? 'أحسنت! CH₄: أربع روابط أحادية بشكل رباعي السطوح (109.5°) وليس مربعًا مسطحًا.' : 'أحسنت! CO₂: O=C=O بشكل خطي (180°).', 'good');
    const label = new Panel({ width: 0.34, height: 0.1, ppm: 1200, bg: 'rgba(16,60,36,0.92)', border: COLORS.good, draw: (ctx, w, h) => {
      drawText(ctx, `${sub(key)} · ${geo}`, w / 2, 12, { size: 44, weight: 800, align: 'center' });
      drawText(ctx, `زاوية الرابطة ${angle}`, w / 2, 66, { size: 36, weight: 600, align: 'center', color: COLORS.gold });
    } });
    this.stageRoot.add(label);
    this.geomLabels.push({ label, mol });
    this._refreshBuildStatus('أدر الجزيء لترى شكله من زوايا مختلفة.');
    if (this.buildState.CH4 && this.buildState.CO2) setTimeout(() => this.alive && this._startLewisMatch(), 2200);
  }

  _updateGeomLabels() {
    if (!this.geomLabels) return;
    const cam = this.app.camera.getWorldPosition(new THREE.Vector3());
    for (const { label, mol } of this.geomLabels) {
      if (!mol.group.parent) continue;
      const c = mol.worldCenter();
      c.y += 0.13;
      label.position.copy(this.stageRoot.worldToLocal(c));
      label.lookAt(cam);
    }
  }

  _startLewisMatch() {
    this._info('مطابقة تراكيب لويس', 'التقط بطاقة تركيب لويس الصحيحة لكل نموذج وضعها في الفتحة المخصصة له على الطاولة. انتبه: إحدى البطاقات خاطئة!');
    this.app.teacher.say('بعد بناء النموذجين، طابق كل نموذج مع تركيب لويس الصحيح. احذر البطاقة الخاطئة.');
    const mkSlot = (x, title) => {
      const s = new Panel({ width: 0.26, height: 0.18, ppm: 1200, bg: 'rgba(31,95,153,0.15)', border: '#39b6ff', borderWidth: 6, draw: (ctx, w, h) => drawText(ctx, title, w / 2, h - 70, { size: 34, weight: 800, align: 'center', color: '#1f5f99' }) });
      s.rotation.x = -Math.PI / 2; s.position.set(x, BENCH_H + 0.002, -0.55);
      this.stageRoot.add(s);
      return s;
    };
    const slots = [{ obj: mkSlot(-0.1, 'لويس: رباعي السطوح'), key: 'CH4' }, { obj: mkSlot(-0.45, 'لويس: الخطي'), key: 'CO2' }];
    const mkLewisCard = (type) => {
      const g = new THREE.Group();
      const W = 0.24, D = 0.16;
      const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.006, D), new THREE.MeshLambertMaterial({ color: 0x13314f }));
      g.add(base);
      const face = new Panel({ width: W - 0.01, height: D - 0.01, ppm: 1400, bg: '#0f1d30', border: '#ffd166', radius: 18, borderWidth: 6, draw: (ctx, w, h) => drawLewis(ctx, type, 10, 10, w - 20, h - 20, { scale: type === 'CH4' ? 1.0 : 1.15 }) });
      face.rotation.x = -Math.PI / 2; face.position.y = 0.0035;
      g.add(face);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, D), new THREE.MeshBasicMaterial({ visible: false }));
      g.add(hit);
      g.userData.hit = hit; g.userData.base = base;
      return g;
    };
    const cards = [['CO2wrong', -0.95], ['CH4', -0.72], ['CO2', -1.18]].map(([type, x]) => {
      const g = mkLewisCard(type);
      g.position.set(x, BENCH_H + 0.004, -0.5);
      this.stageRoot.add(g);
      return { group: g, key: type === 'CO2wrong' ? 'none' : type };
    });
    // تحريك حامل الأدوات بعيدًا عن البطاقات: البطاقات خلفه
    this._cardSlots({
      cards, slots, scoreId: 'buildLewis',
      hintFor: (c, s) => c.key === 'none'
        ? 'هذا التركيب خاطئ: الكربون فيه محاط بأزواج غير رابطة والروابط أحادية؛ في CO₂ كل رابطة ثنائية (O=C=O).'
        : `هذا التركيب لا يطابق النموذج ${s.key === 'CH4' ? 'رباعي السطوح (CH₄)' : 'الخطي (CO₂)'}. قارن عدد الذرات ونوع الروابط.`,
      onAllDone: () => {
        this.app.scoring.recordCompletion('buildLewis', `CH₄ و CO₂ ولويس — أخطاء: ${this.app.scoring.mistakeCount('buildLewis')}`);
        this.done('build');
        const p = this._info('أحسنت! النموذج وتركيب لويس', 'CH₄: أربع روابط أحادية حول C (رباعي السطوح 109.5°).\nCO₂: O=C=O، رابطتان ثنائيتان وزوجان غير رابطين على كل O (خطي 180°).\nالخطوة الأخيرة من خطوات العمل: افحص النموذج ثم فكّه وأعد الأدوات إلى أماكنها.');
        const btn = new Button({ label: 'فكّ النماذج وأعد الأدوات ⟵', width: 0.55, height: 0.085, style: 'primary', onClick: () => this._startEN() });
        btn.position.set(0, -p.height - 0.07, 0);
        this.infoSlot.add(btn);
      },
    });
  }

  // ======================================================== 4) فرق الكهروسالبية
  _startEN() {
    this.app.audio.play('unbond');
    this._clearStage();
    this.geomLabels = [];
    this._info('المهمة 4: احسب فرق الكهروسالبية', 'اختر عنصرين من الجدول على الشاشة. ستظهر العملية: ΔEN = |EN₁ − EN₂|. ثم صنّف الرابطة.\nالحالات المطلوبة: Cl₂ ، HCl ، H₂O (O–H) ، NaCl.');
    this.app.teacher.say('الآن نقيس قوة جذب كل ذرة لإلكترونات الرابطة. اختر عنصرين لحساب فرق الكهروسالبية بينهما.');
    // لوحتا المرجع على الطاولة
    const b1 = createBoard(drawENTable, { width: 0.46, height: 0.24 });
    b1.position.set(-0.75, BENCH_H + 0.135, -0.45); b1.rotation.x = -0.2;
    const b2 = createBoard(drawIonicTable, { width: 0.28, height: 0.32 });
    b2.position.set(0.85, BENCH_H + 0.165, -0.45); b2.rotation.x = -0.2;
    [b1, b2].forEach(b => { this.stageRoot.add(b); registerTarget(b.userData.panel.mesh, { kind: 'grab', object: b, homeParent: this.stageRoot }); });

    this.enSel = [];
    this.enCases = { 'Cl-Cl': { label: 'Cl₂', done: false }, 'Cl-H': { label: 'HCl', done: false }, 'H-O': { label: 'H₂O (O–H)', done: false }, 'Cl-Na': { label: 'NaCl', done: false } };
    const els = CONFIG.enTableElements;
    this.enButtons = els.map((el, i) => {
      const b = new Button({ label: el, sub: EN[el].toFixed(2), width: 0.16, height: 0.13, fontSize: 48, onClick: () => this._pickEN(el) });
      b.position.set(0.36 - i * 0.18, -0.08, 0.004);
      this.sideSlot.add(b);
      return { el, b };
    });
    this.enCalc = new Panel({ width: 0.95, height: 0.5, bg: COLORS.bgSoft, draw: (ctx, w, h) => this._drawCalc(ctx, w, h) });
    this.enCalc.position.set(0, -0.43, 0);
    this.sideSlot.add(this.enCalc);
    this.classBtns = ['pure', 'polar', 'ionic'].map((cls, i) => {
      const b = new Button({ label: BOND_CLASS_LABEL[cls].replace('رابطة ', ''), width: 0.29, height: 0.075, onClick: () => this._classify(cls) });
      b.position.set(0.31 - i * 0.31, -0.74, 0.004);
      b.visible = false;
      this.sideSlot.add(b);
      return { cls, b };
    });
    this.newCalcBtn = new Button({ label: 'حساب جديد ↻', width: 0.3, height: 0.07, onClick: () => this._resetEN() });
    this.newCalcBtn.position.set(0, -0.84, 0.004);
    this.newCalcBtn.visible = false;
    this.sideSlot.add(this.newCalcBtn);
    this.checklist = new Panel({ width: 0.95, height: 0.12, bg: 'rgba(10,18,30,0.85)', draw: (ctx, w, h) => {
      const items = Object.values(this.enCases);
      items.forEach((c, i) => {
        const x = w - 30 - i * (w - 60) / 4;
        drawText(ctx, `${c.done ? '✓' : '○'} ${c.label}`, x, 28, { size: 34, weight: 800, color: c.done ? COLORS.good : COLORS.muted });
      });
    } });
    this.checklist.position.set(0, -0.96, 0);
    this.sideSlot.add(this.checklist);
    this.enStage = 'pick';
  }

  _key(a, b) { return [a, b].sort().join('-'); }

  _pickEN(el) {
    if (this.enStage !== 'pick') return;
    this.enSel.push(el);
    const sel = this.enButtons.find(x => x.el === el);
    sel.b.setStyle('selected');
    if (this.enSel.length === 2) {
      const [a, b] = this.enSel;
      this.enResult = explainPair(a, b);
      if (this.enResult.cls === 'metallic') {
        this.enStage = 'explained';
        this.newCalcBtn.visible = true;
      } else {
        this.enStage = 'classify';
        this.classBtns.forEach(c => { c.b.visible = true; c.b.setStyle('default'); c.b.setEnabled(true); });
      }
      this.app.audio.play('click');
    }
    this.enCalc.redraw();
  }

  _classify(cls) {
    if (this.enStage !== 'classify') return;
    const r = this.enResult;
    const ok = cls === r.cls;
    const key = this._key(r.a, r.b);
    const c = this.enCases[key];
    if (c && !c.done) {
      c.done = true;
      if (!ok) this.app.scoring.addMistake('enCalc');
      this.app.scoring.addPartial('enCalc', ok ? CONFIG.scoring.enCaseWeight : 0, { detail: `${c.label}: ${ok ? 'صحيح' : 'خطأ'}` });
      this.checklist.redraw();
    }
    this.classBtns.forEach(x => { x.b.setStyle(x.cls === r.cls ? 'correct' : x.cls === cls ? 'wrong' : 'default'); x.b.setEnabled(false); });
    this.app.audio.play(ok ? 'correct' : 'error');
    this.enStage = 'explained';
    this.enCalc.redraw();
    this.newCalcBtn.visible = true;
    if (Object.values(this.enCases).every(x => x.done) && !this.isDone('en')) {
      if (!this.app.scoring.has('enCalc')) this.app.scoring.record('enCalc', 0);
      this.done('en');
      const p = this._info('أنهيت مرحلة التجربة!', 'حسبت فروق الكهروسالبية وصنّفت الروابط. تذكّر: الحدود (0.4 و1.7) تقريبية وتختلف بين المناهج، وفرق الكهروسالبية وحده ليس وصفًا كاملًا لطبيعة الرابطة.\nNaCl مركب أيوني وليس جزيئًا تساهميًا؛ استخدمناه للمقارنة فقط.');
      this.makeNextButton(this.infoSlot, new THREE.Vector3(0, -p.height - 0.08, 0), 'المرحلة الرابعة: الاستنتاج ⟵');
      this.app.teacher.say('ممتاز! انتقل إلى منطقة المستوى المجهري لنرى السحب الإلكترونية ونلعب شد الحبل.');
    }
  }

  _resetEN() {
    this.enSel = [];
    this.enStage = 'pick';
    this.enResult = null;
    this.enButtons.forEach(x => x.b.setStyle('default'));
    this.classBtns.forEach(c => { c.b.visible = false; });
    this.newCalcBtn.visible = false;
    this.enCalc.redraw();
  }

  _drawCalc(ctx, w, h) {
    const sel = this.enSel || [];
    const pad = 30;
    if (sel.length === 0) { drawText(ctx, 'اختر العنصر الأول…', w - pad, pad, { size: 36, weight: 700, color: COLORS.muted }); return; }
    if (sel.length === 1) { drawText(ctx, `العنصر الأول: ${sel[0]} (${EN[sel[0]].toFixed(2)}) — اختر العنصر الثاني…`, w - pad, pad, { size: 34, weight: 700 }); return; }
    const r = this.enResult;
    const [a, b] = sel;
    const hi = EN[a] >= EN[b] ? a : b, lo = hi === a ? b : a;
    drawText(ctx, `ΔEN = |EN(${hi}) − EN(${lo})| = |${EN[hi].toFixed(2)} − ${EN[lo].toFixed(2)}| = ${r.d.toFixed(2)}`, w / 2, pad, { size: 40, weight: 800, align: 'center', dir: 'ltr', color: '#ffffff' });
    // شريط المقياس
    const x0 = 40, x1 = w - 40, y = 100, max = 3.3;
    const X = v => x0 + (x1 - x0) * Math.min(1, v / max);
    fillRound(ctx, X(0), y, X(0.4) - X(0), 22, 6, '#2fae4f');
    fillRound(ctx, X(0.4), y, X(1.7) - X(0.4), 22, 6, '#e0a100');
    fillRound(ctx, X(1.7), y, X(max) - X(1.7), 22, 6, '#d8322f');
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(X(r.d), y - 6); ctx.lineTo(X(r.d) - 12, y - 26); ctx.lineTo(X(r.d) + 12, y - 26); ctx.fill();
    drawText(ctx, '0', X(0), y + 28, { size: 24, align: 'center', dir: 'ltr', color: COLORS.muted });
    drawText(ctx, '0.4', X(0.4), y + 28, { size: 24, align: 'center', dir: 'ltr', color: COLORS.muted });
    drawText(ctx, '1.7', X(1.7), y + 28, { size: 24, align: 'center', dir: 'ltr', color: COLORS.muted });
    if (this.enStage === 'classify') {
      drawText(ctx, 'صنّف هذه الرابطة باختيار أحد الأزرار أدناه:', w - pad, 175, { size: 32, weight: 700, color: COLORS.gold });
    } else {
      const col = r.cls === 'pure' ? COLORS.good : r.cls === 'polar' ? COLORS.warn : r.cls === 'ionic' ? COLORS.bad : COLORS.accent;
      drawText(ctx, `${r.label} — الخاصية الأيونية ≈ ${r.percent}%`, w - pad, 168, { size: 34, weight: 800, color: col });
      drawText(ctx, r.text, w - pad, 222, { size: 28, weight: 500, maxW: w - pad * 2, lineH: 1.45, maxLines: 6 });
    }
  }
}
