import { describe, it, expect, vi } from 'vitest';
import { packageComponents } from '../utils/package-components';
import { FulfilmentService } from './fulfilment.service';
import { OrdersService } from './orders.service';
const item=(id='line',quantity=1,options:any={Colour:'Pink',Shelf:'Yes',Tray:'Yes - painted'})=>({id,product_name:'Cart',quantity,wix_options:options,catalog_reference:{catalogItemId:'product',options:{options}},raw_item:{descriptionLines:Object.entries(options).map(([name,value])=>({name:{original:name},plainText:{original:value}}))}} as any);
function setup(quantity=1,options?:any){
 const saved:any={};
 const from=vi.fn((table:string)=>{let rows:any;const q:any={delete:()=>q,eq:()=>q,update:()=>q,insert:(r:any)=>{rows=r;saved[table]=structuredClone(r);return q;},select:()=>q,then:(resolve:any)=>resolve({data:rows||[],error:null})};return q;});
 const orders=new OrdersService({client:{from}} as any),order:any={id:'order',order_number:'fixture',wc_order_items:[item('line',quantity,options)]};orders.orders.set([order]);
 const service=new FulfilmentService({client:{from}} as any,orders,{} as any,{} as any,{} as any),shipment:any={id:'shipment',order_id:'order',status:'Packaging Review'};
 service.shipments.set([shipment]);service.shippingProducts.set([{id:'profile',wix_product_id:'product',product_name:'Cart'} as any]);
 vi.spyOn(service as any,'invalidateShipmentQuote').mockResolvedValue(undefined);
 const box=(id:string,contents:any[])=>({id,shipment_id:'shipment',package_no:Number(id),length_mm:100,width_mm:100,height_mm:100,weight_kg:1,contents} as any);
 return {service,order,shipment,saved,box};
}
describe('package components regression',()=>{
 it('extracts selected addons once from Wix option and localized description shapes',()=>{
  const row=item();expect(packageComponents([row]).map(c=>c.component_name)).toEqual(['Cart','Shelf','Tray: Yes - painted']);
  expect(packageComponents([item('line',1,{Colour:'Blue',Shelf:'No'})])).toHaveLength(1);
  delete row.wix_options;delete row.catalog_reference;expect(packageComponents([row])).toHaveLength(3);
 });
 it('requires every addon and permits separate boxes',()=>{
  const s=setup(),c=s.service.packageComponents(s.order);s.service.shipmentPackages.set([s.box('1',[c[0]])]);
  expect(s.service.unassignedOrderItems('shipment').map(x=>x.component_name)).toEqual(['Shelf','Tray: Yes - painted']);expect(s.service.shipmentComplete('shipment')).toBe(false);
  s.service.shipmentPackages.update(ps=>[...ps,s.box('2',c.slice(1))]);expect(s.service.shipmentComplete('shipment')).toBe(true);
 });
 it('allows a component in multiple boxes and deduplicates within a box',async()=>{
  const s=setup(),c=s.service.packageComponents(s.order);s.service.shipmentPackages.set([s.box('1',c),s.box('2',[c[0]])]);
  expect(await s.service.savePackageContents(s.service.shipmentPackages()[1],[c[0],c[0]])).toBe(true);expect(s.service.shipmentPackages()[1].contents).toHaveLength(1);expect(s.service.shipmentComplete('shipment')).toBe(true);
 });
 it('requires every quantity unit; legacy parent assignments do not cover addons',()=>{
  const s=setup(2),c=s.service.packageComponents(s.order);expect(c).toHaveLength(6);expect(new Set(c.map(x=>x.id)).size).toBe(6);
  s.service.shipmentPackages.set([s.box('1',[{order_item_id:'line',product_name:'Cart'}])]);expect(s.service.unassignedOrderItems('shipment')).toHaveLength(5);
  s.service.shipmentPackages.set([s.box('1',c)]);expect(s.service.shipmentComplete('shipment')).toBe(true);expect(packageComponents([item('line',2,{Shelf:'2'})])).toHaveLength(6);
 });
 it('roundtrips full profile distribution with new IDs without multiplying boxes',async()=>{
  const s=setup(2),c=s.service.packageComponents(s.order);s.service.shipmentPackages.set([s.box('1',c.filter(x=>x.component_key==='main')),s.box('2',c.filter(x=>x.component_key!=='main')),s.box('3',[c[0]])]);
  await s.service.savePackagesAsProductProfile(s.shipment);expect(s.service.error()).toBe('');expect(s.saved.wc_shipping_packages).toHaveLength(3);
  s.order.wc_order_items=[item('new-line',2)];s.service.shipmentPackages.set([]);await (s.service as any).seedPackages(s.shipment);
  expect(s.service.shipmentPackages()).toHaveLength(3);expect(s.service.shipmentPackages()[0].contents?.map(x=>x.order_item_id)).toEqual(['new-line','new-line']);expect(s.service.shipmentComplete('shipment')).toBe(true);
  s.order.wc_order_items=[item('changed',1)];s.service.shipmentPackages.set([]);await (s.service as any).seedPackages(s.shipment);expect(s.service.shipmentPackages()).toHaveLength(0);
 });
 it('keeps plain products and rejects unknown selections',async()=>{
  const s=setup(1,{}),c=s.service.packageComponents(s.order);expect(c).toHaveLength(1);s.service.shipmentPackages.set([s.box('1',c)]);expect(s.service.shipmentComplete('shipment')).toBe(true);
  expect(await s.service.savePackageContents(s.box('1',[]),[{...c[0],component_key:'missing'}])).toBe(false);
 });
});
