import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {CostingService} from './costing.service';
@Component({selector:'app-materials',standalone:true,imports:[CommonModule,FormsModule],styleUrl:'./costing.css',template:`
 <header><div><h1>Materials</h1><p>Purchase prices in AUD, including GST. Saved order costs never change.</p></div><button (click)="edit()">Add material</button></header>
 @if(s.error()){<p role="alert">{{s.error()}}</p>}
 <div class="toolbar"><input placeholder="Search materials" aria-label="Search materials" [(ngModel)]="search"><label><input type="checkbox" [(ngModel)]="archived"> Show archived</label><button (click)="s.load()" [disabled]="s.loading()||s.busy()">Refresh</button></div>
 @if(s.loading()){<p>Loading…</p>}
 @if(draft){<section class="editor"><h3>{{draft.id?'Edit material':'New material'}}</h3><div class="fields">
 <label>Name<input [(ngModel)]="draft.name" maxlength="150"></label><label>Unit<select [(ngModel)]="draft.unit" [disabled]="!!draft.id">@for(u of units;track u){<option [value]="u">{{u}}</option>}</select></label>
 <label>Price incl. GST<input type="number" min="0" step="0.0001" [(ngModel)]="draft.price_gst" placeholder="Not known yet"></label><label><input type="checkbox" [(ngModel)]="draft.active"> Active</label></div>
 <p>A blank price requires a price before costing. A zero price means free material. Units cannot change after creation.</p>
 <button class="primary" (click)="save()" [disabled]="s.busy()||!draft.name?.trim()||draft.price_gst<0">{{s.busy()?'Saving…':'Save material'}}</button> <button [disabled]="s.busy()" (click)="draft=null">Cancel</button></section>}
 <div class="table-wrap"><table><thead><tr><th>Material</th><th>Unit</th><th>Price incl. GST</th><th>Updated</th><th></th></tr></thead><tbody>
 @for(m of visible();track m.id){<tr><td>{{m.name}} @if(!m.active){<span class="badge">Archived</span>}</td><td>{{m.unit}}</td><td>{{m.price_gst==null?'Price required':(m.price_gst|currency:'AUD':'symbol':'1.2-4')}}</td><td>{{m.updated_at|date:'dd MMM yyyy, HH:mm'}}</td><td><button (click)="edit(m)" [disabled]="s.busy()">Edit</button> <button (click)="history=history===m.id?'':m.id">Price history</button></td></tr>
 @if(history===m.id){<tr><td colspan="5">@for(p of s.prices();track p.id){@if(p.material_id===m.id){<div>{{p.created_at|date:'dd MMM yyyy, HH:mm'}} · {{p.price_gst==null?'No price':(p.price_gst|currency:'AUD':'symbol':'1.2-4')}}</div>}}</td></tr>}}
 @empty{<tr><td colspan="5">No materials yet.</td></tr>}</tbody></table></div>
`})
export class MaterialsComponent implements OnInit {
 search='';archived=false;draft:any=null;history='';units=['sheet','m2','m','piece','kg','litre'];
 constructor(public s:CostingService){}ngOnInit(){void this.s.load();}
 visible(){return this.s.materials().filter(m=>(this.archived||m.active)&&m.name.toLowerCase().includes(this.search.toLowerCase()));}
 edit(m?:any){this.draft=m?{...m}:{name:'',unit:'sheet',price_gst:null,active:true};}
 async save(){if(await this.s.saveMaterial(this.draft))this.draft=null;}
}
