import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export interface RoundingProfile {
  axis: 'x' | 'y' | 'z';
  origin: number;
  thickness: number;
  outline: number[][];
  holes: number[][][];
}

// Round the planar corners before beveling the extrusion, retaining the STEP
// outline, cut-outs and the original outside dimensions.
function roundedPath(points: THREE.Vector2[], radius: number, path: THREE.Path): void {
  for (let i = 0; i < points.length; i++) {
    const p = points[i], before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
    const incoming = p.clone().sub(before), outgoing = after.clone().sub(p);
    const a = incoming.length(), b = outgoing.length();
    incoming.normalize(); outgoing.normalize();
    const turn = Math.atan2(incoming.cross(outgoing), incoming.dot(outgoing));
    if (Math.abs(turn) < 0.1) {
      if (i === 0) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y);
      continue;
    }
    const tangent = Math.tan(Math.abs(turn) / 2);
    const distance = Math.min(radius * tangent, a * 0.45, b * 0.45);
    const first = p.clone().addScaledVector(incoming, -distance);
    if (i === 0) path.moveTo(first.x, first.y); else path.lineTo(first.x, first.y);
    if (tangent < 0.0001 || distance < 1e-8) { path.lineTo(p.x, p.y); continue; }
    const r = distance / tangent;
    const center = first.clone().addScaledVector(new THREE.Vector2(-incoming.y, incoming.x), Math.sign(turn) * r);
    const last = p.clone().addScaledVector(outgoing, distance);
    path.absarc(center.x, center.y, r, Math.atan2(first.y - center.y, first.x - center.x), Math.atan2(last.y - center.y, last.x - center.x), turn < 0);
  }
  path.closePath();
}

export function createRoundedPart(profile: RoundingProfile, radiusMm: number): THREE.BufferGeometry {
  const r = radiusMm / 1000;
  if (!(r > 0 && r * 2 < profile.thickness) || profile.outline.length < 3) throw new Error('Недопустимый радиус скругления детали.');
  const points = (outline: number[][]) => outline.map(([u, v]) => new THREE.Vector2(profile.axis === 'x' ? -u : u, profile.axis === 'y' ? -v : v));
  const shape = new THREE.Shape();
  roundedPath(points(profile.outline), r, shape);
  for (const outline of profile.holes) {
    const hole = new THREE.Path();
    // CAD circles contain hundreds of nearly coincident samples. Retain sharp
    // corners, while sampling circular cut-outs to within 0.02 mm of the source.
    const source = points(outline);
    const reduced: THREE.Vector2[] = [];
    for (let i = 0; i < source.length; i++) {
      const p = source[i], before = source[(i + source.length - 1) % source.length], after = source[(i + 1) % source.length];
      const a = p.clone().sub(before).normalize(), b = after.clone().sub(p).normalize();
      if (!reduced.length || Math.abs(Math.atan2(a.cross(b), a.dot(b))) > 0.1 || p.distanceTo(reduced[reduced.length - 1]) >= 0.0005) reduced.push(p);
    }
    roundedPath(reduced.length >= 3 ? reduced : source, r, hole);
    shape.holes.push(hole);
  }
  const extrusion = new THREE.ExtrudeGeometry(shape, {
    depth: profile.thickness - r * 2, steps: 1, bevelEnabled: true,
    bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 6, curveSegments: 3,
  });
  extrusion.deleteAttribute('normal'); extrusion.deleteAttribute('uv');
  const merged = mergeVertices(extrusion, 1e-7);
  merged.computeVertexNormals();
  const geometry = merged.toNonIndexed();
  extrusion.dispose(); merged.dispose();
  if (profile.axis === 'y') { geometry.rotateX(-Math.PI / 2); geometry.translate(0, profile.origin + r, 0); }
  else if (profile.axis === 'x') { geometry.rotateY(Math.PI / 2); geometry.translate(profile.origin + r, 0, 0); }
  else geometry.translate(0, 0, profile.origin + r);
  geometry.userData['plywoodFacesAndEdges'] = true;
  return geometry;
}

// Pine borders surround the panel. Their inner faces must remain square so
// the tabletop and bottom panel meet them without a rounded groove or gap.
export function keepTrimJointSquare(geometry: THREE.BufferGeometry, profile: RoundingProfile, radiusMm: number): void {
  if (profile.axis !== 'y' || profile.holes.length !== 1) return;
  const hole = profile.holes[0];
  const left = Math.min(...hole.map(p => p[0])), right = Math.max(...hole.map(p => p[0]));
  const front = Math.min(...hole.map(p => p[1])), rear = Math.max(...hole.map(p => p[1]));
  const tolerance = radiusMm / 1000 * 2 + 1e-6;
  const positions = geometry.getAttribute('position');
  const changed = new Set<number>();
  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i), z = positions.getZ(i);
    let adjusted = false;
    if (z >= front - tolerance && z <= rear + tolerance) {
      if (Math.abs(x - left) <= tolerance) { x = left; adjusted = true; }
      else if (Math.abs(x - right) <= tolerance) { x = right; adjusted = true; }
    }
    if (x >= left - tolerance && x <= right + tolerance) {
      if (Math.abs(z - front) <= tolerance) { z = front; adjusted = true; }
      else if (Math.abs(z - rear) <= tolerance) { z = rear; adjusted = true; }
    }
    if (adjusted) {
      positions.setXYZ(i, x, positions.getY(i), z);
      changed.add(Math.floor(i / 3));
    }
  }
  const originalNormals = geometry.getAttribute('normal').clone();
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    if (!changed.has(Math.floor(i / 3))) normals.setXYZ(i, originalNormals.getX(i), originalNormals.getY(i), originalNormals.getZ(i));
  }
}
