// The STEP model uses metres, with 95 mm casters and a 1200 × 600 × 900 mm envelope.
// Keep the ends of each horizontal part rigid so trim, plywood thickness and
// mounting holes retain their original sizes; extend only the middle section.
export function resizePlywoodPosition(
  name: string, x: number, y: number, z: number, lengthMm: number, heightMm: number,
): [number, number, number] {
  const lengthChange = (lengthMm - 1200) / 1000;
  const heightChange = (heightMm - 900) / 1000;
  const endZone = 0.15;
  const nextX = x <= endZone ? x : x >= 1.2 - endZone ? x + lengthChange
    : x + lengthChange * (x - endZone) / (1.2 - 2 * endZone);
  let nextY: number;
  if (/^Top[ _]part/i.test(name)) {
    nextY = y + heightChange;
  } else if (/^(Buttom|Bottom)[ _]part/i.test(name)) {
    nextY = y;
  } else if (/^Shelf$/i.test(name)) {
    nextY = y + heightChange / 2;
  } else {
    // Upright panels span between the unchanged 15 mm bottom and top panels.
    nextY = y <= 0.113 ? y : y >= 0.882 ? y + heightChange
      : y + heightChange * (y - 0.113) / (0.882 - 0.113);
  }
  return [nextX, nextY, z];
}
