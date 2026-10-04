import {BoxDrawing, BoxNet, Line, Point, drawingNumber} from './box-constructor-geometry';

/** One-piece hinged box from Small box.ai, exported in points (72 pt/in).
 * The reference's base is 270 x 140 mm, depth 140 mm, tuck flap 40 mm.
 * L/W/D describe the folded box, not the outside size of the flat sheet. */
export function smallBoxNet(length: number, width: number, depth: number, tuck: number): BoxNet & {cutPaths: string[]} {
  if (![length, width, depth, tuck].every(v => Number.isFinite(v) && v > 0)) throw Error('Enter positive box dimensions and tuck flap length in millimetres.');
  if (tuck > depth || tuck >= length / 2) throw Error('Tuck flap length must not exceed D and must be less than half of L.');
  const x = 2 * depth, right = x + length;
  const lidTop = tuck, rearTop = tuck + width, baseTop = rearTop + depth, baseBottom = baseTop + width, bottom = baseBottom + depth;
  const relief = Math.min(2.445, depth / 10, width / 10);
  const corner = Math.min(3, depth / 10, width / 10);
  const notch = Math.min(6, length / 10);
  const small = Math.min(1, depth / 20);
  const lowerInset = Math.min(22.3335, width / 4);
  const upperInset = Math.min(9.7366, width / 4);
  const latchStep=Math.min(4,depth/10), latchInset=Math.min(2.5,width/20), seam=Math.min(.5,width/100);
  const paths: Point[][] = [
    [[x,lidTop],[x,rearTop],[x-depth/2,rearTop+relief],[x-depth/2,baseTop-relief],[x,baseTop],
     [x-depth,baseTop],[x-depth-corner,baseTop+corner],[0,baseTop+upperInset],[0,baseBottom-lowerInset],
     [x-depth-2*corner,baseBottom-latchInset],[x-depth-latchStep,baseBottom-seam],[x-depth,baseBottom-seam],[x-depth,baseBottom],
     [x,baseBottom],[x-depth/2,baseBottom+relief],[x-depth/2,bottom-relief],[x,bottom],[right,bottom],
     [right+depth/2,bottom-relief],[right+depth/2,baseBottom+relief],[right,baseBottom],[right+depth,baseBottom],
     [right+depth,baseBottom-seam],[right+depth+latchStep,baseBottom-seam],[right+depth+2*corner,baseBottom-latchInset],
     [right+2*depth,baseBottom-lowerInset],[right+2*depth,baseTop+upperInset],[right+depth+corner,baseTop+corner],
     [right+depth,baseTop],[right,baseTop],[right+depth/2,baseTop-relief],[right+depth/2,rearTop+relief],
     [right,rearTop],[right,lidTop],[right-notch+small,lidTop],[right-notch,lidTop+small]],
    [[x+notch,lidTop+small],[x+notch-small,lidTop],[x,lidTop]],
  ];
  const n=drawingNumber;
  const pathText=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${n(p[0])} ${n(p[1])}`).join(' ');
  const inset=.5, radius=tuck-inset;
  if(radius <= 0) throw Error('Tuck flap length must be greater than 0.5 mm.');
  const a:Point=[right-inset,lidTop], c:Point=[right-tuck,0];
  const d:Point=[x+tuck,0], f:Point=[x+inset,lidTop];
  // Preserve the reference's cubic quarter-circle control points in SVG.
  const k=.5522847498;
  const c1:Point=[a[0],a[1]-k*radius], c2:Point=[c[0]+k*radius,c[1]+inset];
  const endRight:Point=[c[0],inset];
  const startLeft:Point=[d[0],inset], c3:Point=[d[0]-k*radius,inset], c4:Point=[f[0],f[1]-k*radius];
  const curved=`M${n(a[0])} ${n(a[1])} C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(endRight[0])} ${n(endRight[1])} L${n(startLeft[0])} ${n(startLeft[1])} C${n(c3[0])} ${n(c3[1])} ${n(c4[0])} ${n(c4[1])} ${n(f[0])} ${n(f[1])}`;
  // Scale tessellation with the radius, keeping RD chord error below 0.03 mm.
  const steps=Math.max(16,Math.ceil(Math.PI/2*Math.sqrt(radius/.08)));
  if(steps>10000 || !Number.isSafeInteger(Math.ceil(length+4*depth+bottom))) throw Error('These dimensions are too large. Enter the box size in millimetres.');
  const cubic=(p0:Point,p1:Point,p2:Point,p3:Point):Point[]=>Array.from({length:steps+1},(_,i)=>{
    const t=i/steps,u=1-t;return [u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]] as Point;
  });
  paths.push([...cubic(a,c1,c2,endRight),startLeft,...cubic(startLeft,c3,c4,f).slice(1)]);
  const lines=(points:Point[]):Line[]=>points.slice(1).map((to,i)=>({from:points[i],to}));
  const folds:Line[]=[
    {from:[x,baseTop],to:[right,baseTop]}, {from:[x,baseBottom],to:[right,baseBottom]},
    {from:[x,baseTop],to:[x,baseBottom]}, {from:[right,baseTop],to:[right,baseBottom]},
    {from:[x,rearTop],to:[right,rearTop]}, {from:[x,rearTop],to:[x,baseTop]}, {from:[right,rearTop],to:[right,baseTop]},
    {from:[x,baseBottom],to:[x,bottom]}, {from:[right,baseBottom],to:[right,bottom]},
    {from:[x-depth,baseTop+.5],to:[x-depth,baseBottom]}, {from:[right+depth,baseTop],to:[right+depth,baseBottom]},
    {from:[x+notch,lidTop+small],to:[right-notch,lidTop+small]},
  ];
  return {length,width,depth,panelLength:length,sheetWidth:length+4*depth,sheetHeight:bottom,
    cuts:paths.flatMap(lines),folds,cutPaths:[...paths.slice(0,2).map(pathText),curved]};
}

export function smallBoxDrawing(net:ReturnType<typeof smallBoxNet>):BoxDrawing {
  return {width:net.sheetWidth,height:net.sheetHeight,pieces:1,gap:0,cuts:net.cuts,folds:net.folds,cutPaths:net.cutPaths};
}
