import { Injectable, signal } from '@angular/core';
import { OrderRow } from '../models/order.models';
import { OrdersService } from './orders.service';
import { SupabaseService } from './supabase.service';

export interface FulfilmentRow {
  id: string;
  order_id: string;
  route: 'Pickup'|'Shipping';
  status: 'Awaiting Pickup'|'Shipping Preparation'|'Shipping Booked'|'Fulfilled';
  ready_at: string;
  pickup_email_status: 'Not required'|'Pending integration'|'Sent';
  pickup_email_sent_at?: string|null;
  shipping_booked_at?: string|null;
  fulfilled_at?: string|null;
  updated_at?: string|null;
}

export interface ShipmentRow {
  id:string;
  fulfilment_id:string;
  order_id:string;
  status:'Packaging Review'|'Ready to Book'|'Shipping Booked'|'In Transit'|'Delivered';
  created_at?:string;
  updated_at?:string;
}

export interface ShipmentPackageRow {
  id:string;
  shipment_id:string;
  package_no:number;
  package_name?:string|null;
  length_mm?:number|null;
  width_mm?:number|null;
  height_mm?:number|null;
  weight_kg?:number|null;
  source_type:'Profile'|'Manual';
  shipping_product_id?:string|null;
}

type ShippingProduct={id:string;product_name:string};
type ShippingPackage={shipping_product_id:string;source_type?:string|null;package_no:number;package_name?:string|null;length_mm?:number|null;width_mm?:number|null;height_mm?:number|null;weight_kg?:number|null};

@Injectable({providedIn:'root'})
export class FulfilmentService {
  readonly rows = signal<FulfilmentRow[]>([]);
  readonly shipments = signal<ShipmentRow[]>([]);
  readonly shipmentPackages = signal<ShipmentPackageRow[]>([]);
  readonly error = signal('');
  readonly loading = signal(false);

  constructor(private supabase:SupabaseService, private orders:OrdersService) {}

  private isReady(order:OrderRow){
    const units=(order.wc_order_items??[]).flatMap(i=>i.wc_production_units??[]);
    return units.length>0 && units.every(u=>(u.production_status||'New')==='Ready');
  }

  private route(order:OrderRow):'Pickup'|'Shipping'{
    return String(order.delivery_type||'Shipping').toLowerCase()==='pickup'?'Pickup':'Shipping';
  }

  private normalise(v:string){return String(v||'').toLowerCase().replace(/[–—]/g,'-').split(' - ')[0].replace(/[^a-z0-9]+/g,' ').trim();}

  async load(){
    this.loading.set(true); this.error.set('');
    const [fr,sr,pr]=await Promise.all([
      this.supabase.client.from('wc_fulfilment').select('*').order('ready_at',{ascending:false}),
      this.supabase.client.from('wc_shipments').select('*').order('created_at',{ascending:false}),
      this.supabase.client.from('wc_shipment_packages').select('*').order('package_no')
    ]);
    if(fr.error){ this.loading.set(false); this.error.set(fr.error.message); return; }
    this.rows.set((fr.data??[]) as FulfilmentRow[]);
    if(!sr.error)this.shipments.set((sr.data??[]) as ShipmentRow[]);
    if(!pr.error)this.shipmentPackages.set((pr.data??[]) as ShipmentPackageRow[]);
    await this.ensureReadyOrders();
    await this.ensureShipments();
    this.loading.set(false);
  }

  async ensureReadyOrders(){
    const existing=new Set(this.rows().map(x=>x.order_id));
    const missing=this.orders.orders().filter(o=>this.isReady(o)&&!existing.has(o.id));
    if(!missing.length) return;
    const payload=missing.map(o=>{
      const route=this.route(o);
      return {order_id:o.id,route,status:route==='Pickup'?'Awaiting Pickup':'Shipping Preparation',pickup_email_status:route==='Pickup'?'Pending integration':'Not required'};
    });
    const {data,error}=await this.supabase.client.from('wc_fulfilment').insert(payload).select();
    if(error){this.error.set(error.message);return;}
    this.rows.set([...(data??[]) as FulfilmentRow[],...this.rows()]);
  }

  async ensureShipments(){
    const shippingRows=this.rows().filter(r=>r.route==='Shipping');
    const existing=new Set(this.shipments().map(s=>s.fulfilment_id));
    const missing=shippingRows.filter(r=>!existing.has(r.id));
    if(missing.length){
      const {data,error}=await this.supabase.client.from('wc_shipments').insert(missing.map(r=>({fulfilment_id:r.id,order_id:r.order_id,status:'Packaging Review'}))).select();
      if(error){if(!String(error.message).includes('wc_shipments'))this.error.set(error.message);return;}
      this.shipments.set([...(data??[]) as ShipmentRow[],...this.shipments()]);
    }
    for(const s of this.shipments())if(!this.shipmentPackages().some(p=>p.shipment_id===s.id))await this.seedPackages(s);
  }

  private async seedPackages(shipment:ShipmentRow){
    const order=this.orders.orders().find(o=>o.id===shipment.order_id); if(!order)return;
    const [prodRes,pkgRes]=await Promise.all([
      this.supabase.client.from('wc_shipping_products').select('id,product_name').eq('active',true),
      this.supabase.client.from('wc_shipping_packages').select('*').eq('active',true).eq('source_type','Base').order('package_no')
    ]);
    if(prodRes.error||pkgRes.error)return;
    const products=(prodRes.data??[]) as ShippingProduct[], profiles=(pkgRes.data??[]) as ShippingPackage[];
    const out:any[]=[]; let no=1;
    for(const item of order.wc_order_items??[]){
      if(/^delivery$/i.test(item.product_name||''))continue;
      const match=products.find(p=>this.normalise(p.product_name)===this.normalise(item.product_name||''));
      if(!match)continue;
      const base=profiles.filter(p=>p.shipping_product_id===match.id);
      const qty=Math.max(1,Number(item.quantity||1));
      for(let q=0;q<qty;q++)for(const p of base)out.push({shipment_id:shipment.id,package_no:no++,package_name:p.package_name,length_mm:p.length_mm,width_mm:p.width_mm,height_mm:p.height_mm,weight_kg:p.weight_kg,source_type:'Profile',shipping_product_id:match.id});
    }
    if(!out.length)return;
    const {data,error}=await this.supabase.client.from('wc_shipment_packages').insert(out).select();
    if(!error)this.shipmentPackages.update(xs=>[...xs,...((data??[]) as ShipmentPackageRow[])]);
    await this.syncShipmentStatus(shipment.id);
  }

  orderFor(row:FulfilmentRow){return this.orders.orders().find(o=>o.id===row.order_id)??null;}
  shipmentFor(row:FulfilmentRow){return this.shipments().find(s=>s.fulfilment_id===row.id)??null;}
  packagesFor(shipmentId:string){return this.shipmentPackages().filter(p=>p.shipment_id===shipmentId).sort((a,b)=>a.package_no-b.package_no);}
  packageComplete(p:ShipmentPackageRow){return p.length_mm!=null&&p.width_mm!=null&&p.height_mm!=null&&p.weight_kg!=null;}
  shipmentComplete(shipmentId:string){const ps=this.packagesFor(shipmentId);return ps.length>0&&ps.every(p=>this.packageComplete(p));}

  async addPackage(shipment:ShipmentRow){
    const next=Math.max(0,...this.packagesFor(shipment.id).map(p=>p.package_no))+1;
    const {data,error}=await this.supabase.client.from('wc_shipment_packages').insert({shipment_id:shipment.id,package_no:next,package_name:'Package '+next,source_type:'Manual'}).select().single();
    if(error){this.error.set(error.message);return;}
    this.shipmentPackages.update(xs=>[...xs,data as ShipmentPackageRow]); await this.syncShipmentStatus(shipment.id);
  }

  async savePackage(pkg:ShipmentPackageRow, values:{package_name:string;length_mm:number|null;width_mm:number|null;height_mm:number|null;weight_kg:number|null}){
    const payload={...values,updated_at:new Date().toISOString()};
    const {error}=await this.supabase.client.from('wc_shipment_packages').update(payload).eq('id',pkg.id);
    if(error){this.error.set(error.message);return;}
    this.shipmentPackages.update(xs=>xs.map(x=>x.id===pkg.id?{...x,...payload}:x)); await this.syncShipmentStatus(pkg.shipment_id);
  }

  async removePackage(pkg:ShipmentPackageRow){
    const {error}=await this.supabase.client.from('wc_shipment_packages').delete().eq('id',pkg.id); if(error){this.error.set(error.message);return;}
    this.shipmentPackages.update(xs=>xs.filter(x=>x.id!==pkg.id)); await this.syncShipmentStatus(pkg.shipment_id);
  }

  private async syncShipmentStatus(id:string){
    const s=this.shipments().find(x=>x.id===id); if(!s||s.status==='Shipping Booked'||s.status==='In Transit'||s.status==='Delivered')return;
    const status=this.shipmentComplete(id)?'Ready to Book':'Packaging Review';
    if(s.status===status)return;
    await this.supabase.client.from('wc_shipments').update({status,updated_at:new Date().toISOString()}).eq('id',id);
    this.shipments.update(xs=>xs.map(x=>x.id===id?{...x,status}:x));
  }

  async markCollected(row:FulfilmentRow){
    const now=new Date().toISOString();
    const {error}=await this.supabase.client.from('wc_fulfilment').update({status:'Fulfilled',fulfilled_at:now,updated_at:now}).eq('id',row.id);
    if(error){this.error.set(error.message);return;}
    this.rows.update(xs=>xs.map(x=>x.id===row.id?{...x,status:'Fulfilled',fulfilled_at:now,updated_at:now}:x));
  }

  async markShippingBooked(row:FulfilmentRow){
    const shipment=this.shipmentFor(row); if(!shipment||!this.shipmentComplete(shipment.id)){this.error.set('Complete all package dimensions and weight before booking shipping.');return;}
    const now=new Date().toISOString();
    const [a,b]=await Promise.all([
      this.supabase.client.from('wc_fulfilment').update({status:'Shipping Booked',shipping_booked_at:now,updated_at:now}).eq('id',row.id),
      this.supabase.client.from('wc_shipments').update({status:'Shipping Booked',updated_at:now}).eq('id',shipment.id)
    ]);
    if(a.error||b.error){this.error.set(a.error?.message||b.error?.message||'Could not update shipping status');return;}
    this.rows.update(xs=>xs.map(x=>x.id===row.id?{...x,status:'Shipping Booked',shipping_booked_at:now,updated_at:now}:x));
    this.shipments.update(xs=>xs.map(x=>x.id===shipment.id?{...x,status:'Shipping Booked'}:x));
  }
}
