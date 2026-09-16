import {productNavigationMatches} from '../../core/utils/product-navigation';
import {WixCatalogReviewComponent} from './wix-catalog-review.component';
import {WixProductSnapshotComponent} from './wix-product-snapshot.component';
import {PackageDrawingsComponent} from './package-drawings.component';
import { Component, OnInit, computed, signal, Optional, ChangeDetectorRef } from '@angular/core';
import {DialogModule} from 'primeng/dialog';
import {DrawerModule} from 'primeng/drawer';
import {FormsModule} from '@angular/forms';
import {backdropSizeKey,manualBackdropSizeKey,backdropDrawingKey,qualifiedDrawingKey,optionSizes,packagingSizes,sizeKeyLabel} from './product-sizes';
import {ActivatedRoute} from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import {BoxDrawingComponent} from './box-drawing.component';
import {ProductDetailsComponent} from './product-details.component';
import {ProductPartsComponent} from './product-parts.component';
import {PackagingVariantsComponent,sharedBackdropLayoutKey} from './packaging-variants.component';
import {CatalogCostEditorComponent} from '../costing/catalog-cost-editor.component';
import {ProductWorkCostComponent} from '../costing/product-work-cost.component';
import {CostingService} from '../costing/costing.service';
import {Folding,foldingOption} from '../costing/production-cost';
import {productId,componentNormal} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {shippingProfileCatalog,savedProfileOptions} from '../../core/utils/shipping-profile-catalog';
import {cartSizeFromOptions,cartSizeKey,cartSizeRows} from './cart-size';
import {CartMainPackagingComponent} from './cart-main-packaging.component';
import {BackdropPaintProfileComponent} from './backdrop-paint-profile.component';

type ShippingProduct = {
  id: string;
  product_name: string;
  wix_product_id?: string | null;
  short_name?: string;
  manual_sizes?: string;
  product_type?: string | null;
  active?: boolean;
  saved_profiles?:any[];
  saved_only?:boolean;
  product_source?:'catalog'|'hub_test';
  backdrop_paint_profile?:any;
};

type ShippingPackage = {
  id: string;
  shipping_product_id: string;
  source_type?: string | null;
  package_no: number;
  package_name?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_kg?: number | null;
  active?: boolean;
  size_key?: string | null;
};

type ShippingRule = {
  id: string;
  shipping_product_id: string;
  rule_type?: string | null;
  match_name?: string | null;
  match_value?: string | null;
  effect_type?: string | null;
  package_count_delta?: number | null;
  package_name?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_kg?: number | null;
  active?: boolean;
  size_key?: string | null;
};

export function currentProductCostProfiles(rows:any[]){
  return rows.filter(row=>Object.keys(row.options||{}).length>0||!rows.some(other=>other!==row&&other.kind===row.kind&&Boolean(other.standard_top_excluded)===Boolean(row.standard_top_excluded)&&Object.keys(other.options||{}).length>0));
}

function variantKey(parts:any[]){return `[${parts.map(part=>JSON.stringify(part)).join(', ')}]`;}
export function cartCostProfiles(productId:string,rows:any[],sizeKey:string,productName='Cart'){
  const current=rows.filter(row=>{try{return ['catalog-v4-cart-base','catalog-v4-cart-option'].includes(JSON.parse(row.variant_key)?.[0]);}catch{return false;}});
  const found=current.find(row=>{try{const key=JSON.parse(row.variant_key);return key?.[0]==='catalog-v4-cart-base'&&key?.[2]===sizeKey;}catch{return false;}});
  if(!sizeKey)return [];
  const source=found||current.find(row=>row.kind==='main')||rows.find(row=>row.kind==='main')||{shipping_product_id:productId,product_name:productName,item_id:null,main_item_id:null,multiplier:1,has_pans:false};
  const base={...(found||source),variant_key:found?.variant_key||variantKey(['catalog-v4-cart-base',productId,sizeKey,'complete']),kind:'main',options:{Size:sizeKey},profile:found?.profile||null,legacy_lines:found?.legacy_lines||null,standard_top_excluded:false,cart_material_scope:!found?.item_id,size_key:sizeKey};
  const options=['Internal Shelf','Side shelves'].map(name=>{
    const key=variantKey(['catalog-v4-cart-option',productId,sizeKey,name.toLowerCase(),'yes']);
    const saved=current.find(row=>row.variant_key===key);
    return {...(saved||base),variant_key:key,kind:`option:${name}`,options:{Size:sizeKey,[name]:'Yes'},profile:saved?.profile||null,legacy_lines:saved?.legacy_lines||null,has_pans:false,standard_top_excluded:false,cart_material_scope:!saved?.item_id,size_key:sizeKey};
  });
  return [base,...options];
}
export function cartCostProfileLabel(part:any){return part.kind==='main'?'Main':part.kind==='option:Internal Shelf'?'Shelf':'Side shelves';}

export function backdropCostProfiles(productId:string,productName:string,sizes:string[],rows:any[],manualSizes=false){
 const main=rows.filter(row=>row.kind==='main'&&!row.standard_top_excluded),other=rows.filter(row=>row.kind!=='main'||row.standard_top_excluded);
 const variants=(['foldable','nonfoldable'] as Folding[]).map(folding=>{
  const shared=main.find(row=>row.backdrop_material_scope&&row.profile?.template_item?.profile_scope==='backdrop-structure-v2'&&foldingOption(row.options)===folding);
  if(shared)return{...shared,shipping_product_id:productId,size_key:null,folding};
  const legacy=main.filter(row=>foldingOption(row.options)===folding).map(row=>row.profile).filter(Boolean);
  const signatures=[...new Set(legacy.map(profile=>JSON.stringify((profile.lines||[]).map((line:any)=>[line.material_id,Number(line.quantity)]).sort())))];
  return{variant_key:JSON.stringify(['backdrop-structure-v2',productId,folding]),shipping_product_id:productId,product_name:productName,kind:'main',multiplier:1,standard_top_excluded:false,options:{Foldable:folding==='foldable'?'YES':'NO'},backdrop_material_scope:true,size_key:null,folding,profile:null,legacy_lines:signatures.length===1?legacy[0]?.lines||[]:[]};
 });
 return [...variants,...other];
}

@Component({
  selector: 'app-shipping-data',
  standalone: true,
  imports:[BackdropPaintProfileComponent,PackageDrawingsComponent,WixProductSnapshotComponent,WixCatalogReviewComponent,PackagingVariantsComponent,CartMainPackagingComponent,CatalogCostEditorComponent,ProductWorkCostComponent,BoxDrawingComponent,ProductDetailsComponent,ProductPartsComponent,DialogModule,DrawerModule,FormsModule],
  template: `
    @if (error()) { <div class="error">{{ error() }}</div> }
    <section class="shipping">
      <div class="product-filters">
      <div class="shiphead">
        <div class="products-title"><h1>Products</h1><small>{{ visibleProducts().length }} products</small></div>
        <div class="typefilter">
          @for (k of filters; track k.key) {
            <button [class.on]="kindFilter()===k.key" (click)="setFilter(k.key)">{{ k.label }}</button>
          }
        </div>
        <span class="mut push">Shared product catalogue · packaging, materials, work and Pans</span>
      </div>

      <div class="product-tools"><input aria-label="Search products" placeholder="Search products" [(ngModel)]="search"><app-wix-catalog-review (saved)="load()" /><button (click)="openLibrary()">Backdrop box drawings</button></div>
      </div>
      <div class="tablewrap product-tablewrap"><table class="shiptable product-list"><thead><tr><th class="number">#</th><th>Product</th><th>Short name</th><th>Product size</th><th>Packaging profiles</th></tr></thead><tbody>
      @for(p of visibleProducts();track p.id){<tr><td class="number">{{$index+1}}</td><td><button class="product-link" (click)="openProduct(p.id)">{{p.product_name}}</button></td><td>{{p.short_name||'—'}}</td><td>{{productSizes(p).join(' · ')||'—'}}</td><td>{{reusableProfileCount(p)}}</td></tr>}
      @empty{<tr><td colspan="5">No products found.</td></tr>}
      </tbody></table></div>
      <p-dialog header="Backdrop box drawings" [(visible)]="libraryOpen" [modal]="true" [style]="{width:'min(760px,95vw)'}" [draggable]="false">
       <p>One packaging drawing per backdrop size and folding option, shared by all matching Backdrops. Replacing it updates the shared drawing for all of them.</p>
       @if(libraryError){<p role="alert">{{libraryError}}</p>}
       @if(libraryLoading){<p role="status">Loading drawing library…</p>}
       <div class="product-tools"><input aria-label="New backdrop size" placeholder="e.g. 190cm x 95cm" [(ngModel)]="newSize"><select aria-label="Folding option" [(ngModel)]="newFolding"><option value="">Choose folding option</option><option value="foldable">Foldable</option><option value="nonfoldable">Non-foldable</option></select><button (click)="addLibrarySize()" [disabled]="!parseSize(newSize)||!newFolding">Add size</button></div>
       @if(libraryMessage){<p role="status">{{libraryMessage}}</p>}
       <table class="shiptable"><thead><tr><th>Backdrop size</th><th>Drawing</th></tr></thead><tbody>
       @for(key of librarySizes();track key){<tr><td>{{sizeLabel(key)}}</td><td><app-box-drawing [sharedSize]="key" [readOnly]="!qualifiedKey(key)" />
       @if(!qualifiedKey(key)){<p>Existing drawing: folding option needs review.</p><select aria-label="Classify existing drawing" [(ngModel)]="legacyFolding[key]" [disabled]="!!classifying"><option value="">Choose folding option</option><option value="foldable">Foldable</option><option value="nonfoldable">Non-foldable</option></select><button (click)="classifyDrawing(key)" [disabled]="!legacyFolding[key]||!!classifying">{{classifying===key?'Saving…':'Confirm folding option'}}</button>}
       </td></tr>}
       @empty{<tr><td colspan="2">Add a backdrop size to upload its first drawing.</td></tr>}
       </tbody></table>
      </p-dialog>
      <p-drawer [visible]="!!selectedId()" (visibleChange)="!$event&&selectedId.set(null)" header="Product" position="right" [modal]="true" [dismissible]="true" [blockScroll]="true" styleClass="products-drawer">
        <div class="shipdetail">          @if (selectedProduct(); as p) {
            <div class="detailhead">
              <span class="product-thumbnail">@if(productImage(p);as src){<img [src]="src" [alt]="p.short_name||p.product_name" (error)="failedImages.add(src)">}@else{<span class="pi pi-image" aria-label="No product image"></span>}</span>
              <div>
                <h2>{{ p.short_name || p.product_name }}</h2>
                @if(p.short_name){<div class="product-full-name">{{p.product_name}}</div>}
                @if(productSizes(p).length&&!isCart(p)){<div class="small product-header-size">{{productSizes(p).join(' · ')}}</div>}
              </div>
              <span class="badge">{{reusableProfileCount(p)}} reusable profile(s)</span>
            </div>

            <section class="shipsection"><app-product-details [product]="p" [wixSizes]="wixSizes(p)" [sizeTable]="isCart(p)" (saved)="updateDetails($event)">
            <span class="product-drawing-label">Product drawing</span>
            <app-box-drawing [productId]="p.id" />
            <p class="small product-drawing-help">Product drawing shared by all variants.</p>
            </app-product-details></section>
            @if(isCart(p)&&detailTab!=='wix'&&cartSizes(p).length){<nav class="cart-size-tabs" aria-label="Cart sizes">@for(size of cartSizes(p);track size.key){<button [class.on]="activeCartSize(p)===size.key" (click)="selectCartSize(size.key)">{{size.label}}</button>}</nav>}
            <nav class="product-card-tabs" aria-label="Product card sections"><button [class.on]="detailTab==='cost'" (click)="detailTab='cost'">Product cost</button><button [class.on]="detailTab==='packing'" (click)="detailTab='packing'">Packing</button><button [class.on]="detailTab==='minutes'" (click)="detailTab='minutes'">Estimated min</button><button [class.on]="detailTab==='wix'" (click)="detailTab='wix'">Wix catalogue</button></nav>
            @if(detailTab==='cost'){
            <section class="shipsection"><app-product-work-cost [product]="p" [sizes]="productSizes(p)" [selectedSize]="isCart(p)?activeCartSize(p):''" [manualSizes]="!wixSizes(p).length" [materialProfiles]="costProfiles(p.id,activeCartSize(p))" [materials]="costing.materials()" /></section>
            <section class="shipsection"><h3>Product cost · incl. GST</h3>
            <p class="small">Add materials here. Planned work is calculated above from Estimated min and Work Rates. Order Costing shows the combined order summary.</p>
            @if(costing.error()){<p role="alert">{{costing.error()}}</p>}
            @if(isBackdrop(p)){<p class="small">All sizes reuse one Foldable profile and one Non-foldable profile. Painting is stored once for the whole product.</p>}
            @for(part of costProfiles(p.id,activeCartSize(p));track part.variant_key){<details><summary>Edit materials · {{costProfileLabel(part,p.id)}}</summary><app-catalog-cost-editor [part]="part" [showWork]="false" [hideColour]="isBackdrop(p)" /></details>}
            @empty{<p class="mut">No order variant available yet. Open Add materials on an order to define its costs.</p>}
            @if(isBackdrop(p)){<app-backdrop-paint-profile mode="materials" [product]="p" [materials]="costing.materials()" (saved)="updateDetails($event)" />}
            </section>
            }
            @if(detailTab==='packing'){
            @if(!isCart(p)){@for(profile of packingProfiles(p);track profile.signature){
             <section class="shipsection"><h3>Packaging and box drawings · {{profileOptions(profile)}}</h3>
             <p class="small">Used automatically for matching size, structural options and quantity. Colour (including Raw) does not change packaging. This is the saved profile, not a second copy.</p>
             <div class="tablewrap"><table class="shiptable packaging-table"><thead><tr><th>Box</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th>Contents</th><th>Drawing</th></tr></thead><tbody>
             @for(box of profile.packages;track $index){<tr><td>{{box.package_name}}</td><td>{{box.length_mm}}</td><td>{{box.width_mm}}</td><td>{{box.height_mm}}</td><td>{{box.weight_kg}}</td><td>@for(c of box.contents||[];track $index){<div>{{contentLabel(c)}} · Unit {{c.unit_index}}</div>}</td><td><app-package-drawings [signature]="profile.signature" [index]="$index" [box]="box" [backdrop]="isBackdrop(p)" [sharedSize]="isBackdrop(p)?sharedSize(profile,p):''" [sizeLabel]="sizeLabel(sharedSize(profile,p))" /></td></tr>}
             </tbody></table></div></section>
            }}
            @if(!p.saved_only){
            @if(isCart(p)){
             <p class="small cart-packaging-note">Quote uses the reusable Main packages below. Select one or several Add-ons in the far-right column to create an exact, manually entered Main + Add-ons replacement variant.</p>
             @if(cartMainProfiles(p).length){<section class="shipsection saved-cart-combinations">
              <h3>Saved Main + Add-ons variants</h3>
              <p class="small">Saved combinations remain available after the page is reloaded. Open one to review or rewrite its complete packaging.</p>
              <div class="saved-combination-list">@for(profile of cartMainProfiles(p);track profile.signature){
               <button type="button" [class.on]="cartMainProfileSelected(profile)" (click)="openCartMainProfile(p,profile)"><b>Main + {{cartMainProfileLabel(profile)}}</b><span>{{profile.packages?.length||0}} box(es) · Open</span></button>
              }</div>
             </section>}
            }@else{
             @for (variantProduct of [p]; track variantProduct.id) {<app-packaging-variants [product]="variantProduct" [initialSignature]="requestedVariant" [packagingScope]="packagingScope(variantProduct)" [sharedBackdropProfiles]="sharedBackdropPackagingProfiles()" />}
            }
            <div class="shipsection">
              <h3>{{isCart(p)?'Reusable Main packages':'Packages'}}</h3>
              <div class="tablewrap">
                <table class="shiptable">
                  <thead><tr><th>Source</th><th>Box</th><th>Name</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th></th></tr></thead>
                  <tbody>
                    @for (pkg of productPackages(p.id,isCart(p)?activeCartSize(p):''); track pkg.id) {
                      <tr>
                        <td>{{ pkg.source_type }}</td>
                        <td>{{ pkg.package_no }}</td>
                        <td><input class="name" [disabled]="!editing(pkg.id)" [value]="pkg.package_name||''" (input)="setDraft(pkg.id,'package_name',$any($event.target).value)"></td>
                        <td><input type="number" [disabled]="!editing(pkg.id)" [value]="pkg.length_mm??''" (input)="setDraft(pkg.id,'length_mm',$any($event.target).value)"></td>
                        <td><input type="number" [disabled]="!editing(pkg.id)" [value]="pkg.width_mm??''" (input)="setDraft(pkg.id,'width_mm',$any($event.target).value)"></td>
                        <td><input type="number" [disabled]="!editing(pkg.id)" [value]="pkg.height_mm??''" (input)="setDraft(pkg.id,'height_mm',$any($event.target).value)"></td>
                        <td><input type="number" step="0.1" [disabled]="!editing(pkg.id)" [value]="pkg.weight_kg??''" (input)="setDraft(pkg.id,'weight_kg',$any($event.target).value)"></td>
                        <td>
                          @if (editing(pkg.id)) {
                            <button class="btn primary" (click)="savePackage(pkg)">Save</button>
                          } @else {
                            <span class="badge ok saved">Saved ✓</span><button class="btn" (click)="startEdit(pkg)">Rewrite</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="shipsection">
              <h3>{{isCart(p)?'Add-ons':'Rules'}}</h3>
              @if (productRules(p.id,isCart(p)?activeCartSize(p):'').length) {
                @for (r of productRules(p.id,isCart(p)?activeCartSize(p):''); track r.id) {
                  <div class="rule">
                    <div><b>{{ r.rule_type }}</b><div class="small">{{ r.active ? 'Active' : 'Inactive' }}</div></div>
                    <div><b>{{ r.match_name }}</b><div class="small">{{ r.match_value ? 'Value: '+r.match_value : 'Any value' }}</div></div>
                    <div>{{ r.effect_type==='Replace profile'?'Add package':r.effect_type }}</div>
                    <div>Boxes: <input class="delta" type="number" min="1" [value]="ruleValue(r,'package_count_delta')" (input)="setRuleDraft(r.id,'package_count_delta',$any($event.target).value)"></div>
                    <div>Name: <input class="name" [value]="ruleValue(r,'package_name')" (input)="setRuleDraft(r.id,'package_name',$any($event.target).value)"></div>
                    <div>L mm: <input type="number" min="1" [value]="ruleValue(r,'length_mm')" (input)="setRuleDraft(r.id,'length_mm',$any($event.target).value)"></div>
                    <div>W mm: <input type="number" min="1" [value]="ruleValue(r,'width_mm')" (input)="setRuleDraft(r.id,'width_mm',$any($event.target).value)"></div>
                    <div>H mm: <input type="number" min="1" [value]="ruleValue(r,'height_mm')" (input)="setRuleDraft(r.id,'height_mm',$any($event.target).value)"></div>
                    <div>kg: <input type="number" min="0.01" step="0.01" [value]="ruleValue(r,'weight_kg')" (input)="setRuleDraft(r.id,'weight_kg',$any($event.target).value)"></div>
                    <button class="btn" [disabled]="ruleSaving(r.id)" (click)="saveRule(r)">{{ruleSaving(r.id)?'Saving…':'Save'}}</button>
                    @if(isCart(p)){<label class="combine-main"><input type="checkbox" [checked]="mainAddOnSelected(r)" (change)="toggleMainAddOn(r,$any($event.target).checked)"><span>Combine<br>with Main</span></label>}
                    @if(ruleFeedback()[r.id];as feedback){<span class="rule-feedback" [class.ok-text]="feedback.ok" [class.error-text]="!feedback.ok" [attr.role]="feedback.ok?'status':'alert'">{{feedback.text}}</span>}
                  </div>
                }
                @if(isCart(p)&&mainAddOns().length){<app-cart-main-packaging [product]="p" [sizeKey]="activeCartSize(p)" [sizeLabel]="cartSizeLabel(p)" [addOns]="mainAddOns()" (profileSaved)="storeCartMainProfile(p,$event)" />}
              } @else {
                <div class="mut">No rules for this product.</div>
              }
            </div>
            }
            }
            @if(detailTab==='minutes'){
             <section class="shipsection"><app-product-parts [product]="p" [sizes]="productSizes(p)" [selectedSize]="isCart(p)?activeCartSize(p):''" /></section>
             @if(isBackdrop(p)){<section class="shipsection"><app-backdrop-paint-profile mode="minutes" [product]="p" [materials]="costing.materials()" (saved)="updateDetails($event)" /></section>}
            }
            @if(detailTab==='wix'){
             <section class="shipsection"><app-wix-product-snapshot [productId]="p.id" /></section>
            }
          } @else {
            <div class="mut">No products in this filter.</div>
          }
        </div>
      </p-drawer>
    </section>
  `,
  styleUrl: './shipping-data.component.css',
})
export class ShippingDataComponent implements OnInit {
  search='';libraryOpen=false;libraryLoading=false;libraryError='';newSize='';detailTab:'cost'|'packing'|'minutes'|'wix'='cost';selectedCartSize='';extraSizes=signal<string[]>([]);parseSize=backdropSizeKey;sizeLabel=sizeKeyLabel;
  openProduct(id:string){this.requestedVariant='';this.detailTab='cost';this.selectedCartSize='';this.mainAddOns.set([]);this.selectedId.set(id);}
  isBackdrop(p?:ShippingProduct){return componentNormal(p?.product_type||'')==='backdrop'||/backdrop/i.test(p?.product_name||'');}
  isCart(p?:ShippingProduct){return componentNormal(p?.product_type||'')==='cart';}
  packagingScope(p?:ShippingProduct){return this.isBackdrop(p)?'shared-backdrop' as const:'product' as const;}
  contentLabel(c:any){return [...new Set([c.product_name,c.component_name].filter(Boolean).map((s:string)=>s.trim()))].join(' · ');}
  updateDetails(details:any){this.products.update(rows=>rows.map(p=>p.id===details.id?{...p,...details}:p));}
  wixSizes(p:ShippingProduct){return [...new Set([...(p.saved_profiles||[]).flatMap(profile=>packagingSizes(profile,p.product_name)),...this.costing.parts().filter(part=>part.shipping_product_id===p.id).flatMap(part=>optionSizes(part.options))])];}
  productSizes(p:ShippingProduct){const imported=this.wixSizes(p);return imported.length?imported:[...new Set((p.manual_sizes||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];}
  cartSizes(p:ShippingProduct){return cartSizeRows(this.productSizes(p));}
  activeCartSize(p:ShippingProduct){const sizes=this.cartSizes(p);return sizes.some(size=>size.key===this.selectedCartSize)?this.selectedCartSize:sizes[0]?.key||'';}
  selectCartSize(size:string){this.selectedCartSize=size;this.mainAddOns.set([]);}
  cartSizeLabel(p:ShippingProduct){return this.cartSizes(p).find(size=>size.key===this.activeCartSize(p))?.label||'';}
  packingProfiles(p:ShippingProduct){
    if(this.isBackdrop(p)){
      const parse=this.wixSizes(p).length?backdropSizeKey:manualBackdropSizeKey,sizes=new Set(this.productSizes(p).map(parse).filter(Boolean));
      const entries=this.sharedBackdropPackagingProfiles().map(entry=>({...entry,key:backdropDrawingKey(entry.profile,entry.productName)})).filter(entry=>entry.key&&sizes.has(entry.key.split(':')[0]));
      return [...new Map(entries.map(entry=>[`${entry.key}|${sharedBackdropLayoutKey(entry.profile)}`,entry])).values()].map(entry=>({...entry.profile,packages:(entry.profile.packages||[]).map((box:any)=>({...box,contents:(box.contents||[]).map((content:any)=>content.component_key&&content.component_key!=='main'?content:{...content,product_name:p.product_name,component_name:p.product_name})}))}));
    }
    return !this.isCart(p)?p.saved_profiles||[]:(p.saved_profiles||[]).filter((profile:any)=>packagingSizes(profile,p.product_name).some(size=>cartSizeKey(size)===this.activeCartSize(p)));
  }
  reusableProfileCount(p:ShippingProduct){return this.isBackdrop(p)?this.packingProfiles(p).length:p.saved_profiles?.length||0;}
  newFolding='';libraryMessage='';qualifiedKey=qualifiedDrawingKey;legacyFolding:Record<string,string>={};legacyRevisions:Record<string,string>={};classifying='';
  sharedSize(profile:any,p:ShippingProduct){return backdropDrawingKey(profile,p.product_name);}
  librarySizes(){return [...new Set([...this.extraSizes(),...this.products().filter(p=>this.isBackdrop(p)).flatMap(p=>(p.saved_profiles||[]).map(profile=>this.sharedSize(profile,p)).filter(Boolean))])].sort();}
  sharedBackdropPackagingProfiles(){
    const profiles=this.products().filter(product=>this.isBackdrop(product)).flatMap(product=>(product.saved_profiles||[]).map(profile=>({profile,productName:product.product_name})));
    return [...new Map(profiles.map(entry=>[entry.profile.signature||`${entry.productName}:${backdropDrawingKey(entry.profile,entry.productName)}:${JSON.stringify(entry.profile.packages||[])}`,entry])).values()];
  }
  addLibrarySize(){const size=backdropSizeKey(this.newSize);if(!size||!['foldable','nonfoldable'].includes(this.newFolding))return;const key=size+':'+this.newFolding;this.libraryMessage=this.librarySizes().includes(key)?'This size and folding option already exists. Use its drawing below.':'';this.extraSizes.update(s=>[...new Set([...s,key])]);}
  async openLibrary(){this.libraryOpen=true;this.libraryLoading=true;this.libraryError='';this.libraryMessage='';try{const {data,error}=await this.supabase.client.from('wc_backdrop_box_drawings').select('size_key,revision');if(error)throw error;this.legacyRevisions=Object.fromEntries((data||[]).map(d=>[d.size_key,d.revision]));this.extraSizes.update(s=>[...new Set([...s.filter(qualifiedDrawingKey),...(data||[]).map(d=>d.size_key)])]);}catch{this.libraryError='Could not load the drawing library. Please reopen to retry.';}finally{this.libraryLoading=false;this.cdr?.markForCheck();}}
  async classifyDrawing(key:string){const fold=this.legacyFolding[key];if(this.classifying||!['foldable','nonfoldable'].includes(fold))return;this.classifying=key;this.libraryError='';try{const {data,error}=await this.supabase.client.rpc('wc_classify_backdrop_box_drawing',{p_size:key,p_folding:fold,p_expected:this.legacyRevisions[key]});if(error)throw error;if(data?.size_key!==key+':'+fold)throw Error('The server did not confirm the change.');this.extraSizes.update(s=>[...new Set(s.filter(k=>k!==key).concat(data.size_key))]);this.libraryMessage='Folding option saved. Reopen the product card to refresh its drawing.';}catch(e:any){this.libraryError='Could not classify drawing. '+(e?.message||'Check the connection and retry.');}finally{this.classifying='';this.cdr?.markForCheck();}}
  profileOptions=savedProfileOptions;
  products = signal<ShippingProduct[]>([]);
  packages = signal<ShippingPackage[]>([]);
  rules = signal<ShippingRule[]>([]);
  selectedId = signal<string | null>(null);
  requestedVariant='';
  kindFilter = signal<'all'|'backdrops'|'carts'|'others'>('all');
  error = signal('');
  editingIds = signal<Set<string>>(new Set());
  packageDrafts = new Map<string, Partial<ShippingPackage>>();
  ruleDrafts = new Map<string, Partial<ShippingRule>>();
  ruleSavingIds=signal<Set<string>>(new Set());
  ruleFeedback=signal<Record<string,{ok:boolean;text:string}>>({});
  mainAddOns=signal<ShippingRule[]>([]);
  filters = [
    {key:'all' as const,label:'All'},
    {key:'backdrops' as const,label:'Backdrops'},
    {key:'carts' as const,label:'Carts'},
    {key:'others' as const,label:'Others'}
  ];

  visibleProducts = (() => this.products().filter(p => (this.kindFilter()==='all' || this.kind(p.product_name)===this.kindFilter())&&`${p.product_name} ${p.short_name||''}`.toLowerCase().includes(this.search.toLowerCase())));
  selectedProduct = computed(() => this.products().find(p => p.id===this.selectedId()) ?? null);

  constructor(private supabase: SupabaseService,@Optional() private route?:ActivatedRoute,@Optional() public costing:CostingService=new CostingService(supabase),@Optional() private cdr?:ChangeDetectorRef) {}
  costProfiles(id:string,sizeKey=''){const product=this.products().find(p=>p.id===id) as ShippingProduct;const saved=this.costing.profiles().filter(p=>p.shipping_product_id===id&&p.costing_version===2).map(profile=>({...profile.template_item,shipping_product_id:profile.shipping_product_id,item_id:profile.template_item.source_item_id,variant_key:profile.variant_key,product_name:profile.product_name,profile,backdrop_material_scope:['backdrop-structure','backdrop-structure-v2'].includes(profile.template_item?.profile_scope),cart_material_scope:profile.template_item?.profile_scope==='cart-size-materials'}));const rows=currentProductCostProfiles([...new Map([...saved,...this.costing.parts().filter(p=>p.shipping_product_id===id)].map(p=>[p.variant_key,p])).values()]);if(this.isCart(product))return cartCostProfiles(id,rows,sizeKey,product.product_name);return this.isBackdrop(product)?backdropCostProfiles(id,product.product_name,this.productSizes(product),rows,!this.wixSizes(product).length):rows;}
  failedImages=new Set<string>();
  productImage(p:ShippingProduct){
    const items=this.costing.orders().flatMap(o=>o.wc_order_items||[]);
    const matches=items.filter(item=>p.wix_product_id?productId(item)===p.wix_product_id:componentNormal(item.product_name||'')===componentNormal(p.product_name));
    for(const item of matches){
      const x=item.image||{},r=item.raw_item||{};
      const src=x.url||x.imageUrl||x.imageInfo?.url||r.media?.url||r.image?.url||r.image?.imageInfo?.url||'';
      if(src&&!this.failedImages.has(src))return src;
    }
    return '';
  }
  costProfileLabel(p:any,productId:string){
    const product=this.products().find(row=>row.id===productId) as ShippingProduct;
    if(this.isCart(product))return cartCostProfileLabel(p);
    const backdrop=this.isBackdrop(product);
    const options=Object.entries(p.options||{}).filter(([key])=>!backdrop||!['colour','color'].includes(key.toLowerCase())).map(([k,v])=>k+': '+v).join(' · ');
    return `${p.kind} · ${options||'No options'}${p.standard_top_excluded?' · Standard top excluded':''}`;
  }

  async ngOnInit() {
    await Promise.all([this.load(),this.costing.load()]);
  }

  async load() {
    this.error.set('');
    const [pr, pk, rr] = await Promise.all([
      this.supabase.client.from('wc_shipping_products').select('*').eq('active',true).order('product_name'),
      this.supabase.client.from('wc_shipping_packages').select('*').eq('active',true).order('package_no'),
      this.supabase.client.from('wc_shipping_rules').select('*').order('created_at')
    ]);
    if (pr.error) { this.error.set(pr.error.message); return; }
    const profiles:any[]=[];
    for(let start=0;;start+=250){
      const page=await this.supabase.client.from('wc_delivery_packaging_profiles').select('*').order('signature').range(start,start+249);
      if(page.error){this.error.set('Saved packaging profiles could not be loaded.');return;}
      profiles.push(...(page.data||[]));if((page.data||[]).length<250)break;
    }
    this.products.set(shippingProfileCatalog(pr.data||[],profiles));
    this.packages.set((pk.data ?? []) as ShippingPackage[]);
    this.rules.set((rr.data ?? []) as ShippingRule[]);
    const params=this.route?.snapshot.queryParamMap;
    const requested=params?.get('product'),requestedId=params?.get('productId'),requestedWixId=params?.get('wixProductId');
    this.requestedVariant=params?.get('variant')||'';
    if(requestedId!=null||requested!=null||requestedWixId!=null){
      const matches=productNavigationMatches(this.products(),params!);
      this.selectedId.set(matches.length===1?matches[0].id:null);
      if(matches.length!==1)this.error.set('The product could not be identified uniquely in Products. Check its catalogue record.');
      return; // An explicit, missing target must never fall back to the first product.
    }

  }

  kind(name: string) {
    const n = String(name||'').toLowerCase();
    if (/cart|mobile bar|serving table|event bar/.test(n)) return 'carts';
    if (/backdrop|arch|panel|wall|plinth/.test(n)) return 'backdrops';
    return 'others';
  }

  setFilter(k: 'all'|'backdrops'|'carts'|'others') {
    this.kindFilter.set(k);
    const visible = this.visibleProducts();
    if (!visible.some(p => p.id===this.selectedId())) this.selectedId.set(null);
  }

  productPackages(id: string,sizeKey='') { return this.packages().filter(x => x.shipping_product_id===id&&(!sizeKey||x.size_key===sizeKey)).sort((a,b)=>(a.package_no??0)-(b.package_no??0)); }
  basePackages(id: string,sizeKey='') { return this.productPackages(id,sizeKey).filter(x => x.source_type==='Base'); }
  productRules(id: string,sizeKey='') { return this.rules().filter(x => x.shipping_product_id===id&&(!sizeKey||x.size_key===sizeKey) && x.active!==false && x.effect_type!=='No effect' && (x.effect_type==='Replace profile'||Number(x.package_count_delta||0)!==0)); }
  addOnDescriptorKey(value:any){return [value?.rule_type,value?.match_name,value?.match_value].map(item=>componentNormal(item||'')).join(':');}
  cartMainProfileDescriptors(profile:any){
    const stored=profile?.template_item?.merged_add_ons;
    if(Array.isArray(stored)&&stored.length)return stored;
    return Object.entries(profile?.template_item?.wix_options||{}).filter(([name,value])=>!['size','dimension','dimensions'].includes(componentNormal(name))&&/^(yes|true|included|selected)$/i.test(String(value))).map(([match_name,match_value])=>({rule_type:'Option',match_name,match_value}));
  }
  cartMainProfiles(product:ShippingProduct){return (product.saved_profiles||[]).filter(profile=>profile.template_item?.profile_scope==='cart-main'&&cartSizeFromOptions(profile.template_item?.wix_options)===this.activeCartSize(product)&&this.cartMainProfileDescriptors(profile).length).sort((a,b)=>this.cartMainProfileLabel(a).localeCompare(this.cartMainProfileLabel(b)));}
  cartMainProfileLabel(profile:any){return this.cartMainProfileDescriptors(profile).map((item:any)=>item.match_name).join(' + ');}
  cartMainProfileSelected(profile:any){return this.cartMainProfileDescriptors(profile).map((item:any)=>this.addOnDescriptorKey(item)).sort().join('|')===this.mainAddOns().map(item=>this.addOnDescriptorKey(item)).sort().join('|');}
  openCartMainProfile(product:ShippingProduct,profile:any){
    const available=this.productRules(product.id,this.activeCartSize(product)),selected=this.cartMainProfileDescriptors(profile).map((descriptor:any)=>available.find(rule=>this.addOnDescriptorKey(rule)===this.addOnDescriptorKey(descriptor))).filter(Boolean) as ShippingRule[];
    if(selected.length!==this.cartMainProfileDescriptors(profile).length){this.error.set('This saved Main combination refers to an Add-on rule that is no longer active. Restore the rule before editing the combination.');return;}
    this.error.set('');this.mainAddOns.set(selected);
  }
  storeCartMainProfile(product:ShippingProduct,profile:any){
    this.products.update(rows=>rows.map(row=>row.id!==product.id?row:{...row,saved_profiles:[...(row.saved_profiles||[]).filter(saved=>saved.signature!==profile.signature),profile]}));
  }
  mainAddOnSelected(rule:ShippingRule){return this.mainAddOns().some(item=>item.id===rule.id);}
  toggleMainAddOn(rule:ShippingRule,selected:boolean){this.mainAddOns.update(rows=>selected?[...rows.filter(item=>item.id!==rule.id),rule]:rows.filter(item=>item.id!==rule.id));}
  complete(pkg: ShippingPackage) { return pkg.length_mm!=null && pkg.width_mm!=null && pkg.height_mm!=null && pkg.weight_kg!=null; }
  incompleteCount(id: string) { return this.productPackages(id).filter(x => !this.complete(x)).length; }
  incompleteBaseCount(id: string) { return this.basePackages(id).filter(x => !this.complete(x)).length; }
  editing(id: string) { return this.editingIds().has(id) || !this.complete(this.packages().find(x=>x.id===id) as ShippingPackage); }

  startEdit(pkg: ShippingPackage) {
    this.packageDrafts.set(pkg.id,{...pkg});
    const next = new Set(this.editingIds()); next.add(pkg.id); this.editingIds.set(next);
  }

  setDraft(id: string, key: keyof ShippingPackage, value: string) {
    const current = this.packageDrafts.get(id) ?? {};
    const numeric = ['length_mm','width_mm','height_mm','weight_kg'].includes(String(key));
    (current as any)[key] = numeric ? (value==='' ? null : Number(value)) : (value||null);
    this.packageDrafts.set(id,current);
  }

  async savePackage(pkg: ShippingPackage) {
    const draft = this.packageDrafts.get(pkg.id) ?? {...pkg};
    const payload = {
      package_name: draft.package_name ?? pkg.package_name ?? null,
      length_mm: draft.length_mm ?? pkg.length_mm ?? null,
      width_mm: draft.width_mm ?? pkg.width_mm ?? null,
      height_mm: draft.height_mm ?? pkg.height_mm ?? null,
      weight_kg: draft.weight_kg ?? pkg.weight_kg ?? null,
      updated_at: new Date().toISOString()
    };
    const { error } = await this.supabase.client.from('wc_shipping_packages').update(payload).eq('id',pkg.id);
    if (error) { this.error.set(error.message); return; }
    this.packages.update(rows => rows.map(x => x.id===pkg.id ? {...x,...payload} : x));
    const next = new Set(this.editingIds()); next.delete(pkg.id); this.editingIds.set(next);
    this.packageDrafts.delete(pkg.id);
  }

  ruleValue(rule:ShippingRule,key:keyof ShippingRule){return (this.ruleDrafts.get(rule.id) as any)?.[key]??rule[key]??'';}
  setRuleDraft(id:string,key:keyof ShippingRule,value:string){
    const draft=this.ruleDrafts.get(id)||{};
    (draft as any)[key]=['package_name','effect_type'].includes(String(key))?(value||null):(value===''?null:Number(value));
    this.ruleDrafts.set(id,draft);
    this.ruleFeedback.update(rows=>{const next={...rows};delete next[id];return next;});
  }
  ruleSaving(id:string){return this.ruleSavingIds().has(id);}

  async saveRule(rule: ShippingRule) {
    if(this.ruleSaving(rule.id))return;
    const draft=this.ruleDrafts.get(rule.id)||{};
    const value=<K extends keyof ShippingRule>(key:K):ShippingRule[K]=>Object.prototype.hasOwnProperty.call(draft,key)?draft[key] as ShippingRule[K]:rule[key];
    const payload={effect_type:'Add package',package_count_delta:Number(value('package_count_delta')||0),package_name:value('package_name')??null,length_mm:value('length_mm')??null,width_mm:value('width_mm')??null,height_mm:value('height_mm')??null,weight_kg:value('weight_kg')??null,updated_at:new Date().toISOString()};
    if(!String(payload.package_name||'').trim()||payload.package_count_delta<1||[payload.length_mm,payload.width_mm,payload.height_mm,payload.weight_kg].some(v=>v==null||!Number.isFinite(Number(v))||Number(v)<=0)){
      this.ruleFeedback.update(rows=>({...rows,[rule.id]:{ok:false,text:'Complete the box name, L, W, H and kg before saving.'}}));return;
    }
    this.ruleSavingIds.update(ids=>new Set([...ids,rule.id]));
    this.ruleFeedback.update(rows=>{const next={...rows};delete next[rule.id];return next;});
    try{
      const { error } = await this.supabase.client.from('wc_shipping_rules').update(payload).eq('id',rule.id);
      if(error){this.ruleFeedback.update(rows=>({...rows,[rule.id]:{ok:false,text:`Could not save: ${error.message}. Please retry.`}}));return;}
      this.error.set('');this.rules.update(rows => rows.map(x => x.id===rule.id ? {...x,...payload} : x));this.ruleDrafts.delete(rule.id);
      this.ruleFeedback.update(rows=>({...rows,[rule.id]:{ok:true,text:'Saved ✓'}}));
    }finally{this.ruleSavingIds.update(ids=>{const next=new Set(ids);next.delete(rule.id);return next;});}
  }
}
