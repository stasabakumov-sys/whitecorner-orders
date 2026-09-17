import {Component,Input,OnChanges,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {packagingOptionLabels,orderItemOptionLabels,packagingError,reviewComponents,variantSignature,productId} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {catalogSizes,backdropDrawingKey,sizeKeyLabel} from './product-sizes';

export type BackdropPackagingDimensions={size_key:string;package_name:string;length_mm:number;width_mm:number;height_mm:number;revision:string};
export type PackagingScope='shared-backdrop'|'product';

export function sharedBackdropBox(options:Record<string,string>,dimensions:Record<string,BackdropPackagingDimensions>){
 const target=backdropDrawingKey({template_item:{wix_options:options},packages:[]},'');
 const row=dimensions[target];
 return {key:target,box:row?{package_name:row.package_name,length_mm:Number(row.length_mm),width_mm:Number(row.width_mm),height_mm:Number(row.height_mm),weight_kg:0,contents:[]}:null};
}

@Component({selector:'app-packaging-variants',standalone:true,imports:[FormsModule],template:`
 <h3>Packaging variants</h3>
 @if(packagingScope==='shared-backdrop'){
  <p>Backdrop dimensions and drawing are shared by exact Size and Foldable/Non-foldable. Enter weight separately for this model and size; design and Colour (including Raw) do not change packaging.</p>
 }@else{
  <p>This product uses its own packaging profiles. Size and structural options must match. Colour (including Raw) shares the same packaging.</p>
 }
 @if(error()){<p role="alert">{{error()}}</p>}
 <div class="tools">
 <label>Packaging profile<select aria-label="Saved packaging variant" [disabled]="busy()" [(ngModel)]="selectedKey" (ngModelChange)="open($event)"><option value="">New variant</option>@for(v of variants();track v.signature){<option [value]="v.signature">{{label(v.template_item)}}</option>}</select></label>
 <button [disabled]="busy()||!selectedKey" (click)="copy()">Copy to another Size</button>
 </div>
 @if(loadingExamples()){<p role="status">Loading order compositions in the background…</p>}
 <fieldset [disabled]="busy()">
 @if(!selectedKey&&catalogSizes(catalog).length){<label>Product size<select aria-label="Product size" [ngModel]="sizeValue()" (ngModelChange)="chooseSize($event)"><option value="">Choose size</option>@for(size of catalogSizes(catalog);track size){<option [value]="size">{{size}}</option>}</select></label>}
 <details class="variant-matching"><summary>Variant matching (advanced)</summary>
 <p>These Wix values decide which orders reuse this packaging. Only add options the product actually has. A product without options does not need Size.</p>
 @if(examples().length){<label>Use options from an existing order <select [disabled]="busy()" (change)="useExample($any($event.target).value)"><option value="">Choose composition</option>@for(e of examples();track e.id){<option [value]="e.id">{{label(e)}}</option>}</select></label>}
 <h4>Exact option values from Wix</h4>
 @for(o of options;track $index){<div class="tools"><input aria-label="Option name" [(ngModel)]="o.name" (ngModelChange)="remap()"><input aria-label="Option value" [(ngModel)]="o.value" (ngModelChange)="remap()"><button (click)="options.splice($index,1);remap()">Remove option</button></div>}
 <button (click)="options.push({name:'',value:''})">Add option</button>
 </details>
 @if(reuseMessage()){<p [attr.role]="reuseConflict()?'alert':'status'">{{reuseMessage()}}</p>}
 <h4>Boxes for one product</h4>
 @for(p of boxes;track $index){<section class="box"><div class="tools">
 <label>Name<input [disabled]="packagingScope==='shared-backdrop'" [(ngModel)]="p.package_name"></label>
 <label>L mm<input type="number" min="1" [disabled]="packagingScope==='shared-backdrop'" [(ngModel)]="p.length_mm"></label><label>W mm<input type="number" min="1" [disabled]="packagingScope==='shared-backdrop'" [(ngModel)]="p.width_mm"></label><label>H mm<input type="number" min="1" [disabled]="packagingScope==='shared-backdrop'" [(ngModel)]="p.height_mm"></label><label>kg<input type="number" min="0.001" step="0.1" [(ngModel)]="p.weight_kg"></label>
 @if(packagingScope!=='shared-backdrop'){<button (click)="boxes.splice($index,1)">Remove box</button>}</div>
 <details><summary>Contents ({{p.contents.length}})</summary>@for(c of components();track c.id){<label class="choice"><input type="checkbox" [checked]="assigned(p,c)" (change)="toggle(p,c,$any($event.target).checked)">{{c.component_name}} · Unit {{c.unit_index}}</label>}</details>
 </section>}
 @if(packagingScope!=='shared-backdrop'){<button (click)="addBox()">Add box</button>}
 <p>{{issue()}}</p>
 <label class="choice"><input type="checkbox" [(ngModel)]="confirmed">I checked this variant's options, box measurements and contents.</label>
 <button [disabled]="!!issue()||!confirmed" (click)="save()">{{saving()?'Saving…':busy()?'Loading packaging…':'Save changes'}}</button>
 </fieldset>
 @if(saved()){<p role="status">Variant saved. Existing orders and quotes were not changed.</p>}
 `,styles:[`:host{display:block;border:1px solid var(--wc-border);border-radius:var(--wc-radius);padding:1rem;margin-top:1rem}.tools{display:flex;gap:.6rem;flex-wrap:wrap;align-items:end;margin:.6rem 0}.box{border:1px solid var(--wc-border);border-radius:var(--wc-radius);padding:.7rem;margin:.7rem 0}input,select,button{font:inherit}label input,label select{display:block;max-width:240px;margin-top:.25rem}.choice{display:flex;gap:.5rem;align-items:center;margin:.5rem 0}.choice input{display:inline}h3{margin:0 0 .5rem}p{margin:.5rem 0;color:var(--wc-muted)}select{max-width:100%}.tools input{min-width:0;max-width:100%;width:160px}.tools label{min-width:0}fieldset{border:0;padding:0;min-width:0}.variant-matching{margin:.75rem 0;border-top:1px solid var(--wc-border);border-bottom:1px solid var(--wc-border);padding:.65rem 0}.variant-matching summary{cursor:pointer;font-weight:600}[role=alert]{color:#b91c1c}`]})
export class PackagingVariantsComponent implements OnChanges {
 @Input() product:any;
 @Input() catalog:any;
 catalogSizes=catalogSizes;
 sizeValue(){return this.options.find(o=>/^(size|dimensions?)$/i.test(o.name.trim()))?.value||'';}
 chooseSize(value:string){const name=(this.catalog?.productOptions||[]).find((o:any)=>/^(size|dimensions?)$/i.test(o.name||''))?.name||Object.keys(this.catalog?.variants?.find((v:any)=>Object.keys(v.choices||{}).some(k=>/^(size|dimensions?)$/i.test(k)))?.choices||{}).find(k=>/^(size|dimensions?)$/i.test(k))||'Size';this.options=this.options.filter(o=>!/^(size|dimensions?)$/i.test(o.name.trim()));this.options.push({name,value});this.remap();}
 @Input() initialSignature='';
 @Input() packagingScope:PackagingScope='product';
 @Input() backdropDimensions:Record<string,BackdropPackagingDimensions>={};
 variants=signal<any[]>([]);examples=signal<any[]>([]);rules:any[]=[];error=signal('');busy=signal(false);saving=signal(false);loadingExamples=signal(false);saved=signal(false);
 reuseMessage=signal('');reuseConflict=signal(false);
 selectedKey='';sourceItemId='';catalogId='';
 options:{name:string,value:string}[]=[];boxes:any[]=[];confirmed=false;
 constructor(private supabase:SupabaseService){}
 private loadedInput='';
 async ngOnChanges(){
  const key=JSON.stringify([this.product?.id,this.initialSignature,this.packagingScope]);
  if(key===this.loadedInput)return;
  this.loadedInput=key;
  this.reset();this.busy.set(true);try{
  const [profiles,rules]=await Promise.all([this.supabase.client.from('wc_delivery_packaging_profiles').select('*').eq('shipping_product_id',this.product.id),this.supabase.client.from('wc_shipping_rules').select('*').eq('active',true).eq('effect_type','No effect')]);
  if(profiles.error||rules.error)throw Error('Variants unavailable. Check the packaging variant migration.');
  this.variants.set(profiles.data||[]);this.rules=rules.data||[];
  const requested=this.initialSignature||(this.variants().length===1?this.variants()[0].signature:'');
  if(requested){if(this.variants().some(v=>v.signature===requested))this.open(requested);else this.error.set('The requested packaging variant is no longer available.');}
  this.busy.set(false);this.loadingExamples.set(true);
  const examples:any[]=[];
  for(let start=0;;start+=250){const {data,error}=await this.supabase.client.from('wc_order_items').select('*').order('id').range(start,start+249);if(error)throw Error('Order option examples unavailable');
   examples.push(...(data||[]).filter((i:any)=>this.product.wix_product_id?i.catalog_reference?.catalogItemId===this.product.wix_product_id:i.product_name===this.product.product_name));if((data||[]).length<250)break;}
  this.examples.set([...new Map(examples.map(e=>[this.label(e),e])).values()]);
 }catch(e:any){this.error.set(e.message);}finally{this.busy.set(false);this.loadingExamples.set(false);}}
 reset(){this.selectedKey='';this.sourceItemId='';this.catalogId='';this.options=this.packagingScope==='shared-backdrop'?[{name:'Size',value:''}]:[];this.boxes=[];this.confirmed=false;this.saved.set(false);this.error.set('');this.reuseMessage.set('');this.reuseConflict.set(false);}
 item(){return {id:this.product.id,product_name:this.product.product_name,quantity:1,catalog_reference:(this.product.wix_product_id||this.catalogId)?{catalogItemId:this.product.wix_product_id||this.catalogId}:{},wix_options:Object.fromEntries(this.options.map(o=>[o.name,o.value]))};}
 components(){return reviewComponents({wc_order_items:[this.item()]},this.rules);}
 label(item:any){return packagingOptionLabels(item).join(' · ')||'All colours · no structural options';}
 open(key:string){this.reset();const v=this.variants().find(v=>v.signature===key);if(!v)return;this.selectedKey=key;this.sourceItemId=v.template_item.source_item_id||'';this.catalogId=productId(v.template_item);this.options=Object.entries(v.template_item.wix_options).map(([name,value])=>({name,value:String(value)}));this.boxes=structuredClone(v.packages);this.remap();}
 useExample(id:string){const item=this.examples().find(e=>e.id===id);if(!item)return;this.sourceItemId=item.id;this.catalogId=productId(item);this.options=orderItemOptionLabels(item,100).flatMap(label=>{const n=label.indexOf(':');return n<0?[]:[{name:label.slice(0,n).trim(),value:label.slice(n+1).trim()}];});this.remap();}
 copy(){this.selectedKey='';const size=this.options.find(o=>o.name.trim().toLowerCase()==='size');if(size)size.value='';else this.options.push({name:'Size',value:''});if(this.packagingScope==='shared-backdrop')this.boxes=[];this.remap();}
 remap(){const components=this.components();this.boxes=this.boxes.map(p=>({...p,contents:(p.contents||[]).flatMap((c:any)=>{const match=components.find(x=>x.component_key===c.component_key&&x.unit_index===c.unit_index);return match?[match]:[];})}));if(!this.boxes.length)this.reuseSharedBackdropBoxes();this.confirmed=false;this.saved.set(false);}
 reuseSharedBackdropBoxes(){
  this.reuseMessage.set('');this.reuseConflict.set(false);
  if(this.packagingScope!=='shared-backdrop')return;
  const found=sharedBackdropBox(Object.fromEntries(this.options.map(option=>[option.name,option.value])),this.backdropDimensions);
  if(!found.key)return;
  if(!found.box){this.reuseConflict.set(true);this.reuseMessage.set(`Add shared dimensions for ${sizeKeyLabel(found.key)} in Backdrop box drawings before entering this product's weight.`);return;}
  const components=this.components();
  this.boxes=[{...found.box,contents:components.length===1?components:[]}];
  this.reuseMessage.set(`Shared dimensions loaded for ${sizeKeyLabel(found.key)}. Enter this product's weight before saving.`);
 }
 assigned(p:any,c:any){return p.contents.some((x:any)=>x.id===c.id);}
 toggle(p:any,c:any,on:boolean){p.contents=on?[...p.contents.filter((x:any)=>x.id!==c.id),c]:p.contents.filter((x:any)=>x.id!==c.id);this.confirmed=false;}
 addBox(){if(this.packagingScope==='shared-backdrop'){this.reuseSharedBackdropBoxes();return;}const components=this.components();this.boxes.push({package_name:'Box '+(this.boxes.length+1),length_mm:0,width_mm:0,height_mm:0,weight_kg:0,contents:components.length===1?components:[]});this.confirmed=false;}
 issue(){if(!this.product.wix_product_id&&!this.sourceItemId)return 'Choose an existing order composition to identify the Wix product.';if(!this.selectedKey&&catalogSizes(this.catalog).length&&!this.sizeValue())return 'Choose the product size for these boxes.';if(this.options.some(o=>!o.name.trim()||!o.value.trim()))return 'Open Variant matching (advanced): complete or remove the empty option.';if(new Set(this.options.map(o=>o.name.trim().toLowerCase())).size!==this.options.length)return 'Remove duplicate option names.';return packagingError(this.boxes,this.components());}
 async save(){if(this.busy()||this.issue()||!this.confirmed)return;this.busy.set(true);this.saving.set(true);this.error.set('');try{
  const {data,error}=await this.supabase.client.functions.invoke('delivery-cost-review',{body:{action:'save-packaging-variant',productId:this.product.id,sourceItemId:this.sourceItemId,options:this.options,packages:this.boxes}});
  if(error||!data?.ok){const detail=await error?.context?.json?.().catch(()=>null);throw Error(detail?.error||data?.error||'Variant not saved');}
  const result=await this.supabase.client.from('wc_delivery_packaging_profiles').select('*').eq('shipping_product_id',this.product.id);if(result.error)throw Error('Saved; refresh to load variants.');this.variants.set(result.data||[]);this.selectedKey=variantSignature(this.item());this.saved.set(true);this.confirmed=false;
 }catch(e:any){this.error.set(e.message);}finally{this.busy.set(false);this.saving.set(false);}}
}
