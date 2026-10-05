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
  lengthMm: number, heightMm: number, plainFront = false): [number, number, number] {
  const dx = (lengthMm - 1200) / 1000, dy = (heightMm - 900) / 1000;
  const rigid = /^(Legs|Decorative[ _]wheel)/i.test(name);
  const nextX = rigid ? x + (/Decorative/i.test(name) || x > 0.6 ? dx : 0)
    : x <= 0.2 ? x : x >= 1 ? x + dx : x + dx * (x - 0.2) / 0.8;
  const fixed = /^(Buttom|Bottom|Legs|Decorative[ _]wheel)/i.test(name);
  const elevated = /^(Top|Roof|Dar)/i.test(name);
  const nextY = fixed ? y : elevated ? y + dy : /^Shelf/i.test(name) ? y + dy / 2
    : y <= 0.239 ? y : y >= 0.884 ? y + dy : y + dy * (y - 0.239) / 0.645;
  let nextZ = z;
  if (plainFront && /^Front[ _]part1$/i.test(name)) {
    // Replace the 12 + 12 mm Shaker stack with 16 mm MDF. Keep its outside
    // face at the original 584 mm plane and retain up to 3 mm edge radii.
    const min = .5600004, max = .5720004, edgeZone = .003;
    nextZ = z <= min + edgeZone ? z + .008 : z >= max - edgeZone ? z + .012
      : z + .008 + .004 * (z - min - edgeZone) / (max - min - 2 * edgeZone);
  } else if (plainFront && /^Front[ _]part[34]/i.test(name)) nextZ = z + .008;
  else if (plainFront && /^(Left|Right)[ _]side[ _]?1$/i.test(name.trim())) {
    // Extend each side 8 mm towards the thinner front; preserve rounded ends.
    const rear = .0160004, front = .5600004, endZone = .003;
    nextZ = z <= rear + endZone ? z : z >= front - endZone ? z + .008
      : z + .008 * (z - rear - endZone) / (front - rear - 2 * endZone);
  } else if (plainFront && /^(Left|Right)[ _]side[ _]?2$/i.test(name.trim())) nextZ = z + .008;
  return [nextX, nextY, nextZ];
}
