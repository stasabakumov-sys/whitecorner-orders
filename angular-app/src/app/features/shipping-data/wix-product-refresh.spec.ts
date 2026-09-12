import {describe,it,expect,vi} from 'vitest';
import {WixProductSnapshotComponent} from './wix-product-snapshot.component';
describe('Wix product refresh',()=>{
 it('retains the saved product on failure, permits retry and shows success only after saving',async()=>{
  let finish!:(value:any)=>void;
  const invoke=vi.fn(()=>new Promise(resolve=>finish=resolve));
  const c=new WixProductSnapshotComponent({client:{functions:{invoke}}} as any);
  c.productId='product';const old={name:'Old',variants:[]};c.product.set(old);
  const first=c.refresh();expect(c.busy()).toBe(true);expect(c.message()).toBe('');await c.refresh();expect(invoke).toHaveBeenCalledOnce();
  finish({data:{ok:false,error:'Permission denied'},error:null});await first;
  expect(c.product()).toBe(old);expect(c.error()).toBe('Permission denied');expect(c.busy()).toBe(false);
  const second=c.refresh();finish({data:{ok:true,source_product:{name:'Updated',variants:[{id:'three'}]}}});await second;
  expect(c.product().variants).toHaveLength(1);expect(c.error()).toBe('');expect(c.message()).toContain('updated');
 });
});
