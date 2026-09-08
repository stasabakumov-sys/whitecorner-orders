import {Injectable,signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
@Injectable({providedIn:'root'})
export class CostingService {
 materials=signal<any[]>([]);groups=signal<any[]>([]);prices=signal<any[]>([]);profiles=signal<any[]>([]);costs=signal<any[]>([]);orders=signal<any[]>([]);
 busy=signal(false);loading=signal(false);error=signal('');
 constructor(private db:SupabaseService){}
 private async pages(query:()=>any){const all:any[]=[];for(let start=0;;start+=250){const {data,error}=await query().range(start,start+249);if(error)throw error;all.push(...(data||[]));if((data||[]).length<250)return all;}}
 async load(){if(this.loading())return;this.loading.set(true);this.error.set('');try{
  const [materials,groups,prices,profiles,costs,orders]=await Promise.all([
   this.pages(()=>this.db.client.from('wc_materials').select('*').order('name').order('id')),
   this.pages(()=>this.db.client.from('wc_material_groups').select('*').order('name').order('id')),
   this.pages(()=>this.db.client.from('wc_material_prices').select('*').order('created_at',{ascending:false}).order('id')),
   this.pages(()=>this.db.client.from('wc_material_profiles').select('*').order('variant_key')),
   this.pages(()=>this.db.client.rpc('wc_costing_report')),
   this.pages(()=>this.db.client.from('wc_orders').select('id,order_number,customer_name,currency,archived,fulfillment_status,wix_status,wc_order_items(*,wc_production_units(*))').eq('is_hidden',false).neq('order_number','10242').order('wix_created_at',{ascending:false}).order('id'))]);
  this.materials.set(materials);this.groups.set(groups);this.prices.set(prices);this.profiles.set(profiles);this.costs.set(costs);this.orders.set(orders);
 }catch{this.error.set('Costing data unavailable. Check the materials migration and retry.');}finally{this.loading.set(false);}}
 async saveMaterial(m:any){return this.write('wc_save_material',{p_id:m.id||null,p_name:m.name,p_unit:m.unit,p_price:m.price_gst===''||m.price_gst==null?null:Number(m.price_gst),p_active:m.active,p_expected:m.updated_at||null,p_group_id:m.group_id});}
 async saveGroup(name:string){return this.write('wc_save_material_group',{p_name:name.trim()});}
 async saveProfile(row:any,lines:any[],expected:string|null){return this.write('wc_save_material_profile',{p_item:row.item_id,p_expected_key:row.variant_key,p_lines:lines.map(l=>({material_id:l.material_id,quantity:Number(l.quantity)})),p_expected:expected});}
 private async write(name:string,args:any){if(this.busy()||this.loading())return false;this.busy.set(true);this.error.set('');try{const {error}=await this.db.client.rpc(name,args);if(error)throw error;await this.load();return true;}catch(e:any){this.error.set(e.message||'Could not save.');return false;}finally{this.busy.set(false);}}
}
