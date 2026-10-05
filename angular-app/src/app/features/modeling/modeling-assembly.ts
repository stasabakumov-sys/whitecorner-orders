import * as THREE from 'three';

export type PartKey = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'shelf' | 'wheels' | 'roof' | 'posts' | 'legs' | 'decorative-wheels';
export const ASSEMBLY_PARTS: { key: PartKey; label: string; normal: [number, number, number] }[] = [
  { key: 'top', label: 'Top', normal: [0, 1, 0] },
  { key: 'bottom', label: 'Bottom', normal: [0, -1, 0] },
  { key: 'left', label: 'Left side', normal: [-1, 0, 0] },
  { key: 'right', label: 'Right side', normal: [1, 0, 0] },
  { key: 'front', label: 'Front panel', normal: [0, 0, -1] },
  { key: 'shelf', label: 'Shelf · fixed', normal: [0, 0, 0] },
  { key: 'wheels', label: 'Wheels · fixed', normal: [0, 0, 0] },
  { key: 'roof', label: 'Roof · fixed', normal: [0, 0, 0] },
  { key: 'posts', label: 'Roof supports · fixed', normal: [0, 0, 0] },
  { key: 'legs', label: 'Legs · fixed', normal: [0, 0, 0] },
  { key: 'decorative-wheels', label: 'Decorative wheels · fixed', normal: [0, 0, 0] },
];
const WALLS: PartKey[] = ['left', 'right', 'front'];
export function assemblyPartKey(name: string): PartKey | null {
  if (/^Top[ _]/i.test(name)) return 'top';
  if (/^(Buttom|Bottom)[ _]/i.test(name)) return 'bottom';
  if (/^Left[ _]side/i.test(name)) return 'left';
  if (/^Right[ _]side/i.test(name)) return 'right';
  if (/^Front[ _]/i.test(name)) return 'front';
  if (/^Shelf/i.test(name)) return 'shelf';
  if (/^Caster/i.test(name)) return 'wheels';
  if (/^Roof/i.test(name)) return 'roof';
  if (/^Dar[ _]?\d/i.test(name)) return 'posts';
  if (/^Legs/i.test(name)) return 'legs';
  if (/^Decorative[ _]wheel/i.test(name)) return 'decorative-wheels';
  return null;
}

export class AssemblyState {
  locked = false;
  selected: PartKey | null = null;
  readonly offsets = Object.fromEntries(ASSEMBLY_PARTS.map(p => [p.key, 0])) as Record<PartKey, number>;
  readonly visible = Object.fromEntries(ASSEMBLY_PARTS.map(p => [p.key, true])) as Record<PartKey, boolean>;
  canMove(key: PartKey): boolean {
    if (this.locked || !this.visible[key] || ASSEMBLY_PARTS.find(part => part.key === key)?.normal.every(value => value === 0)) return false;
    return !WALLS.includes(key) || ['top', 'bottom'].every(k =>
      !this.visible[k as PartKey] || this.offsets[k as PartKey] >= 60);
  }
  move(key: PartKey, mm: number): void {
    if (!this.canMove(key) || !Number.isFinite(mm)) return;
    this.offsets[key] = Math.max(0, Math.min(500, mm));
    this.keepAssemblyOrder();
  }
  setVisible(key: PartKey, visible: boolean): void {
    this.visible[key] = visible;
    if (!visible && this.selected === key) this.selected = null;
    this.keepAssemblyOrder();
  }
  restore(key?: PartKey): void {
    for (const part of ASSEMBLY_PARTS) if (!key || part.key === key) this.offsets[part.key] = 0;
    this.keepAssemblyOrder();
  }
  private keepAssemblyOrder(): void {
    if (['top', 'bottom'].some(k => this.visible[k as PartKey] && this.offsets[k as PartKey] < 60)) {
      for (const key of WALLS) this.offsets[key] = 0;
    }
  }
}

// Preview-only transforms. Original geometry and dimensions are never rewritten.
export class AssemblyController {
  normals: Partial<Record<PartKey, [number, number, number]>> = {};
  private normal(key: PartKey): THREE.Vector3 {
    return new THREE.Vector3(...(this.normals[key] || ASSEMBLY_PARTS.find(part => part.key === key)!.normal));
  }
  readonly state = new AssemblyState();
  private enabled = false;
  private bindings = new Map<PartKey, THREE.Object3D[]>();
  private bases = new WeakMap<THREE.Object3D, THREE.Vector3>();
  private highlights: THREE.LineSegments[] = [];
  private arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.2, 0x1884e8, 0.04, 0.025);
  private ray = new THREE.Raycaster();
  private down?: { id: number; x: number; y: number; distance?: number; dx?: number; dy?: number };
  private root?: THREE.Object3D;
  private removers: (() => void)[] = [];
  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private canvas: HTMLElement,
    private orbit: { enabled: boolean }, private changed: () => void) {
    this.arrow.visible = false;
    this.arrow.traverse(node => {
      const material = (node as THREE.Mesh).material as THREE.Material | undefined;
      if (material) { material.depthTest = false; material.depthWrite = false; }
      node.renderOrder = 100;
    });
    this.scene.add(this.arrow);
    this.ray.params.Line = { threshold: 0.018 };
    for (const [type, listener] of [
      ['pointerdown', this.pointerDown], ['pointermove', this.pointerMove],
      ['pointerup', this.pointerUp], ['pointercancel', this.pointerCancel],
    ] as const) {
      canvas.addEventListener(type, listener, true);
      this.removers.push(() => canvas.removeEventListener(type, listener, true));
    }
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.cancelDrag();
    this.refreshHighlight();
    this.update();
  }
  bind(root: THREE.Object3D, nodes: THREE.Object3D[]): void {
    this.clearHighlight();
    this.root = root;
    this.bindings.clear();
    for (const node of nodes) {
      const key = assemblyPartKey(node.userData['plywoodPart'] || node.name);
      if (!key) continue;
      if (!this.bases.has(node)) {
        const saved = node.userData['assemblyBasePosition'];
        const base = Array.isArray(saved) ? new THREE.Vector3().fromArray(saved) : node.position.clone();
        this.bases.set(node, base);
        node.userData['assemblyBasePosition'] = base.toArray();
      }
      const list = this.bindings.get(key) || [];
      list.push(node); this.bindings.set(key, list);
    }
    this.apply();
    this.refreshHighlight();
    this.changed();
  }
  select(key: PartKey): void {
    if (!this.state.visible[key] || !this.bindings.has(key)) return;
    this.state.selected = key;
    this.refreshHighlight(); this.changed(); this.update();
  }
  move(mm: number): void {
    if (!this.state.selected) return;
    this.state.move(this.state.selected, mm); this.apply(); this.changed(); this.update();
  }
  setVisible(key: PartKey, visible: boolean): void {
    this.state.setVisible(key, visible); this.apply(); this.refreshHighlight(); this.changed(); this.update();
  }
  restore(key?: PartKey): void {
    this.state.restore(key); this.apply(); this.changed(); this.update();
  }
  has(key: PartKey): boolean { return this.bindings.has(key); }
  private apply(): void {
    for (const part of ASSEMBLY_PARTS) for (const node of this.bindings.get(part.key) || []) {
      node.position.copy(this.bases.get(node)!).addScaledVector(this.normal(part.key), this.state.offsets[part.key] / 1000);
      node.visible = this.state.visible[part.key] && !node.userData['assemblyHidden'];
    }
    this.root?.updateWorldMatrix(true, true);
  }
  update(): void {
    const key = this.state.selected;
    this.arrow.visible = !!(this.enabled && key && this.state.canMove(key) && this.bindings.has(key));
    if (!this.arrow.visible || !key || !this.root) return;
    this.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    for (const node of this.bindings.get(key) || []) if (node.visible) box.union(new THREE.Box3().setFromObject(node));
    this.arrow.position.copy(box.getCenter(new THREE.Vector3()));
    const normal = this.normal(key).transformDirection(this.root.matrixWorld);
    this.arrow.setDirection(normal);
    this.arrow.updateMatrixWorld(true);
  }
  private clearHighlight(): void {
    for (const line of this.highlights) { line.removeFromParent(); line.geometry.dispose(); (line.material as THREE.Material).dispose(); }
    this.highlights = [];
  }
  private refreshHighlight(): void {
    this.clearHighlight();
    if (!this.enabled || !this.state.selected) return;
    for (const node of this.bindings.get(this.state.selected) || []) node.traverseVisible(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 25), new THREE.LineBasicMaterial({ color: 0x1884e8, depthTest: false, depthWrite: false }));
      line.renderOrder = 99; child.add(line); this.highlights.push(line);
      // Rounded panels have no hard edges for EdgesGeometry. Keep their outer
      // envelope visible as well, so a selected panel is outlined at every radius.
      if (!/moulding/i.test(node.name)) {
        child.geometry.computeBoundingBox();
        const box = new THREE.Box3Helper(child.geometry.boundingBox!.clone(), 0x1884e8);
        (box.material as THREE.Material).depthTest = false;
        (box.material as THREE.Material).depthWrite = false;
        box.renderOrder = 99; child.add(box); this.highlights.push(box);
      }
    });
  }
  private cast(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2), this.camera);
    this.scene.updateMatrixWorld(true);
  }
  private pointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return;
    this.down = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.cast(event);
    if (!this.arrow.visible || !this.ray.intersectObject(this.arrow, true).length || !this.root || !this.state.selected) return;
    const normal = this.normal(this.state.selected).transformDirection(this.root.matrixWorld);
    const start = this.arrow.position.clone().project(this.camera), end = this.arrow.position.clone().addScaledVector(normal, 0.1).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    const dx = (end.x - start.x) * rect.width / 2, dy = -(end.y - start.y) * rect.height / 2;
    if (dx * dx + dy * dy < 16) return;
    Object.assign(this.down, { distance: this.state.offsets[this.state.selected], dx, dy });
    this.orbit.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault(); event.stopImmediatePropagation();
  };
  private pointerMove = (event: PointerEvent): void => {
    if (!this.down || this.down.id !== event.pointerId || this.down.distance === undefined) return;
    const { dx = 0, dy = 0 } = this.down;
    this.move(this.down.distance + ((event.clientX - this.down.x) * dx + (event.clientY - this.down.y) * dy) / (dx * dx + dy * dy) * 100);
    event.preventDefault(); event.stopImmediatePropagation();
  };
  private pointerUp = (event: PointerEvent): void => {
    const down = this.down;
    if (!down || down.id !== event.pointerId) return;
    if (down.distance !== undefined) {
      this.cancelDrag(); event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    this.down = undefined;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    this.cast(event);
    const candidates = [...this.bindings.entries()].filter(([key]) => this.state.visible[key]).flatMap(([, nodes]) => nodes.filter(node => node.visible));
    const hit = this.ray.intersectObjects(candidates, true).find(hit => hit.object instanceof THREE.Mesh);
    if (!hit) return;
    for (const [key, nodes] of this.bindings) if (nodes.some(node => {
      for (let parent: THREE.Object3D | null = hit.object; parent; parent = parent.parent) if (parent === node) return true;
      return false;
    })) { this.select(key); break; }
  };
  private pointerCancel = (): void => { this.cancelDrag(); };
  private cancelDrag(): void {
    if (this.down?.distance !== undefined && this.canvas.hasPointerCapture(this.down.id)) this.canvas.releasePointerCapture(this.down.id);
    this.down = undefined; this.orbit.enabled = true;
  }
  clear(): void {
    this.cancelDrag(); this.clearHighlight(); this.bindings.clear(); this.root = undefined;
    this.state.restore(); this.state.selected = null;
    for (const part of ASSEMBLY_PARTS) this.state.visible[part.key] = true;
    this.arrow.visible = false; this.changed();
  }
  dispose(): void {
    this.clear(); this.removers.forEach(remove => remove()); this.arrow.removeFromParent();
    this.arrow.dispose();
  }
}
