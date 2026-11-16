// رسم تراكيب لويس ثنائية الأبعاد على Canvas
const ATOM_COLORS = { C: '#e9edf2', H: '#ffd84a', O: '#ff6b62', N: '#6aa7ff', Cl: '#5fdc84', Na: '#b394ff' };

const DEFS = {
  CH4: {
    atoms: { C: [0, 0, 'C'], H1: [0, -1, 'H'], H2: [0, 1, 'H'], H3: [-1, 0, 'H'], H4: [1, 0, 'H'] },
    bonds: [['C', 'H1', 1], ['C', 'H2', 1], ['C', 'H3', 1], ['C', 'H4', 1]],
    lone: {},
  },
  CO2: {
    atoms: { O1: [-1.1, 0, 'O'], C: [0, 0, 'C'], O2: [1.1, 0, 'O'] },
    bonds: [['O1', 'C', 2], ['C', 'O2', 2]],
    lone: { O1: [90, 270], O2: [90, 270] },
  },
  CO2wrong: {
    atoms: { O1: [-1.1, 0, 'O'], C: [0, 0, 'C'], O2: [1.1, 0, 'O'] },
    bonds: [['O1', 'C', 1], ['C', 'O2', 1]],
    lone: { O1: [90, 180, 270], O2: [90, 0, 270], C: [90, 270] },
  },
  H2O: {
    atoms: { O: [0, 0, 'O'], H1: [-0.9, 0.75, 'H'], H2: [0.9, 0.75, 'H'] },
    bonds: [['O', 'H1', 1], ['O', 'H2', 1]],
    lone: { O: [55, 125] },
  },
  HCl: {
    atoms: { H: [-0.6, 0, 'H'], Cl: [0.6, 0, 'Cl'] },
    bonds: [['H', 'Cl', 1]],
    lone: { Cl: [0, 90, 270] },
  },
  Cl2: {
    atoms: { A: [-0.6, 0, 'Cl'], B: [0.6, 0, 'Cl'] },
    bonds: [['A', 'B', 1]],
    lone: { A: [180, 90, 270], B: [0, 90, 270] },
  },
  N2: {
    atoms: { A: [-0.6, 0, 'N'], B: [0.6, 0, 'N'] },
    bonds: [['A', 'B', 3]],
    lone: { A: [180], B: [0] },
  },
};

/** يرسم تركيب لويس في المستطيل (x,y,w,h) — الإحداثيات بالبكسل */
export function drawLewis(ctx, type, x, y, w, h, { color = '#eef4fb', scale = 1 } = {}) {
  const d = DEFS[type];
  if (!d) return;
  const unit = Math.min(w, h) * 0.32 * scale;
  const cx = x + w / 2, cy = y + h / 2;
  const P = k => [cx + d.atoms[k][0] * unit, cy + d.atoms[k][1] * unit];
  const fontPx = unit * 0.5;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, unit * 0.055);
  const gap = unit * 0.13;
  for (const [a, b, order] of d.bonds) {
    const [x1, y1] = P(a), [x2, y2] = P(b);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const trim = fontPx * 0.62;
    const offs = order === 1 ? [0] : order === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    for (const o of offs) {
      ctx.beginPath();
      ctx.moveTo(x1 + ux * trim + nx * o, y1 + uy * trim + ny * o);
      ctx.lineTo(x2 - ux * trim + nx * o, y2 - uy * trim + ny * o);
      ctx.stroke();
    }
  }
  ctx.font = `800 ${fontPx}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  for (const k of Object.keys(d.atoms)) {
    const [px, py] = P(k);
    ctx.fillStyle = ATOM_COLORS[d.atoms[k][2]] || color;
    ctx.fillText(d.atoms[k][2], px, py);
  }
  // أزواج إلكترونية غير رابطة
  ctx.fillStyle = '#9fe3ff';
  const dotR = Math.max(2.5, unit * 0.04);
  for (const [k, angles] of Object.entries(d.lone)) {
    const [px, py] = P(k);
    for (const ang of angles) {
      const a = (ang * Math.PI) / 180;
      const rr = fontPx * 0.78;
      const bx = px + Math.cos(a) * rr, by = py - Math.sin(a) * rr;
      const tx = -Math.sin(a), ty = -Math.cos(a);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(bx + tx * dotR * 1.6 * s, by + ty * dotR * 1.6 * s, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export const LEWIS_TYPES = Object.keys(DEFS);
