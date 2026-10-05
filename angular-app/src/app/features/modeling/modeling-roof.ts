import * as THREE from 'three';
// Fit inside the existing roof skirt; its lower edge and overall height stay fixed.
export function createRoofBottom(skirt: THREE.Box3, posts: THREE.Box3[]): THREE.BufferGeometry {
  const rectangle = (path: THREE.Path, x0: number, z0: number, x1: number, z1: number) => {
    path.moveTo(x0, z0); path.lineTo(x1, z0); path.lineTo(x1, z1); path.lineTo(x0, z1); path.closePath();
  };
  const shape = new THREE.Shape();
  rectangle(shape, skirt.min.x, skirt.min.z, skirt.max.x, skirt.max.z);
  for (const post of posts) {
    const hole = new THREE.Path();
    rectangle(hole, post.min.x, post.min.z, post.max.x, post.max.z);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, skirt.min.y + .012, 0);
  geometry.clearGroups(); geometry.addGroup(0, geometry.getAttribute('position').count, 0);
  geometry.computeBoundingBox();
  return geometry;
}
export function glassRackLayout(lengthMm: number, count: number) {
  const available = lengthMm - 240, maximum = Math.floor(available / 105);
  const quantity = Math.max(0, Math.min(maximum, Math.floor(count)));
  const pitch = quantity > 1 ? (available - 105) / (quantity - 1) : null;
  const centres = Array.from({length: quantity}, (_, i) => quantity === 1 ? lengthMm / 2 : 172.5 + i * pitch!);
  return { maximum, centres, pitch, gap: pitch === null ? null : pitch - 105, bowlDiameter: pitch === null ? null : pitch - 4 };
}
// Reference envelope: 70 H × 105 W × 406 D mm. Rod diameter and stem slot
// are visual estimates from the photos, rather than supplied manufacturing dimensions.
export function createGlassRack(): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({color: '#c5c9cc', metalness: .8, roughness: .28});
  const add = (geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, metal); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData['fixedMaterial'] = true;
    group.add(mesh); return mesh;
  };
  for (const end of [-1, 1]) {
    add(new THREE.BoxGeometry(.105, .002, .012), 0, -.001, end * .197);
    for (const x of [-.038, .038]) {
      add(new THREE.CylinderGeometry(.004, .004, .002, 12), x, -.003, end * .197);
    }
  }
  for (const side of [-1, 1]) {
    const points = [new THREE.Vector3(side*.04,-.002,-.197),new THREE.Vector3(side*.04,-.025,-.2015),new THREE.Vector3(side*.017,-.067,-.15),new THREE.Vector3(side*.017,-.0685,.19),new THREE.Vector3(side*.017,-.062,.2015),new THREE.Vector3(side*.017,-.002,.197)];
    const curve = new THREE.CurvePath<THREE.Vector3>();
    let previous = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      const corner = points[i], before = corner.clone().addScaledVector(points[i - 1].clone().sub(corner).normalize(), .003);
      const after = corner.clone().addScaledVector(points[i + 1].clone().sub(corner).normalize(), .003);
      curve.add(new THREE.LineCurve3(previous, before));
      curve.add(new THREE.QuadraticBezierCurve3(before, corner, after)); previous = after;
    }
    curve.add(new THREE.LineCurve3(previous, points[points.length - 1]));
    add(new THREE.TubeGeometry(curve, 80, .0015, 8, false));
  }
  return group;
}
