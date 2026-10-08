import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { shelfProfilesForIceShelf } from './modeling-ice-shelf';
import { createRoundedPart } from './modeling-rounding';

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
