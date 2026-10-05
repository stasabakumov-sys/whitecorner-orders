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
// through the slot. The curved bowl is a hollow 1 mm shell with an open rim.
export function createHangingGlass(diameterMm: number, environment: THREE.Texture | null): THREE.Group {
  const group = new THREE.Group(), radius = diameterMm / 2000;
  const material = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 1,
    transmission: .98, thickness: .001, ior: 1.46, roughness: .045, metalness: 0,
    envMap: environment, envMapIntensity: .8, depthWrite: false, side: THREE.FrontSide });
  const add = (geometry: THREE.BufferGeometry, y: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y;
    mesh.userData['fixedMaterial'] = true; group.add(mesh);
  };
  const foot = [[0,0],[.031,0],[.0345,.0004],[.035,.001],
    [.035,.002],[.0345,.0026],[.031,.003],[.003,.003],[0,.003]];
  add(new THREE.LatheGeometry(foot.map(([x,y]) => new THREE.Vector2(x,y)), 48), 0);
  add(new THREE.CylinderGeometry(.0025, .003, .079, 32), -.0395);
  const point = (x: number, y: number) => new THREE.Vector2(x, y);
  const outerNeck = point(.003, -.078), outerWide = point(radius, -.135), outerRim = point(radius*.72, -.185);
  const innerRim = point(radius*.72-.001, -.185), innerWide = point(radius-.001, -.135), innerNeck = point(.002, -.079);
  const curves = [
    new THREE.CubicBezierCurve(outerNeck, point(.012,-.088), point(radius,-.103), outerWide),
    new THREE.CubicBezierCurve(outerWide, point(radius,-.15), point(radius*.82,-.175), outerRim),
    new THREE.LineCurve(outerRim, innerRim),
    new THREE.CubicBezierCurve(innerRim, point(radius*.82-.001,-.175), point(radius-.001,-.15), innerWide),
    new THREE.CubicBezierCurve(innerWide, point(radius-.001,-.103), point(.011,-.089), innerNeck),
    new THREE.LineCurve(innerNeck, outerNeck),
  ];
  const profile = curves.flatMap((curve, i) => curve.getPoints(12).slice(i ? 1 : 0));
  add(new THREE.LatheGeometry(profile.reverse(), 48), 0);
  return group;
}
