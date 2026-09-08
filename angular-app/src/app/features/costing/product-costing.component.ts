import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {CostingService} from './costing.service';
@Component({selector:'app-product-costing',standalone:true,imports:[CommonModule,FormsModule,RouterLink],styleUrl:'./costing.css',template:`
 <header><div><h1>Product Costing</h1><p>Materials only · AUD including GST. Ready products are excluded from new calculations.</p></div><button (click)="s.load()" [disabled]="s.busy()||s.loading()">Refresh</button></header>
 @if(s.error()){<p role="alert">{{s.error()}}</p>}
 <div class="toolbar"><input aria-label="Search product costs" placeholder="Order or product" [(ngModel)]="search"><select aria-label="Cost status" [(ngModel)]="filter"><option value="all">All</option><option value="materials_required">Materials required</option><option value="price_required">Price required</option><option value="calculated">Calculated</option><option value="changed">Order changed</option></select><a routerLink="/materials">Materials catalogue</a></div>
 @if(s.loading()){<p>Loading…</p>}
 @if(selected){<section class="editor"><header><h3>#{{selected.order_number}} · {{selected.product_name}} · Unit {{selected.unit_index}}</h3><button (click)="selected=null" [disabled]="s.busy()">Close</button></header><p>Variant: {{options(selected)}}</p>
 @if(selected.snapshot){<h3>Saved calculation · {{selected.calculated_at|date:'dd MMM yyyy, HH:mm'}}</h3><div class="table-wrap"><table><thead><tr><th>Material</th><th>Quantity</th><th>Unit</th><th>Saved price incl. GST</th><th>Cost incl. GST</th></tr></thead><tbody>@for(l of selected.snapshot.lines;track $index){<tr><td>{{l.name}}</td><td>{{l.quantity}}</td><td>{{l.unit}}</td><td>{{l.price_gst|currency:'AUD':'symbol':'1.2-4'}}</td><td>{{l.total_gst|currency:'AUD'}}</td></tr>}</tbody></table></div><p><b>Total {{selected.total_gst|currency:'AUD'}}</b> · This snapshot is locked.</p>}
 @if(selected.changed){<p role="alert">Order composition changed. The saved calculation remains unchanged. Review the current order separately.</p>}
 @else{<h3>Material profile for one product</h3><p>Exact product options must match. Saving applies to uncalculated products and future orders, never to saved calculations.</p>
 @for(l of lines;track $index){<div class="fields"><label>Material<select [(ngModel)]="l.material_id" [disabled]="s.busy()"><option value="">Choose material</option>@for(m of s.materials();track m.id){<option [value]="m.id">{{groupName(m.group_id)}} · {{m.name}} · {{m.unit}}{{m.active?'':' (archived)'}}</option>}</select></label><label>Quantity for one product<input type="number" min="0.0001" step="0.0001" [(ngModel)]="l.quantity" [disabled]="s.busy()"></label><button (click)="lines.splice($index,1)" [disabled]="s.busy()">Remove</button></div>}
 <button (click)="lines.push({material_id:'',quantity:1})" [disabled]="s.busy()">Add material</button> <button class="primary" (click)="save()" [disabled]="s.busy()||invalid()">{{s.busy()?'Saving…':'Save profile and calculate pending products'}}</button>
 }</section>}
 <div class="table-wrap"><table><thead><tr><th>Order</th><th>Product / variant</th><th>Unit</th><th>Status</th><th>Unit cost incl. GST</th><th>Recorded product cost</th><th>Recorded order cost</th><th></th></tr></thead><tbody>
 @for(c of visible();track c.unit_id){<tr><td><a [routerLink]="['/orders']" [queryParams]="{order:c.order_number}">#{{c.order_number}}</a></td><td>{{c.product_name}}<small>{{options(c)}}</small></td><td>{{c.unit_index}} / {{c.order_quantity}}</td><td><span class="badge" [class.done]="c.state==='calculated'&&!c.changed">{{label(c)}}</span></td><td>{{c.total_gst==null?'—':(c.total_gst|currency:'AUD')}}</td><td>{{productTotal(c.item_id)|currency:'AUD'}}</td><td>{{orderTotal(c.order_id)|currency:'AUD'}}<small>{{incomplete(c.order_id)?'Partial · pending or changed products':'Recorded products only'}}</small></td><td><button (click)="open(c)" [disabled]="s.busy()">{{c.snapshot?'View / Profile':'Add materials'}}</button></td></tr>}
 @empty{<tr><td colspan="8">No eligible products.</td></tr>}</tbody></table></div>
`})
export class ProductCostingComponent implements OnInit {
 search='';filter='all';selected:any=null;lines:any[]=[];profileVersion:string|null=null;
 constructor(public s:CostingService){}ngOnInit(){void this.s.load();}
 visible(){return this.s.costs().filter(c=>(this.filter==='all'||(this.filter==='changed'?c.changed:!c.changed&&c.state===this.filter))&&`${c.order_number} ${c.product_name}`.toLowerCase().includes(this.search.toLowerCase().replace(/^#/,'')));}
 options(c:any){return Object.entries(c.options||{}).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join(' · ')||'No options';}
 label(c:any){return c.changed?'Order changed':({materials_required:'Materials required',price_required:'Price required',calculated:'Calculated'} as any)[c.state];}
 groupName(id:string|null){return this.s.groups().find((g:any)=>g.id===id)?.name||'Unassigned';}
 open(c:any){this.selected=c;this.profileVersion=this.s.profiles().find(p=>p.variant_key===c.variant_key)?.updated_at||null;this.lines=(this.s.profiles().find(p=>p.variant_key===c.variant_key)?.lines||[]).map((l:any)=>({...l}));}
 invalid(){return !this.lines.length||new Set(this.lines.map(l=>l.material_id)).size!==this.lines.length||this.lines.some(l=>!this.s.materials().some(m=>m.id===l.material_id&&m.active)||!Number.isFinite(Number(l.quantity))||Number(l.quantity)<=0);}
 async save(){const id=this.selected.unit_id;if(await this.s.saveProfile(this.selected,this.lines,this.profileVersion)){const row=this.s.costs().find(c=>c.unit_id===id);if(row)this.open(row);else this.selected=null;}}
 productTotal(id:string){return this.s.costs().filter(c=>c.item_id===id).reduce((sum,c)=>sum+Number(c.total_gst||0),0);}
 orderTotal(id:string){return this.s.costs().filter(c=>c.order_id===id).reduce((sum,c)=>sum+Number(c.total_gst||0),0);}
 incomplete(id:string){return this.s.costs().some(c=>c.order_id===id&&(c.state!=='calculated'||c.changed));}
}
