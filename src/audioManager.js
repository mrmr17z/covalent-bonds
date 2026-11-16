// ============================================================================
//  مدير الصوت — مؤثرات مُولَّدة بـ Web Audio API (لا ملفات خارجية)،
//  أجواء مختبر خافتة، وصوت المعلم عبر Speech Synthesis إن توفّر صوت عربي.
// ============================================================================
import { VOICE_LINES } from './data/voiceManifest.js';
import { textId } from './core/textHash.js';
import { assetUrl } from './assetsManifest.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.voice = null;
    this.speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this._ambient = null;
    if (this.speechSupported) {
      const pick = () => {
        const voices = window.speechSynthesis.getVoices();
        this.voice = voices.find(v => /^ar(-|_|$)/i.test(v.lang)) || null;
      };
      pick();
      window.speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  /** يجب استدعاؤها من حدث مستخدم (نقرة) */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this._startAmbient();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    if (m) this.stopSpeech();
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _startAmbient() {
    // ضجيج بني منخفض جدًا عبر مرشح تمرير منخفض + همهمة تهوية خفيفة
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.035;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this._ambient = { src, g };
  }

  _env(node, t0, a, peak, dcy) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dcy);
    node.connect(g).connect(this.master);
    return g;
  }
  _tone(freq, t0, dur, { type = 'sine', peak = 0.2, attack = 0.005, slideTo = null } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    this._env(o, t0, attack, peak, dur);
    o.start(t0); o.stop(t0 + attack + dur + 0.05);
  }
  _noise(t0, dur, { freq = 2000, q = 1, peak = 0.15, type = 'bandpass' } = {}) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * (dur + 0.05));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f);
    this._env(f, t0, 0.003, peak, dur);
    s.start(t0);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'hover':   this._tone(1400, t, 0.03, { peak: 0.025 }); break;
      case 'click':   this._tone(900, t, 0.05, { type: 'triangle', peak: 0.12 }); break;
      case 'grab':    this._noise(t, 0.05, { freq: 1800, q: 2, peak: 0.12 }); this._tone(520, t, 0.06, { peak: 0.06 }); break;
      case 'release': this._tone(380, t, 0.08, { peak: 0.06, slideTo: 300 }); break;
      case 'land':    this._noise(t, 0.06, { freq: 700, q: 1.5, peak: 0.1 }); break;
      case 'snap':    this._noise(t, 0.04, { freq: 3200, q: 3, peak: 0.16 }); this._tone(1240, t, 0.07, { type: 'square', peak: 0.03 }); break;
      case 'bond':    this._tone(660, t, 0.08, { peak: 0.1 }); this._tone(990, t + 0.06, 0.12, { peak: 0.08 }); break;
      case 'unbond':  this._tone(700, t, 0.1, { peak: 0.08, slideTo: 420 }); break;
      case 'success': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(f, t + i * 0.09, 0.28, { type: 'triangle', peak: 0.11 })); break;
      case 'correct': this._tone(784, t, 0.12, { type: 'triangle', peak: 0.1 }); this._tone(1175, t + 0.1, 0.22, { type: 'triangle', peak: 0.09 }); break;
      case 'error':   this._tone(330, t, 0.18, { type: 'sine', peak: 0.09 }); this._tone(262, t + 0.15, 0.25, { type: 'sine', peak: 0.08 }); break;
      case 'teleport':this._noise(t, 0.22, { freq: 900, q: 0.7, peak: 0.07, type: 'lowpass' }); break;
      case 'whoosh':  this._noise(t, 0.6, { freq: 600, q: 0.5, peak: 0.08 }); break;
      case 'open':    this._tone(220, t, 0.25, { type: 'triangle', peak: 0.06, slideTo: 330 }); break;
      case 'transfer':this._tone(400, t, 0.5, { peak: 0.08, slideTo: 1600 }); break;
      default: break;
    }
  }

  /** هل لهذه الجملة تسجيل مولّد بـ Gemini؟ */
  hasRecorded(text) { return !!VOICE_LINES[textId(text)]; }

  async _voiceBuffer(id, entry) {
    this._voiceCache ||= new Map();
    if (this._voiceCache.has(id)) return this._voiceCache.get(id);
    const p = fetch(assetUrl(entry.file)).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b));
    this._voiceCache.set(id, p);
    try { return await p; } catch (e) { this._voiceCache.delete(id); throw e; }
  }

  /**
   * صوت المعلم:
   *  1) تسجيل مولّد مسبقًا بـ Gemini TTS (assets/audio/voice) إن وُجد للجملة.
   *  2) وإلا صوت عربي من Speech Synthesis إن توفر في المتصفح.
   *  3) وإلا النص المعروض فقط (لا نقرأ العربية بصوت أجنبي).
   */
  async speak(text) {
    const id = textId(text);
    const entry = VOICE_LINES[id];
    if (entry && this.ctx && this.ctx.state === 'suspended') { try { await Promise.race([this.ctx.resume(), new Promise(r => setTimeout(r, 300))]); } catch (e) { /* */ } }
    if (entry && this.ctx && this.ctx.state === 'running' && !this.muted) {
      try {
        const buf = await this._voiceBuffer(id, entry);
        this.stopSpeech();
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain(); g.gain.value = 1.15;
        src.connect(g).connect(this.master);
        this._voiceSrc = src;
        return await new Promise(resolve => {
          let done = false;
          const fin = () => { if (done) return; done = true; if (this._voiceSrc === src) this._voiceSrc = null; resolve(); };
          src.onended = fin;
          // ضمان: لا يتوقف كلام المعلم أبدًا حتى لو تعطّل حدث الانتهاء
          setTimeout(fin, (buf.duration + 1.5) * 1000);
          src.start();
        });
      } catch (e) { console.warn('تعذّر تشغيل تسجيل المعلم', e); }
    }
    return new Promise(resolve => {
      const est = Math.min(14000, 1500 + text.length * 65);
      if (!this.speechSupported || !this.voice || this.muted) { setTimeout(resolve, est); return; }
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.replace(/[δ₀-₉]/g, ''));
        u.voice = this.voice; u.lang = this.voice.lang; u.rate = 1.0; u.pitch = 1.0;
        let done = false;
        const fin = () => { if (!done) { done = true; resolve(); } };
        u.onend = fin; u.onerror = fin;
        setTimeout(fin, est + 6000);
        window.speechSynthesis.speak(u);
      } catch (e) { setTimeout(resolve, est); }
    });
  }
  stopSpeech() {
    if (this._voiceSrc) { const s = this._voiceSrc; this._voiceSrc = null; try { s.onended?.(); s.stop(); } catch (e) { /* انتهى */ } }
    if (this.speechSupported) window.speechSynthesis.cancel();
  }
  get hasArabicVoice() { return !!this.voice; }
}
