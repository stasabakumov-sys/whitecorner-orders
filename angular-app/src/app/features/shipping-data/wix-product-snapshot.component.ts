import {Component, Input, OnChanges, signal, Output, EventEmitter} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {environment} from '../../../environments/environment';
import {backdropSizeKey} from './product-sizes';
import {foldingOption,Folding} from '../costing/production-cost';
@Component({selector:'app-wix-product-snapshot',standalone:true,template:`
 @if(error()){<p role="alert">{{error()}}</p>}
 @if(product();as p){<details [open]="expanded()" (toggle)="expanded.set($any($event.target).open)"><summary>Wix catalogue · description and variants · read only</summary><section>
 @if(!readonly){<button [disabled]="busy()" (click)="refresh()">{{busy()?'Updating from Wix…':'Update this product from Wix'}}</button>}
 @if(message()){<p role="status">{{message()}}</p>}
 @if(!orderOptions){<p>Product-wide SKU: {{p.sku||'—'}} · Product-wide price: {{p.priceData?.formatted?.discountedPrice||p.price?.formatted?.discountedPrice||p.priceData?.formatted?.price||p.price?.formatted?.price||'Not supplied'}} · {{p.visible===true?'Visible in Wix':p.visible===false?'Hidden in Wix':'Visibility not supplied'}}</p>}
 @if(p.description){<div [innerHTML]="p.description"></div>}
 <p>{{visibleVariants().length}} @if(orderOptions){variant(s) matching this order}@else if(backdrop){variants for {{selectedSize}} · {{selectedFolding==='foldable'?'Foldable':'Non-foldable'}}}@else{variants} · Colour variants remain distinct in the catalogue.</p>
 <div class="scroll"><table><thead><tr><th>Variant choices</th><th>SKU</th><th>Price</th></tr></thead><tbody>
 @for(v of visibleVariants();track v.id){<tr><td>{{choices(v.choices)}}</td><td>{{v.variant?.sku||'—'}}</td><td>{{v.variant?.priceData?.formatted?.discountedPrice||v.variant?.priceData?.formatted?.price||'Not supplied'}}</td></tr>}
 @empty{<tr><td colspan="3">No Wix variant matches {{orderOptions?'this order configuration':'the selected size and construction'}}.</td></tr>}
 </tbody></table></div></section></details>}
 `,styles:[`button{font:inherit;padding:8px 12px;border:1px solid #dce5ef;border-radius:8px;background:white;color:#344054;cursor:pointer}button:disabled{opacity:.5}[role=alert]{color:#b42318}summary{cursor:pointer;font-size:14px;font-weight:600;padding:10px 0}section{max-height:55vh;overflow:auto;padding-top:12px}.scroll{max-height:280px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:8px;border-bottom:1px solid #e7edf5}`]})
export class WixProductSnapshotComponent implements OnChanges{
 @Output() catalogUpdated=new EventEmitter<any>();
 @Input({required:true})productId='';@Input()backdrop=false;@Input()selectedSize='';@Input()selectedFolding:Folding|''='';@Input()orderOptions:Record<string,string>|null=null;@Input()readonly=false;readonly product=signal<any>(null);readonly error=signal('');readonly expanded=signal(false);private request=0;
 constructor(private readonly supabase:SupabaseService){}
 readonly busy=signal(false);readonly message=signal('');
 async refresh(){
  if(this.busy())return;const productId=this.productId,request=this.request;this.busy.set(true);this.error.set('');this.message.set('');
  try{
   const {data,error}=await this.supabase.client.functions.invoke(environment.wixSyncFunction,{body:{action:'refreshCatalogProduct',productId}});
   if(error){let reason='';try{reason=(await error.context?.json())?.error||'';}catch{}throw Error(reason||'Wix update failed. Check your connection and permissions, then retry.');}
   if(!data?.ok||!data.source_product)throw Error(data?.error||'Product save was not confirmed. Reload the card before retrying.');
   if(request===this.request){this.product.set(data.source_product);this.catalogUpdated.emit(data.source_product);this.message.set('Product and variants updated from Wix.');}
  }catch(e:any){if(request===this.request)this.error.set(e?.message||'Product update failed. Retry.');}
  finally{this.busy.set(false);}
 }
 optionText(value:any){return String(value?.original??value?.value??value?.name??value??'');}
 choices(value:any){return value&&typeof value==='object'?Object.entries(value).map(([k,v])=>`${k}: ${this.optionText(v)}`).join(' · '):'Default';}
 visibleVariants(){const variants=this.product()?.variants||[];
  if(this.orderOptions){const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();return variants.filter((variant:any)=>{const entries=Object.entries(variant.choices||{});return entries.length?entries.every(([key,value])=>{const selected=Object.entries(this.orderOptions||{}).find(([name])=>normalized(name)===normalized(key))?.[1];return selected!==undefined&&normalized(selected)===normalized(this.optionText(value));}):!Object.keys(this.orderOptions||{}).length;});}
  if(!this.backdrop||!this.selectedSize||!this.selectedFolding)return variants;const size=backdropSizeKey(this.selectedSize);return variants.filter((variant:any)=>{const choices=variant.choices||{},sizeValue=Object.entries(choices).find(([key])=>/^(size|dimensions?)$/i.test(key.trim()))?.[1];return backdropSizeKey(this.optionText(sizeValue))===size&&foldingOption(choices)===this.selectedFolding;});}
 async ngOnChanges(changes:any){if(!changes['productId'])return;const request=++this.request;this.expanded.set(false);this.product.set(null);this.error.set('');this.message.set('');if(!this.productId||this.productId.startsWith('saved:'))return;
 const {data,error}=await this.supabase.client.from('wc_wix_catalog_products').select('source_product').eq('shipping_product_id',this.productId).maybeSingle();
 if(request!==this.request)return;if(error){this.error.set('Imported catalogue details are unavailable.');return;}this.product.set(data?.source_product||null);}
}
