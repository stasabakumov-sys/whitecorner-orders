import * as THREE from 'three';
import { RoundingProfile } from './modeling-rounding';

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
