import {Component,Input,OnChanges} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {CostingService} from './costing.service';

@Component({selector:'app-catalog-cost-editor',standalone:true,imports:[CommonModule,FormsModule],styleUrl:'./costing.css',template:`
<section class="editor">
<h3>{{part.product_name}}</h3><small>{{part.kind==='main'?'Main product':part.kind==='processing'?'Processing of addon':part.kind==='replacement'?'Replacement tabletop':'Addon'}} · {{part.multiplier}} per finished product</small>
<p>{{options()}}</p>
@if(part.standard_top_excluded){<p><b>Exclude the standard tabletop materials.</b> The replacement tabletop has its own profile below.</p>}
@if(!part.profile){<p>No complete saved cost profile yet. Add the missing information.</p>}
@if(part.legacy_lines?.length&&!part.profile){<p>Existing material quantities have been loaded. Check the work and Pans costs.</p>}
<fieldset [disabled]="s.busy()||s.loading()"><legend>Materials for one {{part.kind==='main'?'product':'addon'}}</legend>
@for(l of lines;track $index){<div class="fields"><label>Material<select [(ngModel)]="l.material_id"><option value="">Choose material</option>@for(m of s.materials();track m.id){<option [value]="m.id">{{m.name}} · {{m.unit}}{{m.active?'':' (archived)'}}</option>}</select></label><label>Quantity<input type="number" min="0.0001" step="0.0001" [(ngModel)]="l.quantity"></label><button (click)="lines.splice($index,1)">Remove</button></div>}
<button (click)="lines.push({material_id:'',quantity:1})">Add material</button>
<p><label><input type="checkbox" [(ngModel)]="confirmed"> Material list complete (an empty list means no materials)</label></p>
<b>Material cost: {{materialTotal()===null?'—':(materialTotal()|currency:'AUD')}}</b>
<h4>Work cost for one unit · incl. GST</h4><div class="fields">@for(w of categories;track w.key){<label>{{w.label}}<input type="number" min="0" step="0.01" [(ngModel)]="work[w.key]" placeholder="Unknown"></label>}</div>
@if(part.has_pans){<label>Pans purchase cost · complete set for one product, incl. GST<input type="number" min="0" step="0.01" [(ngModel)]="pans" placeholder="Unknown"></label>}
<p>Blank = unknown. Zero = no cost. Saved order calculations stay unchanged.</p>
<button class="primary" [disabled]="invalid()" (click)="save()">{{s.busy()?'Saving…':'Save product profile'}}</button>
@if(saved){<p role="status">Saved to the shared product catalogue.</p>}
</fieldset></section>
`})
export class CatalogCostEditorComponent implements OnChanges {
 @Input({required:true}) part:any;
 lines:any[]=[];work:Record<string,number|null>={};pans:number|null=null;confirmed=false;version:string|null=null;saved=false;
 categories=[{key:'cnc',label:'CNC'},{key:'assembly',label:'Assembly'},{key:'sanding',label:'Sanding'},{key:'painting',label:'Painting'}];
 private openedKey='';
 constructor(public s:CostingService){}
 ngOnChanges(){if(this.openedKey===this.part.variant_key)return;this.openedKey=this.part.variant_key;this.lines=structuredClone(this.part.profile?.lines||this.part.legacy_lines||[]);this.work=Object.fromEntries(this.categories.map(c=>[c.key,this.part.profile?.work_costs?.[c.key]??null]));this.pans=this.part.profile?.pans_cost_gst??null;this.confirmed=this.part.profile?.materials_confirmed??false;this.version=this.part.profile?.updated_at??null;this.saved=false;}
 options(){return Object.entries(this.part.options||{}).map(([k,v])=>`${k}: ${v}`).join(' · ')||'No options';}
 materialTotal(){if(!this.confirmed)return null;let total=0;for(const l of this.lines){const m=this.s.materials().find(m=>m.id===l.material_id);if(!m?.active||m.price_gst==null)return null;total+=Math.round(Number(m.price_gst)*Number(l.quantity)*100);}return total/100;}
 invalid(){return new Set(this.lines.map(l=>l.material_id)).size!==this.lines.length||this.lines.some(l=>!this.s.materials().some(m=>m.id===l.material_id&&m.active)||!Number.isFinite(Number(l.quantity))||Number(l.quantity)<=0)||Object.values(this.work).some(v=>v!=null&&(!Number.isFinite(Number(v))||Number(v)<0))||(this.pans!=null&&(!Number.isFinite(Number(this.pans))||Number(this.pans)<0));}
 async save(){if(this.invalid())return;if(await this.s.saveCatalogProfile(this.part,this.lines,this.work,this.pans,this.confirmed,this.version)){this.version=this.s.profiles().find(p=>p.variant_key===this.part.variant_key)?.updated_at??null;this.saved=true;}}
}
