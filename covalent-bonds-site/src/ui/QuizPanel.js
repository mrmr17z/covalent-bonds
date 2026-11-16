// لوحة سؤال اختيار من متعدد ثلاثية الأبعاد
import * as THREE from 'three';
import { TextPanel, Button, autoHeight } from './VRPanel.js';
import { COLORS } from './text.js';
import { LETTERS } from '../data/questions.js';

/**
 * mode:
 *  'feedback' — المحاولة الأولى تُقفل السؤال ويظهر التصحيح والتفسير
 *  'silent'   — تُسجَّل الإجابة دون كشف الصحيح (القبلي/الاختبار النهائي)
 *  'retry'    — عند الخطأ يظهر تلميح ويمكن المحاولة مجددًا
 */
export class QuizPanel extends THREE.Group {
  constructor({ title = '', question, options, correct = -1, explanation = '', hints = [], mode = 'feedback', onAnswer = null, width = 1.25, optionHeight = 0.088, gap = 0.016, bodySize = 36 }) {
    super();
    this.mode = mode; this.correct = correct; this.explanation = explanation; this.hints = hints;
    this.onAnswer = onAnswer; this.locked = false; this.width = width;
    const qText = question;
    const qh = Math.max(0.2, autoHeight(qText, width, bodySize, 900, title ? 150 : 90));
    this.qPanel = new TextPanel({ title, body: qText, width, height: qh, bodySize, titleSize: 40 });
    this.add(this.qPanel);
    this.buttons = options.map((opt, i) => {
      const lines = Math.ceil(opt.length / 62);
      const h = Math.max(optionHeight, optionHeight * (lines > 1 ? 1.45 : 1));
      const b = new Button({ label: `${LETTERS[i]}. ${opt}`, width: width - 0.06, height: h, align: 'right', fontSize: 30, onClick: (ptr) => this._choose(i) });
      this.add(b);
      return b;
    });
    this.fb = new TextPanel({ title: '', body: '', width, height: 0.26, bodySize: 32, bg: COLORS.bgSoft });
    this.fb.visible = false;
    this.add(this.fb);
    this._layout();
  }
  _layout() {
    let y = 0;
    const place = (obj, h) => { obj.position.y = y - h / 2; y -= h + 0.016; };
    place(this.qPanel, this.qPanel.height);
    for (const b of this.buttons) place(b, b.height);
    if (this.fb.visible) place(this.fb, this.fb.height);
    this.totalHeight = -y;
  }
  /** يضع المجموعة بحيث يكون أعلاها عند y المعطى */
  get topOffset() { return 0; }

  showFeedback(title, body, color = COLORS.accent) {
    const h = Math.max(0.2, autoHeight(body, this.width, 32, 900, title ? 140 : 80));
    if (Math.abs(h - this.fb.height) > 0.01) {
      this.remove(this.fb); this.fb.dispose();
      this.fb = new TextPanel({ title, body, width: this.width, height: h, bodySize: 32, titleSize: 38, bg: COLORS.bgSoft, accent: color, border: color });
      this.add(this.fb);
    } else {
      this.fb.border = color; this.fb.setText({ title, body, accent: color });
    }
    this.fb.visible = true;
    this._layout();
  }

  _choose(i) {
    if (this.locked) return;
    const isCorrect = i === this.correct;
    if (this.mode === 'silent') {
      this.locked = true;
      this.buttons.forEach((b, k) => { b.setStyle(k === i ? 'selected' : 'default'); b.setEnabled(k === i); });
      this.onAnswer?.(i, isCorrect);
      return;
    }
    if (this.mode === 'feedback') {
      this.locked = true;
      this.buttons.forEach((b, k) => {
        if (k === this.correct) b.setStyle('correct');
        else if (k === i) b.setStyle('wrong');
        else b.setEnabled(false);
      });
      this.showFeedback(isCorrect ? 'إجابة صحيحة ✓' : 'إجابة غير صحيحة', this.explanation, isCorrect ? COLORS.good : COLORS.bad);
      this.onAnswer?.(i, isCorrect);
      return;
    }
    // retry
    if (isCorrect) {
      this.locked = true;
      this.buttons.forEach((b, k) => { if (k === i) b.setStyle('correct'); else b.setEnabled(false); });
      this.showFeedback('صحيح ✓', this.explanation, COLORS.good);
    } else {
      this.buttons[i].setStyle('wrong');
      this.buttons[i].setEnabled(false);
      this.showFeedback('حاول مرة أخرى', this.hints[i] || 'فكّر في السبب العلمي وراء الخيار.', COLORS.warn);
    }
    this.onAnswer?.(i, isCorrect);
  }
  dispose() {}
}
