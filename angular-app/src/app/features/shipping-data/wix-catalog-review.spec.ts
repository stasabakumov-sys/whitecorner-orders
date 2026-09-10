import {describe, it, expect} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {WixCatalogReviewComponent} from './wix-catalog-review.component';
import {reconcileCatalogue} from './wix-catalog-review';
const p = (id: string, name: string) => ({id,name,visible:true,variantCount:2});
describe('Wix catalogue identity review', () => {
  it('keeps backdrop UUID after rename, flags name candidates and preserves absent/unlinked products', () => {
    const hub = [{id:'local-backdrop',wix_product_id:'wix-backdrop',product_name:'Old backdrop'},
      {id:'local-cart',wix_product_id:null,product_name:'Cart'},
      {id:'old',wix_product_id:'old-wix',product_name:'Old item'}];
    const before = JSON.stringify(hub);
    const r = reconcileCatalogue([p('wix-backdrop','New backdrop'),p('cart','Cart'),p('new','New product')], hub);
    expect(r.rows[0].hubIds).toEqual(['local-backdrop']); expect(r.rows[1].status).toBe('Review match');
    expect(r.newCount).toBe(1); expect(r.absent[0].id).toBe('old'); expect(r.unlinked).toHaveLength(1);
    expect(JSON.stringify(hub)).toBe(before);
  });
  it('does not merge two Wix products sharing a name', () => {
    expect(reconcileCatalogue([p('a','Backdrop'),p('b','Backdrop')], []).review).toBe(2);
  });
  it('withholds the report after a partial fetch error; retry starts a fresh review', async () => {
    let calls = 0;
    const db: any = {client:{from:()=>({select:()=>({order:()=>({range:async()=>({data:[]})})})}),functions:{invoke:async()=>{
      calls++;
      if (calls === 2) return {error:{context:{json:async()=>({error:'Permission denied'})}}};
      return {data:{version:'V1_CATALOG',products:[p('a','Backdrop')],total:2,complete:false,nextOffset:1,nextCursor:null}};
    }}}};
    const c = TestBed.runInInjectionContext(() => new WixCatalogReviewComponent(db)); await c.review();
    expect(c.report()).toBeNull(); expect(c.error()).toBe('Permission denied'); expect(c.busy()).toBe(false);
    db.client.functions.invoke = async () => ({data:{version:'V1_CATALOG',products:[p('a','Backdrop')],total:1,complete:true,nextOffset:null,nextCursor:null}});
    await c.review(); expect(c.report()?.newCount).toBe(1); expect(c.progress()).toBe(1);
  });
});
