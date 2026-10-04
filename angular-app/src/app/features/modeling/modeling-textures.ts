// Select a clear section of the supplied pine photograph. Grain runs along V;
// the section avoids the large knots near the ends of the original photograph.
export function pineWoodUv(cross: number, along: number): [number, number] {
  const across = ((cross / 0.6) % 1 + 1) % 1;
  return [0.72 + across * 0.16, 0.12 + along * 0.22];
}
