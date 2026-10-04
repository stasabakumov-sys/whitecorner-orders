import { describe, it, expect } from 'vitest';
import { createRoundedPart, keepTrimJointSquare, RoundingProfile } from './modeling-rounding';
import { resizePlywoodPosition } from './modeling-geometry';

describe('Wooden part rounding', () => {
  const profile: RoundingProfile = { axis: 'y', origin: 0.885, thickness: 0.015,
    outline: [[0, 0], [1.2, 0], [1.2, 0.6], [0, 0.6]], holes: [] };
  it('retains the panel envelope at each supported radius', () => {
    for (const radius of [1, 1.5, 2, 2.5, 3]) {
      const geometry = createRoundedPart(profile, radius);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.x).toBeCloseTo(0, 5);
      expect(box.max.x).toBeCloseTo(1.2, 5);
      expect(box.min.y).toBeCloseTo(0.885, 5);
      expect(box.max.y).toBeCloseTo(0.9, 5);
      expect(box.max.z).toBeCloseTo(0.6, 5);
      expect(geometry.groups.some(group => group.materialIndex === 1)).toBe(true);
      geometry.dispose();
    }
  });
  it('preserves a three millimetre upright corner at all heights', () => {
    for (const height of [850, 900, 950, 1000]) {
      const bottom = resizePlywoodPosition('Front part1', 0, 0.11, 0, 1500, height);
      const bottomArc = resizePlywoodPosition('Front part1', 0, 0.113, 0, 1500, height);
      const top = resizePlywoodPosition('Front part1', 0, 0.885, 0, 1500, height);
      const topArc = resizePlywoodPosition('Front part1', 0, 0.882, 0, 1500, height);
      expect(bottomArc[1] - bottom[1]).toBeCloseTo(0.003, 8);
      expect(top[1] - topArc[1]).toBeCloseTo(0.003, 8);
    }
  });
  it('keeps the inner pine border flush against its panel', () => {
    const trim = { ...profile, thickness: 0.042, holes: [[[0.019, 0.019], [1.181, 0.019], [1.181, 0.581], [0.019, 0.581]]] };
    const geometry = createRoundedPart(trim, 3);
    keepTrimJointSquare(geometry, trim, 3);
    const positions = geometry.getAttribute('position');
    let jointVertices = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      if (Math.abs(x - 0.019) < 0.006 && z >= 0.0189 && z <= 0.5811) {
        expect(x).toBeCloseTo(0.019, 6); jointVertices++;
      }
    }
    expect(jointVertices).toBeGreaterThan(0);
    geometry.dispose();
  });
});
