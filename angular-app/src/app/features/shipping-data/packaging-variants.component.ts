import {Component,Input,OnChanges,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {orderItemOptionLabels,packagingError,reviewComponents,variantSignature,productId} from '../../../../../supabase/functions/_shared/delivery-review-domain';

@Component({selector:'app-packaging-variants',standalone:true,imports:[FormsModule],template:`
 <h3>Packaging variants</h3>
 <p>One product per template. Size and all other options must match the order. Quantities are expanded automatically.</p>
 @if(error()){<p role="alert">{{error()}}</p>}
 <div class="tools">
 <select aria-label="Saved packaging variant" [disabled]="busy()" [(ngModel)]="selectedKey" (ngModelChange)="open($event)"><option value="">New variant</option>@for(v of variants();track v.signature){<option [value]="v.signature">{{label(v.template_item)}}</option>}</select>
 <button [disabled]="busy()" (click)="copy()">Copy to another Size</button>
 </div>
 @if(examples().length){<label>Use options from an existing order <select [disabled]="busy()" (change)="useExample($any($event.target).value)"><option value="">Choose composition</option>@for(e of examples();track e.id){<option [value]="e.id">{{label(e)}}</option>}</select></label>}
 <fieldset [disabled]="busy()"><legend>Exact option values from Wix</legend>
 @for(o of options;track $index){<div class="tools"><input aria-label="Option name" [(ngModel)]="o.name" (ngModelChange)="remap()"><input aria-label="Option value" [(ngModel)]="o.value" (ngModelChange)="remap()"><button (click)="options.splice($index,1);remap()">Remove option</button></div>}
 <button (click)="options.push({name:'',value:''})">Add option</button>
 <h4>Boxes for one product</h4>
 @for(p of boxes;track $index){<section class="box"><div class="tools">
 <label>Name<input [(ngModel)]="p.package_name"></label>
 <label>L mm<input type="number" min="1" [(ngModel)]="p.length_mm"></label><label>W mm<input type="number" min="1" [(ngModel)]="p.width_mm"></label><label>H mm<input type="number" min="1" [(ngModel)]="p.height_mm"></label><label>kg<input type="number" min="0.001" step="0.1" [(ngModel)]="p.weight_kg"></label>
 <button (click)="boxes.splice($index,1)">Remove box</button></div>
 <details><summary>Contents ({{p.contents.length}})</summary>@for(c of components();track c.id){<label class="choice"><input type="checkbox" [checked]="assigned(p,c)" (change)="toggle(p,c,$any($event.target).checked)">{{c.component_name}} · Unit {{c.unit_index}}</label>}</details>
 </section>}
 <button (click)="addBox()">Add box</button>
 <p>{{issue()}}</p>
 <label class="choice"><input type="checkbox" [(ngModel)]="confirmed">I checked this variant's options, box measurements and contents.</label>
 <button [disabled]="!!issue()||!confirmed" (click)="save()">{{busy()?'Saving…':'Save variant'}}</button>
 </fieldset>
 @if(saved()){<p role="status">Variant saved. Existing orders and quotes were not changed.</p>}
 `,styles:[`:host{display:block;border:1px solid var(--wc-border);border-radius:var(--wc-radius);padding:1rem;margin-top:1rem}.tools{display:flex;gap:.6rem;flex-wrap:wrap;align-items:end;margin:.6rem 0}.box{border:1px solid var(--wc-border);border-radius:var(--wc-radius);padding:.7rem;margin:.7rem 0}input,select,button{font:inherit}label input{display:block;max-width:140px}.choice{display:flex;gap:.5rem;align-items:center;margin:.5rem 0}.choice input{display:inline}h3{margin:0 0 .5rem}p{margin:.5rem 0;color:var(--wc-muted)}select{max-width:100%}.tools input{min-width:0;max-width:100%;width:160px}.tools label{min-width:0}fieldset{border:0;padding:0;min-width:0}[role=alert]{color:#b91c1c}`]})
export class PackagingVariantsComponent implements OnChanges {
 @Input() product:any;
 @Input() initialSignature='';
 variants=signal<any[]>([]);examples=signal<any[]>([]);rules:any[]=[];error=signal('');busy=signal(false);saved=signal(false);
 selectedKey='';sourceItemId='';catalogId='';
 options:{name:string,value:string}[]=[{name:'Size',value:''}];boxes:any[]=[];confirmed=false;
 constructor(private supabase:SupabaseService){}
 async ngOnChanges(){this.reset();this.busy.set(true);try{
  const [profiles,rules]=await Promise.all([this.supabase.client.from('wc_delivery_packaging_profiles').select('*').eq('shipping_product_id',this.product.id),this.supabase.client.from('wc_shipping_rules').select('*').eq('active',true).eq('effect_type','No effect')]);
  if(profiles.error||rules.error)throw Error('Variants unavailable. Check the packaging variant migration.');
  this.variants.set(profiles.data||[]);this.rules=rules.data||[];
  if(this.initialSignature){if(this.variants().some(v=>v.signature===this.initialSignature))this.open(this.initialSignature);else this.error.set('The requested packaging variant is no longer available.');}
  const examples:any[]=[];
  for(let start=0;;start+=250){const {data,error}=await this.supabase.client.from('wc_order_items').select('*').order('id').range(start,start+249);if(error)throw Error('Order option examples unavailable');
   examples.push(...(data||[]).filter((i:any)=>this.product.wix_product_id?i.catalog_reference?.catalogItemId===this.product.wix_product_id:i.product_name===this.product.product_name));if((data||[]).length<250)break;}
  this.examples.set([...new Map(examples.map(e=>[this.label(e),e])).values()]);
 }catch(e:any){this.error.set(e.message);}finally{this.busy.set(false);}}
 reset(){this.selectedKey='';this.sourceItemId='';this.catalogId='';this.options=[{name:'Size',value:''}];this.boxes=[];this.confirmed=false;this.saved.set(false);this.error.set('');}
 item(){return {id:this.product.id,product_name:this.product.product_name,quantity:1,catalog_reference:(this.product.wix_product_id||this.catalogId)?{catalogItemId:this.product.wix_product_id||this.catalogId}:{},wix_options:Object.fromEntries(this.options.map(o=>[o.name,o.value]))};}
 components(){return reviewComponents({wc_order_items:[this.item()]},this.rules);}
 label(item:any){return orderItemOptionLabels(item,100).join(' · ')||'No options';}
 open(key:string){this.reset();const v=this.variants().find(v=>v.signature===key);if(!v)return;this.selectedKey=key;this.sourceItemId=v.template_item.source_item_id||'';this.catalogId=productId(v.template_item);this.options=Object.entries(v.template_item.wix_options).map(([name,value])=>({name,value:String(value)}));this.boxes=structuredClone(v.packages);this.remap();}
 useExample(id:string){const item=this.examples().find(e=>e.id===id);if(!item)return;this.sourceItemId=item.id;this.catalogId=productId(item);this.options=orderItemOptionLabels(item,100).flatMap(label=>{const n=label.indexOf(':');return n<0?[]:[{name:label.slice(0,n).trim(),value:label.slice(n+1).trim()}];});this.remap();}
 copy(){this.selectedKey='';const size=this.options.find(o=>o.name.trim().toLowerCase()==='size');if(size)size.value='';else this.options.push({name:'Size',value:''});this.remap();}
 remap(){const components=this.components();this.boxes=this.boxes.map(p=>({...p,contents:(p.contents||[]).flatMap((c:any)=>{const match=components.find(x=>x.component_key===c.component_key&&x.unit_index===c.unit_index);return match?[match]:[];})}));this.confirmed=false;this.saved.set(false);}
 assigned(p:any,c:any){return p.contents.some((x:any)=>x.id===c.id);}
 toggle(p:any,c:any,on:boolean){p.contents=on?[...p.contents.filter((x:any)=>x.id!==c.id),c]:p.contents.filter((x:any)=>x.id!==c.id);this.confirmed=false;}
 addBox(){this.boxes.push({package_name:'Box '+(this.boxes.length+1),length_mm:0,width_mm:0,height_mm:0,weight_kg:0,contents:[]});this.confirmed=false;}
 issue(){if(!this.product.wix_product_id&&!this.sourceItemId)return 'Choose an existing order composition to identify the Wix product.';if(this.options.some(o=>!o.name.trim()||!o.value.trim()))return 'Complete each option name and value.';if(new Set(this.options.map(o=>o.name.trim().toLowerCase())).size!==this.options.length)return 'Remove duplicate option names.';return packagingError(this.boxes,this.components());}
 async save(){if(this.busy()||this.issue()||!this.confirmed)return;this.busy.set(true);this.error.set('');try{
  const {data,error}=await this.supabase.client.functions.invoke('delivery-cost-review',{body:{action:'save-packaging-variant',productId:this.product.id,sourceItemId:this.sourceItemId,options:this.options,packages:this.boxes}});
  if(error||!data?.ok){const detail=await error?.context?.json?.().catch(()=>null);throw Error(detail?.error||data?.error||'Variant not saved');}
  const result=await this.supabase.client.from('wc_delivery_packaging_profiles').select('*').eq('shipping_product_id',this.product.id);if(result.error)throw Error('Saved; refresh to load variants.');this.variants.set(result.data||[]);this.selectedKey=variantSignature(this.item());this.saved.set(true);this.confirmed=false;
 }catch(e:any){this.error.set(e.message);}finally{this.busy.set(false);}}
}
