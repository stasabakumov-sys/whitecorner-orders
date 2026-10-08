import * as THREE from 'three';
import { RoundingProfile } from './modeling-rounding';

// Reuse the two source bottom rails on either side of the upright divider.
// Bake the translation into their geometry/profile before dimension mapping,
// so the upper pair follows the ice shelf at every supported table height.
export function prepareIceShelfSupports(scene: THREE.Group): void {
  const shelf = scene.children.find(node => /^Ice[ _]shelf[ _]4$/i.test(node.name));
  if (!shelf) return;
  const underside = new THREE.Box3().setFromObject(shelf).min.y;
  for (const index of [1, 2]) {
    const name = `Ice shelf ${index + 4}`;
    if (scene.children.some(node => new RegExp(`^Ice[ _]shelf[ _]${index + 4}$`, 'i').test(node.name))) continue;
    const source = scene.children.find(node => new RegExp(`^Ice[ _]shelf[ _]${index}$`, 'i').test(node.name));
    if (!source) throw new Error('The Ice shelf source is missing a divider support rail.');
    const lift = underside - new THREE.Box3().setFromObject(source).max.y;
    const upper = source.clone(true);
    upper.name = name;
    upper.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry = node.geometry.clone().translate(0, lift, 0);
      node.userData['plywoodPart'] = name;
      const profile = node.userData['roundingProfile'] as RoundingProfile | undefined;
      if (profile) {
        const move = (point: number[]) => [point[0], point[1] + lift];
        node.userData['roundingProfile'] = profile.axis === 'y'
          ? { ...profile, origin: profile.origin + lift }
          : { ...profile, outline: profile.outline.map(move), holes: profile.holes.map(hole => hole.map(move)) };
      }
    });
    scene.add(upper);
  }
}

// The vertical ice-storage divider passes through the middle shelf. Build the
// shelf from one panel without it, or from panels on either side of it.
export function shelfProfilesForIceShelf(shelf: THREE.Box3, iceDividers: THREE.Box3[], includeIceShelf: boolean): RoundingProfile[] {
  const cuts = includeIceShelf ? iceDividers
    .filter(box => box.min.y < shelf.max.y && box.max.y > shelf.min.y
      && box.min.z <= shelf.min.z + .002 && box.max.z >= shelf.max.z - .002
      && box.max.x > shelf.min.x && box.min.x < shelf.max.x)
    .map(box => [Math.max(shelf.min.x, box.min.x), Math.min(shelf.max.x, box.max.x)] as const)
    .sort((a, b) => a[0] - b[0]) : [];
  const spans: [number, number][] = [];
  let start = shelf.min.x;
  for (const [cutStart, cutEnd] of cuts) {
    if (cutStart > start + 1e-5) spans.push([start, cutStart]);
    start = Math.max(start, cutEnd);
  }
  if (shelf.max.x > start + 1e-5) spans.push([start, shelf.max.x]);
  return spans.map(([left, right]) => ({axis: 'y', origin: shelf.min.y,
    thickness: shelf.max.y - shelf.min.y,
    outline: [[left, shelf.min.z], [right, shelf.min.z], [right, shelf.max.z], [left, shelf.max.z]], holes: []}));
}
