import {expect,it} from 'vitest';
import {signal} from '@angular/core';
import {ShippingDataComponent} from './shipping-data.component';

it('shows saved sizes immediately, then replaces them with Wix changes without losing the card on failure',async()=>{
 const old={id:'wix-id',name:'Arch',variants:[{id:'old',choices:{Size:'180cm x 100cm'}}]};
 const current={...old,variants:[{id:'new',choices:{Size:'200cm x 100cm'}}]};
 let result:any={data:{ok:true,source_product:current},error:null};
 const c=Object.create(ShippingDataComponent.prototype) as ShippingDataComponent;
 c.selectedId=signal('hub-id');c.finishCatalog=signal(null);c.catalogProducts=signal({});
 c.catalogUpdating=signal(false);c.catalogRefreshError=signal('');c.products=signal([{id:'hub-id',product_name:'Arch'}] as any);
 (c as any).catalogRequest=0;
 (c as any).supabase={client:{
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{source_product:old},error:null})})})}),
  functions:{invoke:async()=>result}
 }};
 await c.loadFinishCatalog('hub-id');
 expect(c.wixSizes(c.products()[0])).toEqual(['200cm x 100cm']);
 expect(c.catalogRefreshError()).toBe('');
 result={data:null,error:new Error('Wix unavailable')};
 await c.loadFinishCatalog('hub-id');
 expect(c.wixSizes(c.products()[0])).toEqual(['180cm x 100cm']);
 expect(c.catalogRefreshError()).toContain('Saved product data is shown');
});
