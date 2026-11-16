// أدوات رسم النص العربي على Canvas (اتجاه RTL، التفاف الأسطر، مستطيلات مستديرة)
export const FONT_FAMILY = "'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif";
export const COLORS = {
  bg: 'rgba(14,22,36,0.94)',
  bgSoft: 'rgba(24,36,56,0.92)',
  border: '#39b6ff',
  text: '#eef4fb',
  muted: '#a9bcd3',
  accent: '#39b6ff',
  good: '#35d07f',
  bad: '#ff6b6b',
  warn: '#ffc145',
  gold: '#ffd166',
};

export function font(size, weight = 600) { return `${weight} ${Math.round(size)}px ${FONT_FAMILY}`; }

let _mctx = null;
function mctx() {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  return _mctx;
}

export function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (ctx.measureText(test).width <= maxW) line = test;
      else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

export function measureParagraph(text, size, maxW, weight = 600, lineH = 1.5) {
  const c = mctx();
  c.font = font(size, weight);
  c.direction = 'rtl';
  return wrapLines(c, text, maxW).length * size * lineH;
}

/** يرسم فقرة ويعيد موضع y بعد آخر سطر */
export function drawText(ctx, text, x, y, {
  size = 32, weight = 600, color = COLORS.text, maxW = 1000, align = 'right', lineH = 1.5, dir = 'rtl', maxLines = 99,
} = {}) {
  ctx.save();
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.direction = dir;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const lines = wrapLines(ctx, text, maxW).slice(0, maxLines);
  for (const l of lines) { ctx.fillText(l, x, y); y += size * lineH; }
  ctx.restore();
  return y;
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fillRound(ctx, x, y, w, h, r, fill, stroke = null, lw = 4) {
  roundRect(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** ينتظر تحميل الخط العربي قبل رسم أي لوحة */
export async function loadFonts() {
  if (!document.fonts) return;
  try {
    await Promise.race([
      Promise.all([document.fonts.load(font(32, 600)), document.fonts.load(font(32, 800)), document.fonts.load(font(32, 400))]),
      new Promise(r => setTimeout(r, 3500)),
    ]);
  } catch (e) { /* يُستخدم الخط الاحتياطي */ }
}
