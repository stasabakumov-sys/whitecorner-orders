import * as THREE from 'three';

// M10 furniture bolts: smooth domed heads outside, square necks in the wheels,
// and nuts inside the bottom rails. Coordinates match the STEP axle holes.
export function fitFurnitureBolts(root: THREE.Object3D): void {
  for (const side of ['front', 'rear']) {
    const outside = side === 'front' ? .626 : -.028;
    const sign = side === 'front' ? 1 : -1;
    const parts = new Map<string, THREE.Mesh>();
    root.traverse(node => {
      if (node instanceof THREE.Mesh && node.name.toLowerCase().includes(`decorative_wheel_${side}`)) {
        if (/bolt_head$/i.test(node.name)) parts.set('head', node);
        else if (/M10_axle_bolt$/i.test(node.name)) parts.set('shaft', node);
        else if (/nut$/i.test(node.name)) parts.set('nut', node);
      }
    });
    const head = parts.get('head'), shaft = parts.get('shaft'), nut = parts.get('nut');
    if (!head || !shaft || !nut) continue;
    const cap = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(.012, 0),
      new THREE.Vector2(.012, .001), new THREE.Vector2(.011, .002),
      new THREE.Vector2(.009, .0035), new THREE.Vector2(.006, .0045),
      new THREE.Vector2(0, .005),
    ], 48);
    cap.rotateX(sign * Math.PI / 2); cap.translate(1.047, .2530002, outside);
    head.geometry.dispose(); head.geometry = cap;
    const oldNutCenter = side === 'front' ? .632 : -.032;
    const newNutCenter = side === 'front' ? .578 : .022;
    const nutGeometry = nut.geometry.clone().translate(0, 0, newNutCenter - oldNutCenter);
    nut.geometry.dispose(); nut.geometry = nutGeometry;
    const shaftGeometry = new THREE.CylinderGeometry(.005, .005, .052, 32);
    shaftGeometry.rotateX(Math.PI / 2);
    shaftGeometry.translate(1.047, .2530002, outside - sign * .026);
    shaft.geometry.dispose(); shaft.geometry = shaftGeometry;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(.010, .010, .006), head.material);
    neck.geometry.translate(1.047, .2530002, outside - sign * .003);
    neck.name = `Decorative_wheel_${side}_square_neck`;
    neck.userData['fixedMaterial'] = true;
    root.add(neck);
  }
}


export function shortenCastorBrakes(root: THREE.Object3D): void {
  const plates = new Map<string, number>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const match = /^(Caster_[LR]_(?:front|rear))_plate$/i.exec(node.name);
    if (!match) return;
    node.geometry.computeBoundingBox();
    plates.set(match[1].toLowerCase(), node.geometry.boundingBox!.getCenter(new THREE.Vector3()).z);
  });
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const match = /^(Caster_[LR]_(?:front|rear))_brake_(?:linkage|pedal)$/i.exec(node.name);
    if (!match) return;
    const center = plates.get(match[1].toLowerCase());
    if (center === undefined) return;
    const geometry = node.geometry.clone(), positions = geometry.getAttribute('position');
    const anchor = center + .006;
    const lengthScale = .65 * .8; // A further 20% reduction from the existing shortened brake.
    for (let i = 0; i < positions.count; i++) positions.setZ(i, anchor + (positions.getZ(i) - anchor) * lengthScale);
    positions.needsUpdate = true;
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    node.geometry.dispose(); node.geometry = geometry;
  });
}


// Centre the wheel itself beneath the fixed mounting plate and turn the running
// assembly with it. The protruding brake must not determine the centre.
export function turnCastorWheels(root: THREE.Object3D): void {
  const plates = new Map<string, THREE.Vector3>();
  const wheels = new Map<string, THREE.Vector3>();
  root.updateWorldMatrix(true, true);
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const match = /^(Caster[ _][LR][ _](?:front|rear))[ _]plate$/i.exec(node.name);
    if (match) plates.set(match[1].replaceAll(' ', '_').toLowerCase(), new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()));
    const wheel = /^(Caster[ _][LR][ _](?:front|rear))[ _](?:nylon[ _]wheel|rubber[ _]tire)$/i.exec(node.name);
    if (wheel) wheels.set(wheel[1].replaceAll(' ', '_').toLowerCase(), new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()));
  });
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const match = /^(Caster[ _][LR][ _](?:front|rear))[ _](.+)$/i.exec(node.name);
    if (!match || !/(?:wheel|tire|hub|fork|brake)/i.test(match[2])) return;
    const key = match[1].replaceAll(' ', '_').toLowerCase();
    const pivot = plates.get(key), wheel = wheels.get(key);
    if (!pivot || !wheel) return;
    const worldTurn = new THREE.Matrix4().makeTranslation(pivot.x, wheel.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(-wheel.x, -wheel.y, -wheel.z));
    const localTurn = node.matrixWorld.clone().invert().multiply(worldTurn).multiply(node.matrixWorld);
    const geometry = node.geometry.clone(); geometry.userData = { ...node.geometry.userData };
    geometry.applyMatrix4(localTurn); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    node.geometry.dispose(); node.geometry = geometry;
  });
}
