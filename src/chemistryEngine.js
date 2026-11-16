// ============================================================================
//  محرك الكيمياء — منطق خالص بلا رسوميات (قابل للاختبار في Node)
//  العناصر، الكهروسالبية، تصنيف الروابط، التحقق من بنية الجزيئات.
// ============================================================================
import { CONFIG } from './config.js';

// ألوان النموذج التعليمي (ثابتة في جميع المشاهد):
// C أسود، H أصفر، N أزرق، O أحمر، Cl أخضر.
export const ELEMENTS = {
  C:  { symbol: 'C',  name: 'الكربون',    valence: 4, lonePairs: 0, color: 0x2b2b2b, radius: 0.032 },
  N:  { symbol: 'N',  name: 'النيتروجين', valence: 3, lonePairs: 1, color: 0x2f6fdb, radius: 0.031 },
  O:  { symbol: 'O',  name: 'الأكسجين',   valence: 2, lonePairs: 2, color: 0xd8322f, radius: 0.030 },
  H:  { symbol: 'H',  name: 'الهيدروجين', valence: 1, lonePairs: 0, color: 0xf2cf2a, radius: 0.022 },
  Cl: { symbol: 'Cl', name: 'الكلور',     valence: 1, lonePairs: 3, color: 0x2fae4f, radius: 0.034 },
  Na: { symbol: 'Na', name: 'الصوديوم',   valence: 1, lonePairs: 0, color: 0x8a63d2, radius: 0.036, metal: true },
};

export const EN = CONFIG.electronegativity;

export const BOND_CLASS_LABEL = {
  pure: 'رابطة تساهمية نقية',
  polar: 'رابطة تساهمية قطبية',
  ionic: 'رابطة أيونية',
  metallic: 'رابطة فلزية',
};

const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
export function sub(text) { return String(text).replace(/\d/g, d => SUB[d]); }

export function round2(x) { return Math.round(x * 100) / 100; }

export function deltaEN(a, b) {
  if (!(a in EN) || !(b in EN)) throw new Error(`Unknown element ${a}/${b}`);
  return round2(Math.abs(EN[a] - EN[b]));
}

/** التصنيف التعليمي التقريبي لفرق الكهروسالبية */
export function classifyDelta(d, a = null, b = null) {
  const { pureMax, polarMax } = CONFIG.bondClassBounds;
  if (a && b && ELEMENTS[a]?.metal && ELEMENTS[b]?.metal) return 'metallic';
  if (d < pureMax) return 'pure';
  if (d <= polarMax) return 'polar';
  return 'ionic';
}

/** النسبة المئوية التقريبية للخاصية الأيونية (علاقة باولنغ): 1 - e^(-ΔEN²/4) */
export function ionicCharacter(d) {
  return 1 - Math.exp(-(d * d) / 4);
}
export function ionicPercent(d) { return Math.round(ionicCharacter(d) * 100); }

/** شرح مختصر لكل حالة يظهر بعد الحساب */
export function explainPair(a, b) {
  const d = deltaEN(a, b);
  const cls = classifyDelta(d, a, b);
  const hi = EN[a] >= EN[b] ? a : b;
  const lo = hi === a ? b : a;
  let text;
  if (cls === 'metallic') {
    text = 'ذرتا فلز متماثلتان: الرابطة بينهما فلزية، وهي خارج نطاق هذا النشاط.';
  } else if (cls === 'pure') {
    text = d === 0
      ? 'الذرتان متساويتان في الكهروسالبية، فتتشاركان زوج الإلكترونات بالتساوي ولا تنشأ شحنات جزئية.'
      : `الفرق صغير جدًا، فتكون المشاركة متساوية تقريبًا وتُعامل الرابطة كغير قطبية.`;
  } else if (cls === 'polar') {
    text = `ذرة ${hi} أعلى كهروسالبية فتجذب زوج الإلكترونات المشترك نحوها أكثر: تظهر δ− عند ${hi} و δ+ عند ${lo}.`;
  } else {
    text = `الفرق كبير: ينتقل إلكترون من ${lo} إلى ${hi} في التمثيل التعليمي وتتكوّن أيونات يجذب بعضها بعضًا كهروستاتيكيًا — هذه ليست مشاركة إلكترونات.`;
  }
  const metalNonMetal = !!(ELEMENTS[a]?.metal) !== !!(ELEMENTS[b]?.metal);
  if (metalNonMetal && cls !== 'ionic') {
    text += ' ملاحظة: ارتباط فلز بلافلز يكون غالبًا أيونيًا حتى لو كان الفرق أقل من 1.7؛ الحدود تقريبية.';
  }
  return { a, b, d, cls, label: BOND_CLASS_LABEL[cls], percent: ionicPercent(d), text, hi, lo };
}

// ----------------------------------------------------------------------------
//  الرسم البياني للجزيء: { atoms:[{id, el}], bonds:[{a, b, order, kind:'stick'|'spring'}] }
// ----------------------------------------------------------------------------
export function usedValence(graph, id) {
  let s = 0;
  for (const b of graph.bonds) if (b.a === id || b.b === id) s += b.order;
  return s;
}
export function freeHoles(graph, id) {
  const atom = graph.atoms.find(x => x.id === id);
  return ELEMENTS[atom.el].valence - usedValence(graph, id);
}
export function neighbors(graph, id) {
  const out = [];
  for (const b of graph.bonds) {
    if (b.a === id) out.push({ id: b.b, bond: b });
    else if (b.b === id) out.push({ id: b.a, bond: b });
  }
  return out;
}
export function countElements(graph) {
  const c = {};
  for (const a of graph.atoms) c[a.el] = (c[a.el] || 0) + 1;
  return c;
}
/** صيغة هيل: C أولًا ثم H ثم الباقي أبجديًا */
export function formulaOf(graph, useSub = true) {
  const c = countElements(graph);
  const keys = Object.keys(c).sort((x, y) => {
    const rank = e => (c.C ? (e === 'C' ? 0 : e === 'H' ? 1 : 2) : 2);
    return rank(x) - rank(y) || x.localeCompare(y);
  });
  const f = keys.map(k => k + (c[k] > 1 ? c[k] : '')).join('');
  return useSub ? sub(f) : f;
}

/** هل يمكن إنشاء وصلة بين ذرتين؟ */
export function canConnect(graph, idA, idB) {
  if (idA === idB) return { ok: false, msg: 'لا يمكن ربط الذرة بنفسها.' };
  const fa = freeHoles(graph, idA), fb = freeHoles(graph, idB);
  const ea = graph.atoms.find(a => a.id === idA).el, eb = graph.atoms.find(a => a.id === idB).el;
  if (fa <= 0) return { ok: false, msg: `لا توجد فتحة حرة في ذرة ${ELEMENTS[ea].name} (${ea}).` };
  if (fb <= 0) return { ok: false, msg: `لا توجد فتحة حرة في ذرة ${ELEMENTS[eb].name} (${eb}).` };
  if (ELEMENTS[ea].metal || ELEMENTS[eb].metal) return { ok: false, msg: 'الصوديوم لا يكوّن روابط تساهمية في هذا النموذج.' };
  return { ok: true };
}

/** هل يمكن إضافة وصلة إضافية (زنبرك) إلى رابطة قائمة؟ */
export function canIncreaseOrder(graph, bond, kind) {
  if (kind !== 'spring') return { ok: false, msg: 'العصا تمثل رابطة أحادية فقط. استخدم الزنبرك لإضافة وصلة ثانية أو ثالثة.' };
  if (bond.kind !== 'spring') return { ok: false, msg: 'هذه الرابطة عصا أحادية. فكّها بالكماشة ثم اربط الذرتين بالزنابرك.' };
  if (bond.order >= 3) return { ok: false, msg: 'الحد الأقصى ثلاث وصلات (رابطة ثلاثية).' };
  const fa = freeHoles(graph, bond.a), fb = freeHoles(graph, bond.b);
  if (fa <= 0 || fb <= 0) return { ok: false, msg: 'لا توجد فتحة حرة لإضافة وصلة أخرى بين هاتين الذرتين.' };
  return { ok: true };
}

/** عدد مجالات الإلكترونات (للهندسة): الجيران + الفتحات الحرة + الأزواج غير الرابطة */
export function stericNumber(graph, id) {
  const atom = graph.atoms.find(a => a.id === id);
  const e = ELEMENTS[atom.el];
  return neighbors(graph, id).length + freeHoles(graph, id) + e.lonePairs;
}

// ----------------------------------------------------------------------------
//  محللات التحقق من الجزيئات المطلوبة
// ----------------------------------------------------------------------------
function compositionIs(graph, want) {
  const c = countElements(graph);
  const keys = new Set([...Object.keys(c), ...Object.keys(want)]);
  for (const k of keys) if ((c[k] || 0) !== (want[k] || 0)) return false;
  return true;
}

/** CO2: O=C=O — وصلتان (زنبركان) بين C وكل O. لا تُقبل وصلة واحدة ولا ثلاث. */
export function analyzeCO2(graph) {
  const c = countElements(graph);
  if (!compositionIs(graph, { C: 1, O: 2 })) {
    if ((c.C || 0) === 1 && (c.O || 0) < 2 && Object.keys(c).every(k => k === 'C' || k === 'O'))
      return { ok: false, progress: true, msg: 'أكمل البناء: يحتاج الجزيء إلى ذرتي أكسجين حول ذرة الكربون.' };
    return { ok: false, msg: 'جزيء CO₂ يتكون من ذرة كربون واحدة وذرتي أكسجين فقط.' };
  }
  const C = graph.atoms.find(a => a.el === 'C');
  const Os = graph.atoms.filter(a => a.el === 'O');
  if (graph.bonds.some(b => {
    const ea = graph.atoms.find(a => a.id === b.a).el, eb = graph.atoms.find(a => a.id === b.b).el;
    return ea === 'O' && eb === 'O';
  })) return { ok: false, msg: 'لا ترتبط ذرتا الأكسجين ببعضهما؛ ذرة الكربون في المنتصف.' };
  for (const O of Os) {
    const bond = graph.bonds.find(b => (b.a === C.id && b.b === O.id) || (b.b === C.id && b.a === O.id));
    if (!bond) return { ok: false, progress: true, msg: 'إحدى ذرتي الأكسجين غير مرتبطة بالكربون بعد.' };
    if (bond.kind === 'stick') return { ok: false, msg: 'العصا تمثل رابطة أحادية. الرابطة الثنائية تُمثَّل بزنبركين بين الذرتين.' };
    if (bond.order === 1) return { ok: false, progress: true, msg: 'بين الكربون وإحدى ذرتي الأكسجين وصلة واحدة فقط — الرابطة الثنائية تحتاج وصلتين.' };
    if (bond.order === 3) return { ok: false, msg: 'ثلاث وصلات تمثل رابطة ثلاثية، وهذا غير صحيح في CO₂. فكّ وصلة بالكماشة.' };
  }
  return { ok: true, msg: 'أحسنت! لقد بنيت جزيء CO₂ بصورة صحيحة: O=C=O' };
}

/** CH4: أربع روابط أحادية (عصي) بين C وأربع ذرات H */
export function analyzeCH4(graph) {
  const c = countElements(graph);
  if (!compositionIs(graph, { C: 1, H: 4 })) {
    if ((c.C || 0) === 1 && (c.H || 0) < 4 && Object.keys(c).every(k => k === 'C' || k === 'H'))
      return { ok: false, progress: true, msg: `أكمل البناء: ${4 - (c.H || 0)} ذرات هيدروجين متبقية.` };
    return { ok: false, msg: 'جزيء الميثان CH₄ يتكون من ذرة كربون واحدة وأربع ذرات هيدروجين.' };
  }
  const C = graph.atoms.find(a => a.el === 'C');
  for (const b of graph.bonds) {
    if (b.a !== C.id && b.b !== C.id) return { ok: false, msg: 'كل ذرة هيدروجين ترتبط بالكربون مباشرة.' };
    if (b.order !== 1) return { ok: false, msg: 'الروابط في الميثان أحادية.' };
    if (b.kind !== 'stick') return { ok: false, msg: 'الرابطة الأحادية تُمثَّل بعصا، لا بزنبرك.' };
  }
  if (graph.bonds.length !== 4) return { ok: false, progress: true, msg: 'يجب أن ترتبط ذرات الهيدروجين الأربع بالكربون.' };
  return { ok: true, msg: 'أحسنت! جزيء الميثان CH₄: أربع روابط أحادية بشكل رباعي السطوح.' };
}

/** يعيد أفضل نتيجة تحليل من بين عدة جزيئات */
export function bestAnalysis(graphs, analyzer) {
  let best = null;
  for (const g of graphs) {
    const r = analyzer(g);
    if (r.ok) return { ...r, graph: g };
    if (g.atoms.length > 1 && (!best || g.atoms.length > best.graph.atoms.length)) best = { ...r, graph: g };
  }
  return best || { ok: false, msg: 'لم تبدأ البناء بعد.', graph: null };
}

// ----------------------------------------------------------------------------
//  اتجاهات المجالات المثالية (VSEPR) — تستخدمها طبقة العرض
//  الاتجاه الأول دائمًا +Y. تُرجع مصفوفات [x,y,z].
// ----------------------------------------------------------------------------
export function idealDirections(n) {
  switch (n) {
    case 0: return [];
    case 1: return [[0, 1, 0]];
    case 2: return [[0, 1, 0], [0, -1, 0]];
    case 3: return [[0, 1, 0], [0.8660254, -0.5, 0], [-0.8660254, -0.5, 0]];
    default: {
      const s = Math.sqrt(8 / 9), y = -1 / 3;
      const out = [[0, 1, 0]];
      for (let k = 0; k < 3; k++) {
        const t = (k * 2 * Math.PI) / 3;
        out.push([s * Math.cos(t), y, s * Math.sin(t)]);
      }
      return out; // زاوية 109.47°
    }
  }
}
export function angleBetween(u, v) {
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  return (Math.acos(Math.min(1, Math.max(-1, d / (lu * lv)))) * 180) / Math.PI;
}
