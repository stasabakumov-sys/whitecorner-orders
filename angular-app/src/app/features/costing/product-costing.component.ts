import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {DrawerModule} from 'primeng/drawer';
import {ProductionService} from '../../core/services/production.service';
import {orderCostingView} from './order-costing-view';
import {isDeliveryLine} from '../../core/utils/order-products';
import {CostingService} from './costing.service';
@Component({selector:'app-product-costing',standalone:true,imports:[CommonModule,FormsModule,RouterLink,DrawerModule],styleUrl:'./costing.css',templateUrl:'./product-costing.component.html'})
export class ProductCostingComponent implements OnInit {
 orderId:string|null=null;
 readonly hasCost=(c:any)=>c.total_gst!=null;
 views(){return this.s.orders().filter(o=>this.s.costs().some(c=>c.order_id===o.id)||(!o.archived&&(o.currency||'AUD')==='AUD'&&String(o.fulfillment_status).toUpperCase()!=='FULFILLED'&&!['CANCELED','CANCELLED'].includes(String(o.wix_status).toUpperCase())&&(o.wc_order_items||[]).some((i:any)=>!isDeliveryLine(i)&&(!(i.wc_production_units||[]).length||(i.wc_production_units||[]).some((u:any)=>u.production_status!=='Ready'))))).map(o=>orderCostingView(o,this.s.costs().filter(c=>c.order_id===o.id),this.production.unitsForOrder(o)));}
 visibleOrders(){const q=this.search.trim().replace(/^#/,'').toLowerCase();return this.views().filter(v=>[v.order.order_number,v.order.customer_name,...v.products.map(p=>p.item.product_name)].join(' ').toLowerCase().includes(q)&&(this.filter==='all'||(this.filter==='changed'?v.issues.length>0:this.filter==='calculated'?!v.partial:!v.issues.length&&v.costs.some(c=>c.state===this.filter))));}
 activeOrder(){return this.orderId?this.views().find(v=>v.order.id===this.orderId):null;}
 openOrder(id:string){this.selected=null;this.orderId=id;}
 closeOrder(){if(!this.s.busy()){this.orderId=null;this.selected=null;}}
 orderLabel(v:ReturnType<typeof orderCostingView>){return v.issues.length?'Composition review required':!v.partial?'Calculated':v.costs.some(c=>c.state==='materials_required')?'Materials required':v.costs.some(c=>c.state==='price_required')?'Price required':'Partial · Ready products excluded';}
 editable(p:any){return p.costs.find((c:any)=>!c.changed&&p.units.some((u:any)=>u.id===c.unit_id&&u.production_status!=='Ready'));}
 unitCost(id:string){return this.s.costs().find(c=>c.unit_id===id)?.total_gst??null;}
 search='';filter='all';selected:any=null;lines:any[]=[];profileVersion:string|null=null;
 constructor(public s:CostingService,private production:ProductionService){}ngOnInit(){void this.s.load();}
 visible(){return this.s.costs().filter(c=>(this.filter==='all'||(this.filter==='changed'?c.changed:!c.changed&&c.state===this.filter))&&`${c.order_number} ${c.product_name}`.toLowerCase().includes(this.search.toLowerCase().replace(/^#/,'')));}
 options(c:any){return Object.entries(c.options||{}).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join(' · ')||'No options';}
 label(c:any){return c.changed?'Order changed':({materials_required:'Materials required',price_required:'Price required',calculated:'Calculated'} as any)[c.state];}
 groupName(id:string|null){return this.s.groups().find((g:any)=>g.id===id)?.name||'Unassigned';}
 open(c:any){this.selected=c;this.profileVersion=this.s.profiles().find(p=>p.variant_key===c.variant_key)?.updated_at||null;this.lines=(this.s.profiles().find(p=>p.variant_key===c.variant_key)?.lines||[]).map((l:any)=>({...l}));}
 invalid(){return !this.lines.length||new Set(this.lines.map(l=>l.material_id)).size!==this.lines.length||this.lines.some(l=>!this.s.materials().some(m=>m.id===l.material_id&&m.active)||!Number.isFinite(Number(l.quantity))||Number(l.quantity)<=0);}
 async save(){if(this.orderId&&(!this.activeOrder()||this.activeOrder()!.issues.length))return;const id=this.selected.unit_id;if(await this.s.saveProfile(this.selected,this.lines,this.profileVersion)){const row=this.s.costs().find(c=>c.unit_id===id);if(row)this.open(row);else this.selected=null;}}
 productTotal(id:string){return this.s.costs().filter(c=>c.item_id===id).reduce((sum,c)=>sum+Number(c.total_gst||0),0);}
 orderTotal(id:string){return this.s.costs().filter(c=>c.order_id===id).reduce((sum,c)=>sum+Number(c.total_gst||0),0);}
 incomplete(id:string){return this.s.costs().some(c=>c.order_id===id&&(c.state!=='calculated'||c.changed));}
}
