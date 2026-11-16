// سجل الأجسام القابلة للتفاعل — منفصل عن المشاهد وعن مدير التفاعل لتجنب الاعتماد الدائري.
//
// واجهة المعالج (handler):
//  kind: 'button' | 'grab' | 'handle' | 'tool' | 'pick'
//  enabled?(): boolean
//  onHover?(on, ptr)
//  onPress?(ptr)                      — للأزرار وعناصر الاختيار
//  object                              — الجسم الذي يُحرَّك عند الالتقاط (grab/tool)
//  onGrab?(ptr) / onRelease?(ptr)->bool(consumed) / onHeldUpdate?(ptr, handPoint, dt)
//  onTool?(ptr, toolType)->bool        — عند الضغط وفي اليد أداة (كماشة/زنبرك/عصا)
//  homeParent                          — الأب الذي يعود إليه الجسم عند الإفلات
//  gravity                             — يسقط على أقرب سطح عند الإفلات (افتراضي true)
export const registry = { targets: new Set(), buttons: new Set() };

export function registerTarget(mesh, handler) {
  mesh.userData.handler = handler;
  registry.targets.add(mesh);
  if (handler.kind === 'button') registry.buttons.add(mesh);
  return mesh;
}
export function unregisterTarget(mesh) {
  registry.targets.delete(mesh);
  registry.buttons.delete(mesh);
}
export function isShown(obj) {
  while (obj) { if (!obj.visible) return false; obj = obj.parent; }
  return true;
}
export function handlerEnabled(h) {
  return !h.enabled || h.enabled();
}

/** يحرر الموارد لشجرة كاملة ويزيل أهداف التفاعل منها (يتجاهل الموارد المشتركة) */
export function disposeTree(root) {
  root.traverse(o => {
    if (o.userData?.handler) unregisterTarget(o);
    if (o.userData?.onDispose) o.userData.onDispose();
    if (o.geometry && !o.isSprite && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      if (m.map && !m.map.userData?.shared) m.map.dispose();
      m.dispose();
    }
  });
  root.parent?.remove(root);
}
