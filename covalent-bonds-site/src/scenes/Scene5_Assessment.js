// ============================================================================
//  المشهد الخامس: الاختبار الختامي والاستخلاص (≈ 3:20)
//  خمسة أسئلة (100) بلا تلميحات، القياس البعدي ومقارنته بالقبلي، التقييم الذاتي
//  (10) باختيار أو لوحة مفاتيح افتراضية، ثم التقرير النهائي وشروط الاجتياز.
// ============================================================================
import * as THREE from 'three';
import { BaseScene } from '../sceneManager.js';
import { TextPanel, Panel, Button, autoHeight } from '../ui/VRPanel.js';
import { QuizPanel } from '../ui/QuizPanel.js';
import { VirtualKeyboard } from '../ui/Keyboard.js';
import { drawText, fillRound, COLORS } from '../ui/text.js';
import { disposeTree } from '../core/registry.js';
import { Q, LETTERS } from '../data/questions.js';
import { CONFIG } from '../config.js';
import { BRAND, drawLogo } from '../ui/brand.js';

export class Scene5_Assessment extends BaseScene {
  static stage = 5;
  static title = 'الاختبار الختامي';

  async enter() {
    this.mount('exam');
    this.addTask('exam', 'أجب عن أسئلة الاختبار الخمسة (100 نقطة)');
    this.addTask('post', 'القياس البعدي: سؤال HCl مرة أخرى');
    this.addTask('self', 'التقييم الذاتي: اشرح الفرق بجملة واحدة (10 نقاط)');
    this.addTask('report', 'اطّلع على تقريرك النهائي');
    this.header = new Panel({
      width: 2.7, height: 0.32, bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)',
      draw: (ctx, w, h) => {
        drawText(ctx, 'الاختبار الختامي والاستخلاص', w / 2, 10, { size: 96, weight: 800, align: 'center', color: '#f4f1de' });
        drawText(ctx, this.headerSub || '', w / 2, 140, { size: 64, weight: 600, align: 'center', color: '#cfe8d0' });
      },
    });
    this.header.position.set(0, 2.35, -2.31);
    this.root.add(this.header);
    this.slot = new THREE.Group();
    this.slot.position.set(0, 2.05, -1.25);
    this.root.add(this.slot);
    this.qIndex = 0;
  }

  start() {
    this.app.teacher.placeAt(this.zoneRoot, new THREE.Vector3(-1.6, 0, -1.2), new THREE.Vector3(0, 0, 0.85));
    this.app.teacher.say('وصلت إلى الاختبار الختامي. خمسة أسئلة، ولن تظهر تلميحات أثناء الاختبار. بالتوفيق!');
    this._intro();
  }

  _setHeader(s) { this.headerSub = s; this.header.redraw(); }
  _set(obj) {
    for (const c of [...this.slot.children]) disposeTree(c);
    if (obj) this.slot.add(obj);
  }

  _intro() {
    this._setHeader('تعليمات الاختبار');
    const g = new THREE.Group();
    const p = new TextPanel({
      title: 'قبل أن تبدأ',
      body: '• خمسة أسئلة اختيار من متعدد، لكل سؤال 20 نقطة.\n• تُحتسب إجابتك الأولى ولا يمكن تغييرها.\n• لا توجد تلميحات أثناء الاختبار.\n• بعد الاختبار: القياس البعدي ثم التقييم الذاتي ثم تقريرك النهائي.',
      width: 1.3, height: 0.5, titleSize: 40, bodySize: 32,
    });
    p.position.y = -0.25;
    const b = new Button({ label: 'ابدأ الاختبار ⟵', width: 0.4, height: 0.09, style: 'primary', onClick: () => this._question(0) });
    b.position.y = -0.58;
    g.add(p, b);
    this._set(g);
  }

  _question(i) {
    this.qIndex = i;
    const q = Q.exam[i];
    this._setHeader(`السؤال ${i + 1} من ${Q.exam.length}`);
    const g = new THREE.Group();
    const quiz = new QuizPanel({
      title: `السؤال ${i + 1}`, question: q.text, options: q.options, correct: q.correct, mode: 'silent', width: 1.3, bodySize: 36, optionHeight: 0.095,
      onAnswer: (choice) => {
        this.app.assessment.answerMCQ(q.id, choice, q.correct, 20);
        this.app.audio.play('click');
        let y = -quiz.totalHeight - 0.02;
        if (q.afterNote) {
          const h = autoHeight(q.afterNote, 1.3, 30, 900, 70);
          const note = new TextPanel({ body: q.afterNote, width: 1.3, height: h, bodySize: 30, bg: COLORS.bgSoft });
          note.position.y = y - h / 2;
          g.add(note);
          y -= h + 0.02;
        }
        const last = i === Q.exam.length - 1;
        const nb = new Button({ label: last ? 'إنهاء الاختبار ⟵' : 'السؤال التالي ⟵', sub: 'تم تسجيل إجابتك', width: 0.42, height: 0.1, style: 'primary', onClick: () => {
          if (last) { this.done('exam'); this._postTest(); } else this._question(i + 1);
        } });
        nb.position.y = y - 0.06;
        g.add(nb);
      },
    });
    g.add(quiz);
    this._set(g);
  }

  _postTest() {
    this._setHeader('القياس البعدي');
    this.app.teacher.say('هل تذكر سؤال البداية؟ أجب عنه مرة أخرى بعد كل ما تعلمته.');
    const q = Q.preHCl;
    const quiz = new QuizPanel({
      title: 'القياس البعدي', question: q.text, options: q.options, correct: q.correct, mode: 'silent', width: 1.3, bodySize: 36, optionHeight: 0.095,
      onAnswer: (choice) => {
        this.app.assessment.setPostTest(choice);
        this.done('post');
        setTimeout(() => this.alive && this._compare(), 700);
      },
    });
    this._set(quiz);
  }

  _compare() {
    const c = this.app.assessment.comparePrePost();
    const q = Q.preHCl;
    const opt = (x) => x ? `${LETTERS[x.choice]}. ${q.options[x.choice]} ${x.correct ? '✓' : '✗'}` : 'لم تُسجَّل';
    const pre = this.app.scoring.preTest, post = this.app.scoring.postTest;
    const body = `إجابتك السابقة: ${opt(pre)}\nإجابتك الجديدة: ${opt(post)}\n${c ? c.verdict : ''}\nالتفسير العلمي: ${q.explanation}`;
    const h = autoHeight(body, 1.3, 32, 900, 160);
    const g = new THREE.Group();
    const p = new TextPanel({ title: 'مقارنة القياس القبلي والبعدي', body, width: 1.3, height: h, titleSize: 40, bodySize: 32, accent: c?.post?.correct ? COLORS.good : COLORS.warn });
    p.position.y = -h / 2;
    const b = new Button({ label: 'التقييم الذاتي ⟵', width: 0.4, height: 0.09, style: 'primary', onClick: () => this._self() });
    b.position.y = -h - 0.08;
    g.add(p, b);
    this._set(g);
    this.app.audio.play(c?.improved || c?.post?.correct ? 'success' : 'click');
  }

  _self() {
    this._setHeader('التقييم الذاتي');
    const g = new THREE.Group();
    const prompt = new TextPanel({ title: 'التقييم الذاتي (10 نقاط)', body: Q.self.prompt + '\nاختر جملة، أو اكتب إجابتك بلوحة المفاتيح الافتراضية.', width: 1.3, height: 0.3, titleSize: 38, bodySize: 32 });
    prompt.position.y = -0.15;
    g.add(prompt);
    Q.self.options.forEach((o, i) => {
      const b = new Button({ label: o.text, width: 1.26, height: 0.12, align: 'right', fontSize: 30, onClick: () => this._submitSelf({ optionIndex: i }) });
      b.position.y = -0.38 - i * 0.135;
      g.add(b);
    });
    const kb = new Button({ label: '⌨ اكتب إجابتك بنفسك', width: 0.5, height: 0.085, onClick: () => this._keyboard() });
    kb.position.y = -0.8;
    g.add(kb);
    this._set(g);
  }

  _keyboard() {
    const g = new THREE.Group();
    const prompt = new TextPanel({ title: '', body: Q.self.prompt, width: 1.3, height: 0.14, bodySize: 32 });
    prompt.position.y = -0.07;
    g.add(prompt);
    const kb = new VirtualKeyboard({ width: 1.2, onSubmit: (text) => this._submitSelf({ text }) });
    kb.position.y = -0.52;
    g.add(kb);
    const back = new Button({ label: 'رجوع إلى الخيارات', width: 0.34, height: 0.07, onClick: () => this._self() });
    back.position.set(0.45, -1.07, 0);
    g.add(back);
    this.app.keyboardCaptured = true;
    this._set(g);
  }

  _submitSelf(input) {
    this.app.keyboardCaptured = false;
    const res = this.app.assessment.submitSelf(input);
    this.done('self', { sound: res.score >= 5 });
    const body = `إجابتك: «${res.text}»\n${res.feedback.join('\n')}\nالدرجة: ${res.score} / 10\nالإجابة النموذجية: في الرابطة النقية تتشارك الذرتان الإلكترونات بالتساوي تقريبًا، وفي القطبية تكون المشاركة غير متساوية بسبب اختلاف الكهروسالبية.`;
    const h = autoHeight(body, 1.3, 30, 900, 150);
    const g = new THREE.Group();
    const p = new TextPanel({ title: 'نتيجة التقييم الذاتي', body, width: 1.3, height: h, titleSize: 38, bodySize: 30, accent: res.score === 10 ? COLORS.good : COLORS.warn });
    p.position.y = -h / 2;
    const b = new Button({ label: 'عرض التقرير النهائي ⟵', width: 0.48, height: 0.09, style: 'primary', onClick: () => this._report() });
    b.position.y = -h - 0.08;
    g.add(p, b);
    this._set(g);
  }

  _report() {
    const S = this.app.scoring.summary();
    this.app.scoring.save();
    this.app.onFinished?.(S);
    this._setHeader(S.passed ? 'النتيجة: ناجح ✓' : 'النتيجة: لم يتحقق الاجتياز');
    this.done('report');
    this.app.audio.play(S.passed ? 'success' : 'error');
    if (S.passed) this.app.effects.burst(this.slot.getWorldPosition(new THREE.Vector3()), 0xffd166, 80);
    const th = CONFIG.scoring.thresholds;
    const p = new Panel({
      width: 1.7, height: 1.25, ppm: 1000, draw: (ctx, w, h) => {
        const pad = 40;
        drawText(ctx, 'التقرير النهائي — COVALENT BONDS', w - pad, 26, { size: 46, weight: 800 });
        fillRound(ctx, pad, 22, 300, 64, 32, S.passed ? '#1d7a4c' : '#8a2c35');
        drawText(ctx, S.passed ? 'ناجح' : 'غير مجتاز', pad + 150, 30, { size: 40, weight: 800, align: 'center' });
        const box = (x, title, val, sub2, ok) => {
          fillRound(ctx, x, 110, 500, 170, 22, 'rgba(255,255,255,0.06)', ok ? COLORS.good : COLORS.bad, 4);
          drawText(ctx, title, x + 250, 124, { size: 32, weight: 700, align: 'center', color: COLORS.muted });
          drawText(ctx, val, x + 250, 166, { size: 62, weight: 800, align: 'center', dir: 'ltr' });
          drawText(ctx, sub2, x + 250, 240, { size: 26, weight: 600, align: 'center', color: COLORS.muted, dir: 'rtl' });
        };
        box(w - pad - 500, 'الأداء العملي (60%)', `${S.practical.pct.toFixed(1)}%`, `${S.practical.raw} / ${S.practical.max} — الحد ${th.practical}%`, S.practical.pct >= th.practical);
        box(w / 2 - 250, 'الاختبار (40%)', `${S.exam.pct.toFixed(1)}%`, `${S.exam.raw} / ${S.exam.max} — الحد ${th.exam}%`, S.exam.pct >= th.exam);
        box(pad, 'الدرجة النهائية', `${S.final.toFixed(1)}%`, `العملي×0.60 + الاختبار×0.40 — الحد ${th.final}%`, S.final >= th.final);
        let y = 300;
        drawText(ctx, 'البنود الحرجة:', w - pad, y, { size: 32, weight: 800, color: COLORS.gold });
        S.criticals.forEach((c, i) => {
          const cx = i % 2 === 0 ? w - pad - 230 : w / 2 - 120;
          const cy = y + Math.floor(i / 2) * 44;
          drawText(ctx, `${c.passed ? '✓' : '✗'} ${c.label}`, cx, cy, { size: 29, weight: 700, color: c.passed ? COLORS.good : COLORS.bad, maxW: w / 2 - 140, maxLines: 1 });
        });
        y += Math.ceil(S.criticals.length / 2) * 44 + 14;
        if (!S.passed) {
          y = drawText(ctx, 'أسباب عدم الاجتياز: ' + S.reasons.join('، '), w - pad, y, { size: 27, weight: 700, color: COLORS.bad, maxW: w - pad * 2, maxLines: 3, lineH: 1.4 }) + 14;
        }
        const col = (x0, title, items, color) => {
          drawText(ctx, title, x0, y, { size: 32, weight: 800, color });
          let yy = y + 48;
          for (const it of items.slice(0, 8)) { if (yy > h - 130) break; yy = drawText(ctx, '• ' + it, x0, yy, { size: 26, weight: 600, maxW: w / 2 - pad * 1.5, maxLines: 2, lineH: 1.35 }) + 4; }
          if (!items.length) drawText(ctx, '—', x0, yy, { size: 26, color: COLORS.muted });
        };
        col(w - pad, 'نقاط القوة', S.strengths, COLORS.good);
        col(w / 2 - pad / 2, 'نقاط تحتاج إلى تحسين', S.weaknesses, COLORS.warn);
        drawLogo(ctx, BRAND.logoLight, pad, h - 96, 62);
        const pre = S.preTest, post = S.postTest;
        drawText(ctx, `القياس القبلي: ${pre ? (pre.correct ? 'صحيح' : 'خطأ') : '—'}   ·   القياس البعدي: ${post ? (post.correct ? 'صحيح' : 'خطأ') : '—'}   ·   المدة: ${Math.floor(S.durationSec / 60)}:${String(S.durationSec % 60).padStart(2, '0')} دقيقة`, w / 2, h - 66, { size: 28, weight: 700, align: 'center', color: COLORS.muted });
      },
    });
    const g = new THREE.Group();
    p.position.y = -0.62;
    p.position.z = -0.1;
    const again = new Button({ label: '↻ إعادة التجربة من البداية', width: 0.55, height: 0.09, style: 'primary', onClick: () => this.app.sceneManager.restart() });
    again.position.set(0, -1.32, 0);
    g.add(p, again);
    this.slot.position.set(0, 2.25, -0.95);
    this._set(g);
    // جملتان ثابتتان (لهما صوت مولّد)؛ الدرجة نفسها معروضة في التقرير
    if (S.passed) this.app.teacher.say('تهانينا! لقد اجتزت التجربة وحققت جميع شروط النجاح. اطّلع على تفاصيل درجتك في التقرير.');
    else this.app.teacher.say('أحسنت المحاولة. راجع البنود المذكورة في التقرير، ثم أعد التجربة؛ أنت قادر على النجاح.');
  }

  onExit() { this.app.keyboardCaptured = false; }
}
