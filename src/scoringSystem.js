// ============================================================================
//  نظام الدرجات — مستقل عن الواجهات. يحسب النسب والدرجة المركبة وشروط الاجتياز.
// ============================================================================
import { CONFIG, allScoreItems } from './config.js';

export class ScoringSystem extends EventTarget {
  constructor(cfg = CONFIG.scoring) {
    super();
    this.cfg = cfg;
    this.defs = new Map(allScoreItems().map(d => [d.id, d]));
    this.reset();
  }

  reset() {
    this.results = {};      // id -> { score, max, mistakes, detail, at }
    this.mistakes = {};     // id -> عدد الأخطاء المسجلة قبل الإنهاء
    this.preTest = null;    // { choice, correct }
    this.postTest = null;
    this.selfAnswer = null; // { text, score, concepts }
    this.startedAt = Date.now();
    this._emit();
  }

  def(id) {
    const d = this.defs.get(id);
    if (!d) throw new Error('Unknown score item: ' + id);
    return d;
  }
  has(id) { return id in this.results; }
  get(id) { return this.results[id] || null; }

  addMistake(id, n = 1) {
    this.def(id);
    this.mistakes[id] = (this.mistakes[id] || 0) + n;
    this._emit();
  }
  mistakeCount(id) { return this.mistakes[id] || 0; }

  /** يسجّل درجة البند (مرة واحدة إلا إذا overwrite) */
  record(id, score, { detail = '', overwrite = false } = {}) {
    const d = this.def(id);
    if (this.has(id) && !overwrite) return this.results[id];
    const s = Math.max(0, Math.min(d.max, Math.round(score * 100) / 100));
    this.results[id] = { score: s, max: d.max, mistakes: this.mistakeCount(id), detail, at: Date.now() };
    this._emit();
    return this.results[id];
  }

  /** درجة مهام الإكمال مع الخصم القابل للضبط لكل خطأ */
  recordCompletion(id, detail = '') {
    const d = this.def(id);
    const pen = this.cfg.penaltyPerMistake * this.mistakeCount(id);
    return this.record(id, d.max - pen, { detail });
  }

  /** يضيف درجة جزئية إلى بند متعدد الأجزاء (مثل حالات الكهروسالبية) */
  addPartial(id, points, { detail = '' } = {}) {
    const d = this.def(id);
    const cur = this.results[id] || { score: 0, max: d.max, mistakes: 0, detail: '', parts: 0, at: Date.now() };
    cur.score = Math.min(d.max, Math.round((cur.score + points) * 100) / 100);
    cur.parts = (cur.parts || 0) + 1;
    cur.mistakes = this.mistakeCount(id);
    if (detail) cur.detail = detail;
    cur.at = Date.now();
    this.results[id] = cur;
    this._emit();
    return cur;
  }

  _group(group) {
    const items = group === 'practical' ? this.cfg.practical : this.cfg.exam;
    let raw = 0, max = 0;
    for (const it of items) { max += it.max; raw += this.results[it.id]?.score || 0; }
    return { raw: Math.round(raw * 100) / 100, max, pct: max ? (raw / max) * 100 : 0 };
  }

  summary() {
    const practical = this._group('practical');
    const exam = this._group('exam');
    const w = this.cfg.weights, th = this.cfg.thresholds;
    const final = practical.pct * w.practical + exam.pct * w.exam;
    const criticals = [...this.defs.values()].filter(d => d.critical).map(d => ({
      id: d.id, label: d.label,
      passed: !!this.results[d.id] && this.results[d.id].score >= d.max,
    }));
    const reasons = [];
    if (final < th.final) reasons.push(`الدرجة المركبة أقل من ${th.final}%`);
    if (practical.pct < th.practical) reasons.push(`الأداء العملي أقل من ${th.practical}%`);
    if (exam.pct < th.exam) reasons.push(`الاختبار أقل من ${th.exam}%`);
    for (const c of criticals) if (!c.passed) reasons.push(`لم يُجتز البند الحرج: ${c.label}`);
    const passed = reasons.length === 0;

    const strengths = [], weaknesses = [], failedItems = [];
    for (const d of this.defs.values()) {
      const r = this.results[d.id];
      const pct = r ? (r.score / d.max) * 100 : 0;
      const m = this.mistakeCount(d.id);
      if (!r) { weaknesses.push(`${d.label}: لم يُنجز`); failedItems.push(d.label); continue; }
      if (pct >= 80 && m === 0) strengths.push(d.label);
      else if (pct < 60) { weaknesses.push(`${d.label}: ${r.score}/${d.max}`); failedItems.push(d.label); }
      else if (m > 0) weaknesses.push(`${d.label}: ${m} ${m === 1 ? 'خطأ' : 'أخطاء'} أثناء التنفيذ`);
    }
    return {
      practical, exam,
      final: Math.round(final * 10) / 10,
      criticals, passed, reasons, strengths, weaknesses, failedItems,
      preTest: this.preTest, postTest: this.postTest, selfAnswer: this.selfAnswer,
      durationSec: Math.round((Date.now() - this.startedAt) / 1000),
      weightsNote: 'الأداء العملي 60% + الاختبار 40%',
    };
  }

  save(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    const s = this.summary();
    const payload = { date: new Date().toISOString(), summary: s, results: this.results, mistakes: this.mistakes };
    try { storage?.setItem(CONFIG.storageKey, JSON.stringify(payload)); } catch (e) { /* التخزين غير متاح */ }
    return payload;
  }
  static loadLast(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    try { const t = storage?.getItem(CONFIG.storageKey); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }

  _emit() { this.dispatchEvent(new Event('change')); }
}
