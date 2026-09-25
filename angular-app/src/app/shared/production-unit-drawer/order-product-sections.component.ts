import {Component, Input, OnChanges, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ProductionUnitView} from '../../core/models/production.models';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {CostingService} from '../../features/costing/costing.service';
import {CatalogCostEditorComponent} from '../../features/costing/catalog-cost-editor.component';
import {ProductWorkCostComponent} from '../../features/costing/product-work-cost.component';
import {ProductPartsComponent} from '../../features/shipping-data/product-parts.component';
import {ProductCncComponent} from '../../features/shipping-data/product-cnc.component';
import {WixProductSnapshotComponent} from '../../features/shipping-data/wix-product-snapshot.component';
import {SavedPackingComponent} from '../../features/shipping-data/saved-packing.component';
import {BoxRdFilesComponent} from '../../features/shipping-data/box-rd-files.component';
import {backdropSizeKey, optionSizes} from '../../features/shipping-data/product-sizes';
import {cartSizeFromOptions, isCartProduct} from '../../features/shipping-data/cart-size';
import {backdropFinishModes, foldingOption, optionFinish, Folding} from '../../features/costing/production-cost';
import {backdropCostProfiles, currentProductCostProfiles} from '../../features/shipping-data/shipping-data.component';
import {orderItemOptionLabels} from '../../core/utils/order-item-display';
import {productId, variantSignature, canonicalPackagingSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';

type Section='cost'|'packing'|'minutes'|'wix'|'cnc';
type Product={id:string;product_name:string;product_type?:string|null;short_name?:string|null;wix_product_id?:string|null;backdrop_paint_profile?:unknown};
type PackingProfile={signature:string;shipping_product_id:string;packages:any[];template_item:any};

function optionText(value:unknown):string {
 const v=value as {original?:unknown;value?:unknown;name?:unknown}|null;
 return String(v&&typeof v==='object'?(v.original??v.value??v.name??''):value??'').trim();
}
function orderChoices(view:ProductionUnitView):Record<string,string> {
 const options=Object.fromEntries(Object.entries(view.mainItem.wix_options||{}).map(([name,value])=>[name,optionText(value)]));
 if(Object.keys(options).length)return options;
 return Object.fromEntries(orderItemOptionLabels(view.mainItem,Number.MAX_SAFE_INTEGER).map(label=>{const split=label.indexOf(':');return split<0?['', '']:[label.slice(0,split).trim(),label.slice(split+1).trim()]}).filter(([name])=>name));
}
@Component({selector:'app-order-product-sections',standalone:true,
 imports:[CommonModule,CatalogCostEditorComponent,ProductWorkCostComponent,ProductPartsComponent,ProductCncComponent,WixProductSnapshotComponent,SavedPackingComponent,BoxRdFilesComponent],
 template:`
 <section class="order-product-sections" aria-label="Product details for this order variant">
  @if(loading()){<p role="status">Loading this product configuration…</p>}
  @if(error()){<p class="error" role="alert">{{error()}} <button type="button" (click)="load()">Retry</button></p>}
  @if(!loading()&&product();as p){
   <p class="variant">Selected configuration: {{variantLabel()}}</p>
   <nav aria-label="Product card sections">
    <button type="button" [class.active]="section()==='cost'" (click)="section.set('cost')">Product cost</button>
    <button type="button" [class.active]="section()==='packing'" (click)="section.set('packing')">Packing</button>
    <button type="button" [class.active]="section()==='minutes'" (click)="section.set('minutes')">Estimated min</button>
    <button type="button" [class.active]="section()==='wix'" (click)="section.set('wix')">Wix catalogue</button>
    <button type="button" [class.active]="section()==='cnc'" (click)="section.set('cnc')">CNC</button>
   </nav>
   @if(section()==='cost'){
   <app-product-work-cost [product]="p" [selectedSize]="timeSize()" [selectedFolding]="folding()" [orderVariant]="true" [orderComponentIds]="componentIds()" [availableFinishes]="orderFinishes()" [materialProfiles]="costProfiles()" [materials]="costing.materials()" />
    @if(costError()){<p class="error" role="alert">{{costError()}} <button type="button" (click)="load()">Retry</button></p>}
    @if(costing.error()){<p class="error" role="alert">{{costing.error()}}</p>}
    @if(members.manager()){@for(part of costProfiles();track part.variant_key){<details><summary>Edit materials · {{part.kind||'Product'}}</summary><app-catalog-cost-editor [part]="part" [showWork]="false" /></details>}
    @empty{<p>No saved cost profile matches this configuration.</p>}}
   }
   @if(section()==='packing'){
    @for(profile of packingProfiles();track profile.signature){<section class="profile"><h3>Boxes for this configuration</h3>
     @if(members.manager()){<app-saved-packing [product]="p" [profile]="profile" [rules]="rules()" [fallbackOptions]="choices()" [backdrop]="backdrop()" [sharedSize]="backdropKey()" [backdropDimensions]="dimensions()" (profileSaved)="load()" />}
     @else{@for(box of profile.packages;track $index){<p>{{box.package_name||'Box '+($index+1)}} · {{box.length_mm}} × {{box.width_mm}} × {{box.height_mm}} mm · {{box.weight_kg??'—'}} kg</p>}}
     @if(!members.manager()){@for(box of profile.packages;track $index){<div class="box-files"><strong>{{box.package_name||'Box '+($index+1)}}</strong><app-box-rd-files [signature]="profile.signature" [index]="$index" /></div>}}
    </section>}
    @empty{<p>No saved Packing profile matches this order configuration.</p>}
   }
   @if(section()==='minutes'){
    @if(unresolvedAddons()){<p class="error" role="alert">An ordered add-on could not be matched to a product ID. Its minutes need review in Products.</p>}
    @if(backdrop()&&!folding()){<p class="error" role="alert">This order has no clear Foldable option. Review its product choices before editing estimated minutes.</p>}
    @else if(members.manager()&&!unresolvedAddons()){<app-product-parts [product]="p" [selectedSize]="timeSize()" [selectedFolding]="folding()" [orderVariant]="true" [orderComponentIds]="componentIds()" />}
    @else{@for(template of timeTemplates();track template.id){<section class="profile"><h3>{{template.name}}</h3><p>CNC: {{template.estimates?.CNC??'—'}} min</p>@for(part of visibleParts(template);track part.id){<p>{{part.name}} · Assembly: {{template.estimates?.['Assembly:'+part.id]??'—'}} min · Sanding: {{template.estimates?.['Sanding:'+part.id]??'—'}} min</p>}</section>}
    @empty{<p>No estimated minutes match this configuration.</p>}}
   }
   @if(section()==='wix'){<app-wix-product-snapshot [productId]="p.id" [orderOptions]="choices()" [readonly]="!members.manager()" [backdrop]="backdrop()" [selectedSize]="size()" [selectedFolding]="folding()" />}
   @if(section()==='cnc'){<app-product-cnc [productId]="p.id" [backdrop]="backdrop()" [orderFolding]="folding()" [requireOrderFolding]="backdrop()" [readonly]="!members.manager()" />}
  }@else if(!loading()&&!error()){<p>This order item is not linked to a unique product record. Its catalogue ID must be matched before product details can be shown.</p>}
 </section>`,styles:[`
 :host{display:block}.order-product-sections{border:1px solid var(--wc-border);border-radius:12px;padding:14px;margin:14px 0;background:#fff;min-width:0}.variant{color:var(--wc-muted);font-size:.875rem;margin:0 0 12px}nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}nav button{border:1px solid var(--wc-border);border-radius:9px;background:#fff;padding:9px 12px;font:inherit;cursor:pointer}nav button.active{border-color:#34c995;background:#effdf7;color:#168565;font-weight:600}.profile{padding:12px 0;border-top:1px solid var(--wc-border)}.profile h3{margin:0 0 8px}.box-files{border-top:1px solid var(--wc-border);padding:8px 0}.error{color:#991b1b}details{margin:10px 0}summary{cursor:pointer}
 `]})
export class OrderProductSectionsComponent implements OnChanges {
 @Input({required:true})view!:ProductionUnitView;
 readonly section=signal<Section>('cost');readonly product=signal<Product|null>(null);readonly profiles=signal<PackingProfile[]>([]);
 readonly costParts=signal<any[]>([]);readonly sharedCostProfiles=signal<any[]>([]);readonly templates=signal<any[]>([]);readonly rules=signal<any[]>([]);readonly dimensions=signal<any>(null);readonly componentIds=signal<string[]>([]);readonly unresolvedAddons=signal(false);readonly loading=signal(false);readonly error=signal('');readonly costError=signal('');
 private generation=0;
 constructor(private db:SupabaseService,readonly members:HubMembersService,readonly costing:CostingService){}
 ngOnChanges(){this.section.set('cost');void this.load();}
 choices(){return orderChoices(this.view);}
 variantLabel(){return Object.entries(this.choices()).map(([key,value])=>`${key}: ${value}`).join(' · ')||'No variant options supplied';}
 size(){return optionSizes(this.choices())[0]||this.view.mainItem.size||'';}
 cartSize(){return cartSizeFromOptions(this.choices());}
 timeSize(){return isCartProduct(this.product())?this.cartSize():this.backdrop()?backdropSizeKey(this.size()):this.size();}
 folding():Folding|''{return foldingOption(this.choices());}
 orderFinishes():boolean[]{const finish=optionFinish(this.choices());if(finish==='raw')return[false];if(finish==='painted')return[true];return backdropFinishModes(this.product());}
 backdrop(){const p=this.product();return !!p&&(String(p.product_type||'').toLowerCase()==='backdrop'||/backdrop/i.test(p.product_name));}
 backdropKey(){const size=backdropSizeKey(this.size()),fold=this.folding();return size&&fold?`${size}:${fold}`:'';}
 packingProfiles(){let signature='';try{signature=variantSignature(this.view.mainItem);}catch{return[];}
  return this.profiles().filter(profile=>canonicalPackagingSignature(profile.signature)===signature);}
 costProfiles(){
  const product=this.product(),parts=this.costParts();if(!product||!this.backdrop())return parts;
  const saved=this.sharedCostProfiles().map(profile=>({...profile.template_item,shipping_product_id:profile.shipping_product_id,item_id:profile.template_item?.source_item_id,variant_key:profile.variant_key,product_name:profile.product_name,profile,backdrop_material_scope:['backdrop-structure','backdrop-structure-v2'].includes(profile.template_item?.profile_scope)}));
  const rows=currentProductCostProfiles([...new Map([...parts,...saved].map(part=>[part.variant_key,part])).values()]);
  return backdropCostProfiles(product.id,product.product_name,[],rows).filter(part=>part.kind!=='main'||!this.folding()||foldingOption(part.options)===this.folding());
 }
 visibleParts(template:any){const allowed=new Set(this.componentIds());return (template.parts||[]).filter((part:any)=>allowed.has(part.component_product_id||this.product()?.id));}
 timeTemplates(){const size=this.cartSize(),fold=this.folding();return this.templates().filter(t=>this.backdrop()?t.folding===fold&&(!t.size_key||t.size_key===this.backdropKey().split(':')[0]):isCartProduct(this.product())?!!size&&t.size_key===size:!t.size_key||!!this.size()&&t.size_key===this.size());}
 async load(){const generation=++this.generation,id=productId(this.view.mainItem);this.loading.set(true);this.error.set('');this.costError.set('');this.product.set(null);this.profiles.set([]);this.costParts.set([]);this.sharedCostProfiles.set([]);this.templates.set([]);this.rules.set([]);this.dimensions.set(null);this.componentIds.set([]);this.unresolvedAddons.set(false);
  try{await this.members.load();if(!id)return;
   const productResult=await this.db.client.from('wc_shipping_products').select('id,product_name,product_type,short_name,wix_product_id,backdrop_paint_profile').eq('wix_product_id',id).eq('active',true).maybeSingle();
   if(productResult.error)throw productResult.error;if(generation!==this.generation)return;
   const product=productResult.data as Product|null;if(!product)return;
   this.product.set(product);
   const addonIds=[...new Set(this.view.addons.map(addon=>productId(addon.item)).filter(Boolean))];
   if(addonIds.length){const addonResult=await this.db.client.from('wc_shipping_products').select('id,wix_product_id').in('wix_product_id',addonIds).eq('active',true);if(addonResult.error)throw addonResult.error;if(generation!==this.generation)return;this.componentIds.set([product.id,...(addonResult.data||[]).map(row=>row.id)]);this.unresolvedAddons.set(addonIds.length!==this.view.addons.length||(addonResult.data||[]).length!==addonIds.length);}
   else this.componentIds.set([product.id]);
   const [packing,templates,rules,dimensions]=await Promise.all([
    this.db.client.from('wc_delivery_packaging_profiles').select('signature,shipping_product_id,packages,template_item').eq('shipping_product_id',product.id),
    this.db.client.from('wc_shop_templates').select('id,name,size_key,folding,parts,estimates').eq('product_id',product.id),
    this.db.client.from('wc_shipping_rules').select('*').order('created_at'),
    this.backdropKey()?this.db.client.from('wc_backdrop_packaging_dimensions').select('*').eq('size_key',this.backdropKey()).maybeSingle():Promise.resolve({data:null,error:null}),
   ]);
   if(packing.error||templates.error||rules.error||dimensions.error)throw packing.error||templates.error||rules.error||dimensions.error;
   if(generation!==this.generation)return;
   this.profiles.set((packing.data||[]) as PackingProfile[]);
   this.templates.set(templates.data||[]);
   this.rules.set(rules.data||[]);
   this.dimensions.set(dimensions.data);
   try{
    const parts:any[]=[];for(let start=0;;start+=250){const page=await this.db.client.rpc('wc_catalog_cost_parts').range(start,start+249);if(page.error)throw page.error;parts.push(...(page.data||[]));if((page.data||[]).length<250)break;}
    if(generation===this.generation)this.costParts.set(parts.filter(part=>part.shipping_product_id===product.id&&part.order_id===this.view.order.id&&part.main_item_id===this.view.mainItem.id));
    if(this.backdrop()){const shared:any[]=[];for(let start=0;;start+=250){const page=await this.db.client.from('wc_material_profiles').select('*').eq('shipping_product_id',product.id).eq('costing_version',2).order('variant_key').range(start,start+249);if(page.error)throw page.error;shared.push(...(page.data||[]));if((page.data||[]).length<250)break;}if(generation===this.generation)this.sharedCostProfiles.set(shared);}
    if(!this.costing.materials().length){const materials:any[]=[];for(let start=0;;start+=250){const page=await this.db.client.from('wc_materials').select('*').order('name').order('id').range(start,start+249);if(page.error)throw page.error;materials.push(...(page.data||[]));if((page.data||[]).length<250)break;}if(generation===this.generation)this.costing.materials.set(materials);}
   }catch(e){if(generation===this.generation)this.costError.set(`Could not load material costs. ${(e as Error)?.message||'Check the connection and retry.'}`);}
  }catch(e){if(generation===this.generation)this.error.set(`Could not load this product configuration. ${(e as Error)?.message||'Check the connection and retry.'}`);}
  finally{if(generation===this.generation)this.loading.set(false);}
 }
}
