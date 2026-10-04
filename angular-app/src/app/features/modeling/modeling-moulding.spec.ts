import { describe, it, expect } from 'vitest';
import { createFrontMoulding } from './modeling-moulding';

describe('Front panel moulding', () => {
  it('keeps the outer frame 90 mm from each panel edge at every size', () => {
    for (const length of [1200, 1300, 1400, 1500]) for (const height of [850, 900, 950, 1000]) {
      const geometry = createFrontMoulding(length, height);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.x - 0.019).toBeCloseTo(0.09, 6);
      expect(length / 1000 - 0.019 - box.max.x).toBeCloseTo(0.09, 6);
      expect(box.min.y - 0.11).toBeCloseTo(0.09, 6);
      expect(height / 1000 - 0.015 - box.max.y).toBeCloseTo(0.09, 6);
      expect(0.019 - box.min.z).toBeLessThanOrEqual(0.0151);
      geometry.dispose();
    }
  });
  it('places the stepped lip inside and gives adjoining curved faces continuous normals', () => {
    const geometry = createFrontMoulding(1200, 900);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const hasLip = Array.from({ length: positions.count }, (_, i) => i).some(i =>
      Math.abs(positions.getY(i) - (0.2 + 0.028)) < 1e-6 &&
      Math.abs(positions.getZ(i) - 0.012) < 1e-6);
    expect(hasLip).toBe(true);
    let continuousCurvedJoins = 0;
    for (let i = 0; i + 24 < positions.count; i += 24) {
      const end = i + 5, next = i + 24;
      const sameNormal = [0, 1, 2].every(axis =>
        Math.abs(normals.getComponent(end, axis) - normals.getComponent(next, axis)) < 1e-6);
      if (sameNormal && Math.abs(normals.getY(end)) > 0.05 && Math.abs(normals.getZ(end)) > 0.05) continuousCurvedJoins++;
    }
    expect(continuousCurvedJoins).toBeGreaterThan(50);
    geometry.dispose();
  });
});
