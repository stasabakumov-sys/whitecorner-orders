import * as THREE from 'three';
import { createRoundedPart, RoundingProfile } from './modeling-rounding';

export const CLASSIC_MDF_SLUG = 'classic-bar-mdf';
export const CLASSIC_MDF_NAME = 'Collapsible Mobile Bar "Classic" - Mobile Food Service - Event Bar Cart';

const near = (a: number, b: number) => Math.abs(a - b) < 0.00001;

function xAt(name: string, x: number): number {
  if (near(x, 0) || near(x, 1.2)) return x;
  if (/^Buttom[ _]part1$/i.test(name) && x > .05 && x < 1.15) return x;
  return x < .6 ? x - .003 : x > .6 ? x + .003 : x;
}

function zAt(name: string, z: number): number {
  if (near(z, 0) || near(z, .6)) return z;
  // Caster mounting holes in the bottom sheet remain registered with the
  // unchanged wheel plates. Only its perimeter expands into the 16 mm rim.
  if (/^Buttom[ _]part1$/i.test(name) && z > .05 && z < .55) return z;
  const anchors: [number, number][] = [[0, 0], [.019, .016], [.034, .032], [.116, .114], [.3, .3], [.581, .584], [.6, .6]];
  for (let i = 1; i < anchors.length; i++) {
    const [oldEnd, newEnd] = anchors[i], [oldStart, newStart] = anchors[i - 1];
    if (z <= oldEnd + .000001) return newStart + (z - oldStart) * (newEnd - newStart) / (oldEnd - oldStart);
  }
  return z;
}

function yAt(name: string, y: number): number {
  if (/^Top[ _]part2$/i.test(name)) return .855 + (y - .858) * 45 / 42;
  if (/^Buttom[ _]part2$/i.test(name)) return .095 + (y - .095) * 45 / 42;
  if (/^Top[ _]part1$/i.test(name)) return .884 + (y - .885) * 16 / 15;
  if (/^Buttom[ _]part1$/i.test(name)) return .095 + (y - .095) * 16 / 15;
  if (/^Shelf$/i.test(name)) return .49 + (y - .49) * 16 / 15;
  return .111 + (y - .11) * (.884 - .111) / (.885 - .11);
}

function profileAt(name: string, profile: RoundingProfile): RoundingProfile {
  const transform = ([a, b]: number[]): number[] => profile.axis === 'y' ? [xAt(name, a), zAt(name, b)]
    : profile.axis === 'x' ? [zAt(name, a), yAt(name, b)] : [xAt(name, a), yAt(name, b)];
  const axis = profile.axis === 'y' ? yAt : profile.axis === 'x' ? xAt : zAt;
  const origin = axis(name, profile.origin);
  return { ...profile, origin, thickness: axis(name, profile.origin + profile.thickness) - origin,
    outline: profile.outline.map(transform), holes: profile.holes.map(hole => hole.map(transform)) };
}

// The private plywood GLB supplies the joints, caster hardware and folding
// construction. This conversion changes the actual cut surfaces and their CAD
// profiles; it does not scale the whole model or merely swap its finish.
export function prepareClassicMdfSource(scene: THREE.Group): void {
  for (const part of scene.children) {
    const name = part.name;
    if (/^Caster[ _]/i.test(name)) continue;
    part.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const positions = node.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) positions.setXYZ(i,
        xAt(name, positions.getX(i)), yAt(name, positions.getY(i)), zAt(name, positions.getZ(i)));
      positions.needsUpdate = true;
      node.geometry.computeVertexNormals();
      node.geometry.computeBoundingBox();
      node.geometry.computeBoundingSphere();
      const profile = node.userData['roundingProfile'] as RoundingProfile | undefined;
      if (profile) {
        const next = profileAt(name, profile);
        node.userData['roundingProfile'] = next;
        if (/^(?:Top[ _]part1|Front[ _]part1|Shelf)$/i.test(name)) {
          node.geometry.dispose();
          node.geometry = createRoundedPart(next, 0);
        }
      }
      // The plywood GLB carries wood maps on its face, edge and trim. The MDF
      // variant starts with clean material slots, then the editor applies the
      // selected MDF paint or oak top independently.
      const clean = (material:THREE.Material) => {
        const m = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, roughness: .85 });
        m.name = material.name;
        return m;
      };
      node.material = Array.isArray(node.material) ? node.material.map(clean) : clean(node.material);
    });
  }
}
