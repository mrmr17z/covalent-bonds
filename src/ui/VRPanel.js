// لوحات وأزرار ثلاثية الأبعاد داخل البيئة — نص عربي مرسوم على Canvas.
import * as THREE from 'three';
import { COLORS, drawText, fillRound, font, wrapLines, measureParagraph } from './text.js';
import { registerTarget } from '../core/registry.js';

export const uiContext = { audio: null, maxAnisotropy: 4 };
const DEFAULT_PPM = 900;

function makeTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = uiContext.maxAnisotropy;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

/** لوحة عامة: مستوى عليه Canvas يُرسم بدالة draw(ctx, w, h) */
export class Panel extends THREE.Group {
  constructor({ width = 1, height = 0.6, ppm = DEFAULT_PPM, draw = null, bg = COLORS.bg, border = COLORS.border, radius = 26, borderWidth = 4, doubleSided = false } = {}) {
    super();
    this.width = width; this.height = height;
    this.bg = bg; this.border = border; this.radius = radius; this.borderWidth = borderWidth;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.min(2048, Math.round(width * ppm));
    this.canvas.height = Math.min(2048, Math.round(height * ppm));
    this.ctx = this.canvas.getContext('2d');
    this.texture = makeTexture(this.canvas);
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide, alphaTest: 0.02 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.add(this.mesh);
    this.drawFn = draw;
    this.redraw();
  }
  get pw() { return this.canvas.width; }
  get ph() { return this.canvas.height; }
  setDraw(fn) { this.drawFn = fn; this.redraw(); }
  redraw() {
    const { ctx } = this, w = this.pw, h = this.ph;
    ctx.clearRect(0, 0, w, h);
    if (this.bg) fillRound(ctx, 3, 3, w - 6, h - 6, this.radius, this.bg, this.border, this.borderWidth);
    this.drawFn?.(ctx, w, h, this);
    this.texture.needsUpdate = true;
  }
  dispose() { this.texture.dispose(); this.material.dispose(); this.mesh.geometry.dispose(); }
}

/** لوحة نصية قياسية: عنوان + نص + تذييل اختياري */
export class TextPanel extends Panel {
  constructor({ title = '', body = '', footer = '', width = 1.1, height = 0.6, titleSize = 46, bodySize = 34, accent = COLORS.accent, align = 'right', ...rest } = {}) {
    super({ width, height, ...rest, draw: null });
    this.content = { title, body, footer, titleSize, bodySize, accent, align };
    this.setDraw((ctx, w, h) => this._drawContent(ctx, w, h));
  }
  _drawContent(ctx, w, h) {
    const c = this.content, pad = 36;
    let y = pad;
    const x = c.align === 'center' ? w / 2 : w - pad;
    if (c.title) {
      ctx.fillStyle = c.accent;
      ctx.fillRect(w - pad - 8, y + 6, 8, c.titleSize * 1.05);
      y = drawText(ctx, c.title, c.align === 'center' ? x : x - 22, y, { size: c.titleSize, weight: 800, color: COLORS.text, maxW: w - pad * 2 - 30, align: c.align, lineH: 1.3 });
      y += 12;
    }
    if (c.body) y = drawText(ctx, c.body, x, y, { size: c.bodySize, weight: 500, color: COLORS.text, maxW: w - pad * 2, align: c.align, lineH: 1.55 });
    if (c.footer) drawText(ctx, c.footer, x, h - pad - c.bodySize * 0.9 * 1.4, { size: c.bodySize * 0.82, weight: 600, color: COLORS.muted, maxW: w - pad * 2, align: c.align });
  }
  setText(patch) { Object.assign(this.content, patch); this.redraw(); }
}

/** يحسب ارتفاعًا مناسبًا لنص داخل لوحة بعرض معين (بالأمتار) */
export function autoHeight(text, widthM, sizePx, ppm = DEFAULT_PPM, extraPx = 80) {
  const h = measureParagraph(text, sizePx, widthM * ppm - 72);
  return (h + extraPx) / ppm;
}

const BTN_STYLES = {
  default:  { bg: '#24364f', border: '#4b6a90', text: COLORS.text },
  primary:  { bg: '#1b6fb3', border: '#5cc2ff', text: '#ffffff' },
  selected: { bg: '#2c4d7a', border: '#ffd166', text: '#ffffff' },
  correct:  { bg: '#1d7a4c', border: '#5cf0a0', text: '#ffffff' },
  wrong:    { bg: '#8a2c35', border: '#ff8c8c', text: '#ffffff' },
  disabled: { bg: '#1c2533', border: '#2c3a4e', text: '#62748c' },
  ghost:    { bg: 'rgba(20,30,46,0.75)', border: '#39b6ff', text: COLORS.text },
};

/** زر ثلاثي الأبعاد: يُضغط بالشعاع أو باللمس المباشر (Poke) أو بالفأرة */
export class Button extends THREE.Group {
  constructor({ label = '', width = 0.3, height = 0.08, ppm = 1000, onClick = null, style = 'default', fontSize = null, enabled = true, sub = '', align = 'center', haptic = true } = {}) {
    super();
    this.width = width; this.height = height;
    this.label = label; this.sub = sub; this.align = align;
    this.style = style; this.baseStyle = style;
    this.onClick = onClick;
    this.enabledFlag = enabled;
    this.hover = false;
    this.fontSize = fontSize;
    this._lastClick = 0;
    this._pressAnim = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * ppm);
    this.canvas.height = Math.round(height * ppm);
    this.ctx = this.canvas.getContext('2d');
    this.texture = makeTexture(this.canvas);
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, alphaTest: 0.02 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.position.z = 0.004;
    this.add(this.mesh);
    registerTarget(this.mesh, {
      kind: 'button', owner: this,
      enabled: () => this.enabledFlag,
      onHover: (on) => this.setHover(on),
      onPress: (ptr) => this.click(ptr),
    });
    this.redraw();
  }
  setHover(on) {
    if (this.hover === on) return;
    this.hover = on;
    if (on && this.enabledFlag) uiContext.audio?.play('hover');
    this.redraw();
  }
  setEnabled(on) {
    if (this.enabledFlag === on) return;
    this.enabledFlag = on; this.redraw();
  }
  setStyle(s) { this.style = s; this.redraw(); }
  setLabel(label, sub = this.sub) { this.label = label; this.sub = sub; this.redraw(); }
  click(ptr) {
    if (!this.enabledFlag) return;
    const now = performance.now();
    if (now - this._lastClick < 320) return;
    this._lastClick = now;
    this._pressAnim = 1;
    uiContext.audio?.play('click');
    ptr?.pulse?.(0.35, 30);
    this.onClick?.(ptr, this);
  }
  update(dt) {
    if (this._pressAnim > 0) {
      this._pressAnim = Math.max(0, this._pressAnim - dt * 6);
      const s = 1 - 0.06 * Math.sin(this._pressAnim * Math.PI);
      this.mesh.scale.set(s, s, 1);
    }
  }
  redraw() {
    const { ctx } = this, w = this.canvas.width, h = this.canvas.height;
    const st = BTN_STYLES[this.enabledFlag ? this.style : 'disabled'] || BTN_STYLES.default;
    ctx.clearRect(0, 0, w, h);
    const r = Math.min(h * 0.32, 40);
    fillRound(ctx, 3, 3, w - 6, h - 6, r, st.bg, this.hover && this.enabledFlag ? '#ffffff' : st.border, this.hover ? 6 : 4);
    if (this.hover && this.enabledFlag) { fillRound(ctx, 3, 3, w - 6, h - 6, r, 'rgba(255,255,255,0.10)'); }
    let size = this.fontSize || Math.min(h * 0.42, 46);
    ctx.font = font(size, 700);
    ctx.direction = 'rtl';
    const padX = 26;
    let lines = wrapLines(ctx, this.label, w - padX * 2);
    while (lines.length * size * 1.3 > h * (this.sub ? 0.62 : 0.86) && size > 14) {
      size -= 2; ctx.font = font(size, 700); lines = wrapLines(ctx, this.label, w - padX * 2);
    }
    const totalH = lines.length * size * 1.3 + (this.sub ? size * 1.1 : 0);
    let y = (h - totalH) / 2 + size * 0.08;
    const x = this.align === 'center' ? w / 2 : w - padX;
    for (const l of lines) {
      drawText(ctx, l, x, y, { size, weight: 700, color: st.text, maxW: w * 4, align: this.align, lineH: 1.3 });
      y += size * 1.3;
    }
    if (this.sub) drawText(ctx, this.sub, x, y, { size: size * 0.72, weight: 500, color: COLORS.muted, maxW: w - padX * 2, align: this.align });
    this.texture.needsUpdate = true;
  }
}

/** نص عائم بسيط (بطاقة تعريفية) */
export function makeLabel(text, { width = 0.4, height = 0.1, size = null, color = COLORS.text, bg = 'rgba(10,18,30,0.82)', border = null, weight = 700, ppm = 1000 } = {}) {
  const p = new Panel({
    width, height, ppm, bg, border: border || 'rgba(0,0,0,0)', radius: 18, borderWidth: border ? 4 : 0,
    draw: (ctx, w, h) => {
      const s = size || h * 0.5;
      drawText(ctx, text, w / 2, (h - s * 1.25) / 2, { size: s, weight, color, align: 'center', maxW: w * 0.94, lineH: 1.25 });
    },
  });
  return p;
}

/** يجعل الكائن يواجه نقطة ما (حول المحور الرأسي فقط) */
export function faceTowardsY(obj, worldTarget) {
  const p = new THREE.Vector3();
  obj.getWorldPosition(p);
  const ang = Math.atan2(worldTarget.x - p.x, worldTarget.z - p.z);
  const parentQ = new THREE.Quaternion();
  obj.parent?.getWorldQuaternion(parentQ);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
  obj.quaternion.copy(parentQ.invert().multiply(q));
}
