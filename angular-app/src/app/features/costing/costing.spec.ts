import {describe,it,expect,vi} from 'vitest';
import {signal} from '@angular/core';
import {CostingService} from './costing.service';
import {ProductCostingComponent} from './product-costing.component';
import {MaterialsComponent} from './materials.component';
describe('Material costing UI',()=>{
 it('keeps zero price distinct from missing price and sends a concurrency guard',async()=>{
  const rpc=vi.fn(async()=>({})),s=new CostingService({client:{rpc}} as any);vi.spyOn(s,'load').mockResolvedValue();
  await s.saveMaterial({id:'m',name:'MDF',group_id:'g',unit:'sheet',price_gst:0,active:true,updated_at:'version'});
  expect(rpc).toHaveBeenCalledWith('wc_save_material',expect.objectContaining({p_price:0,p_expected:'version',p_group_id:'g'}));
  await s.saveMaterial({name:'MDF',group_id:'g',unit:'sheet',price_gst:'',active:true});expect(rpc).toHaveBeenLastCalledWith('wc_save_material',expect.objectContaining({p_price:null,p_group_id:'g'}));
  await s.saveGroup('  Custom group  ');expect(rpc).toHaveBeenLastCalledWith('wc_save_material_group',{p_name:'Custom group'});
 });
 it('retains the editor and reports failed saves',async()=>{
  const s=new CostingService({client:{rpc:async()=>({error:{message:'Material changed'}})}} as any),c=new MaterialsComponent(s);c.edit();c.draft.name='MDF';await c.save();expect(c.draft.name).toBe('MDF');expect(s.error()).toBe('Material changed');
 });
 it('captures the profile version when opening, rejects duplicate lines and totals recorded units only',async()=>{
  const saveProfile=vi.fn(async()=>true);const s={profiles:signal([{variant_key:'v',updated_at:'old',lines:[{material_id:'m',quantity:1.5}]}]),materials:signal([{id:'m',group_id:'g',active:true}]),groups:signal([{id:'g',name:'MDF'}]),costs:signal([{unit_id:'1',item_id:'i',order_id:'o',variant_key:'v',total_gst:16.5,state:'calculated'},{unit_id:'2',item_id:'i',order_id:'o',total_gst:16.5,state:'calculated'}]),saveProfile};
  const c=new ProductCostingComponent(s as any,{} as any);c.open(s.costs()[0]);s.profiles.set([{variant_key:'v',updated_at:'new',lines:[]}]);
  expect(c.productTotal('i')).toBe(33);expect(c.orderTotal('o')).toBe(33);expect(c.invalid()).toBe(false);
  c.lines.push({material_id:'m',quantity:1});expect(c.invalid()).toBe(true);c.lines.pop();await c.save();expect(saveProfile).toHaveBeenCalledWith(expect.anything(),expect.anything(),'old');
 });
 it('filters materials by an extensible group and keeps legacy rows visible as unassigned',()=>{
  const s={materials:signal([{id:'a',name:'Radiata 12 mm',group_id:'ply',active:true},{id:'b',name:'Old material',group_id:null,active:true}]),groups:signal([{id:'ply',name:'Radiata Ply'}])};
  const c=new MaterialsComponent(s as any);expect(c.visible()).toHaveLength(2);c.groupFilter='ply';expect(c.visible().map(m=>m.id)).toEqual(['a']);c.groupFilter='unassigned';expect(c.visible().map(m=>m.id)).toEqual(['b']);expect(c.groupName('ply')).toBe('Radiata Ply');
 });
 it('marks drift separately and never includes its total as a fresh calculation',()=>{
  const c=new ProductCostingComponent({costs:signal([{order_id:'o',order_number:'1',product_name:'Cart',state:'calculated',changed:true,total_gst:10}])} as any,{} as any);
  expect(c.incomplete('o')).toBe(true);c.filter='calculated';expect(c.visible()).toHaveLength(0);c.filter='changed';expect(c.visible()).toHaveLength(1);
 });
});
