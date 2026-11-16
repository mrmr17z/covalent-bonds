// ============================================================================
//  مدير التقييم — منطق الأسئلة (المحاولة الأولى تُحتسب)، القياس القبلي/البعدي،
//  وتصحيح التقييم الذاتي المكتوب بالكلمات المفتاحية.
// ============================================================================
import { Q } from './data/questions.js';

export function normalizeArabic(s) {
  return String(s || '')
    .replace(/[ً-ْـ]/g, '')      // التشكيل والتطويل
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEGATED_EQUAL = /(غير|عدم|ليست|ليس|لا ?تكون)\s*(ال)?(متساو\S*|تساو\S*|متكافي\S*|متماثل\S*)/g;
const EQUAL_TERMS = ['متساو', 'بالتساوي', 'تساوي', 'متكافي', 'متماثل', 'بشكل متساو', 'نفس الكهروسالبيه', 'نفس القوه', 'بالعدل', 'متعادل'];
const UNEQUAL_TERMS = ['غير متساو', 'عدم تساوي', 'عدم التساوي', 'غير متكافي', 'منحاز', 'انحياز', 'تنحاز', 'اختلاف', 'مختلف', 'كهروسالب', 'يجذب', 'تجذب', 'اكثر جذب', 'اقرب الي', 'شحنه جزييه', 'شحنات جزييه'];

export class AssessmentManager {
  constructor(scoring) {
    this.scoring = scoring;
    this.answers = {}; // id -> [choices...]
  }
  reset() { this.answers = {}; }

  /** سؤال اختيار من متعدد: المحاولة الأولى فقط تُحتسب */
  answerMCQ(scoreId, choice, correct, points) {
    const list = (this.answers[scoreId] ||= []);
    list.push(choice);
    const isCorrect = choice === correct;
    const first = list.length === 1;
    if (first && points != null) {
      if (!isCorrect) this.scoring.addMistake(scoreId);
      this.scoring.record(scoreId, isCorrect ? points : 0, { detail: `الاختيار ${choice + 1}` });
    }
    return { correct: isCorrect, first };
  }

  setPreTest(choice) {
    this.scoring.preTest = { choice, correct: choice === Q.preHCl.correct };
    this.scoring._emit();
  }
  setPostTest(choice) {
    this.scoring.postTest = { choice, correct: choice === Q.preHCl.correct };
    this.scoring._emit();
  }
  comparePrePost() {
    const pre = this.scoring.preTest, post = this.scoring.postTest;
    if (!pre || !post) return null;
    let verdict;
    if (!pre.correct && post.correct) verdict = 'تحسّن فهمك: أصبحت إجابتك صحيحة.';
    else if (pre.correct && post.correct) verdict = 'ثبت فهمك: إجابتك صحيحة في المرتين.';
    else if (pre.correct && !post.correct) verdict = 'تراجعت الإجابة: راجع مفهوم القطبية وفرق الكهروسالبية.';
    else verdict = 'لم يتحسن الفهم بعد: راجع محاكاة شد الحبل لجزيء HCl.';
    return { pre, post, improved: !pre.correct && post.correct, verdict, explanation: Q.preHCl.explanation };
  }

  /** تصحيح مبسّط بالكلمات المفتاحية: مفهومان × 5 نقاط */
  gradeSelfText(text) {
    const n = normalizeArabic(text);
    const withoutNegated = n.replace(NEGATED_EQUAL, ' ');
    const equal = EQUAL_TERMS.some(t => withoutNegated.includes(normalizeArabic(t)));
    const unequal = UNEQUAL_TERMS.some(t => n.includes(normalizeArabic(t)));
    const score = (equal ? 5 : 0) + (unequal ? 5 : 0);
    const fb = [];
    fb.push(equal ? '✓ ذكرتَ تساوي المشاركة في الرابطة النقية.' : '✗ لم تذكر أن المشاركة متساوية تقريبًا في الرابطة النقية.');
    fb.push(unequal ? '✓ ذكرتَ عدم تساوي المشاركة/اختلاف الكهروسالبية في القطبية.' : '✗ لم تذكر أن المشاركة غير متساوية بسبب اختلاف الكهروسالبية.');
    return { score, concepts: { equal, unequal }, feedback: fb };
  }

  submitSelf({ text = null, optionIndex = null }) {
    let res;
    if (optionIndex != null) {
      const opt = Q.self.options[optionIndex];
      res = { score: opt.score, text: opt.text, mode: 'choice', feedback: [] };
      const g = this.gradeSelfText(opt.text);
      res.concepts = g.concepts;
      res.feedback = opt.score === 10 ? ['✓ إجابة مكتملة: تساوي المشاركة مقابل عدم تساويها بسبب الكهروسالبية.']
        : opt.score === 5 ? ['◐ ذكرتَ سبب القطبية فقط، ولم تذكر تساوي المشاركة في الرابطة النقية.']
        : ['✗ الرابطة النقية لا تنتقل فيها الإلكترونات، والقطبية ليست مشاركة متساوية.'];
    } else {
      const g = this.gradeSelfText(text);
      res = { score: g.score, text, mode: 'text', concepts: g.concepts, feedback: g.feedback };
    }
    this.scoring.selfAnswer = res;
    this.scoring.record('selfAssess', res.score, { detail: res.mode });
    return res;
  }
}
