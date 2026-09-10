import {Component, Input, OnChanges, signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
@Component({selector:'app-wix-product-snapshot',standalone:true,template:`
 @if(error()){<p role="alert">{{error()}}</p>}
 @if(product();as p){<details [open]="expanded()" (toggle)="expanded.set($any($event.target).open)"><summary>Wix catalogue · description and variants · read only</summary><section>
 <p>SKU: {{p.sku||'—'}} · Price: {{p.priceData?.formatted?.discountedPrice||p.price?.formatted?.discountedPrice||p.priceData?.formatted?.price||p.price?.formatted?.price||'Not supplied'}} · {{p.visible===true?'Visible in Wix':p.visible===false?'Hidden in Wix':'Visibility not supplied'}}</p>
 @if(p.description){<div [innerHTML]="p.description"></div>}
 <p>{{p.variants?.length||0}} variants · Colour variants remain distinct in the catalogue.</p>
 <div class="scroll"><table><thead><tr><th>Variant choices</th><th>SKU</th><th>Price</th></tr></thead><tbody>
 @for(v of p.variants||[];track v.id){<tr><td>{{choices(v.choices)}}</td><td>{{v.variant?.sku||'—'}}</td><td>{{v.variant?.priceData?.formatted?.discountedPrice||v.variant?.priceData?.formatted?.price||'Not supplied'}}</td></tr>}
 </tbody></table></div></section></details>}
 `,styles:[`summary{cursor:pointer;font-size:14px;font-weight:600;padding:10px 0}section{max-height:55vh;overflow:auto;padding-top:12px}.scroll{max-height:280px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:8px;border-bottom:1px solid #e7edf5}`]})
export class WixProductSnapshotComponent implements OnChanges{
 @Input({required:true})productId='';readonly product=signal<any>(null);readonly error=signal('');readonly expanded=signal(false);private request=0;
 constructor(private readonly supabase:SupabaseService){}
 choices(value:any){return value&&typeof value==='object'?Object.entries(value).map(([k,v])=>`${k}: ${String(v)}`).join(' · '):'Default';}
 async ngOnChanges(){const request=++this.request;this.expanded.set(false);this.product.set(null);this.error.set('');if(!this.productId||this.productId.startsWith('saved:'))return;
 const {data,error}=await this.supabase.client.from('wc_wix_catalog_products').select('source_product').eq('shipping_product_id',this.productId).maybeSingle();
 if(request!==this.request)return;if(error){this.error.set('Imported catalogue details are unavailable.');return;}this.product.set(data?.source_product||null);}
}
