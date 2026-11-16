// معرّف ثابت لنص (FNV-1a 32bit) — يربط جملة المعلم بملف الصوت المولّد لها.
// يُستخدم في المتصفح وفي سكربت التوليد (Node) فيبقى الربط متطابقًا.
export function textId(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text).normalize('NFC')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
