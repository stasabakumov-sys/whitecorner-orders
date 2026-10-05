import * as THREE from 'three';

// Decorative pine panel mould, 31 mm wide and 15 mm deep. The curved face is
// approximated from the supplied reference; the four rails meet at mitres.
export function createFrontMoulding(lengthMm: number, heightMm: number,
  placement = { panelLeft: 0.019, panelBottom: 0.11, panelTopInset: 0.015, front: 0.019, direction: -1 }): THREE.BufferGeometry {
  const left = placement.panelLeft + 0.09, right = lengthMm / 1000 - placement.panelLeft - 0.09;
  const bottom = placement.panelBottom + 0.09, top = heightMm / 1000 - placement.panelTopInset - 0.09;
  const profile = new THREE.Shape();
  profile.moveTo(0, 0); profile.lineTo(0, 0.007);
  profile.lineTo(0.003, 0.007); profile.lineTo(0.003, 0.009);
  profile.bezierCurveTo(0.003, 0.014, 0.009, 0.015, 0.01, 0.01);
  profile.bezierCurveTo(0.012, 0.003, 0.022, 0.003, 0.023, 0.01);
  profile.bezierCurveTo(0.024, 0.015, 0.031, 0.016, 0.031, 0.011);
  profile.lineTo(0.031, 0); profile.closePath();
  // Mirror across the width: the stepped lip faces the opening of the frame.
  // Reverse the contour too so the outward face winding stays unchanged.
  const points = profile.getPoints(48).map(point => new THREE.Vector2(0.031 - point.x, point.y)).reverse();
  const positions: number[] = [], uv: number[] = [], normals: number[] = [];
  const ring = (point: THREE.Vector2) => [
    [left + point.x, bottom + point.x, placement.front + placement.direction * point.y],
    [right - point.x, bottom + point.x, placement.front + placement.direction * point.y],
    [right - point.x, top - point.x, placement.front + placement.direction * point.y],
    [left + point.x, top - point.x, placement.front + placement.direction * point.y],
  ];
  const faceNormals = points.slice(0, -1).map((point, i) => {
    const a = ring(point), b = ring(points[i + 1]);
    return a.map((vertex, side) => {
      const origin = new THREE.Vector3(...vertex);
      const along = new THREE.Vector3(...a[(side + 1) % 4]).sub(origin);
      return along.cross(new THREE.Vector3(...b[(side + 1) % 4]).sub(origin)).normalize();
    });
  });
  const smoothNormal = (face: THREE.Vector3, neighbour?: THREE.Vector3) =>
    neighbour && face.dot(neighbour) > 0.9 ? face.clone().add(neighbour).normalize() : face;
  for (let i = 0; i < points.length - 1; i++) {
    const a = ring(points[i]), b = ring(points[i + 1]);
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      const startNormal = smoothNormal(faceNormals[i][side], faceNormals[i - 1]?.[side]);
      const endNormal = smoothNormal(faceNormals[i][side], faceNormals[i + 1]?.[side]);
      const vertices = [a[side], a[next], b[next], a[side], b[next], b[side]];
      for (const [index, vertex] of vertices.entries()) {
        positions.push(...vertex);
        // Width across the contour, rather than its changing depth: depth-based
        // UVs fold back on every bead and turn straight grain into repeated waves.
        const width = index === 0 || index === 1 || index === 3 ? points[i].x : points[i + 1].x;
        uv.push(0.72 + width / 0.031 * 0.16, 0.12 + (side % 2 ? vertex[1] : vertex[0]) * 0.22);
        normals.push(...(index === 0 || index === 1 || index === 3 ? startNormal : endNormal).toArray());
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
