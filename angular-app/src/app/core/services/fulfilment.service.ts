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

@Injectable({providedIn:'root'})
export class FulfilmentService {
  readonly rows = signal<FulfilmentRow[]>([]);
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

  async load(){
    this.loading.set(true); this.error.set('');
    const {data,error}=await this.supabase.client.from('wc_fulfilment').select('*').order('ready_at',{ascending:false});
    if(error){ this.loading.set(false); this.error.set(error.message); return; }
    this.rows.set((data??[]) as FulfilmentRow[]);
    await this.ensureReadyOrders();
    this.loading.set(false);
  }

  async ensureReadyOrders(){
    const existing=new Set(this.rows().map(x=>x.order_id));
    const missing=this.orders.orders().filter(o=>this.isReady(o)&&!existing.has(o.id));
    if(!missing.length) return;
    const payload=missing.map(o=>{
      const route=this.route(o);
      return {
        order_id:o.id,
        route,
        status:route==='Pickup'?'Awaiting Pickup':'Shipping Preparation',
        pickup_email_status:route==='Pickup'?'Pending integration':'Not required'
      };
    });
    const {data,error}=await this.supabase.client.from('wc_fulfilment').insert(payload).select();
    if(error){this.error.set(error.message);return;}
    this.rows.set([...(data??[]) as FulfilmentRow[],...this.rows()]);
  }

  orderFor(row:FulfilmentRow){return this.orders.orders().find(o=>o.id===row.order_id)??null;}

  async markCollected(row:FulfilmentRow){
    const now=new Date().toISOString();
    const {error}=await this.supabase.client.from('wc_fulfilment').update({status:'Fulfilled',fulfilled_at:now,updated_at:now}).eq('id',row.id);
    if(error){this.error.set(error.message);return;}
    this.rows.update(xs=>xs.map(x=>x.id===row.id?{...x,status:'Fulfilled',fulfilled_at:now,updated_at:now}:x));
  }

  async markShippingBooked(row:FulfilmentRow){
    const now=new Date().toISOString();
    const {error}=await this.supabase.client.from('wc_fulfilment').update({status:'Shipping Booked',shipping_booked_at:now,updated_at:now}).eq('id',row.id);
    if(error){this.error.set(error.message);return;}
    this.rows.update(xs=>xs.map(x=>x.id===row.id?{...x,status:'Shipping Booked',shipping_booked_at:now,updated_at:now}:x));
  }
}
