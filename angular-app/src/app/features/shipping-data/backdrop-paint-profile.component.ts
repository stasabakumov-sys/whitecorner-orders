import {CommonModule} from '@angular/common';
import {Component,EventEmitter,Input,OnChanges,Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {BACKDROP_PAINT_OPERATIONS,paintLabel} from '../shop-floor/shop-floor.models';

@Component({selector:'app-backdrop-paint-profile',standalone:true,imports:[CommonModule,FormsModule],template:`
<details class="paint"><summary>Painting · shared by all sizes and constructions</summary>
 <p>Enter paint materials and painting minutes once. The same painting add-on is used for Foldable and Non-foldable.</p>
 <fieldset [disabled]="busy"><legend>Paint materials for one product</legend>
  @for(line of lines;track $index){<div class="fields"><label>Material<select [(ngModel)]="line.material_id"><option value="">Choose material</option>@for(material of materials;track material.id){<option [value]="material.id">{{material.name}} · {{material.unit}}{{material.active?'':' (archived)'}}</option>}</select></label><label>Quantity<input type="number" min="0.0001" step="0.0001" [(ngModel)]="line.quantity"></label><button type="button" (click)="lines.splice($index,1)">Remove</button></div>}
  <button type="button" (click)="lines.push({material_id:'',quantity:1})">Add paint material</button>
  <label class="check"><input type="checkbox" [(ngModel)]="confirmed"> Paint material list complete</label>
  <div class="minutes">@for(operation of operations;track operation){<label>{{paintLabel(operation,operations)}} (min)<input type="number" min="0" [ngModel]="estimates['Painting:'+operation]" (ngModelChange)="setMinute(operation,$event)"></label>}</div>
  <button class="primary" type="button" [disabled]="invalid()" (click)="save()">{{busy?'Saving…':'Save shared painting'}}</button>
 </fieldset>
 @if(message){<p role="status">{{message}}</p>}@if(error){<p class="error" role="alert">{{error}}</p>}
</details>`,styles:[`:host{display:block}.paint{border-top:1px solid var(--wc-border);margin-top:14px;padding-top:10px}.fields,.minutes{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin:10px 0}label{display:flex;flex-direction:column;gap:5px}.check{flex-direction:row;margin:12px 0}.primary{background:var(--p-primary-color);color:white}.error{color:var(--p-red-600)}`]})
export class BackdropPaintProfileComponent implements OnChanges{
 @Input({required:true})product:any;@Input()materials:any[]=[];@Output()saved=new EventEmitter<any>();
 operations=BACKDROP_PAINT_OPERATIONS;paintLabel=paintLabel;lines:any[]=[];estimates:Record<string,number>={};confirmed=false;version=0;busy=false;message='';error='';
 constructor(private db:SupabaseService){}
 ngOnChanges(){const profile=this.product?.backdrop_paint_profile||{};this.lines=structuredClone(profile.lines||[]);this.estimates={...profile.estimates};this.confirmed=!!profile.materials_confirmed;this.version=Number(profile.version)||0;this.message='';this.error='';}
 setMinute(operation:string,value:string|number|null){const key='Painting:'+operation;if(value===''||value===null)delete this.estimates[key];else this.estimates[key]=Number(value);}
 invalid(){return new Set(this.lines.map(line=>line.material_id)).size!==this.lines.length||this.lines.some(line=>!this.materials.some(material=>material.id===line.material_id&&material.active)||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0)||Object.values(this.estimates).some(value=>!Number.isFinite(Number(value))||Number(value)<0);}
 async save(){if(this.busy||this.invalid())return;this.busy=true;this.message='';this.error='';try{const {data,error}=await this.db.client.rpc('wc_save_backdrop_paint_profile',{p_product:this.product.id,p_lines:this.lines.map(line=>({material_id:line.material_id,quantity:Number(line.quantity)})),p_estimates:this.estimates,p_confirmed:this.confirmed,p_expected:this.version});if(error)throw error;if(!data||Number(data.version)!==this.version+1)throw Error('The server did not confirm the painting profile.');this.version=Number(data.version);this.message='Shared painting saved.';this.saved.emit({...this.product,backdrop_paint_profile:data});}catch(e:any){this.error=e?.message||'Could not save shared painting. Retry.';}finally{this.busy=false;}}
}
