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
