import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {hangingGlassLayout, createHangingGlass} from './modeling-glasses';

describe('Hanging glasses', () => {
  it('fits bowls within the usable rack length with clearance between glasses', () => {
    for (const diameter of [60, 80, 100, 160]) {
      const layout = hangingGlassLayout(diameter, null);
      expect(layout.count).toBe(Math.floor(320 / (Math.max(diameter, 70) + 4)));
      expect(layout.positions[0] - diameter / 2000).toBeGreaterThanOrEqual(-.13);
      expect(layout.positions.at(-1)! + diameter / 2000).toBeLessThanOrEqual(.19);
      for (let i = 1; i < layout.count; i++) {
        expect((layout.positions[i] - layout.positions[i - 1]) * 1000).toBeCloseTo(Math.max(diameter, 70) + 4);
      }
    }
  });
  it('prevents bowls from overlapping the adjacent rack row', () => {
    expect(hangingGlassLayout(105, 102.875).count).toBe(0);
    expect(hangingGlassLayout(100, 102.875).count).toBe(3);
    expect(hangingGlassLayout(999, null).diameter).toBe(160);
  });
  it('places a transparent glass foot on the rail with the bowl hanging below', () => {
    const glass = createHangingGlass(80, null);
    const bounds = new THREE.Box3().setFromObject(glass);
    expect(bounds.max.y).toBeCloseTo(.003);
    expect(bounds.min.y).toBeCloseTo(-.185);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(.08);
    glass.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(object.userData['fixedMaterial']).toBe(true);
      expect((object.material as THREE.MeshPhysicalMaterial).transparent).toBe(true);
      expect(object.castShadow).toBe(false);
    });
  });
});
