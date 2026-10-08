import { expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareTwoInOneCartSource } from './modeling-two-in-one';
import { resizeSideShelfCartPosition } from './modeling-geometry';

it('derives only the plain 1200 mm cart from the private 1500 mm construction source', () => {
  const scene = new THREE.Group();
  for (const name of ['Top_part1', 'Top_part1_cutouts', 'Top_part1_cutout_plug_1', 'Ice_shelf_4', 'Shelf', 'Side_shelf_left_1', 'Side_shelf_right_1', 'Caster_R_front_plate']) {
    const part = new THREE.Object3D(); part.name = name; scene.add(part);
  }
  prepareTwoInOneCartSource(scene);
  expect(scene.children.map(part => part.name)).toEqual(['Top_part1', 'Ice_shelf_4', 'Shelf', 'Side_shelf_left_1', 'Side_shelf_right_1', 'Caster_R_front_plate']);
  expect(resizeSideShelfCartPosition('Side_shelf_right_1', 1.7, .85, 0, 1200, 850)[0]).toBeCloseTo(1.4);
  expect(resizeSideShelfCartPosition('Top_part1', 1.5, .85, 0, 1200, 850)[0]).toBeCloseTo(1.2);
});
