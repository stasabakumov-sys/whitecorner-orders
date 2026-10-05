import * as THREE from 'three';

export function hangingGlassLayout(diameterMm: number, rackLimitMm: number | null) {
  const diameter = Math.max(60, Math.min(160, Math.round(diameterMm / 5) * 5));
  const fits = rackLimitMm === null || diameter <= rackLimitMm;
  const spacing = Math.max(diameter, 70) + 4;
  const count = fits ? Math.floor(320 / spacing) : 0;
  const pitch = spacing / 1000;
  return { diameter, count, positions: Array.from({ length: count }, (_, i) => .03 + (i - (count - 1) / 2) * pitch) };
}

// Inverted wine glass: a 70 mm foot rests above the rods; its stem passes
// through the slot. The hollow bowl and open rim are modelled as a thin shell.
export function createHangingGlass(diameterMm: number, environment: THREE.Texture | null): THREE.Group {
  const group = new THREE.Group(), radius = diameterMm / 2000;
  const material = new THREE.MeshPhysicalMaterial({ color: '#f2f9fb', transparent: true, opacity: .22,
    roughness: .07, metalness: 0, clearcoat: 1, clearcoatRoughness: .08,
    envMap: environment, envMapIntensity: .6, depthWrite: false, side: THREE.DoubleSide });
  const add = (geometry: THREE.BufferGeometry, y: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y;
    mesh.userData['fixedMaterial'] = true; group.add(mesh);
  };
  add(new THREE.CylinderGeometry(.035, .035, .003, 32), .0015);
  add(new THREE.CylinderGeometry(.0025, .003, .079, 16), -.0395);
  const profile = [new THREE.Vector2(.003, -.078), new THREE.Vector2(radius*.30, -.089),
    new THREE.Vector2(radius*.74, -.112), new THREE.Vector2(radius, -.145),
    new THREE.Vector2(radius*.95, -.184), new THREE.Vector2(radius*.91, -.185),
    new THREE.Vector2(radius*.96, -.145), new THREE.Vector2(radius*.70, -.113),
    new THREE.Vector2(radius*.27, -.090), new THREE.Vector2(.002, -.080)];
  add(new THREE.LatheGeometry(profile, 32), 0);
  return group;
}
