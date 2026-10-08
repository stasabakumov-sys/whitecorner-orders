import { expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareRooflessCartSource, rooflessCartPartIncluded } from './modeling-roofless';

it('keeps the lower legs and wheels, but removes roof, posts and tabletop post holders', () => {
  for (const name of ['Roof 1', 'Roof_9', 'Roof_5_', 'Dar1', 'Dar 4', 'Top 3', 'Top_6']) expect(rooflessCartPartIncluded(name)).toBe(false);
  for (const name of ['Top 1', 'Top 2', 'Front part1', 'Shelf', 'Legs 1', 'Legs_4', 'Decorative wheel front', 'Caster L front plate']) expect(rooflessCartPartIncluded(name)).toBe(true);
});

it('closes roof post holes in the tabletop profile', () => {
  const scene = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, .016, .5), new THREE.MeshStandardMaterial());
  top.name = 'Top 1';
  top.userData['roundingProfile'] = {axis:'y',origin:.884,thickness:.016,outline:[[0,0],[1,0],[1,.5],[0,.5]],holes:[[[.1,.1],[.2,.1],[.2,.2],[.1,.2]]]};
  scene.add(top);
  for (const name of ['Roof_5_', 'Dar_4', 'Top_3', 'Legs_1', 'Caster_L_front_plate']) {
    const part = new THREE.Object3D(); part.name = name; scene.add(part);
  }
  prepareRooflessCartSource(scene);
  expect(scene.children.map(part => part.name)).toEqual(['Top 1', 'Legs_1', 'Caster_L_front_plate']);
  expect(top.userData['roundingProfile'].holes).toEqual([]);
  expect(top.geometry.getAttribute('position').count).toBeGreaterThan(0);
  const ray=new THREE.Raycaster(new THREE.Vector3(.15,1,.15),new THREE.Vector3(0,-1,0));
  expect(ray.intersectObject(top).length).toBeGreaterThan(0);
});
