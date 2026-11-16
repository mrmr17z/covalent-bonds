// ============================================================================
//  الجزيئات ومساحة البناء
//  - Molecule: مجموعة ذرات وروابط تتحرك ككتلة واحدة، مع تخطيط هندسي (VSEPR)
//  - Workspace: الالتقاط، التقريب، التوصيل بنقاط الالتصاق (Snap)، التحقق من
//    صحة الوصلات، إضافة الزنبركات، الفك بالكماشة، وفصل المكوّنات.
// ============================================================================
import * as THREE from 'three';
import { AtomView, GEO, elementMaterial } from './Atom.js';
import { BondView, BOND_GEO, BOND_MATS } from './Bond.js';
import { ELEMENTS, idealDirections, canConnect, canIncreaseOrder, formulaOf } from '../chemistryEngine.js';
import { registerTarget, unregisterTarget, disposeTree } from '../core/registry.js';

const UP = new THREE.Vector3(0, 1, 0);
const SNAP_DIST = 0.07;      // المسافة بين سطحي الذرتين لبدء الالتصاق
export const BOND_GAP = 0.032;

export function bondLength(a, b) { return a.r + b.r + BOND_GAP; }

export class Molecule {
  constructor(ws) {
    this.ws = ws;
    this.group = new THREE.Group();
    this.group.name = 'molecule';
    this.atoms = [];
    this.bonds = [];
    this.root = null;
    this.hover = false;
    this.success = false;
    this.structureLocked = false;
    this.anim = null;
    this.settleAfterAnim = false;
    this.home = null;
  }
  get heldBy() { return this.group.userData.heldBy || null; }

  graph() {
    return {
      atoms: this.atoms.map(a => ({ id: a.id, el: a.el, ref: a })),
      bonds: this.bonds.map(b => ({ a: b.a.id, b: b.b.id, order: b.order, kind: b.kind, ref: b })),
      molecule: this,
    };
  }
  formula() { return formulaOf(this.graph()); }
  neighborsOf(atom) {
    const out = [];
    for (const b of this.bonds) if (b.involves(atom)) out.push({ atom: b.other(atom), bond: b });
    return out;
  }
  usedValence(atom) { let s = 0; for (const b of this.bonds) if (b.involves(atom)) s += b.order; return s; }
  freeHoles(atom) { return atom.def.valence - this.usedValence(atom); }

  setHover(on) { this.hover = on; this.refreshHalo(); }
  setSuccess(on) { this.success = on; this.refreshHalo(); }
  refreshHalo() {
    for (const a of this.atoms) a.setHalo(a.preview ? 'preview' : this.hover ? 'hover' : this.success ? 'success' : null);
  }

  /** تخطيط هندسي: الذرة المركزية ثابتة في العالم، والبقية حسب عدد المجالات */
  layout(animate = true) {
    if (!this.atoms.length) return;
    let root = this.root && this.atoms.includes(this.root) ? this.root : this.atoms[0];
    for (const a of this.atoms) if (a.def.valence > root.def.valence) root = a;
    this.root = root;
    // نقل أصل المجموعة إلى الذرة المركزية دون تغيير المواضع العالمية
    const oldRootLocal = root.root.position.clone();
    if (oldRootLocal.lengthSq() > 0) {
      const delta = oldRootLocal.clone().applyQuaternion(this.group.quaternion);
      this.group.position.add(delta);
      for (const a of this.atoms) a.root.position.sub(oldRootLocal);
    }
    const targets = new Map([[root, new THREE.Vector3()]]);
    const holeDirs = new Map();
    const visited = new Set();
    const visit = (atom, parent, parentDir) => {
      visited.add(atom);
      const nbs = this.neighborsOf(atom);
      const free = this.freeHoles(atom);
      const sn = Math.max(1, Math.min(4, nbs.length + free + atom.def.lonePairs));
      let q;
      if (parentDir) q = new THREE.Quaternion().setFromUnitVectors(UP, parentDir);
      else q = sn === 2 ? new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0)) : new THREE.Quaternion();
      const dirs = idealDirections(sn).map(a => new THREE.Vector3(...a).applyQuaternion(q));
      let idx = parentDir ? 1 : 0;
      const pos = targets.get(atom);
      for (const n of nbs) {
        if (n.atom === parent || visited.has(n.atom)) continue;
        const d = dirs[idx++] || new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        targets.set(n.atom, pos.clone().addScaledVector(d, bondLength(atom, n.atom)));
        visit(n.atom, atom, d.clone().negate());
      }
      holeDirs.set(atom, dirs.slice(idx, idx + free));
    };
    visit(root, null, null);
    for (const a of this.atoms) a.setHoleDirs(holeDirs.get(a) || []);
    if (animate) {
      this.anim = { t: 0, from: new Map(this.atoms.map(a => [a, a.root.position.clone()])), to: targets };
    } else {
      for (const a of this.atoms) a.root.position.copy(targets.get(a) || a.root.position);
      this.anim = null;
      this.updateBonds();
    }
  }
  updateBonds() { for (const b of this.bonds) b.updateTransform(); }

  /** يُرجع true عند انتهاء الحركة */
  tickAnim(dt) {
    if (!this.anim) return false;
    this.anim.t = Math.min(1, this.anim.t + dt / 0.35);
    const e = 1 - Math.pow(1 - this.anim.t, 3);
    for (const a of this.atoms) {
      const f = this.anim.from.get(a), t = this.anim.to.get(a);
      if (f && t) a.root.position.lerpVectors(f, t, e);
    }
    this.updateBonds();
    if (this.anim.t >= 1) { this.anim = null; return true; }
    return false;
  }

  /** أبعاد ومركز الجزيء في العالم */
  worldCenter(out = new THREE.Vector3()) {
    out.set(0, 0, 0);
    const v = new THREE.Vector3();
    for (const a of this.atoms) out.add(a.worldPos(v));
    return out.divideScalar(Math.max(1, this.atoms.length));
  }
}

export class Workspace extends EventTarget {
  /**
   * @param app
   * @param parent  الجذر الذي تعود إليه الجزيئات عند الإفلات
   * @param opts.allowJoin(atomA, atomB, tool) -> {ok,msg}|true
   */
  constructor(app, parent, { labels = true, allowJoin = null, onChange = null, floorRespawnY = 0.4 } = {}) {
    super();
    this.app = app;
    this.parent = parent;
    this.labels = labels;
    this.allowJoin = allowJoin;
    this.onChange = onChange;
    this.floorRespawnY = floorRespawnY;
    this.molecules = new Set();
    this.enabled = true;
    this.candidates = new Map(); // molecule -> candidate
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.previewLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true }));
    this.previewLine.renderOrder = 998;
    this.previewLine.frustumCulled = false;
    this.previewLine.visible = false;
    app.scene.add(this.previewLine);
  }

  // ------------------------------------------------------------ الإنشاء
  createAtom(el, localPos, { home = true } = {}) {
    const mol = new Molecule(this);
    const atom = new AtomView(el, { label: this.labels });
    atom.molecule = mol;
    mol.atoms.push(atom);
    mol.root = atom;
    mol.group.add(atom.root);
    mol.group.position.copy(localPos);
    if (home) mol.home = localPos.clone();
    this.parent.add(mol.group);
    this.molecules.add(mol);
    this._registerAtom(atom);
    return mol;
  }

  _registerAtom(atom) {
    const ws = this;
    registerTarget(atom.ball, {
      kind: 'grab',
      get object() { return atom.molecule.group; },
      get homeParent() { return ws.parent; },
      enabled: () => ws.enabled,
      onHover: (on) => atom.molecule.setHover(on),
      onGrab: () => ws._onGrab(atom.molecule),
      onRelease: (p) => ws._onRelease(atom.molecule, p),
      onRest: () => ws._onRest(atom.molecule),
      onTool: (p, tool) => ws._atomTool(atom, tool),
    });
  }
  _bondHandler(bond) {
    const ws = this;
    return {
      kind: 'grab',
      get object() { return bond.a.molecule.group; },
      get homeParent() { return ws.parent; },
      enabled: () => ws.enabled,
      onHover: (on) => { bond.setHover(on); },
      onGrab: () => ws._onGrab(bond.a.molecule),
      onRelease: (p) => ws._onRelease(bond.a.molecule, p),
      onRest: () => ws._onRest(bond.a.molecule),
      onTool: (p, tool) => ws._bondTool(bond, tool),
    };
  }
  _addBond(mol, a, b, order, kind) {
    const bond = new BondView(a, b, order, kind);
    bond.handler = this._bondHandler(bond);
    mol.bonds.push(bond);
    mol.group.add(bond.group);
    bond.rebuild(registerTarget, unregisterTarget);
    return bond;
  }
  _removeBond(mol, bond) {
    mol.bonds = mol.bonds.filter(x => x !== bond);
    if (bond.hitMesh) unregisterTarget(bond.hitMesh);
    bond.group.parent?.remove(bond.group);
  }

  graphs() { return [...this.molecules].map(m => m.graph()); }

  // ------------------------------------------------------------ الالتقاط والإفلات
  _onGrab(mol) { mol.home = mol.home || mol.group.position.clone(); }

  _onRest(mol) {
    if (!mol.group.parent) return;
    const wp = new THREE.Vector3();
    mol.group.getWorldPosition(wp);
    if (wp.y < this.floorRespawnY && mol.home) {
      // سقط على الأرض: يعود إلى مكانه على الطاولة
      mol.group.position.copy(mol.home).add(new THREE.Vector3(0, 0.1, 0));
      this.app.toast('أُعيد النموذج إلى الطاولة', 'info');
      this._drop(mol);
    }
  }
  _drop(mol) {
    if (mol.heldBy) return;
    this.app.physics.drop(mol.group, { onRest: () => this._onRest(mol) });
  }

  _findCandidate(mol) {
    if (this.joinEnabled === false) return null;
    let best = null;
    const va = new THREE.Vector3(), vb = new THREE.Vector3();
    for (const a of mol.atoms) {
      if (mol.freeHoles(a) <= 0) continue;
      a.worldPos(va);
      for (const other of this.molecules) {
        if (other === mol || other.structureLocked) continue;
        for (const b of other.atoms) {
          if (other.freeHoles(b) <= 0) continue;
          const d = va.distanceTo(b.worldPos(vb)) - a.r - b.r;
          if (d < SNAP_DIST && (!best || d < best.d)) best = { a, b, mb: other, d };
        }
      }
    }
    if (mol.structureLocked && best) return null;
    return best;
  }

  _onRelease(mol, p) {
    this._clearPreview(mol);
    const cand = this._findCandidate(mol);
    if (!cand) return false;
    const tool = this.app.interaction.activeBondTool(p);
    if (!tool) {
      this.app.toast('لتوصيل الذرتين التقط أداة الربط أولًا: العصا (أحادية) أو الزنبرك (متعددة).', 'warn');
      this.app.audio.play('error');
      return false;
    }
    if (tool === 'stick' || tool === 'spring') {
      const graph = { atoms: [...mol.atoms, ...cand.mb.atoms].map(a => ({ id: a.id, el: a.el })), bonds: [...mol.bonds, ...cand.mb.bonds].map(b => ({ a: b.a.id, b: b.b.id, order: b.order, kind: b.kind })) };
      const r = canConnect(graph, cand.a.id, cand.b.id);
      if (!r.ok) { this.app.toast(r.msg, 'warn'); this.app.audio.play('error'); return false; }
      if (this.allowJoin) {
        const ok = this.allowJoin(cand.a, cand.b, tool);
        if (ok !== true && ok && !ok.ok) { this.app.toast(ok.msg, 'warn'); this.app.audio.play('error'); return false; }
      }
      this.join(mol, cand.a, cand.mb, cand.b, tool);
      return true;
    }
    return false;
  }

  /** دمج الجزيء A في B بوصلة واحدة من نوع الأداة */
  join(molA, atomA, molB, atomB, kind) {
    for (const a of molA.atoms) { molB.group.attach(a.root); a.molecule = molB; molB.atoms.push(a); }
    for (const b of molA.bonds) { molB.group.attach(b.group); molB.bonds.push(b); }
    molA.atoms = []; molA.bonds = [];
    this.molecules.delete(molA);
    molA.group.parent?.remove(molA.group);
    this._addBond(molB, atomA, atomB, 1, kind);
    molB.setSuccess(false);
    molB.layout(true);
    molB.settleAfterAnim = true;
    this.app.audio.play('snap');
    setTimeout(() => this.app.audio.play('bond'), 90);
    this._changed();
  }

  // ------------------------------------------------------------ الأدوات على الروابط والذرات
  _bondTool(bond, tool) {
    const mol = bond.a.molecule;
    if (tool === 'pliers') {
      if (mol.structureLocked) { this.app.toast('هذا النموذج مكتمل ومعتمد. لن يُفك الآن.', 'info'); return true; }
      bond.order -= 1;
      if (bond.order <= 0) {
        this._removeBond(mol, bond);
        this._splitComponents(mol, bond.b);
      } else {
        bond.rebuild(registerTarget, unregisterTarget);
        mol.layout(true);
      }
      this.app.audio.play('unbond');
      mol.setSuccess(false);
      this._changed();
      return true;
    }
    if (tool === 'spring' || tool === 'stick') {
      if (mol.structureLocked) { this.app.toast('هذا النموذج مكتمل ومعتمد.', 'info'); return true; }
      const g = mol.graph();
      const gb = g.bonds.find(x => x.ref === bond);
      const r = canIncreaseOrder(g, gb, tool);
      if (!r.ok) { this.app.toast(r.msg, 'warn'); this.app.audio.play('error'); return true; }
      bond.order += 1;
      bond.rebuild(registerTarget, unregisterTarget);
      mol.layout(true);
      mol.settleAfterAnim = !mol.heldBy;
      this.app.audio.play('bond');
      this.app.toast(bond.order === 2 ? 'أُضيفت وصلة ثانية: رابطة ثنائية (زنبركان)' : 'أُضيفت وصلة ثالثة: رابطة ثلاثية (ثلاثة زنبركات)', 'info');
      this._changed();
      return true;
    }
    return false;
  }

  _atomTool(atom, tool) {
    if (tool !== 'pliers') return false;
    const mol = atom.molecule;
    if (mol.atoms.length === 1) { this.app.toast('هذه الذرة منفصلة بالفعل.', 'info'); return true; }
    if (mol.structureLocked) { this.app.toast('هذا النموذج مكتمل ومعتمد. لن يُفك الآن.', 'info'); return true; }
    this.detachAtom(atom);
    return true;
  }

  detachAtom(atom) {
    const mol = atom.molecule;
    for (const b of [...mol.bonds]) if (b.involves(atom)) this._removeBond(mol, b);
    this._splitComponents(mol, atom);
    this.app.audio.play('unbond');
    mol.setSuccess(false);
    this._changed();
  }

  /** بعد إزالة رابطة: كل مكوّن متصل يصبح جزيئًا مستقلًا */
  _splitComponents(mol, popAtom = null) {
    const comps = [];
    const seen = new Set();
    const ordered = [mol.root, ...mol.atoms.filter(a => a !== mol.root)];
    for (const start of ordered) {
      if (seen.has(start)) continue;
      const comp = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const a = stack.pop();
        comp.push(a);
        for (const n of mol.neighborsOf(a)) if (!seen.has(n.atom)) { seen.add(n.atom); stack.push(n.atom); }
      }
      comps.push(comp);
    }
    if (comps.length <= 1) { mol.layout(true); return; }
    const center = mol.worldCenter();
    for (let i = 1; i < comps.length; i++) {
      const comp = comps[i];
      const nm = new Molecule(this);
      const wp = comp[0].worldPos(new THREE.Vector3());
      this.parent.add(nm.group);
      nm.group.position.copy(this.parent.worldToLocal(wp.clone()));
      for (const a of comp) { nm.group.attach(a.root); a.molecule = nm; nm.atoms.push(a); }
      const compSet = new Set(comp);
      for (const b of [...mol.bonds]) if (compSet.has(b.a)) { nm.group.attach(b.group); nm.bonds.push(b); }
      mol.bonds = mol.bonds.filter(b => !compSet.has(b.a));
      mol.atoms = mol.atoms.filter(a => !compSet.has(a));
      nm.root = comp[0];
      nm.home = mol.home ? mol.home.clone().add(new THREE.Vector3(0.08 * i, 0, 0.05)) : null;
      // إبعاد بسيط عن الجزيء الأصلي
      const away = wp.clone().sub(center); away.y = 0;
      if (away.lengthSq() < 1e-6) away.set(0.1, 0, 0.05);
      away.normalize().multiplyScalar(0.06);
      nm.group.position.add(away);
      nm.layout(true);
      nm.settleAfterAnim = true;
      this.molecules.add(nm);
    }
    if (!mol.atoms.includes(mol.root)) mol.root = mol.atoms[0];
    mol.layout(true);
    mol.settleAfterAnim = !mol.heldBy;
  }

  // ------------------------------------------------------------ معاينة الالتصاق
  _clearPreview(mol) {
    const c = this.candidates.get(mol);
    if (c) {
      c.a.preview = false; c.b.preview = false;
      c.a.molecule?.refreshHalo(); c.b.molecule?.refreshHalo();
      this.candidates.delete(mol);
    }
    if (!this.candidates.size) this.previewLine.visible = false;
  }

  update(dt) {
    for (const m of this.molecules) {
      if (m.tickAnim(dt) && m.settleAfterAnim) {
        m.settleAfterAnim = false;
        this._drop(m);
      }
    }
    // معاينة: الجزيء الممسوك قريب من ذرة أخرى ذات فتحة حرة
    let any = false;
    for (const m of this.molecules) {
      if (!m.heldBy) { if (this.candidates.has(m)) this._clearPreview(m); continue; }
      const c = this._findCandidate(m);
      const old = this.candidates.get(m);
      if (old && (!c || old.a !== c.a || old.b !== c.b)) this._clearPreview(m);
      if (c) {
        c.a.preview = true; c.b.preview = true;
        c.a.molecule.refreshHalo(); c.b.molecule.refreshHalo();
        this.candidates.set(m, c);
        const pos = this.previewLine.geometry.attributes.position;
        const va = c.a.worldPos(new THREE.Vector3()), vb = c.b.worldPos(new THREE.Vector3());
        pos.setXYZ(0, va.x, va.y, va.z); pos.setXYZ(1, vb.x, vb.y, vb.z); pos.needsUpdate = true;
        const tool = this.app.interaction.activeBondTool(m.heldBy);
        this.previewLine.material.color.set(tool ? 0x5cf0a0 : 0xff6b6b);
        any = true;
      }
    }
    this.previewLine.visible = any;
  }

  _changed() {
    this.onChange?.(this);
    this.dispatchEvent(new Event('change'));
  }

  // ------------------------------------------------------------ التنظيف
  removeMolecule(m) {
    this.molecules.delete(m);
    this.candidates.delete(m);
    if (m.heldBy) { const p = m.heldBy; p.held = null; m.group.userData.heldBy = null; }
    this.app.physics.stop(m.group);
    disposeTree(m.group);
  }
  clear() { for (const m of [...this.molecules]) this.removeMolecule(m); this.previewLine.visible = false; }
  dispose() {
    this.clear();
    this.previewLine.geometry.dispose();
    this.previewLine.material.dispose();
    this.app.scene.remove(this.previewLine);
  }
}

// ============================================================================
//  نموذج ثابت للعرض (الأسبرين، الماء...) — كرة وعصا، الروابط المتعددة بوصلات متعددة
//  def: { atoms: [[el, x, y, z], ...] (أنغستروم), bonds: [[i, j, order], ...] }
// ============================================================================
export function buildStaticMolecule(def, { scale = 0.06, atomScale = 0.5, low = false } = {}) {
  const g = new THREE.Group();
  const pts = def.atoms.map(([el, x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(scale));
  const center = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
  pts.forEach(p => p.sub(center));
  const radii = def.atoms.map(([el]) => (el === 'H' ? 0.25 : el === 'Cl' ? 0.42 : el === 'Na' ? 0.45 : 0.34) * scale * atomScale * 2.2);
  def.atoms.forEach(([el], i) => {
    const m = new THREE.Mesh(low ? GEO.sphereLow : GEO.sphere, elementMaterial(el));
    m.scale.setScalar(radii[i]);
    m.position.copy(pts[i]);
    m.userData.el = el;
    g.add(m);
  });
  const up = new THREE.Vector3(0, 1, 0);
  for (const [i, j, order] of def.bonds) {
    const a = pts[i], b = pts[j];
    const d = b.clone().sub(a); const L = d.length(); d.normalize();
    const perp = new THREE.Vector3().crossVectors(d, Math.abs(d.z) > 0.9 ? up : new THREE.Vector3(0, 0, 1)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, d);
    const n = order || 1;
    const gap = scale * 0.16;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * gap;
      const m = new THREE.Mesh(n === 1 ? BOND_GEO.stick : BOND_GEO.thin, BOND_MATS.staticStick);
      m.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(perp, off);
      m.quaternion.copy(q);
      const thick = scale / 0.06;
      m.scale.set(thick, L, thick);
      g.add(m);
    }
  }
  return g;
}
