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
});
