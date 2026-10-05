export type ShelfSupport = 'rail' | 'plastic';
export interface ShelfDrawingInput {
  width: number; height: number; panelThickness: number; shelfThickness: number;
  support: ShelfSupport; material: 'Plywood' | 'MDF'; product: string;
}
export function shelfPlacement(input: ShelfDrawingInput) {
  const {width,height,shelfThickness} = input;
  if (![width,height,input.panelThickness,shelfThickness].every(n => Number.isFinite(n) && n > 0)) throw new Error('Panel dimensions are missing. Load the complete model and retry.');
  const shelfBottom = (height - shelfThickness) / 2;
  const rail = {x:82, y:shelfBottom - 20, width:width - 82, height:20, thickness:input.material === 'Plywood' ? 15 : 16};
  const holes = [{x:142, y:shelfBottom - 5}, {x:width - 80, y:shelfBottom - 5}];
  if (rail.width <= 0 || shelfBottom < 20 || holes[1].x <= holes[0].x || holes[0].x < 2.5 || holes[1].x > width - 2.5) throw new Error('The side panel is too small for this shelf support layout.');
  return {shelfBottom, shelfTop:shelfBottom+shelfThickness, rail, holes, diameter:5};
}
const mm = (n:number) => Number(n.toFixed(1)).toString();
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function shelfDrawingSvg(input: ShelfDrawingInput): string {
 const layout=shelfPlacement(input), w=input.width, h=input.height, top=50, left=115;
 const x=(n:number)=>left+n, y=(n:number)=>top+h-n;
 const text=(px:number,py:number,label:string,extra='')=>`<text x="${px}" y="${py}" ${extra}>${escape(label)}</text>`;
 const line=(x1:number,y1:number,x2:number,y2:number,cls='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
 const horizontal=(a:number,b:number,py:number,label:string)=>line(x(a),py,x(b),py,'dimension')+line(x(a),py-7,x(a),py+7)+line(x(b),py-7,x(b),py+7)+text(x((a+b)/2),py-8,label,'text-anchor="middle"');
 const vertical=(px:number,a:number,b:number,label:string)=>line(px,y(a),px,y(b),'dimension')+line(px-7,y(a),px+7,y(a))+line(px-7,y(b),px+7,y(b))+text(px-9,y((a+b)/2),label,`text-anchor="middle" transform="rotate(-90 ${px-9} ${y((a+b)/2)})"`);
 let drawing=`<rect x="${left}" y="${top}" width="${w}" height="${h}" class="panel"/>`;
 drawing+=line(x(12),y(0),x(12),y(h),'reference')+line(x(82),y(0),x(82),y(h),'reference');
 drawing+=line(x(0),y(layout.shelfBottom),x(w),y(layout.shelfBottom),'shelf')+line(x(0),y(layout.shelfTop),x(w),y(layout.shelfTop),'shelf');
 drawing+=horizontal(0,w,y(0)+42,`${mm(w)} mm`)+vertical(left-65,0,h,`${mm(h)} mm`);
 drawing+=vertical(x(w)+42,0,layout.shelfBottom,`${mm(layout.shelfBottom)} mm`);
 if(input.support==='rail'){
  const r=layout.rail;
  drawing+=`<rect x="${x(r.x)}" y="${y(r.y+r.height)}" width="${r.width}" height="${r.height}" class="rail"/>`;
  drawing+=horizontal(0,r.x,y(0)+80,`${mm(r.x)} mm`)+horizontal(r.x,w,y(0)+118,`${mm(r.width)} mm`);
  drawing+=vertical(x(w)+83,0,r.y,`${mm(r.y)} mm`);
 }else{
  for(const hole of layout.holes){
   drawing+=`<circle cx="${x(hole.x)}" cy="${y(hole.y)}" r="2.5" class="hole"/>`;
   drawing+=line(x(hole.x)-9,y(hole.y),x(hole.x)+9,y(hole.y),'centre')+line(x(hole.x),y(hole.y)-9,x(hole.x),y(hole.y)+9,'centre');
  }
  drawing+=horizontal(0,layout.holes[0].x,y(0)+80,`${mm(layout.holes[0].x)} mm`)+horizontal(layout.holes[0].x,layout.holes[1].x,y(0)+118,`${mm(layout.holes[1].x-layout.holes[0].x)} mm`)+horizontal(layout.holes[1].x,w,y(0)+80,'80 mm');
  drawing+=vertical(x(w)+83,0,layout.holes[0].y,`${mm(layout.holes[0].y)} mm`);
 }
 const support=input.support==='rail'?`2 × ${mm(layout.rail.width)} × 20 × ${layout.rail.thickness} mm`:'2 × Ø5 mm';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w+270}mm" height="${h+220}mm" viewBox="0 0 ${w+270} ${h+220}">
 <style>text{font-family:Inter,Arial,sans-serif;font-size:32px;font-weight:500;fill:#263241}line,rect,circle{stroke:#263241;stroke-width:1;fill:none}.panel{stroke-width:1.3}.dimension{stroke:#596778}.reference{stroke:#a1abb6;stroke-dasharray:4 4}.shelf{stroke:#4380a3;stroke-dasharray:5 3}.rail{fill:#e9eef2}.hole{fill:#fff;stroke:#111}.centre{stroke:#4380a3;stroke-width:.4} .title{font-size:18px;font-weight:bold}</style>
 <rect width="100%" height="100%" fill="white" stroke="none"/>
 ${text(left,32,`${mm(input.panelThickness)} mm`)}
 ${drawing}
 ${text(left,h+200,support)}
 </svg>`;
}
