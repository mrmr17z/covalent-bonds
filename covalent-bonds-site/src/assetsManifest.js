// مسارات الأصول (نماذج، شعار، أصوات).
// في نسخة الملف الواحد (dist) تُضمَّن داخل الصفحة في window.__EMBEDDED_MODELS و window.__EMBEDDED_ASSETS.
const FILES = {
  teacher: 'assets/models/lecturer.glb',          // المعلم (CHR-0119_lecturer)
  technician: 'assets/models/medical_male_01.glb', // فني المختبر (CHR-0081_Medical_Male_01)
  boy1: 'assets/models/male_child_01.glb',        // طالب بلا نظارة ولا معطف (CHR-0043)
  boy2: 'assets/models/male_child_02.glb',        // طالب ملتزم بالسلامة (CHR-0044)
  girl1: 'assets/models/female_child_01.glb',     // طالبة تنزع الزنبرك بأسنانها (CHR-0041)
  sphere: 'assets/models/amad_sphere.glb',        // كرة الأمد المرافقة (ELM-0531)
};
const EMBEDDED = (typeof window !== 'undefined' && window.__EMBEDDED_MODELS) || {};
export const MODEL_URLS = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, EMBEDDED[k] || v]));
export const MODEL_FILES = FILES;

// شعار الأمد (مقتطع من الكليشة الرسمية): نسخة بكتابة داكنة للخلفيات الفاتحة، وبكتابة بيضاء للداكنة
export const BRAND_FILES = {
  logo: 'assets/brand/alamad-logo.png',
  logoLight: 'assets/brand/alamad-logo-light.png',
};

/** رابط أصل: من النسخة المضمّنة إن وُجدت، وإلا من المسار النسبي */
export function assetUrl(path) {
  const emb = typeof window !== 'undefined' && window.__EMBEDDED_ASSETS?.[path];
  if (emb) return emb;
  return typeof document !== 'undefined' ? new URL(path, document.baseURI).href : path;
}
