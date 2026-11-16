// لوحة مفاتيح عربية افتراضية داخل VR (تعمل أيضًا بلوحة مفاتيح الكمبيوتر في وضع المعاينة)
import * as THREE from 'three';
import { Panel, Button } from './VRPanel.js';
import { COLORS, drawText } from './text.js';

const ROWS = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'د', 'ذ'],
  ['أ', 'إ', 'آ', 'لا', '،', '.'],
];

export class VirtualKeyboard extends THREE.Group {
  constructor({ maxLength = 160, onSubmit = null, onChange = null, width = 1.2 } = {}) {
    super();
    this.text = '';
    this.maxLength = maxLength;
    this.onSubmit = onSubmit; this.onChange = onChange;
    this.display = new Panel({
      width, height: 0.2, bg: '#0c1422', border: COLORS.accent,
      draw: (ctx, w, h) => {
        const t = this.text || 'اكتب إجابتك هنا…';
        drawText(ctx, t + (this.text ? '|' : ''), w - 30, 24, { size: 34, weight: 600, color: this.text ? COLORS.text : COLORS.muted, maxW: w - 60, maxLines: 3 });
      },
    });
    this.display.position.y = 0.22;
    this.add(this.display);
    const kw = 0.092, kh = 0.078, gap = 0.012;
    ROWS.forEach((row, r) => {
      const rowW = row.length * kw + (row.length - 1) * gap;
      row.forEach((ch, i) => {
        // ترتيب من اليمين إلى اليسار
        const b = new Button({ label: ch, width: kw, height: kh, fontSize: 40, onClick: () => this.typeChar(ch) });
        b.position.set(rowW / 2 - kw / 2 - i * (kw + gap), 0.06 - r * (kh + gap), 0);
        this.add(b);
      });
    });
    const y5 = 0.06 - 4 * (kh + gap);
    const space = new Button({ label: 'مسافة', width: 0.42, height: kh, onClick: () => this.typeChar(' ') });
    space.position.set(0, y5, 0);
    const del = new Button({ label: '⌫ حذف', width: 0.2, height: kh, onClick: () => this.backspace() });
    del.position.set(-0.33, y5, 0);
    const clear = new Button({ label: 'مسح الكل', width: 0.2, height: kh, onClick: () => { this.text = ''; this._changed(); } });
    clear.position.set(0.33, y5, 0);
    this.submitBtn = new Button({ label: 'إرسال الإجابة ✓', width: 0.5, height: 0.085, style: 'primary', onClick: () => this.submit() });
    this.submitBtn.position.set(0, y5 - 0.1, 0);
    this.add(space, del, clear, this.submitBtn);

    // إدخال من لوحة مفاتيح الكمبيوتر
    this._onKey = (e) => {
      if (!this.visible || !this.parent) return;
      if (e.key === 'Backspace') { this.backspace(); e.preventDefault(); }
      else if (e.key === 'Enter') { this.submit(); e.preventDefault(); }
      else if (e.key.length === 1 && /[؀-ۿ\s.,،؟a-zA-Z0-9]/.test(e.key)) { this.typeChar(e.key); e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', this._onKey, true);
    this.userData.onDispose = () => window.removeEventListener('keydown', this._onKey, true);
  }
  typeChar(ch) { if (this.text.length >= this.maxLength) return; this.text += ch; this._changed(); }
  backspace() { this.text = this.text.slice(0, -1); this._changed(); }
  _changed() { this.display.redraw(); this.onChange?.(this.text); }
  submit() { if (this.text.trim().length < 3) return; this.onSubmit?.(this.text.trim()); }
}
