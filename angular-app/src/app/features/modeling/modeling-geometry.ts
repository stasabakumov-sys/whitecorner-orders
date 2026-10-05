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

// The MDF roof cart has a 900 mm tabletop, 73 mm castors and 150 mm legs.
// Keep hardware, decorative wheels, legs and roof posts rigid. Extend panels
// between the fixed lower deck and the moving tabletop; lift the roof intact.
export function resizeRoofCartPosition(name: string, x: number, y: number, z: number,
  lengthMm: number, heightMm: number): [number, number, number] {
  const dx = (lengthMm - 1200) / 1000, dy = (heightMm - 900) / 1000;
  const rigid = /^(Legs|Decorative[ _]wheel)/i.test(name);
  const nextX = rigid ? x + (/Decorative/i.test(name) || x > 0.6 ? dx : 0)
    : x <= 0.2 ? x : x >= 1 ? x + dx : x + dx * (x - 0.2) / 0.8;
  const fixed = /^(Buttom|Bottom|Legs|Decorative[ _]wheel)/i.test(name);
  const elevated = /^(Top|Roof|Dar)/i.test(name);
  const nextY = fixed ? y : elevated ? y + dy : /^Shelf/i.test(name) ? y + dy / 2
    : y <= 0.239 ? y : y >= 0.884 ? y + dy : y + dy * (y - 0.239) / 0.645;
  return [nextX, nextY, z];
}
