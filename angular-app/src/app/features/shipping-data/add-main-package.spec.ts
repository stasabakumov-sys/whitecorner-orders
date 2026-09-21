import {describe,it,expect,vi} from 'vitest';
import {AddMainPackageComponent} from './add-main-package.component';

function setup(fail=false){
 const insert=vi.fn();
 const query:any={select:()=>query,eq:vi.fn(()=>query),order:()=>query,limit:async()=>({data:[{package_no:3}],error:null})};
 insert.mockImplementation((payload:any)=>({select:()=>({single:async()=>fail?{error:{message:'Network unavailable'}}:{data:{...payload,id:'saved-box'},error:null}})}));
 query.insert=insert;
 const c=new AddMainPackageComponent({client:{from:()=>query}} as any);
 c.productId='cart';c.sizeKey='size ii';c.sizeLabel='Size II';c.start();
 c.draft={package_name:'Main box',length_mm:1400,width_mm:600,height_mm:100,weight_kg:20};
 return{c,insert,query};
}
describe('Adding reusable Main packaging',()=>{
 it('inserts the first or next box for the selected product and size and emits confirmed data',async()=>{
  const{c,insert,query}=setup();const emit=vi.spyOn(c.packageSaved,'emit');await c.save();
  expect(query.eq).toHaveBeenCalledWith('size_key','size ii');
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({shipping_product_id:'cart',size_key:'size ii',source_type:'Base',package_no:4,weight_kg:20}));
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({id:'saved-box'}));expect(c.saved()).toBe(true);expect(c.editing).toBe(false);
 });
 it('rejects missing dimensions without writing',async()=>{
  const{c,insert}=setup();c.draft.width_mm=null;await c.save();expect(insert).not.toHaveBeenCalled();expect(c.error()).toContain('positive');expect(c.editing).toBe(true);
 });
 it('retains inputs and permits retry when saving fails',async()=>{
  const{c}=setup(true);const emit=vi.spyOn(c.packageSaved,'emit');await c.save();
  expect(c.error()).toContain('Network unavailable');expect(c.draft.weight_kg).toBe(20);expect(c.editing).toBe(true);expect(c.saving()).toBe(false);expect(c.saved()).toBe(false);expect(emit).not.toHaveBeenCalled();
 });
 it('does not write on cancel',()=>{const{c,insert}=setup();c.cancel();expect(insert).not.toHaveBeenCalled();expect(c.editing).toBe(false);});
});
