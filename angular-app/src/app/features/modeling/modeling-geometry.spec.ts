import { describe, expect, it } from 'vitest';
import { resizePlywoodPosition, resizeRoofCartPosition } from './modeling-geometry';

describe('MDF roof cart dimensions', () => {
  it('keeps wheel axes aligned with bottom holes at every length and height', () => {
    for (const length of [1200, 1300, 1400, 1500]) for (const height of [850, 900, 950, 1000]) {
      const hole = resizeRoofCartPosition('Buttom_part2', 1.047, 0.2530002, 0.6, length, height);
      const wheel = resizeRoofCartPosition('Decorative_wheel_front', 1.047, 0.2530002, 0.614, length, height);
      expect(wheel[0]).toBeCloseTo(hole[0]); expect(wheel[1]).toBeCloseTo(hole[1]);
      const rim = resizeRoofCartPosition('Decorative_wheel_front', 0.802, 0.0080002, 0.614, length, height);
      expect(wheel[0] - rim[0]).toBeCloseTo(0.245);
      expect(rim[1]).toBeCloseTo(0.0080002);
    }
  });
  it('moves the roof and its posts with the tabletop while retaining their dimensions', () => {
    const table = resizeRoofCartPosition('Top_1', 0.6, 0.9, 0.3, 1500, 1000);
    const roof = resizeRoofCartPosition('Roof_1', 0.6, 1.93, 0.3, 1500, 1000);
    expect(table[1]).toBeCloseTo(1); expect(roof[1] - table[1]).toBeCloseTo(1.03);
    const low = resizeRoofCartPosition('Dar1', 0.0615, 0.784, 0.495, 1500, 1000);
    const high = resizeRoofCartPosition('Dar1', 0.1035, 1.918, 0.495, 1500, 1000);
    expect(high[0] - low[0]).toBeCloseTo(0.042); expect(high[1] - low[1]).toBeCloseTo(1.134);
    expect(resizeRoofCartPosition('Legs_1', 0.1665, 0.073, 0.49, 1500, 1000)).toEqual([0.1665,0.073,0.49]);
  });
});

describe('Classic plywood parts', () => {
  it('keeps both trim rings 42 × 19 mm at every available length and height', () => {
    for (const length of [1200, 1300, 1400, 1500]) {
      for (const height of [900, 950, 1000]) {
        for (const [name, bottom] of [['Top_part2', 0.858], ['Buttom_part2', 0.095]] as const) {
          const outside = resizePlywoodPosition(name, 1.2, bottom, 0, length, height);
          const inside = resizePlywoodPosition(name, 1.181, bottom + 0.042, 0.019, length, height);
          expect(outside[0]).toBeCloseTo(length / 1000);
          expect(outside[0] - inside[0]).toBeCloseTo(0.019);
          expect(inside[1] - outside[1]).toBeCloseTo(0.042);
          expect(inside[2] - outside[2]).toBeCloseTo(0.019);
          expect(outside[1]).toBeCloseTo(bottom + (name === 'Top_part2' ? (height - 900) / 1000 : 0));
        }
      }
    }
  });

  it('preserves side panel and shelf thickness while extending the body', () => {
    const leftOuter = resizePlywoodPosition('Left_side_part1', 0.019, 0.11, 0.034, 1500, 1000);
    const leftInner = resizePlywoodPosition('Left_side_part1', 0.031, 0.885, 0.034, 1500, 1000);
    expect(leftInner[0] - leftOuter[0]).toBeCloseTo(0.012);
    expect(leftInner[1]).toBeCloseTo(0.985);
    const shelfBottom = resizePlywoodPosition('Shelf', 0.031, 0.49, 0.034, 1500, 1000);
    const shelfTop = resizePlywoodPosition('Shelf', 1.169, 0.505, 0.581, 1500, 1000);
    expect(shelfTop[1] - shelfBottom[1]).toBeCloseTo(0.015);
    expect(shelfTop[0]).toBeCloseTo(1.469);
  });

  it('keeps all four internal reinforcements 70 × 12 mm as their height changes', () => {
    const parts = [
      { name: 'Front_part2', min: [0.031, 0.11, 0.034], max: [0.101, 0.885, 0.046] },
      { name: 'Front_part3', min: [1.099, 0.11, 0.034], max: [1.169, 0.885, 0.046] },
      { name: 'Left_side_part2', min: [0.031, 0.11, 0.046], max: [0.043, 0.885, 0.116] },
      { name: 'Right_side_part2', min: [1.157, 0.11, 0.046], max: [1.169, 0.885, 0.116] },
    ];
    for (const length of [1200, 1300, 1400, 1500]) {
      for (const height of [900, 1000]) {
        for (const part of parts) {
          const min = resizePlywoodPosition(part.name, part.min[0], part.min[1], part.min[2], length, height);
          const max = resizePlywoodPosition(part.name, part.max[0], part.max[1], part.max[2], length, height);
          expect(max[0] - min[0]).toBeCloseTo(part.max[0] - part.min[0]);
          expect(max[2] - min[2]).toBeCloseTo(part.max[2] - part.min[2]);
          expect(max[1] - min[1]).toBeCloseTo(0.775 + (height - 900) / 1000);
          expect(min[0]).toBeCloseTo(part.min[0] + (part.min[0] > 1 ? (length - 1200) / 1000 : 0));
        }
      }
    }
  });
});
