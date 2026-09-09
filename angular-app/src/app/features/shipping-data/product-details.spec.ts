import {describe,it,expect,vi} from 'vitest';
import {ProductDetailsComponent} from './product-details.component';
describe('Local product details',()=>{
 it('saves only local fields to the selected product',async()=>{
  const single=vi.fn().mockResolvedValue({data:{id:'cart',short_name:'Classic',manual_sizes:'1400 x 600 mm'}});
  const eq=vi.fn().mockReturnValue({select:()=>({single})});const update=vi.fn().mockReturnValue({eq});
  const c=new ProductDetailsComponent({client:{from:()=>({update})}} as any);c.product={id:'cart'};c.shortName=' Classic ';c.sizes='1400 x 600 mm\n1400 x 600 mm';
  await c.save();expect(update).toHaveBeenCalledWith({short_name:'Classic',manual_sizes:'1400 x 600 mm'});expect(eq).toHaveBeenCalledWith('id','cart');expect(c.done).toBe(true);
 });
 it('retains input after a failed save',async()=>{
  const c=new ProductDetailsComponent({client:{from:()=>{throw Error('offline');}}} as any);
  c.product={id:'backdrop'};c.shortName='Arch';await c.save();expect(c.shortName).toBe('Arch');expect(c.error).toContain('Could not save');expect(c.done).toBe(false);
 });
});
