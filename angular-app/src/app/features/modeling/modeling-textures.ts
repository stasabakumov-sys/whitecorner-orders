import * as THREE from 'three';

// Select a clear section of the supplied pine photograph. Grain runs along V;
// the section avoids the large knots near the ends of the original photograph.
export function pineWoodUv(cross: number, along: number): [number, number] {
  const across = ((cross / 0.6) % 1 + 1) % 1;
  return [0.72 + across * 0.16, 0.12 + along * 0.22];
}
// The oak photograph has vertical grain. On horizontal panels V follows X;
// preserve the physical grain scale as the tabletop gets longer.
export function addTopFinishUvs(geometry: THREE.BufferGeometry, turnGrain = false): void {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2), edge = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const across = Math.abs(normal.getY(i)) > .5 ? z : y;
    const along = Math.abs(normal.getX(i)) > .5 ? z : x;
    // Turn oak grain vertically on the roof-post sockets below the tabletop.
    uv[i * 2] = turnGrain ? along : across; uv[i * 2 + 1] = turnGrain ? -across : along;
    edge[i * 2] = along / .12; edge[i * 2 + 1] = y / .12;
  }
  geometry.setAttribute('uv2', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('uv3', new THREE.BufferAttribute(edge, 2));
}

export function groupTopFacesAndEdges(geometry: THREE.BufferGeometry): void {
  if (geometry.userData['topFinishGroups']) return;
  const normal = geometry.getAttribute('normal'), index = geometry.getIndex();
  geometry.clearGroups();
  const count = index?.count || normal.count;
  for (let i = 0; i < count; i += 3) {
    const vertex = index ? index.getX(i) : i;
    const material = Math.abs(normal.getY(vertex)) > .5 ? 0 : 1;
    const last = geometry.groups[geometry.groups.length - 1];
    if (last && last.materialIndex === material) last.count += 3;
    else geometry.addGroup(i, 3, material);
  }
  geometry.userData['topFinishGroups'] = true;
}
