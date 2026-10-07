import {BoxDrawing, BoxNet, Line, Point, LID_CLEARANCE_MM} from './box-constructor-geometry';

// Arch Box 180x90.cdr, measured in CorelDRAW in millimetres. Hand-drawn
// coordinate noise is below 0.5 mm; nominal folds are 915/925 × 915/925 × 80.
export const BACKDROP_REFERENCE = {length: 930, width: 930, depth: 80} as const;
export const BACKDROP_LASER = {width: 1300, height: 990} as const;
export const BACKDROP_CARD = {width: 1170, height: 1170} as const;
const REFERENCE_SHORT_PANEL = 129;
export interface BackdropBox {
  package: {length: number; width: number; depth: number};
  splitAdjusted: boolean;
  rim: number;
  bottom: BoxNet[];
  lid: BoxNet[];
  drawing: BoxDrawing;
}

// Each U-shaped piece has one end wall and two side walls. The joining
// edge is intentionally open in the supplied CDR (a pre-cut sheet edge).
function piece(length: number, width: number, depth: number, panelLength: number, rim: number): BoxNet {
  const sheetWidth = width + 2 * rim, sheetHeight = panelLength + rim;
  const relief = Math.min(1.5, rim / 4);
  const outline: Point[] = [
    [0, 0], [0, panelLength], [rim, panelLength],
    [0, panelLength + relief], [0, sheetHeight - relief],
    [rim, sheetHeight], [rim + width, sheetHeight],
    [sheetWidth, sheetHeight - relief], [sheetWidth, panelLength + relief],
    [rim + width, panelLength], [sheetWidth, panelLength], [sheetWidth, 0],
  ];
  return {length, width, depth, panelLength, sheetWidth, sheetHeight,
    cuts: outline.slice(1).map((to, index) => ({from: outline[index], to})),
    folds: [
      {from: [rim, 0], to: [rim, sheetHeight]},
      {from: [rim + width, 0], to: [rim + width, sheetHeight]},
      {from: [rim, panelLength], to: [rim + width, panelLength]},
    ],
  };
}

export function backdropBox(packageLength: number, packageWidth: number, depth: number): BackdropBox {
  if (![packageLength, packageWidth, depth].every(value => Number.isFinite(value) && value > 0)) {
    throw Error('Enter positive package L, W and D dimensions in millimetres.');
  }
  // Transport dimensions include the owner's 5 mm allowance for bulging.
  // Lid is package −5; bottom is package −15, preserving the 10 mm clearance.
  const length = packageLength - 15, width = packageWidth - 15;
  if (length <= 0 || width <= 0) throw Error('Package L and W must be greater than 15 mm to allow for the bottom and lid.');
  const lidLength = length + LID_CLEARANCE_MM;
  const lidWidth = width + LID_CLEARANCE_MM;
  // Preserve the central fields. Only the surrounding rim may shrink.
  // Use the same rim on bottom and lid, sized for the wider lid.
  const rim = Math.min(depth, (BACKDROP_CARD.width - lidWidth) / 2);
  if (rim <= 0) {
    throw Error('The main box field leaves no room for a border on the 1170 × 1170 mm cardboard sheet. Reduce package W.');
  }
  const maxPanel = Math.min(BACKDROP_LASER.height, BACKDROP_CARD.height) - rim;
  if (lidLength > 2 * maxPanel) {
    throw Error('The box cannot fit the 1300 × 990 mm laser field in two parts. Reduce package L.');
  }
  // Retain the reference short panel while it fits. Transfer any main-panel
  // excess into the short panel, reserving room for the lid's extra 10 mm.
  const preferredMain = Math.max(length / 2, length - REFERENCE_SHORT_PANEL);
  const mainPanel = Math.min(maxPanel, Math.max(preferredMain, lidLength - maxPanel));
  if (mainPanel >= length) throw Error('The box cannot fit the 1300 × 990 mm laser field in two parts. Reduce D.');
  const bottom = [piece(length, width, depth, mainPanel, rim), piece(length, width, depth, length - mainPanel, rim)];
  const lid = [piece(lidLength, lidWidth, depth, mainPanel, rim),
    piece(lidLength, lidWidth, depth, lidLength - mainPanel, rim)];
  const gap = 10;
  const move = (lines: Line[], x: number, y: number): Line[] => lines.map(line => ({
    from: [line.from[0] + x, line.from[1] + y], to: [line.to[0] + x, line.to[1] + y],
  }));
  // Left: bottom; right: lid, as in the reference. Short pieces above main.
  const drawPair = (nets: BoxNet[]): BoxDrawing => {
    const y = nets[1].sheetHeight + gap;
    return {width: nets[0].sheetWidth, height: y + nets[0].sheetHeight, pieces: 2, gap,
      cuts: [...nets[1].cuts, ...move(nets[0].cuts, 0, y)],
      folds: [...nets[1].folds, ...move(nets[0].folds, 0, y)]};
  };
  const lower = drawPair(bottom), upper = drawPair(lid);
  const parts = [
    {name: 'Bottom' as const, net: bottom[0], drawing: lower, x: 0, y: 0},
    {name: 'Lid' as const, net: lid[0], drawing: upper, x: lower.width + gap, y: 0},
  ];
  const drawing: BoxDrawing = {width: lower.width + gap + upper.width, height: Math.max(lower.height, upper.height), pieces: 4, gap, parts,
    cuts: parts.flatMap(part => move(part.drawing.cuts, part.x, part.y)),
    folds: parts.flatMap(part => move(part.drawing.folds, part.x, part.y))};
  return {package: {length: packageLength, width: packageWidth, depth}, splitAdjusted: mainPanel !== preferredMain, rim, bottom, lid, drawing};
}
