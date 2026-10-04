import * as THREE from 'three';

// Decorative pine panel mould, 31 mm wide and 15 mm deep. The curved face is
// approximated from the supplied reference; the four rails meet at mitres.
export function createFrontMoulding(lengthMm: number, heightMm: number): THREE.BufferGeometry {
  const left = 0.019 + 0.09, right = lengthMm / 1000 - 0.019 - 0.09;
  const bottom = 0.11 + 0.09, top = heightMm / 1000 - 0.015 - 0.09;
  const profile = new THREE.Shape();
  profile.moveTo(0, 0); profile.lineTo(0, 0.007);
  profile.lineTo(0.003, 0.007); profile.lineTo(0.003, 0.009);
  profile.bezierCurveTo(0.003, 0.014, 0.009, 0.015, 0.01, 0.01);
  profile.bezierCurveTo(0.012, 0.003, 0.022, 0.003, 0.023, 0.01);
  profile.bezierCurveTo(0.024, 0.015, 0.031, 0.016, 0.031, 0.011);
  profile.lineTo(0.031, 0); profile.closePath();
  const points = profile.getPoints(12);
  const positions: number[] = [], uv: number[] = [];
  const ring = (point: THREE.Vector2) => [
    [left + point.x, bottom + point.x, 0.019 - point.y],
    [right - point.x, bottom + point.x, 0.019 - point.y],
    [right - point.x, top - point.x, 0.019 - point.y],
    [left + point.x, top - point.x, 0.019 - point.y],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const a = ring(points[i]), b = ring(points[i + 1]);
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      for (const vertex of [a[side], a[next], b[next], a[side], b[next], b[side]]) {
        positions.push(...vertex);
        uv.push((side % 2 ? vertex[1] : vertex[0]) / 1.2, -vertex[2] / 0.6);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
