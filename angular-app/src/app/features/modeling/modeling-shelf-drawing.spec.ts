import {describe,it,expect} from 'vitest';
import {shelfPlacement,shelfDrawingSvg,ShelfDrawingInput} from './modeling-shelf-drawing';
const classic:ShelfDrawingInput={width:547,height:775,panelThickness:18,shelfThickness:15,support:'rail',material:'Plywood',product:'Classic 1200 x 600 x 900'};
describe('Shelf positioning drawings',()=>{
 it('matches rail placement and pin centres measured from Sides.ai',()=>{
  const layout=shelfPlacement(classic);
  expect(layout.shelfBottom).toBe(380);expect(layout.shelfTop).toBe(395);
  expect(layout.rail).toEqual({x:82,y:360,width:465,height:20,thickness:15});
  expect(layout.holes).toEqual([{x:142,y:375},{x:467,y:375}]);expect(layout.diameter).toBe(5);
 });
 it('keeps a centred MDF shelf, adjusts side depth for thinner front and uses a 16 mm rail',()=>{
  const shaker=shelfPlacement({...classic,width:544,height:645,shelfThickness:16,material:'MDF'});
  const plain=shelfPlacement({...classic,width:552,height:695,shelfThickness:16,material:'MDF'});
  expect(shaker.shelfBottom+8).toBe(322.5);expect(plain.shelfBottom+8).toBe(347.5);
  expect(plain.rail.width-shaker.rail.width).toBe(8);expect(plain.rail.thickness).toBe(16);
  expect(plain.holes[1].x-shaker.holes[1].x).toBe(8);
 });
 it('shows hole coordinates and diameter without drawing a rail for plastic support',()=>{
  const svg=shelfDrawingSvg({...classic,support:'plastic',product:'Cart <test> & sample'});
  expect(svg).toContain('142 mm');expect(svg).toContain('325 mm - centres');expect(svg).toContain('375 mm - hole centres');
  expect(svg).toContain('diameter 5 mm');expect(svg.match(/class="hole"/g)).toHaveLength(2);expect(svg).not.toContain('class="rail"/>');
  expect(svg).toContain('Cart &lt;test&gt; &amp; sample');
 });
 it('rejects missing dimensions and layouts where supports overlap',()=>{
  expect(()=>shelfPlacement({...classic,width:0})).toThrow('dimensions');
  expect(()=>shelfPlacement({...classic,width:200})).toThrow('too small');
 });
});
