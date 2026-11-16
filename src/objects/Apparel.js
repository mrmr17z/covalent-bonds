// ============================================================================
//  الملابس الواقية المُفصّلة على جسم كل شخصية:
//  - معطف مختبر أبيض طويل (حتى أسفل الركبة) بياقة وطيّات صدر وأزرار وجيب صدر
//    وجيبين أماميين وأكمام طويلة بأساور، فوق قميص وبنطال داكنين.
//  - نظارات واقية مغلقة الجوانب بعدسة شفافة منحنية وفتحات تهوية وشريط أسود خلفي.
//  الطريقة: نقيس رؤوس شبكة الجسم الفعلية (بعد التحريك) ونبني الملابس حولها بهامش،
//  ثم ننسخ أوزان الهيكل العظمي من أقرب رأس في الجسم فتتحرك الملابس معه دون اختراق.
//  (الصور المرجعية استُخدمت للشكل والتفاصيل فقط؛ لا توجد صور أو خامات منسوخة.)
// ============================================================================
import * as THREE from 'three';

const DEG = Math.PI / 180;
const strip = (n) => n.replace(/^Bip0\d_?/, '');
const ARM = (side) => new RegExp(`^${side}_(UpperArm|Forearm)$`);
const ANY_ARM = /^(L|R)_(UpperArm|Forearm|Hand|Finger\d*)$/;
const LEG = (side) => new RegExp(`^${side}_(Thigh|Calf)$`);
const TORSO = /^(Pelvis|Spine\d?|Neck|(L|R)_Clavicle|(L|R)_Thigh|)$/;
const isHeadBone = (b) => !ANY_ARM.test(b) && !/^(Pelvis|Spine\d?|(L|R)_(Clavicle|Thigh|Calf|Foot|Toe0)|)$/.test(b);

const COLORS = {
  coat: new THREE.Color(0xf3f5f7),
  lapel: new THREE.Color(0xe9edf1),
  seam: new THREE.Color(0xc9d1da),
  pocket: new THREE.Color(0xeef1f4),
  pocketEdge: new THREE.Color(0xb9c3ce),
  button: new THREE.Color(0xd9dfe6),
  shirt: new THREE.Color(0x1e2633),
  cuff: new THREE.Color(0xe4e9ee),
};

// ---------------------------------------------------------------- عيّنات الجسم
/** يعيد رؤوس الشبكة في وضعها الحالي (فضاء العالم) مع العظمة الغالبة وأوزانها */
export function sampleBody(ch) {
  ch.updateMatrixWorld(true);
  const samples = [];
  let ref = null, refCount = -1;
  ch.model.traverse((o) => {
    if (!o.isSkinnedMesh || o.userData.isGarment) return; // الملابس المضافة ليست جزءًا من الجسم
    const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!si || !sw) return;
    if (pos.count > refCount) { ref = o; refCount = pos.count; }
    const v = new THREE.Vector3();
    const local = [];
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld);
      const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      let best = 0;
      for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
      const smp = { p: v.clone(), bone: strip(o.skeleton.bones[idx[best]].name), bones: idx.map((j) => o.skeleton.bones[j]), w };
      samples.push(smp);
      local.push(smp);
    }
    // تكثيف: مراكز المثلثات ومنتصفات أضلاعها (الشبكات منخفضة التفاصيل لها أوجه كبيرة
    // قد تعبر خارج الملابس بين رؤوسها) — للقياس فقط، لا لنسخ الأوزان
    const ix = g.index ? g.index.array : null;
    const triCount = ix ? ix.length / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      const a = local[ix ? ix[t * 3] : t * 3], b = local[ix ? ix[t * 3 + 1] : t * 3 + 1], c = local[ix ? ix[t * 3 + 2] : t * 3 + 2];
      if (!a || !b || !c) continue;
      const mk = (p) => ({ p, bone: a.bone, bones: a.bones, w: a.w, dense: true });
      samples.push(mk(a.p.clone().add(b.p).add(c.p).multiplyScalar(1 / 3)));
      samples.push(mk(a.p.clone().add(b.p).multiplyScalar(0.5)));
      samples.push(mk(b.p.clone().add(c.p).multiplyScalar(0.5)));
      samples.push(mk(c.p.clone().add(a.p).multiplyScalar(0.5)));
    }
  });
  return { samples, ref };
}

/** ينسخ أوزان أقرب رأس جسم لكل رأس من رؤوس الملابس ويحوّلها إلى فضاء الربط */
function skinToBody(geo, candidates, ref, { rigidBone = null, rigidBelowY = null } = {}) {
  const pos = geo.attributes.position, n = pos.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const bones = ref.skeleton.bones;
  const indexOf = new Map(bones.map((b, i) => [b, i]));
  const B = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, ref.skeleton.boneInverses[i]));
  const bindInv = ref.bindMatrix.clone().invert();
  const M = new THREE.Matrix4(), p = new THREE.Vector3();
  candidates = candidates.filter((c) => !c.dense); // الأوزان تُنسخ من رؤوس حقيقية فقط
  const pts = candidates.map((c) => c.p);
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    let bs, ws;
    if (rigidBone && rigidBelowY !== null && p.y < rigidBelowY) { bs = [rigidBone]; ws = [1]; }
    else {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < pts.length; k++) {
        const d = pts[k].distanceToSquared(p);
        if (d < bd) { bd = d; bi = k; }
      }
      bs = candidates[bi].bones; ws = candidates[bi].w;
    }
    const e = M.elements;
    e.fill(0);
    let sum = 0;
    for (let k = 0; k < bs.length; k++) {
      const w = ws[k];
      if (!(w > 0)) continue;
      const j = indexOf.get(bs[k]) ?? 0;
      const be = B[j].elements;
      for (let t = 0; t < 16; t++) e[t] += be[t] * w;
      skinIndex[i * 4 + k] = j;
      skinWeight[i * 4 + k] = w;
      sum += w;
    }
    if (sum > 0 && Math.abs(sum - 1) > 1e-3) { for (let t = 0; t < 16; t++) e[t] /= sum; for (let k = 0; k < 4; k++) skinWeight[i * 4 + k] /= sum; }
    p.applyMatrix4(M.clone().invert()).applyMatrix4(bindInv);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.computeVertexNormals();
  return geo;
}

function makeSkinned(geo, mat, ref) {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.bind(ref.skeleton, ref.bindMatrix);
  m.frustumCulled = false;
  m.userData.isGarment = true;
  return m;
}

// ---------------------------------------------------------------- أدوات الملاءمة
/**
 * أقصى نصف قطر للعيّنات في كل قطاع زاوي حول مركز (cx,cz).
 * القطاع k مركزه عند الزاوية (k+0.5)/n، ثم "تمديد" بأخذ أقصى الجيران حتى تغطي
 * الأوجه المستوية بين رأسين متجاورين كل العيّنات بينهما (منع الاختراق).
 */
function radialMax(samples, cx, cz, sectors) {
  const r = new Float32Array(sectors).fill(-1);
  for (const s of samples) {
    const dx = s.p.x - cx, dz = s.p.z - cz;
    let a = Math.atan2(dz, dx); if (a < 0) a += Math.PI * 2;
    const k = Math.floor(a / (Math.PI * 2) * sectors) % sectors;
    const d = Math.hypot(dx, dz);
    if (d > r[k]) r[k] = d;
  }
  const out = Float32Array.from(r);
  for (let k = 0; k < sectors; k++) {
    const a = r[(k - 1 + sectors) % sectors], b = r[(k + 1) % sectors];
    out[k] = Math.max(r[k], a, b);
  }
  return out;
}
const secAngle = (k, n) => ((k + 0.5) / n) * Math.PI * 2;

/** الغلاف المحدب لنقاط ثنائية الأبعاد (خوارزمية Andrew) */
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/**
 * نصف قطر الغلاف المحدب عند زاوية كل قطاع حول (cx,cz): مقطع ناعم يحتوي كل النقاط
 * (يتدلّى كالقماش بدل أن يلتصق بتعرّجات الجسم). minR عند غياب العيّنات.
 */
function hullRadii(pts2, cx, cz, n, minR) {
  const out = new Float32Array(n);
  const hull = convexHull(pts2);
  if (hull.length < 3) { out.fill(minR); return out; }
  let ox = cx, oz = cz;
  // إن كان المركز خارج الغلاف نستخدم مركز الغلاف
  let inside = true;
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k], b = hull[(k + 1) % hull.length];
    if ((b[0] - a[0]) * (oz - a[1]) - (b[1] - a[1]) * (ox - a[0]) < 0) { inside = false; break; }
  }
  if (!inside) { ox = hull.reduce((t, q) => t + q[0], 0) / hull.length; oz = hull.reduce((t, q) => t + q[1], 0) / hull.length; }
  for (let i = 0; i < n; i++) {
    const th = secAngle(i, n), dx = Math.cos(th), dz = Math.sin(th);
    let best = -1;
    for (let k = 0; k < hull.length; k++) {
      const a = hull[k], b = hull[(k + 1) % hull.length];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const ax = a[0] - ox, az = a[1] - oz;
      const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
    }
    // تحويل المسافة من مركز الغلاف إلى مركز المعطف (نقطة على الحافة ثم نصف قطرها من cx,cz)
    const px = ox + dx * Math.max(best, 0), pz = oz + dz * Math.max(best, 0);
    out[i] = Math.max(minR, best > 0 ? Math.hypot(px - cx, pz - cz) : minR);
  }
  return out;
}
/** يملأ القطاعات الفارغة وينعّم مع ضمان ألا يقل الناتج عن القيم المقاسة */
function fillSmooth(r, passes = 2, floor = 0) {
  const n = r.length;
  const known = [...r].map((v, i) => [v, i]).filter(([v]) => v >= 0);
  if (!known.length) { r.fill(floor); return r; }
  for (let i = 0; i < n; i++) if (r[i] < 0) {
    let L = i, R = i, dl = 0, dr = 0;
    while (r[(L - 1 + n) % n] < 0 && dl < n) { L = (L - 1 + n) % n; dl++; }
    while (r[(R + 1) % n] < 0 && dr < n) { R = (R + 1) % n; dr++; }
    const a = r[(L - 1 + n) % n], b = r[(R + 1) % n];
    const t = (dl + 1) / (dl + dr + 2);
    r[i] = (a >= 0 ? a : b) * (1 - t) + (b >= 0 ? b : a) * t;
  }
  const raw = Float32Array.from(r);
  for (let p = 0; p < passes; p++) {
    const c = Float32Array.from(r);
    for (let i = 0; i < n; i++) r[i] = Math.max(raw[i], (c[(i - 1 + n) % n] + 2 * c[i] + c[(i + 1) % n]) / 4, c[(i - 1 + n) % n] * 0.92, c[(i + 1) % n] * 0.92);
  }
  for (let i = 0; i < n; i++) r[i] = Math.max(r[i], floor);
  return r;
}
const lerpAngle = (arr, a) => {
  const n = arr.length;
  let x = (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * n - 0.5;
  if (x < 0) x += n;
  const i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, t = x - Math.floor(x);
  return arr[i0] * (1 - t) + arr[i1] * t;
};

/** شبكة سطح بمصفوفة نقاط [صفوف][أعمدة] وألوان رؤوس */
function gridGeometry(rows, colorFn = null, closeU = false) {
  const R = rows.length, C = rows[0].length;
  const pos = new Float32Array(R * C * 3), col = new Float32Array(R * C * 3);
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
    const k = (i * C + j) * 3, p = rows[i][j];
    pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
    const c = colorFn ? colorFn(i, j, p) : COLORS.coat;
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = [];
  const Cq = closeU ? C : C - 1;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < Cq; j++) {
    const j1 = (j + 1) % C;
    const a = i * C + j, b = i * C + j1, c = (i + 1) * C + j, d = (i + 1) * C + j1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function mergeColored(geos) {
  let n = 0, ni = 0;
  for (const g of geos) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) idx[oi + k] = gi[k] + o;
    o += g.attributes.position.count; oi += gi.length;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

// ---------------------------------------------------------------- المعطف
/**
 * يبني معطفًا مُفصّلًا (مع البنطال الداكن) لشخصية في وضعها الحالي.
 * يجب أن تكون الشخصية في فضاء التعريف (بلا أب وبلا تحويل).
 */
export function buildLabCoat(ch, S) {
  const s = ch.scaleRef;
  const W = (n) => ch.worldOf(n);
  const lS = W('L_UpperArm'), rS = W('R_UpperArm'), pelvis = W('Pelvis'), lK = W('L_Calf'), rK = W('R_Calf');
  const shoulderY = (lS.y + rS.y) / 2;
  const kneeY = (lK.y + rK.y) / 2;
  const hemY = kneeY - 0.035 * s;                     // معطف طويل حتى أسفل الركبة
  const collarY = shoulderY + 0.06 * s;
  const waistY = pelvis.y + 0.1 * s;
  const margin = 0.014 * s + 0.004;
  const torso = S.samples.filter((x) => TORSO.test(x.bone) || /^(L|R)_Calf$/.test(x.bone));
  const chestBand = torso.filter((x) => Math.abs(x.p.y - (shoulderY - 0.12 * s)) < 0.06 * s);
  const cx = (lS.x + rS.x) / 2;
  let zmin = Infinity, zmax = -Infinity;
  for (const x of chestBand) { zmin = Math.min(zmin, x.p.z); zmax = Math.max(zmax, x.p.z); }
  const cz = isFinite(zmin) ? (zmin + zmax) / 2 : pelvis.z;
  const SEC = 44;
  const FRONT = 90 * DEG;

  // الحلقات من الحافة السفلية إلى الكتفين
  const levels = [];
  const NL = 24;
  for (let i = 0; i <= NL; i++) levels.push(hemY + (shoulderY - hemY) * (i / NL));
  const band = (shoulderY - hemY) / NL * 0.9;
  const rings = levels.map((y) => {
    const near = torso.filter((x) => Math.abs(x.p.y - y) < band).map((x) => [x.p.x, x.p.z]);
    const r = hullRadii(near, cx, cz, SEC, 0.06 * s);
    return Array.from(r, (v) => v + margin);
  });
  // التدلّي: من الخصر إلى الأسفل لا يضيق المعطف أبدًا، ثم اتساع A خفيف
  let wi = 0; while (wi < levels.length - 1 && levels[wi + 1] < waistY) wi++;
  for (let i = wi - 1; i >= 0; i--) for (let k = 0; k < SEC; k++) rings[i][k] = Math.max(rings[i][k], rings[i + 1][k]);
  for (let i = 0; i <= wi; i++) {
    const fl = 1 + 0.07 * ((waistY - levels[i]) / Math.max(1e-6, waistY - hemY));
    for (let k = 0; k < SEC; k++) rings[i][k] *= fl;
  }
  // تنعيم رأسي مع الحفاظ على الحد الأدنى المقاس
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < rings.length - 1; i++) for (let k = 0; k < SEC; k++) {
      const v = (rings[i - 1][k] + 2 * rings[i][k] + rings[i + 1][k]) / 4;
      rings[i][k] = Math.max(rings[i][k], v);
    }
  }
  // الكتفان حتى فتحة الرقبة
  // فتحة الرقبة: من رؤوس الرقبة فقط (لا الترقوة) حتى تلتف الياقة حول العنق لا حول الكتفين
  const neckBone = W('Neck');
  const neckS = S.samples.filter((x) => (x.bone === 'Neck' || x.bone === 'Spine2' || x.bone === 'Head') && Math.abs(x.p.y - collarY) < 0.025 * s
    && Math.hypot(x.p.x - neckBone.x, x.p.z - neckBone.z) < 0.085 * s);
  const neckR = Array.from(fillSmooth(radialMax(neckS, cx, cz, SEC), 2, 0.05 * s), (v) => v + 0.01 * s);
  const capN = 5;
  const shoulderRing = rings[rings.length - 1];
  for (let i = 1; i <= capN; i++) {
    const t = i / capN;
    const y = shoulderY + (collarY - shoulderY) * t;
    const near = torso.filter((x) => Math.abs(x.p.y - y) < 0.02 * s && !ANY_ARM.test(x.bone));
    const meas = near.length >= 3 ? hullRadii(near.map((x) => [x.p.x, x.p.z]), cx, cz, SEC, 0) : new Float32Array(SEC).fill(-1);
    const e = 1 - Math.pow(1 - t, 2);
    levels.push(y);
    rings.push(shoulderRing.map((r0, k) => Math.max(r0 + (neckR[k] - r0) * e, meas[k] > 0 ? meas[k] + margin * 0.6 : 0)));
  }
  const rAt = (theta, y) => {
    let i = 0;
    while (i < levels.length - 2 && levels[i + 1] < y) i++;
    const t = THREE.MathUtils.clamp((y - levels[i]) / (levels[i + 1] - levels[i]), 0, 1);
    return lerpAngle(rings[i], theta) * (1 - t) + lerpAngle(rings[i + 1], theta) * t;
  };
  const surf = (theta, y, off = 0) => {
    const r = rAt(theta, y) + off;
    return new THREE.Vector3(cx + Math.cos(theta) * r, y, cz + Math.sin(theta) * r);
  };
  const chestY = shoulderY - 0.12 * s;

  // جسم المعطف مع تظليل طيّات خفيف بألوان الرؤوس
  const bodyRows = levels.map((y, i) => {
    const row = [];
    for (let k = 0; k < SEC; k++) {
      const th = secAngle(k, SEC);
      const r = rings[i][k];
      row.push(new THREE.Vector3(cx + Math.cos(th) * r, y, cz + Math.sin(th) * r));
    }
    return row;
  });
  const bodyGeo = gridGeometry(bodyRows, (i, k, p) => {
    const th = secAngle(k, SEC);
    const low = THREE.MathUtils.clamp((chestY - p.y) / (0.35 * s), 0, 1);
    let f = 1 - 0.045 * low * (0.5 + 0.5 * Math.cos(th * 7 + p.y * 9));
    if (p.y < hemY + 0.015 * s) f *= 0.93;
    return COLORS.coat.clone().multiplyScalar(f);
  }, true);

  const parts = [bodyGeo];
  const patch = (th0, th1, y0, y1, off, color, nu = 4, nv = 3, thFn = null) => {
    const rows = [];
    for (let i = 0; i <= nv; i++) {
      const y = y0 + (y1 - y0) * (i / nv);
      const row = [];
      for (let j = 0; j <= nu; j++) {
        const u = j / nu;
        const th = thFn ? thFn(u, y) : th0 + (th1 - th0) * u;
        row.push(surf(th, y, off));
      }
      rows.push(row);
    }
    parts.push(gridGeometry(rows, () => color));
  };
  const ang = (meters, y, th = FRONT) => meters / Math.max(0.05, rAt(th, y));

  // فتحة V وقميص داكن وطيّتا الصدر
  const vBottom = shoulderY - 0.17 * s;
  const halfTop = 0.058 * s;
  const halfAt = (y) => ang(halfTop * THREE.MathUtils.clamp((y - vBottom) / (collarY - vBottom), 0, 1), y);
  patch(0, 0, vBottom, collarY - 0.004 * s, 0.008, COLORS.shirt, 4, 5, (u, y) => FRONT + (u * 2 - 1) * halfAt(y));
  for (const sg of [-1, 1]) {
    const lw = (y) => ang((0.026 + 0.02 * THREE.MathUtils.clamp((y - vBottom) / (collarY - vBottom), 0, 1)) * s, y);
    patch(0, 0, vBottom, collarY - 0.006 * s, 0.009, COLORS.lapel, 2, 6, (u, y) => FRONT + sg * (halfAt(y) + u * lw(y)));
    patch(0, 0, vBottom, collarY - 0.006 * s, 0.0095, COLORS.seam, 1, 6, (u, y) => FRONT + sg * (halfAt(y) + lw(y) + u * ang(0.003, y)));
  }
  // خط الإغلاق الأمامي والأزرار
  patch(0, 0, hemY + 0.005, vBottom, 0.006, COLORS.seam, 1, 8, (u, y) => FRONT + (u - 0.5) * ang(0.005, y));
  const btnGeo = [];
  for (let b = 0; b < 4; b++) {
    const y = vBottom - 0.02 * s - b * 0.115 * s;
    if (y < hemY + 0.12 * s) break;
    const th = FRONT - ang(0.012 * s, y);
    const p = surf(th, y, 0.008);
    const g = new THREE.CylinderGeometry(0.0085 * s, 0.0085 * s, 0.004, 10).toNonIndexed();
    const n = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    g.translate(p.x, p.y, p.z);
    const cnt = g.attributes.position.count;
    const col = new Float32Array(cnt * 3);
    for (let k = 0; k < cnt; k++) col.set([COLORS.button.r, COLORS.button.g, COLORS.button.b], k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const ix = []; for (let k = 0; k < cnt; k++) ix.push(k);
    g.setIndex(ix);
    btnGeo.push(g);
  }
  parts.push(...btnGeo);
  // جيب الصدر (يسار الشخصية = +X)
  {
    const yc = chestY + 0.005 * s, h = 0.085 * s, w = 0.08 * s;
    const thc = FRONT - ang(0.09 * s, yc);
    const dw = ang(w / 2, yc, thc);
    patch(thc - dw, thc + dw, yc - h / 2, yc + h / 2, 0.006, COLORS.pocket, 3, 2);
    patch(thc - dw, thc + dw, yc + h / 2 - 0.006 * s, yc + h / 2, 0.0075, COLORS.pocketEdge, 3, 1);
    for (const e of [-1, 1]) patch(thc + e * dw - 0.0015, thc + e * dw + 0.0015, yc - h / 2, yc + h / 2, 0.007, COLORS.seam, 1, 2);
  }
  // جيبان أماميان بغطاء
  for (const sg of [-1, 1]) {
    const yc = pelvis.y - 0.07 * s, h = 0.11 * s, w = 0.12 * s;
    const thc = FRONT + sg * ang(0.115 * s, yc);
    const dw = ang(w / 2, yc, thc);
    patch(thc - dw, thc + dw, yc - h / 2, yc + h / 2, 0.006, COLORS.pocket, 4, 2);
    patch(thc - dw * 1.04, thc + dw * 1.04, yc + h / 2 - 0.024 * s, yc + h / 2 + 0.002 * s, 0.0085, COLORS.lapel, 4, 1);
    patch(thc - dw * 1.04, thc + dw * 1.04, yc + h / 2 - 0.026 * s, yc + h / 2 - 0.021 * s, 0.009, COLORS.pocketEdge, 4, 1);
  }
  // درز خلفي وفتحة سفلية
  patch(0, 0, hemY + 0.13 * s, collarY - 0.02 * s, 0.0055, COLORS.seam, 1, 8, (u, y) => 270 * DEG + (u - 0.5) * ang(0.004, y, 270 * DEG));
  patch(0, 0, hemY, hemY + 0.13 * s, 0.006, COLORS.pocketEdge, 1, 3, (u, y) => 270 * DEG + (u - 0.5) * ang(0.006, y, 270 * DEG));
  // ياقة مطوية تلتف حول العنق من الخلف وتستلقي على الكتفين، مفتوحة من الأمام
  {
    const rows = [];
    const gap = halfAt(collarY) * 1.05;
    const N = 32;
    const spec = [
      (th) => { const r = lerpAngle(neckR, th) + 0.005; return new THREE.Vector3(cx + Math.cos(th) * r, collarY + 0.016 * s, cz + Math.sin(th) * r); },
      (th) => surf(th, collarY - 0.002 * s, 0.007),
      (th) => surf(th, collarY - 0.02 * s, 0.009),
      (th) => surf(th, collarY - 0.026 * s, 0.009),
    ];
    for (let i = 0; i < spec.length; i++) {
      const row = [];
      for (let j = 0; j <= N; j++) row.push(spec[i](FRONT + gap + (j / N) * (Math.PI * 2 - 2 * gap)));
      rows.push(row);
    }
    parts.push(gridGeometry(rows, (i) => (i === 3 ? COLORS.seam : i === 0 ? COLORS.lapel : COLORS.coat)));
  }
  const coatGeo = mergeColored(parts);

  // الأكمام الطويلة بأساور
  const sleeveGeos = [];
  const sleevePaths = {};
  for (const side of ['L', 'R']) {
    const sh = W(`${side}_UpperArm`), el = W(`${side}_Forearm`), wr = W(`${side}_Hand`);
    const armS = S.samples.filter((x) => ARM(side).test(x.bone));
    const d1 = el.clone().sub(sh).normalize(), d2 = wr.clone().sub(el).normalize();
    const path = [sh.clone().addScaledVector(d1, -0.015 * s), sh, el, wr.clone().addScaledVector(d2, 0.02 * s)];
    const lens = [0]; for (let k = 1; k < path.length; k++) lens.push(lens[k - 1] + path[k].distanceTo(path[k - 1]));
    const total = lens[lens.length - 1];
    const NR = 16, NS = 16;
    const rows = [], frames = [];
    let prevU = null;
    for (let i = 0; i <= NR; i++) {
      const L = (i / NR) * total;
      let k = 1; while (k < lens.length - 1 && lens[k] < L) k++;
      const t = (L - lens[k - 1]) / (lens[k] - lens[k - 1]);
      const c = path[k - 1].clone().lerp(path[k], t);
      const d = path[k].clone().sub(path[k - 1]).normalize();
      let u = prevU ? prevU.clone().addScaledVector(d, -prevU.dot(d)).normalize() : new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 0, 1)).normalize();
      if (u.lengthSq() < 0.5) u = new THREE.Vector3(1, 0, 0);
      prevU = u;
      const v = new THREE.Vector3().crossVectors(d, u).normalize();
      const sec2 = [];
      for (const x of armS) {
        const q = x.p.clone().sub(c);
        if (Math.abs(q.dot(d)) > 0.032 * s) continue;
        sec2.push([q.dot(u), q.dot(v)]);
      }
      const rr = hullRadii(sec2, 0, 0, NS, 0.035 * s);
      frames.push({ c, u, v, rr: Array.from(rr, (x) => x + 0.009 * s + 0.003) });
    }
    // تنعيم طولي يحافظ على الحد الأدنى + كُمّ مستقيم ينسدل (لا يضيق كثيرًا بين المرفق والرسغ)
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < frames.length - 1; i++) for (let j = 0; j < NS; j++) {
      const m = (frames[i - 1].rr[j] + 2 * frames[i].rr[j] + frames[i + 1].rr[j]) / 4;
      frames[i].rr[j] = Math.max(frames[i].rr[j], m);
    }
    frames.forEach((fr, i) => {
      const cuff = i >= NR - 1 ? 1.06 : 1;
      const row = [];
      for (let j = 0; j < NS; j++) {
        const a = secAngle(j, NS);
        const r = fr.rr[j] * cuff;
        row.push(fr.c.clone().addScaledVector(fr.u, Math.cos(a) * r).addScaledVector(fr.v, Math.sin(a) * r));
      }
      rows.push(row);
    });
    const g = gridGeometry(rows, (i) => (i >= NR - 1 ? COLORS.cuff : COLORS.coat), true);
    sleeveGeos.push({ g, cand: armS.length ? armS : S.samples });
    sleevePaths[side] = { path, lens, total };
  }

  // بنطال داكن من تحت المعطف حتى الكاحل
  const pantsGeos = [];
  const ankleYs = [];
  for (const side of ['L', 'R']) {
    const hip = W(`${side}_Thigh`), knee = W(`${side}_Calf`), ankle = W(`${side}_Foot`);
    const legS = S.samples.filter((x) => LEG(side).test(x.bone));
    const top = hemY + 0.1 * s, bot = ankle.y - 0.028 * s; // البنطال ينسدل على الحذاء
    ankleYs.push(ankle.y);
    const NR = 12, NS = 14;
    const rows = [];
    for (let i = 0; i <= NR; i++) {
      const y = top + (bot - top) * (i / NR);
      const segA = y > knee.y ? hip : knee, segB = y > knee.y ? knee : ankle;
      const t = THREE.MathUtils.clamp((segA.y - y) / (segA.y - segB.y), 0, 1);
      const c = segA.clone().lerp(segB, t);
      const near = legS.filter((x) => Math.abs(x.p.y - y) < 0.03 * s).map((x) => [x.p.x, x.p.z]);
      const rr = hullRadii(near, c.x, c.z, NS, 0.04 * s);
      const flare = i === NR ? 1.12 : i === NR - 1 ? 1.05 : 1;
      const row = [];
      for (let j = 0; j < NS; j++) {
        const a = secAngle(j, NS);
        const r = (rr[j] + 0.008 * s + 0.002) * flare;
        row.push(new THREE.Vector3(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r));
      }
      rows.push(row);
    }
    pantsGeos.push({ g: gridGeometry(rows, () => COLORS.shirt, true), cand: legS.length ? legS : S.samples });
  }

  // الربط بالهيكل العظمي
  const ref = S.ref;
  const coatMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x000000 });
  const pantsMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x000000 });
  const torsoCand = torso.filter((x) => !/^(L|R)_Calf$/.test(x.bone));
  const group = new THREE.Group();
  group.name = 'LabCoat';
  const coat = makeSkinned(skinToBody(coatGeo, torsoCand, ref, { rigidBone: ch.bone('Pelvis'), rigidBelowY: pelvis.y - 0.02 * s }), coatMat, ref);
  group.add(coat);
  for (const { g, cand } of sleeveGeos) group.add(makeSkinned(skinToBody(g, cand, ref), coatMat, ref));
  for (const { g, cand } of pantsGeos) group.add(makeSkinned(skinToBody(g, cand, ref), pantsMat, ref));
  group.userData.fit = { levels, rings, cx, cz, hemY, collarY, SEC };
  const ankleY = Math.max(...ankleYs);
  const alongSleeve = (side, p) => {
    const sp = sleevePaths[side];
    if (!sp) return Infinity;
    let best = Infinity, bestAlong = 0;
    for (let k = 1; k < sp.path.length; k++) {
      const a = sp.path[k - 1], b = sp.path[k];
      const ab = b.clone().sub(a), L = ab.length();
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / (L * L), 0, 1);
      const d = a.clone().addScaledVector(ab, t).distanceTo(p);
      if (d < best) { best = d; bestAlong = sp.lens[k - 1] + t * L; }
    }
    return sp.total - bestAlong; // المسافة المتبقية حتى طرف الكم
  };
  tuckBody(ch, (p, bone) => {
    const arm = /^(L|R)_(UpperArm|Forearm)$/.exec(bone);
    if (arm) return alongSleeve(arm[1], p) > 0.03 * s ? 0.009 * s : 0;
    if (/^(Pelvis|Spine\d?|(L|R)_Clavicle|)$/.test(bone)) return p.y > hemY + 0.02 * s && p.y < collarY + 0.03 * s ? 0.011 * s : 0;
    if (bone === 'Neck') return p.y < collarY + 0.016 * s ? 0.007 * s : 0;
    if (/^(L|R)_(Thigh|Calf)$/.test(bone)) return 0.009 * s; // حتى حافة البنطال الأصلي فوق الحذاء
    return 0;
  });
  return group;
}

/**
 * "إدخال" الجسم تحت الملابس: يسحب رؤوس الملابس الأصلية المغطاة إلى الداخل على عكس
 * الناظم بمقدار amount(p, bone) متر، فلا تظهر من خلال المعطف أثناء الحركة.
 * يعمل على نسخة هندسة خاصة بالشخصية (النموذج الأصلي في المكتبة لا يتغير).
 */
function tuckBody(ch, amount) {
  ch.updateMatrixWorld(true);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), M = new THREE.Matrix4();
  ch.model.traverse((o) => {
    if (!o.isSkinnedMesh || o.userData.isGarment) return;
    if (!o.userData.ownGeometry) {
      o.geometry = o.geometry.clone();
      o.geometry.userData.shared = false;
      o.userData.ownGeometry = true;
    }
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!nor || !si) return;
    const bones = o.skeleton.bones, inv = o.skeleton.boneInverses;
    const B = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
    const bindInv = o.bindMatrix.clone().invert();
    let changed = 0;
    for (let i = 0; i < pos.count; i++) {
      const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      let best = 0; for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
      o.getVertexPosition(i, p); p.applyMatrix4(o.matrixWorld);
      const amt = amount(p, strip(bones[idx[best]].name));
      if (!(amt > 0)) continue;
      const e = M.elements; e.fill(0);
      for (let k = 0; k < 4; k++) { if (!(w[k] > 0)) continue; const be = B[idx[k]].elements; for (let t = 0; t < 16; t++) e[t] += be[t] * w[k]; }
      const skin = M.clone().multiply(o.bindMatrix);
      n.fromBufferAttribute(nor, i).transformDirection(skin);
      p.addScaledVector(n, -amt);
      p.applyMatrix4(M.clone().invert()).applyMatrix4(bindInv);
      pos.setXYZ(i, p.x, p.y, p.z);
      changed++;
    }
    if (changed) { pos.needsUpdate = true; g.computeBoundingSphere(); }
  });
}

// ---------------------------------------------------------------- النظارات الواقية
/**
 * نظارة واقية مغلقة: عدسة منحنية شفافة حول الوجه بجوانب مغلقة، حواف وفتحات تهوية،
 * وشريط أسود خلف الرأس. profile(θ) نصف القطر الداخلي حول المركز (θ=90° للأمام).
 */
export function buildGoggles({ profile, cx = 0, cz = 0, eyeY = 0, s = 1 }) {
  const g = new THREE.Group();
  g.name = 'SafetyGoggles';
  const SPAN = 80 * DEG, FRONT = 90 * DEG;
  const top = eyeY + 0.032 * s, bot = eyeY - 0.03 * s;
  const lensR = (th, v) => profile(th) + 0.004 * s * Math.sin(Math.PI * v);
  const notch = (th) => 0.021 * s * Math.exp(-Math.pow((th - FRONT) / (13 * DEG), 2));
  const NU = 44, NV = 6;
  const P = (th, y, r) => new THREE.Vector3(cx + Math.cos(th) * r, y, cz + Math.sin(th) * r);
  // العدسة
  const pos = [], idx = [];
  for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++) {
    const th = FRONT - SPAN + (2 * SPAN) * (j / NU);
    const v = i / NV;
    const y = (bot + notch(th)) * (1 - v) + top * v;
    const p = P(th, y, lensR(th, v));
    pos.push(p.x, p.y, p.z);
  }
  for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) {
    const a = i * (NU + 1) + j, b = a + 1, c = a + NU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setIndex(idx);
  lg.computeVertexNormals();
  const lensMat = new THREE.MeshPhongMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.24, shininess: 180, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false, emissive: 0x000000 });
  const lens = new THREE.Mesh(lg, lensMat);
  lens.renderOrder = 8;
  g.add(lens);
  // الإطار البلاستيكي الشفاف المصنفر (الحافة العلوية والسفلية والجانبان)
  const frameMat = new THREE.MeshPhongMaterial({ color: 0xf2f7fb, transparent: true, opacity: 0.6, shininess: 90, emissive: 0x000000, depthWrite: false });
  const edge = (yf, rOff) => {
    const pts = [];
    for (let j = 0; j <= 30; j++) {
      const th = FRONT - SPAN + (2 * SPAN) * (j / 30);
      pts.push(P(th, yf(th), lensR(th, yf === undefined ? 0 : 0) + rOff));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  const rimR = 0.0048 * s;
  const topRim = new THREE.Mesh(new THREE.TubeGeometry(edge(() => top, 0.001), 60, rimR * 1.15, 6, false), frameMat);
  const botRim = new THREE.Mesh(new THREE.TubeGeometry(edge((th) => bot + notch(th), 0.001), 60, rimR, 6, false), frameMat);
  topRim.renderOrder = botRim.renderOrder = 9;
  g.add(topRim, botRim);
  for (const sg of [-1, 1]) {
    const th = FRONT + sg * SPAN;
    const side = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(P(th, bot, lensR(th, 0)), P(th, top, lensR(th, 1))), 4, rimR * 1.3, 6, false), frameMat);
    side.renderOrder = 9;
    g.add(side);
  }
  // فتحات التهوية الجانبية
  const ventMat = new THREE.MeshLambertMaterial({ color: 0x59636e, emissive: 0x000000 });
  for (const sg of [-1, 1]) for (const yy of [top - 0.011 * s, bot + 0.011 * s]) {
    const th = FRONT + sg * (SPAN - 14 * DEG);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.018 * s, 0.006 * s, 0.003), ventMat);
    vent.position.copy(P(th, yy, lensR(th, 0.5) + 0.0015));
    vent.lookAt(P(th, yy, lensR(th, 0.5) + 1));
    g.add(vent);
  }
  // الشريط الأسود خلف الرأس مع مشبكين
  const strapMat = new THREE.MeshLambertMaterial({ color: 0x141414, side: THREE.DoubleSide, emissive: 0x000000 });
  {
    const spos = [], sidx = [];
    const N = 40, h = 0.012 * s, yc = eyeY + 0.003 * s;
    const a0 = FRONT + SPAN - 4 * DEG, a1 = FRONT - SPAN + 4 * DEG + Math.PI * 2;
    for (let j = 0; j <= N; j++) {
      const th = a0 + (a1 - a0) * (j / N);
      const r = profile(th) + 0.0035;
      for (const dy of [-h, h]) { const p = P(th, yc + dy, r); spos.push(p.x, p.y, p.z); }
    }
    for (let j = 0; j < N; j++) { const a = j * 2; sidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3));
    sg.setIndex(sidx);
    sg.computeVertexNormals();
    g.add(new THREE.Mesh(sg, strapMat));
    for (const sgn of [-1, 1]) {
      const th = FRONT + sgn * (SPAN + 1 * DEG);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.014 * s, 0.03 * s, 0.006), strapMat);
      b.position.copy(P(th, yc, lensR(th, 0.5) + 0.002));
      b.lookAt(P(th, yc, 10));
      g.add(b);
    }
  }
  g.userData.fit = { profile, cx, cz, top, bot, eyeY, notch, SPAN, FRONT };
  return g;
}

/** نظارة مُلاءمة لرأس الشخصية (تُقاس من رؤوس الوجه والشعر عند مستوى العينين) */
export function fitGoggles(ch, S) {
  const s = ch.scaleRef;
  const re = ch.worldOf('REye'), le = ch.worldOf('LEye');
  const eyeY = re && le ? (re.y + le.y) / 2 : ch.worldOf('Head').y + 0.08 * s;
  const head = S.samples.filter((x) => isHeadBone(x.bone) && Math.abs(x.p.y - eyeY) < 0.05 * s);
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const x of head) { minx = Math.min(minx, x.p.x); maxx = Math.max(maxx, x.p.x); minz = Math.min(minz, x.p.z); maxz = Math.max(maxz, x.p.z); }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const SEC = 72;
  const raw = fillSmooth(radialMax(head, cx, cz, SEC), 3, 0.06 * s);
  const FRONT = 90 * DEG;
  // هامش أكبر أمام الوجه (العدسة تبتعد عن الجلد) وهامش صغير للشريط فوق الشعر
  const prof = Array.from(raw, (r, k) => {
    const th = secAngle(k, SEC);
    const dFront = Math.abs(Math.atan2(Math.sin(th - FRONT), Math.cos(th - FRONT)));
    const m = dFront < 82 * DEG ? 0.011 * s + 0.004 : 0.004;
    return r + m;
  });
  // تنعيم يحافظ على الحد الأدنى (منحنى عدسة سلس بلا تعرّجات)
  for (let p = 0; p < 4; p++) {
    const c = prof.slice();
    for (let k = 0; k < SEC; k++) prof[k] = Math.max(c[k], (c[(k + SEC - 1) % SEC] + c[k] + c[(k + 1) % SEC]) / 3);
  }
  const profile = (th) => lerpAngle(prof, th);
  return buildGoggles({ profile, cx, cz, eyeY, s });
}

/** نظارة مستقلة (للالتقاط) بمقاس رأس قياسي */
export function buildPropGoggles(s = 0.9) {
  const a = 0.078 * s, b = 0.1 * s;
  const profile = (th) => 1 / Math.sqrt(Math.pow(Math.cos(th) / a, 2) + Math.pow(Math.sin(th) / b, 2)) + 0.012 * s;
  return buildGoggles({ profile, cx: 0, cz: 0, eyeY: 0, s });
}

// ---------------------------------------------------------------- فحص الاختراق
/**
 * يعيد عدد رؤوس الجسم التي تخترق النظارة/المعطف في الوضعية الحالية.
 * النظارة: رؤوس الرأس داخل نطاق ارتفاع العدسة يجب أن تكون داخل منحنى العدسة.
 * المعطف: رؤوس الجذع داخل نطاق المعطف يجب أن تكون داخل حلقات المعطف المحرّكة.
 */
export function measurePenetration(ch) {
  const S = sampleBody(ch);
  const out = { goggles: null, coat: null };
  const gog = ch.gear?.goggles;
  if (gog && gog.visible) {
    const f = gog.userData.fit;
    let bad = 0, n = 0;
    const local = new THREE.Vector3();
    gog.updateMatrixWorld(true);
    const inv = gog.matrixWorld.clone().invert();
    for (const x of S.samples) {
      if (!isHeadBone(x.bone)) continue;
      local.copy(x.p).applyMatrix4(inv);
      // داخل نطاق العدسة رأسيًا وضمن زاويتها
      const th = Math.atan2(local.z - f.cz, local.x - f.cx);
      const r = Math.hypot(local.x - f.cx, local.z - f.cz);
      const thN = ((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const inFront = Math.abs(Math.atan2(Math.sin(thN - f.FRONT), Math.cos(thN - f.FRONT))) <= f.SPAN;
      const yb = f.bot + (inFront ? f.notch(thN) : 0);
      if (local.y < yb || local.y > f.top) continue;
      n++;
      if (r > f.profile(thN) - 0.0005) bad++;
    }
    out.goggles = { checked: n, penetrating: bad };
  }
  const coatG = ch.gear?.coat;
  if (coatG && coatG.visible) {
    const coat = coatG.children[0];
    const fit = coatG.userData.fit;
    const SEC = fit.SEC, L = fit.levels.length;
    // حلقات المعطف الحالية بعد التحريك (أول L×SEC رأسًا هي جسم المعطف)
    const v = new THREE.Vector3();
    const cur = [];
    for (let i = 0; i < L; i++) { const row = []; for (let k = 0; k < SEC; k++) { coat.getVertexPosition(i * SEC + k, v); row.push(v.clone().applyMatrix4(coat.matrixWorld)); } cur.push(row); }
    // لكل حلقة: متوسط الارتفاع والمركز
    const meta = cur.map((ring) => {
      let y = 0, x = 0, z = 0;
      for (const p of ring) { y += p.y; x += p.x; z += p.z; }
      return { y: y / SEC, x: x / SEC, z: z / SEC };
    });
    /** نصف قطر مضلع الحلقة في اتجاه (dx,dz) من نقطة (ox,oz): تقاطع شعاع مع الأضلاع */
    const polyR = (ring, ox, oz, dx, dz) => {
      let best = -1;
      for (let k = 0; k < SEC; k++) {
        const a = ring[k], b = ring[(k + 1) % SEC];
        const ex = b.x - a.x, ez = b.z - a.z;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-12) continue;
        const ax = a.x - ox, az = a.z - oz;
        const t = (ax * ez - az * ex) / den;
        const u = (ax * dz - az * dx) / den;
        if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
      }
      return best;
    };
    let bad = 0, n = 0, worst = 0;
    for (const x of S.samples) {
      if (!/^(Pelvis|Spine\d?|(L|R)_Clavicle)$/.test(x.bone)) continue;
      let li = -1;
      for (let i = 0; i < L - 1; i++) if (x.p.y >= meta[i].y && x.p.y <= meta[i + 1].y) { li = i; break; }
      if (li < 0) continue;
      const t = (x.p.y - meta[li].y) / Math.max(1e-6, meta[li + 1].y - meta[li].y);
      const ox = meta[li].x * (1 - t) + meta[li + 1].x * t, oz = meta[li].z * (1 - t) + meta[li + 1].z * t;
      const dx = x.p.x - ox, dz = x.p.z - oz;
      const rb = Math.hypot(dx, dz);
      if (rb < 1e-6) continue;
      const r0 = polyR(cur[li], ox, oz, dx / rb, dz / rb), r1 = polyR(cur[li + 1], ox, oz, dx / rb, dz / rb);
      if (r0 < 0 || r1 < 0) continue;
      const rc = r0 * (1 - t) + r1 * t;
      n++;
      if (rb > rc + 0.001) { bad++; worst = Math.max(worst, rb - rc); }
    }
    out.coat = { checked: n, penetrating: bad, worstMm: Math.round(worst * 1000) };
  }
  return out;
}
