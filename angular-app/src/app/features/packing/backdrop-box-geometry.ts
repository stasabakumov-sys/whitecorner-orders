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

function wholePiece(length: number, width: number, depth: number, rim: number, rotated: boolean): BoxNet {
  const sheetWidth = width + 2 * rim, sheetHeight = length + 2 * rim;
  // Both end walls retain the corner wings and relief cuts of the original
  // U-shaped CDR piece. Joining its open edges must not remove those wings.
  const relief = Math.min(1.5, rim / 4);
  const outline: Point[] = [
    [rim,0],[rim+width,0],[sheetWidth,relief],[sheetWidth,rim-relief],
    [rim+width,rim],[sheetWidth,rim],[sheetWidth,rim+length],
    [rim+width,rim+length],[sheetWidth,rim+length+relief],
    [sheetWidth,sheetHeight-relief],[rim+width,sheetHeight],
    [rim,sheetHeight],[0,sheetHeight-relief],[0,rim+length+relief],
    [rim,rim+length],[0,rim+length],[0,rim],
    [rim,rim],[0,rim-relief],[0,relief],[rim,0],
  ];
  const net:BoxNet={length,width,depth,panelLength:length,sheetWidth,sheetHeight,
    cuts:outline.slice(1).map((to,index)=>({from:outline[index],to})),
    folds:[
      {from:[rim,0],to:[rim,sheetHeight]},
      {from:[rim+width,0],to:[rim+width,sheetHeight]},
      {from:[rim,rim],to:[rim+width,rim]},
      {from:[rim,rim+length],to:[rim+width,rim+length]},
    ]};
  if(!rotated)return net;
  const turn=([x,y]:Point):Point=>[y,sheetWidth-x];
  return {...net,sheetWidth:sheetHeight,sheetHeight:sheetWidth,
    cuts:net.cuts.map(line=>({from:turn(line.from),to:turn(line.to)})),
    folds:net.folds.map(line=>({from:turn(line.from),to:turn(line.to)}))};
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
  // First try the complete lid and bottom. Reduce only their border when
  // necessary; the central fields retain their requested dimensions.
  const normalRim = Math.min(depth, (BACKDROP_CARD.width - lidWidth) / 2,
    (BACKDROP_LASER.height - lidLength) / 2);
  const rotatedRim = Math.min(depth, (BACKDROP_CARD.width - lidLength) / 2,
    (BACKDROP_LASER.height - lidWidth) / 2);
  const rotated=rotatedRim>normalRim;
  const wholeRim=Math.max(normalRim,rotatedRim);
  const whole = wholeRim > 0;
  const rim = whole ? wholeRim : Math.min(depth, (BACKDROP_CARD.width - lidWidth) / 2);
  if (rim <= 0) {
    throw Error('The main box field leaves no room for a border on the 1170 × 1170 mm cardboard sheet. Reduce package W.');
  }
  const maxPanel = Math.min(BACKDROP_LASER.height, BACKDROP_CARD.height) - rim;
  if (!whole && lidLength > 2 * maxPanel) {
    throw Error('The box cannot fit the 1300 × 990 mm laser field in two parts. Reduce package L.');
  }
  // Retain the reference short panel while it fits. Transfer any main-panel
  // excess into the short panel, reserving room for the lid's extra 10 mm.
  const preferredMain = Math.max(length / 2, length - REFERENCE_SHORT_PANEL);
  const mainPanel = Math.min(maxPanel, Math.max(preferredMain, lidLength - maxPanel));
  if (!whole && mainPanel >= length) throw Error('The box cannot fit the 1300 × 990 mm laser field in two parts. Reduce L.');
  const bottom = whole ? [wholePiece(length,width,depth,rim,rotated)] :
    [piece(length, width, depth, mainPanel, rim), piece(length, width, depth, length - mainPanel, rim)];
  const lid = whole ? [wholePiece(lidLength,lidWidth,depth,rim,rotated)] :
    [piece(lidLength, lidWidth, depth, mainPanel, rim),piece(lidLength, lidWidth, depth, lidLength - mainPanel, rim)];
  const gap = 10;
  const move = (lines: Line[], x: number, y: number): Line[] => lines.map(line => ({
    from: [line.from[0] + x, line.from[1] + y], to: [line.to[0] + x, line.to[1] + y],
  }));
  // Left: bottom; right: lid, as in the reference. Short pieces above main.
  const drawPair = (nets: BoxNet[]): BoxDrawing => {
    if(nets.length===1)return {width:nets[0].sheetWidth,height:nets[0].sheetHeight,pieces:1,gap:0,cuts:nets[0].cuts,folds:nets[0].folds};
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
  const drawing: BoxDrawing = {width: lower.width + gap + upper.width, height: Math.max(lower.height, upper.height), pieces: lower.pieces+upper.pieces, gap, parts,
    cuts: parts.flatMap(part => move(part.drawing.cuts, part.x, part.y)),
    folds: parts.flatMap(part => move(part.drawing.folds, part.x, part.y))};
  return {package: {length: packageLength, width: packageWidth, depth}, splitAdjusted: !whole && mainPanel !== preferredMain, rim, bottom, lid, drawing};
}
