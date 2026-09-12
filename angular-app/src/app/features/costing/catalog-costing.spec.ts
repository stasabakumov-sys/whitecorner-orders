import {describe,it,expect,vi} from 'vitest';
import {signal} from '@angular/core';
import {ProductCostingComponent} from './product-costing.component';
import {CatalogCostEditorComponent} from './catalog-cost-editor.component';
import {ProductionService} from '../../core/services/production.service';
import {packageComponents} from '../../../../../supabase/functions/_shared/delivery-review-domain';
describe('Shared catalogue costing',()=>{
 it('keeps tabletop design as an option, not a packaging component',()=>{
  expect(packageComponents([{id:'a',product_name:'Cart',quantity:1,wix_options:{'Tabletop design':'Plain - without cutouts'}}] as any).map(x=>x.component_key)).toEqual(['main']);
 });
 it('shows sales excluding GST-inclusive delivery and deducts the complete saved Pans total once',()=>{
  const o:any={id:'o',total:1200,shipping:100,raw_order:{shippingInfo:{cost:{totalPriceAfterTax:{amount:110}}}},wc_order_items:[{id:'i',quantity:2,wix_options:{Pans:'With 13 pans'}}]};
  const s={parts:signal([{item_id:'i',variant_key:'v'}]),pans:signal([{order_id:'o',total_gst:80,snapshot:[{item_id:'i',quantity:2,variant_key:'v'}]}])};
  const c=new ProductCostingComponent(s as any,{} as any);expect(c.productSales(o)).toBe(1090);expect(c.pansTotal(o)).toBe(80);expect(c.productLessPans(o)).toBe(1010);
  s.pans.set([]);expect(c.pansTotal(o)).toBeNull();expect(c.productLessPans(o)).toBeNull();o.wc_order_items[0].wix_options.Pans='Shelf without steel pans';expect(c.pansTotal(o)).toBe(0);
 });
 it('excludes Ready main products even if addon placeholders are not Ready',()=>{
  const o:any={id:'o',currency:'AUD',wc_order_items:[{id:'m',product_name:'Cart',quantity:1,wc_production_units:[{id:'u',unit_index:1,production_status:'Ready'}]},{id:'a',product_name:'Additional Tabletop',quantity:1,wc_production_units:[{id:'extra',unit_index:1,production_status:'New'}]}]};
  const c=new ProductCostingComponent({orders:signal([o]),costs:signal([]),parts:signal([])} as any,new ProductionService({} as any,{} as any,{} as any,{} as any));expect(c.views()).toEqual([]);
 });
 it('keeps products without Board units visible with a composition warning',()=>{
  const o:any={id:'o',currency:'AUD',wc_order_items:[{id:'m',product_name:'Cart',quantity:1,wc_production_units:[]}]};
  const c=new ProductCostingComponent({orders:signal([o]),costs:signal([]),parts:signal([])} as any,new ProductionService({} as any,{} as any,{} as any,{} as any));
  expect(c.views()).toHaveLength(1);expect(c.views()[0].issues.join(' ')).toContain('product quantity does not match');
 });
 it('loads the saved profile and preserves other unsaved editors across a service refresh',()=>{
  const e=new CatalogCostEditorComponent({materials:signal([{id:'m',active:true,price_gst:11}])} as any);
  e.part={variant_key:'v',profile:{lines:[{material_id:'m',quantity:2}],materials_confirmed:true,work_costs:{cnc:4},updated_at:'old'}};e.ngOnChanges();expect(e.materialTotal()).toBe(22);e.lines[0].quantity=3;
  e.part={...e.part,profile:{...e.part.profile,updated_at:'new'}};e.ngOnChanges();expect(e.lines[0].quantity).toBe(3);expect(e.version).toBe('old');
 });
 it('saves one backdrop material edit to both paint variants while preserving their work snapshots',async()=>{const saveCatalogProfile=vi.fn().mockResolvedValue(true);const service:any={materials:signal([]),profiles:signal([]),saveCatalogProfile};const e=new CatalogCostEditorComponent(service);e.showWork=false;e.part={variant_key:'white',shared_parts:[{variant_key:'white',profile:{updated_at:'w',work_costs:{painting:10}}},{variant_key:'raw',profile:{updated_at:'r',work_costs:{painting:0}}}]};e.lines=[];e.confirmed=true;await e.save();expect(saveCatalogProfile).toHaveBeenNthCalledWith(1,e.part.shared_parts[0],[],{painting:10},null,true,'w');expect(saveCatalogProfile).toHaveBeenNthCalledWith(2,e.part.shared_parts[1],[],{painting:0},null,true,'r');});
});
