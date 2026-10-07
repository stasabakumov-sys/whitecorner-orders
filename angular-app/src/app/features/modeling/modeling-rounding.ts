import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export interface RoundingProfile {
  axis: 'x' | 'y' | 'z';
  origin: number;
  thickness: number;
  outline: number[][];
  holes: number[][][];
}

export interface PartJoint { axis: 'x' | 'y' | 'z'; plane: number; bounds: THREE.Box3; normal?: [number,number,number]; cap?: {axis: 'x'|'y'|'z';min:number;max:number}; }

// STEP roof members meet on planar faces. Detect shared faces before rounding,
// while excluding overlaps, edges and separate parts.
export function matingPartJoints(parts: { name: string; bounds: THREE.Box3; profile?: RoundingProfile }[]): Map<string, PartJoint[]> {
  const joints = new Map<string, PartJoint[]>();
  const axes = ['x', 'y', 'z'] as const;
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    // Parts in one panel share both their outline seam and their flat face.
    // Closing only the seam plane leaves the extrusion bevel as a visible groove.
    const family=(name:string)=>/^(Front[ _]part|(?:Left|Right)[ _]side[ _]?|Top[ _](?:part)?|(?:Buttom|Bottom)[ _](?:part)?)\d+$/i.exec(name.trim())?.[1].toLowerCase().replace(/[ _]/g,'').replace('buttom','bottom');
    if(family(a.name)&&family(a.name)===family(b.name)&&a.profile&&b.profile&&a.profile.axis===b.profile.axis&&Math.abs(a.profile.origin-b.profile.origin)<1e-6){
      const ap=a.profile,bp=b.profile,near=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
      const world=(p:number[],depth:number)=>ap.axis==='x'?new THREE.Vector3(depth,p[1],p[0]):ap.axis==='y'?new THREE.Vector3(p[0],depth,p[1]):new THREE.Vector3(p[0],p[1],depth);
      for(let ai=0;ai<ap.outline.length;ai++)for(let bi=0;bi<bp.outline.length;bi++){
        const a0=ap.outline[ai],a1=ap.outline[(ai+1)%ap.outline.length],b0=bp.outline[bi],b1=bp.outline[(bi+1)%bp.outline.length];
        if(!((near(a0,b0)&&near(a1,b1))||(near(a0,b1)&&near(a1,b0))))continue;
        const du=a1[0]-a0[0],dv=a1[1]-a0[1];if(Math.hypot(du,dv)<1e-7)continue;
        const normal=(ap.axis==='x'?new THREE.Vector3(0,-du,dv):ap.axis==='y'?new THREE.Vector3(dv,0,-du):new THREE.Vector3(dv,-du,0)).normalize();
        const max=ap.origin+Math.min(ap.thickness,bp.thickness),bounds=new THREE.Box3().setFromPoints([world(a0,ap.origin),world(a1,ap.origin),world(a0,max),world(a1,max)]);
        const joint:PartJoint={axis:ap.axis,normal:normal.toArray() as [number,number,number],plane:normal.dot(world(a0,ap.origin)),bounds,cap:{axis:ap.axis,min:ap.origin,max}};
        for(const part of [a,b])joints.set(part.name,[...(joints.get(part.name)||[]),joint]);
      }
    }
    const roof = /^Roof[ _]/i.test(a.name) && /^Roof[ _]/i.test(b.name);
    const shaker = /^Front[ _]part[12]$/i.test(a.name) && /^Front[ _]part[12]$/i.test(b.name);
    // MDF body panels and their inner reinforcement rails meet on square faces.
    // Rounding the two mating faces independently opens a visible light slit.
    const bodyPanel = (name: string) => /^Front[ _]part\d+\)?$/i.test(name.trim()) || /^(Left|Right)[ _]side[ _]?[12]$/i.test(name.trim());
    const body = bodyPanel(a.name) && bodyPanel(b.name);
    const borderFamily = (name:string) => /^(Top|Buttom|Bottom)[ _](?:part)?\d+$/i.exec(name)?.[1].toLowerCase().replace('buttom','bottom');
    const border=borderFamily(a.name)&&borderFamily(a.name)===borderFamily(b.name);
    if (!roof && !shaker && !body && !border) continue;
    for (const axis of axes) {
      const others = axes.filter(value => value !== axis);
      if (!others.every(value => Math.min(a.bounds.max[value], b.bounds.max[value]) - Math.max(a.bounds.min[value], b.bounds.min[value]) > 1e-5)) continue;
      let plane: number | undefined;
      if (Math.abs(a.bounds.max[axis] - b.bounds.min[axis]) < 1e-5) plane = a.bounds.max[axis];
      else if (Math.abs(b.bounds.max[axis] - a.bounds.min[axis]) < 1e-5) plane = b.bounds.max[axis];
      if (plane === undefined) continue;
      const bounds = new THREE.Box3(a.bounds.min.clone().max(b.bounds.min), a.bounds.max.clone().min(b.bounds.max));
      bounds.min[axis] = bounds.max[axis] = plane;
      for (const part of [a, b]) joints.set(part.name, [...(joints.get(part.name) || []), { axis, plane, bounds }]);
    }
  }
  return joints;
}

export function keepPartJointsSquare(geometry: THREE.BufferGeometry, joints: PartJoint[], radiusMm: number): void {
  if (!joints.length) return;
  const positions = geometry.getAttribute('position');
  const tolerance = radiusMm / 1000 * 2 + 1e-6;
  const changed = new Set<number>();
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, i);
    for (const joint of joints) {
      const normal=joint.normal?new THREE.Vector3(...joint.normal):null;
      const distance=normal?point.dot(normal)-joint.plane:point[joint.axis]-joint.plane;
      if (Math.abs(distance) > tolerance) continue;
      if (!(['x', 'y', 'z'] as const).filter(axis => normal || axis !== joint.axis).every(axis =>
        point[axis] >= joint.bounds.min[axis] - tolerance && point[axis] <= joint.bounds.max[axis] + tolerance)) continue;
      if(normal)point.addScaledVector(normal,-distance);else point[joint.axis] = joint.plane;
      if(joint.cap){const cap=joint.cap;point[cap.axis]=point[cap.axis]<(cap.min+cap.max)/2?cap.min:cap.max;}
      positions.setXYZ(i, point.x, point.y, point.z);
      changed.add(Math.floor(i / 3));
    }
  }
  if (!changed.size) return;
  const originalNormals = geometry.getAttribute('normal').clone();
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) if (!changed.has(Math.floor(i / 3))) {
    normals.setXYZ(i, originalNormals.getX(i), originalNormals.getY(i), originalNormals.getZ(i));
  }
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
  if (!(r >= 0 && r * 2 < profile.thickness) || profile.outline.length < 3) throw new Error('Недопустимый радиус скругления детали.');
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
    depth: profile.thickness - r * 2, steps: 1, bevelEnabled: r > 0,
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
