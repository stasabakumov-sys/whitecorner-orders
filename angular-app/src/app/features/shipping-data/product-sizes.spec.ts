import {describe,it,expect,vi} from 'vitest';
import {backdropSizeKey,backdropDrawingKey,packagingSizes} from './product-sizes';
import {BoxDrawingComponent} from './box-drawing.component';
describe('Backdrop shared box library',()=>{
 it('matches equivalent metric dimensions without guessing sizes',()=>{
  expect(backdropSizeKey('190cm x 95cm')).toBe('1900x950');expect(backdropSizeKey('950 × 1900 mm')).toBe('1900x950');
  for(const s of ['Size II','190 x 95','190cm x 95cm x 3cm','0cm x 95cm'])expect(backdropSizeKey(s)).toBe('');
 });
 it('uses product options and not box measurements for size',()=>{
  expect(packagingSizes({template_item:{wix_options:{Size:'190cm x 95cm'}},packages:[{length_mm:970,width_mm:970,contents:[]}]},'Backdrop')).toEqual(['190cm x 95cm']);
 });
 it('reads the same size library entry for different backdrop products',async()=>{
  const eq=vi.fn();const row={filename:'shared.cdr',size_key:'1900x950'};const query={select:()=>query,eq:(...args:any[])=>{eq(...args);return query;},maybeSingle:async()=>({data:row})};const from=vi.fn((table:string)=>query);
  for(const signature of ['backdrop-A','backdrop-B']){const c=new BoxDrawingComponent({client:{from}} as any);c.signature=signature;c.sharedSize='1900x950';await c.load();expect(c.current).toEqual(row);}
  expect(from.mock.calls.every(c=>c[0]==='wc_backdrop_box_drawings')).toBe(true);expect(eq).toHaveBeenCalledWith('size_key','1900x950');
 });
});

describe('Shared backdrop folding key',()=>{
 const profile=(fold:any,size='200cm x 100cm')=>({template_item:{wix_options:{Size:size,...(fold===undefined?{}:{Foldable:fold})}}});
 it('separates folded and non-folded packaging and ignores colour',()=>{
  expect(backdropDrawingKey(profile('YES'),'Backdrop')).toBe('2000x1000:foldable');
  expect(backdropDrawingKey(profile('NO'),'Backdrop')).toBe('2000x1000:nonfoldable');
  const p=profile('YES','1000 × 2000 mm');Object.assign(p.template_item.wix_options,{Colour:'Raw'});
  expect(backdropDrawingKey(p,'Another Backdrop')).toBe('2000x1000:foldable');
 });
 it('requires explicit size and folding, without guessing from the product title',()=>{
  for(const value of [undefined,'','YES/NO','maybe'])expect(backdropDrawingKey(profile(value),'Foldable Backdrop')).toBe('');
  expect(backdropDrawingKey(profile('YES','Size II'),'Backdrop')).toBe('');
 });
 it('reads saved main-component options and rejects conflicting folding values',()=>{
  const p:any={packages:[{contents:[{product_name:'Backdrop',component_key:'main',profile_item_key:JSON.stringify(['id',['size 200cm x 100cm','foldable no']])+':1'}]}]};
  expect(backdropDrawingKey(p,'Backdrop')).toBe('2000x1000:nonfoldable');
  p.template_item=profile('YES').template_item;expect(backdropDrawingKey(p,'Backdrop')).toBe('');
 });
});
