// مؤشر التقدم: لوحة على المعصم الأيسر داخل VR + شريط HTML في وضع المعاينة
import * as THREE from 'three';
import { Panel } from './VRPanel.js';
import { COLORS, drawText, fillRound } from './text.js';

const TOOL_NAMES = { stick: 'عصا (رابطة أحادية)', spring: 'زنبرك (وصلة متعددة)', pliers: 'كماشة (فك)' };

export class ProgressHUD {
  constructor(app) {
    this.app = app;
    this.state = { stage: 1, total: 5, title: '', task: '', progress: 0, tool: null, score: '' };
    this.wrist = new Panel({ width: 0.2, height: 0.125, ppm: 2000, radius: 30, draw: (ctx, w, h) => this._draw(ctx, w, h) });
    this.wrist.visible = false;
    this.dom = {
      root: document.getElementById('hud'),
      stage: document.getElementById('hud-stage'),
      title: document.getElementById('hud-title'),
      task: document.getElementById('hud-task'),
      bar: document.getElementById('hud-bar'),
      tool: document.getElementById('hud-tool'),
    };
    this._dirty = true;
  }
  /** يُثبَّت على مقبض وحدة التحكم اليسرى كساعة يد */
  attachToGrip(grip) {
    grip.add(this.wrist);
    this.wrist.position.set(0.0, 0.035, 0.06);
    this.wrist.rotation.set(-Math.PI / 2.6, 0, 0);
    this.wrist.visible = true;
  }
  set(patch) {
    let changed = false;
    for (const k in patch) if (this.state[k] !== patch[k]) { this.state[k] = patch[k]; changed = true; }
    if (changed) this._dirty = true;
  }
  update() {
    if (!this._dirty) return;
    this._dirty = false;
    this.wrist.redraw();
    const s = this.state, d = this.dom;
    if (d.root) {
      d.stage.textContent = `المرحلة ${s.stage} من ${s.total}`;
      d.title.textContent = s.title;
      d.task.textContent = s.task;
      d.bar.style.width = `${Math.round(s.progress * 100)}%`;
      d.tool.textContent = (s.tool ? `الأداة في يدك: ${TOOL_NAMES[s.tool]}` : 'لا توجد أداة في يدك') + (s.goggles ? ' · 🥽 النظارة' : '') + (s.coat ? ' · 🥼 المعطف' : '');
    }
  }
  _draw(ctx, w, h) {
    const s = this.state, pad = 22;
    drawText(ctx, `المرحلة ${s.stage}/${s.total} · ${s.title}`, w - pad, pad, { size: 30, weight: 800, maxW: w - pad * 2, maxLines: 1 });
    fillRound(ctx, pad, 78, w - pad * 2, 16, 8, '#22344d');
    fillRound(ctx, w - pad - (w - pad * 2) * s.progress, 78, Math.max(16, (w - pad * 2) * s.progress), 16, 8, COLORS.good);
    drawText(ctx, s.task || '—', w - pad, 110, { size: 26, weight: 600, color: COLORS.gold, maxW: w - pad * 2, maxLines: 3, lineH: 1.35 });
    drawText(ctx, (s.goggles ? '🥽 ' : '') + (s.coat ? '🥼 ' : '') + (s.tool ? `الأداة: ${TOOL_NAMES[s.tool]}` : 'X: القائمة · A: محطة المهمة'), w - pad, h - 46, { size: 22, weight: 600, color: COLORS.muted, maxW: w - pad * 2, maxLines: 1 });
  }
}
