export type Point = readonly [number, number];
export interface Line {from: Point; to: Point}
export type BoxLayout = 'pair' | 'single';

export interface BoxNet {
  length: number;
  width: number;
  depth: number;
  panelLength: number;
  sheetWidth: number;
  sheetHeight: number;
  cuts: Line[];
  folds: Line[];
}

export interface BoxDrawing {
  width: number;
  height: number;
  pieces: number;
  gap: number;
  cuts: Line[];
  folds: Line[];
  cutPaths?: string[];
  parts?: BoxDrawingPart[];
}

export interface BoxDrawingPart {
  name: 'Bottom' | 'Lid';
  net: BoxNet;
  drawing: BoxDrawing;
  x: number;
  y: number;
}

export const LID_CLEARANCE_MM = 10;

// L/W/D describe the assembled box. The two mirrored base panels meet
// edge to edge, with tape on the join, as shown in the supplied d1.ai.
export function boxNet(length: number, width: number, depth: number): BoxNet {
  if (![length, width, depth].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Enter positive L, W and D dimensions in millimetres.');
  }
  const panelLength = length / 2;
  const sheetWidth = depth + panelLength;
  const sheetHeight = width + 2 * depth;
  if (!Number.isSafeInteger(Math.ceil(sheetWidth * 2 + 10 + sheetHeight))) {
    throw new Error('These dimensions are too large. Enter the box size in millimetres.');
  }
  // The reference has tapered end tabs and approximately 1.5 mm corner
  // relief. Preserve that detail; reduce it only for depths below 6 mm.
  const relief = Math.min(1.5, depth / 4);
  const outline: Point[] = [
    [depth, 0], [sheetWidth, 0], [sheetWidth, sheetHeight],
    [depth, sheetHeight], [0, sheetHeight - relief],
    [0, depth + width + relief], [depth, depth + width], [0, depth + width],
    [0, depth], [depth, depth], [0, depth - relief], [0, relief], [depth, 0],
  ];
  return {
    length, width, depth, panelLength, sheetWidth, sheetHeight,
    cuts: outline.slice(1).map((to, index) => ({from: outline[index], to})),
    folds: [
      {from: [depth, 0], to: [depth, sheetHeight]},
      {from: [depth, depth], to: [sheetWidth, depth]},
      {from: [depth, depth + width], to: [sheetWidth, depth + width]},
    ],
  };
}

export function drawingForBox(net: BoxNet, layout: BoxLayout): BoxDrawing {
  if (layout === 'single') return {width: net.sheetWidth, height: net.sheetHeight, pieces: 1, gap: 0, cuts: net.cuts, folds: net.folds};
  // Separate the pieces so their meeting edges are not cut twice.
  const gap = 10;
  const width = 2 * net.sheetWidth + gap;
  const mirror = (lines: Line[]): Line[] => lines.map(line => ({
    from: [width - line.from[0], line.from[1]],
    to: [width - line.to[0], line.to[1]],
  }));
  return {width, height: net.sheetHeight, pieces: 2, gap, cuts: [...net.cuts, ...mirror(net.cuts)], folds: [...net.folds, ...mirror(net.folds)]};
}

// One request describes the bottom. The confirmed lid reference is 10 mm
// larger in both L and W; its depth stays equal to the requested D.
export function drawingWithLid(bottom: BoxNet, layout: BoxLayout): BoxDrawing {
  const lid = boxNet(bottom.length + LID_CLEARANCE_MM, bottom.width + LID_CLEARANCE_MM, bottom.depth);
  const lower = drawingForBox(bottom, layout);
  const upper = drawingForBox(lid, layout);
  const width = Math.max(lower.width, upper.width);
  const gap = 10;
  const parts: BoxDrawingPart[] = [
    {name: 'Bottom', net: bottom, drawing: lower, x: (width - lower.width) / 2, y: 0},
    {name: 'Lid', net: lid, drawing: upper, x: (width - upper.width) / 2, y: lower.height + gap},
  ];
  const moved = (lines: Line[], part: BoxDrawingPart): Line[] => lines.map(line => ({
    from: [line.from[0] + part.x, line.from[1] + part.y],
    to: [line.to[0] + part.x, line.to[1] + part.y],
  }));
  return {
    width, height: lower.height + gap + upper.height,
    pieces: lower.pieces + upper.pieces, gap, parts,
    cuts: parts.flatMap(part => moved(part.drawing.cuts, part)),
    folds: parts.flatMap(part => moved(part.drawing.folds, part)),
  };
}

export function drawingNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}

export function exportBoxSvg(drawing: BoxDrawing): string {
  const n = drawingNumber;
  const lines = (items: Line[]) => items.map(line => `<line x1="${n(line.from[0])}" y1="${n(line.from[1])}" x2="${n(line.to[0])}" y2="${n(line.to[1])}"/>`).join('\n');
  const groups = (view: BoxDrawing, prefix = '') => `<g id="${prefix}Cut" fill="none" stroke="#ff0000" stroke-width="0.2">
${view.cutPaths ? view.cutPaths.map(d => `<path d="${d}"/>`).join('\n') : lines(view.cuts)}
</g>
<g id="${prefix}Fold" fill="none" stroke="#45d6ff" stroke-width="0.264583">
${lines(view.folds)}
</g>`;
  const content = drawing.parts
    ? drawing.parts.map(part => `<g id="${part.name}" transform="translate(${n(part.x)} ${n(part.y)})">\n${groups(part.drawing, part.name + '-') }\n</g>`).join('\n')
    : groups(drawing);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(drawing.width)}mm" height="${n(drawing.height)}mm" viewBox="0 0 ${n(drawing.width)} ${n(drawing.height)}">
${content}
</svg>\n`;
}
