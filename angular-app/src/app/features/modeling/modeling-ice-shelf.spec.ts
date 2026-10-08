import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareIceShelfSupports, shelfProfilesForIceShelf } from './modeling-ice-shelf';
import { createRoundedPart, keepPartJointsSquare, matingPartJoints, RoundingProfile } from './modeling-rounding';
import { resizeSideShelfCartPosition } from './modeling-geometry';
import { roofSideShelfIceHeight } from './modeling-roof-side-shelf';

describe('Ice shelf divider supports', () => {
  function source() {
    const scene = new THREE.Group();
    const bounds = [
      [.69675, .71675, .111, .127], [.66475, .68475, .111, .127],
      [.68475, .69675, .111, .7], [.032, 1.468, .7, .716],
    ];
    for (const [index, [x0, x1, y0, y1]] of bounds.entries()) {
      const profile: RoundingProfile = { axis: 'y', origin: y0, thickness: y1 - y0,
        outline: [[x0, 0], [x1, 0], [x1, .556], [x0, .556]], holes: [] };
      const mesh = new THREE.Mesh(createRoundedPart(profile, 0), new THREE.MeshStandardMaterial());
      mesh.name = `Ice_shelf_${index + 1}`;
      mesh.userData['roundingProfile'] = profile;
      scene.add(mesh);
    }
    return scene;
  }

  it('copies both source rails to the underside without changing the originals or adding duplicates', () => {
    const scene = source(), lower = scene.children.slice(0, 2) as THREE.Mesh[];
    const original = lower.map(mesh => new THREE.Box3().setFromObject(mesh));
    prepareIceShelfSupports(scene);
    prepareIceShelfSupports(scene);
    expect(scene.children).toHaveLength(6);
    for (const [index, rail] of lower.entries()) {
      const upper = scene.getObjectByName(`Ice shelf ${index + 5}`) as THREE.Mesh;
      const bounds = new THREE.Box3().setFromObject(upper);
      expect(bounds.min.x).toBeCloseTo(original[index].min.x, 6);
      expect(bounds.max.x).toBeCloseTo(original[index].max.x, 6);
      expect(bounds.min.z).toBeCloseTo(original[index].min.z, 6);
      expect(bounds.max.z).toBeCloseTo(original[index].max.z, 6);
      expect(bounds.min.y).toBeCloseTo(.684, 6);
      expect(bounds.max.y).toBeCloseTo(.7, 6);
      expect(upper.material).toBe(rail.material);
      expect(upper.geometry).not.toBe(rail.geometry);
      expect(upper.userData['roundingProfile'].origin).toBeCloseTo(.684, 6);
      expect(new THREE.Box3().setFromObject(rail)).toEqual(original[index]);
    }
  });

  it.each([[1500, 850], [1200, 850], [1200, 950]])('keeps square support joints at %i × 600 × %i', (width, height) => {
    const scene = source();
    prepareIceShelfSupports(scene);
    const parts = scene.children.map(node => ({ name: node.name, bounds: new THREE.Box3().setFromObject(node),
      profile: node.userData['roundingProfile'] as RoundingProfile }));
    const joints = matingPartJoints(parts);
    for (const index of [5, 6]) {
      const name = `Ice shelf ${index}`, part = parts.find(candidate => candidate.name === name)!;
      const geometry = createRoundedPart(part.profile, 1.5);
      keepPartJointsSquare(geometry, joints.get(name)!, 1.5);
      const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        const [x, y, z] = resizeSideShelfCartPosition(name, positions.getX(i), positions.getY(i), positions.getZ(i), width, 850);
        positions.setXYZ(i, x, roofSideShelfIceHeight(name, y, height), z);
      }
      const bounds = new THREE.Box3().setFromBufferAttribute(positions);
      expect(bounds.max.y).toBeCloseTo(roofSideShelfIceHeight('Ice shelf 4', .7, height), 6);
      expect(bounds.max.y - bounds.min.y).toBeCloseTo(.016, 6);
      // The contact side remains square all the way to the shelf underside.
      const side = joints.get(name)!.find(joint => joint.axis === 'x')!;
      const [contactX] = resizeSideShelfCartPosition(name, side.plane, .7, .3, width, 850);
      const topContact = Array.from({ length: positions.count }, (_, i) => i).some(i =>
        Math.abs(positions.getX(i) - contactX) < 1e-6 && Math.abs(positions.getY(i) - bounds.max.y) < 1e-6);
      expect(topContact).toBe(true);
    }
  });
});

describe('Shelf and Ice shelf construction', () => {
  const shelf = new THREE.Box3(new THREE.Vector3(.032, .4565, 0), new THREE.Vector3(1.468, .4725, .556));
  const divider = new THREE.Box3(new THREE.Vector3(.68475, .111, 0), new THREE.Vector3(.69675, .7, .556));
  const hasTopFace = (profiles: ReturnType<typeof shelfProfilesForIceShelf>, x: number) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, .6, .3), new THREE.Vector3(0, -1, 0));
    return profiles.some(profile => ray.intersectObject(new THREE.Mesh(createRoundedPart(profile, 0))).length > 0);
  };
  it('makes one continuous shelf without Ice shelf', () => {
    const profiles = shelfProfilesForIceShelf(shelf, [divider], false);
    expect(profiles).toHaveLength(1);
    expect(hasTopFace(profiles, .69)).toBe(true);
  });
  it('cuts the shelf only where the upright Ice shelf passes through', () => {
    const profiles = shelfProfilesForIceShelf(shelf, [divider], true);
    expect(profiles).toHaveLength(2);
    expect(hasTopFace(profiles, .69)).toBe(false);
    expect(hasTopFace(profiles, .5)).toBe(true);
    expect(hasTopFace(profiles, .9)).toBe(true);
  });
});
