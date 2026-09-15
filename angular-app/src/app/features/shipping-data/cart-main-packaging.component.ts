import {Component,Input,OnChanges,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {packagingError,reviewComponents} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {cartSizeFromOptions} from './cart-size';

@Component({selector:'app-cart-main-packaging',standalone:true,imports:[FormsModule],template:`
 <section class="editor">
  <h3>Main packaging variants</h3>
  <p class="mut">Save the complete Main packaging separately without and with Internal Shelf. Enter every final dimension and weight manually.</p>
  <div class="states"><span [class.ready]="hasVariant('no')">Without shelf: {{hasVariant('no')?'Saved ✓':'Required'}}</span><span [class.ready]="hasVariant('yes')">With shelf: {{hasVariant('yes')?'Saved ✓':'Required'}}</span></div>
  @if(error()){<p role="alert">{{error()}}</p>}
  <div class="tools">
   <label>Saved Main variant<select [disabled]="busy()" [(ngModel)]="selected" (ngModelChange)="open($event)"><option value="">New Main variant</option>@for(v of variants();track v.signature){<option [value]="v.signature">{{variantLabel(v)}}</option>}</select></label>
   <label>Composition<select [disabled]="busy()||!!selected" [(ngModel)]="shelf" (ngModelChange)="resetBoxes()"><option value="no">Without Internal Shelf</option><option value="yes">With Internal Shelf</option></select></label>
  </div>
  <h4>{{sizeLabel}} · {{shelf==='yes'?'With Internal Shelf':'Without Internal Shelf'}}</h4>
  @for(box of boxes;track $index){<div class="box">
   <div class="tools"><label>Name<input [(ngModel)]="box.package_name"></label><label>L mm<input type="number" min="1" [(ngModel)]="box.length_mm"></label><label>W mm<input type="number" min="1" [(ngModel)]="box.width_mm"></label><label>H mm<input type="number" min="1" [(ngModel)]="box.height_mm"></label><label>kg<input type="number" min="0.01" step="0.1" [(ngModel)]="box.weight_kg">@if(weightNote(box.weight_kg);as note){<span class="weight-note" [class.over]="Number(box.weight_kg)>25">{{note}}</span>}</label><button type="button" (click)="removeBox($index)">Remove</button></div>
   <details><summary>Contents ({{box.contents.length}})</summary>@for(component of components();track component.id){<label class="choice"><input type="checkbox" [checked]="assigned(box,component)" (change)="toggle(box,component,$any($event.target).checked)">{{component.component_name}} · Unit {{component.unit_index}}</label>}</details>
  </div>}
  <button type="button" [disabled]="busy()" (click)="addBox()">Add box</button>
  @if(issue()){<p class="mut">{{issue()}}</p>}
  <label class="choice"><input type="checkbox" [(ngModel)]="confirmed">I checked this Main variant's composition, measurements, weight and contents.</label>
  <button type="button" class="primary" [disabled]="busy()||!!issue()||!confirmed" (click)="save()">{{busy()?'Saving…':'Save Main variant'}}</button>
  @if(saved()){<p role="status">Main variant saved ✓</p>}
 </section>
 `,styles:[`:host{display:block}.editor{border:1px solid var(--wc-border);border-radius:12px;padding:14px}.states{display:flex;gap:8px;flex-wrap:wrap}.states span{padding:5px 9px;border-radius:8px;background:var(--p-orange-50);color:var(--p-orange-800)}.states span.ready{background:var(--p-green-50);color:var(--p-green-800)}.tools{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:10px 0}.tools label{display:flex;flex-direction:column;gap:5px}.tools input,.tools select{width:165px;max-width:100%}.box{border-top:1px solid var(--wc-border);padding:10px 0}.choice{display:flex;align-items:center;gap:7px;margin:8px 0}.choice input{width:auto}.mut{color:var(--wc-muted)}.weight-note{font-size:.75rem;color:var(--p-orange-700)}.weight-note.over{color:var(--p-red-600)}[role=alert]{color:var(--p-red-600)}[role=status]{color:var(--p-green-700)}h3{margin-top:0}h4{margin:14px 0 6px}`]})
export class CartMainPackagingComponent implements OnChanges{
 @Input() product:any;@Input() sizeKey='';@Input() sizeLabel='';
 variants=signal<any[]>([]);error=signal('');busy=signal(false);saved=signal(false);selected='';shelf:'no'|'yes'='no';boxes:any[]=[];confirmed=false;rules:any[]=[];
 constructor(private db:SupabaseService){}
 Number=Number;
 async ngOnChanges(){this.selected='';this.shelf='no';this.boxes=[];this.confirmed=false;this.saved.set(false);await this.load();}
 async load(){if(!this.product?.id||!this.sizeKey)return;this.busy.set(true);this.error.set('');try{const [profiles,rules]=await Promise.all([this.db.client.from('wc_delivery_packaging_profiles').select('*').eq('shipping_product_id',this.product.id),this.db.client.from('wc_shipping_rules').select('match_name,match_value,effect_type,active').eq('active',true).eq('effect_type','No effect')]);if(profiles.error||rules.error)throw Error('Main packaging variants could not be loaded.');this.variants.set((profiles.data||[]).filter((p:any)=>p.template_item?.profile_scope==='cart-main'&&cartSizeFromOptions(p.template_item?.wix_options)===this.sizeKey));this.rules=rules.data||[];}catch(e:any){this.error.set(e.message||'Main packaging variants could not be loaded.');}finally{this.busy.set(false);}}
 item(){return{id:this.product.id,product_name:this.product.product_name,quantity:1,catalog_reference:this.product.wix_product_id?{catalogItemId:this.product.wix_product_id}:{},wix_options:{Size:this.sizeLabel,'Internal Shelf':this.shelf==='yes'?'Yes':'No'}};}
 components(){return reviewComponents({wc_order_items:[this.item()]},this.rules);}
 variantLabel(profile:any){return String(profile.template_item?.wix_options?.['Internal Shelf']||'No').toLowerCase()==='yes'?'With Internal Shelf':'Without Internal Shelf';}
 hasVariant(shelf:'no'|'yes'){return this.variants().some(profile=>this.variantLabel(profile)===(shelf==='yes'?'With Internal Shelf':'Without Internal Shelf'));}
 open(signature:string){this.saved.set(false);this.confirmed=false;const profile=this.variants().find(v=>v.signature===signature);if(!profile){this.shelf='no';this.boxes=[];return;}this.shelf=this.variantLabel(profile).startsWith('With')?'yes':'no';this.boxes=structuredClone(profile.packages||[]);this.remap();}
 resetBoxes(){this.boxes=[];this.confirmed=false;this.saved.set(false);}
 remap(){const components=this.components();this.boxes=this.boxes.map(box=>({...box,contents:(box.contents||[]).flatMap((content:any)=>{const match=components.find(c=>c.component_key===content.component_key&&c.unit_index===content.unit_index);return match?[match]:[];})}));}
 addBox(){this.boxes.push({package_name:'Main box '+(this.boxes.length+1),length_mm:0,width_mm:0,height_mm:0,weight_kg:0,contents:[]});this.confirmed=false;this.saved.set(false);}
 removeBox(index:number){this.boxes.splice(index,1);this.confirmed=false;this.saved.set(false);}
 assigned(box:any,component:any){return box.contents.some((content:any)=>content.id===component.id);}
 toggle(box:any,component:any,on:boolean){box.contents=on?[...box.contents.filter((c:any)=>c.id!==component.id),component]:box.contents.filter((c:any)=>c.id!==component.id);this.confirmed=false;this.saved.set(false);}
 issue(){return packagingError(this.boxes,this.components());}
 weightNote(value:any){const weight=Number(value);return weight>25?'Over the common 25 kg carrier limit':weight>=24?'Close to the common 25 kg carrier limit':'';}
 async save(){if(this.busy()||this.issue()||!this.confirmed)return;this.busy.set(true);this.error.set('');this.saved.set(false);try{const {data,error}=await this.db.client.functions.invoke('delivery-cost-review',{body:{action:'save-packaging-variant',profileScope:'cart-main',productId:this.product.id,options:[{name:'Size',value:this.sizeLabel},{name:'Internal Shelf',value:this.shelf==='yes'?'Yes':'No'}],packages:this.boxes}});if(error||!data?.ok){const detail=await error?.context?.json?.().catch(()=>null);throw Error(detail?.error||data?.error||'Main variant was not saved.');}await this.load();const match=this.variants().find(v=>this.variantLabel(v)===(this.shelf==='yes'?'With Internal Shelf':'Without Internal Shelf'));this.selected=match?.signature||'';if(match)this.boxes=structuredClone(match.packages);this.confirmed=false;this.saved.set(true);}catch(e:any){this.error.set((e?.message||'Main variant was not saved.')+' Your entries are retained; retry after checking the connection.');}finally{this.busy.set(false);}}
}
