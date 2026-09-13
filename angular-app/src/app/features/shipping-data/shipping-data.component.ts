import {productNavigationMatches} from '../../core/utils/product-navigation';
import {WixCatalogReviewComponent} from './wix-catalog-review.component';
import {WixProductSnapshotComponent} from './wix-product-snapshot.component';
import {PackageDrawingsComponent} from './package-drawings.component';
import { Component, OnInit, computed, signal, Optional, ChangeDetectorRef } from '@angular/core';
import {DialogModule} from 'primeng/dialog';
import {DrawerModule} from 'primeng/drawer';
import {FormsModule} from '@angular/forms';
import {backdropSizeKey,backdropDrawingKey,qualifiedDrawingKey,optionSizes,packagingSizes,sizeKeyLabel} from './product-sizes';
import {ActivatedRoute} from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import {BoxDrawingComponent} from './box-drawing.component';
import {ProductDetailsComponent} from './product-details.component';
import {ProductPartsComponent} from './product-parts.component';
import {PackagingVariantsComponent} from './packaging-variants.component';
import {CatalogCostEditorComponent} from '../costing/catalog-cost-editor.component';
import {ProductWorkCostComponent} from '../costing/product-work-cost.component';
import {CostingService} from '../costing/costing.service';
import {productId,componentNormal} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {shippingProfileCatalog,savedProfileOptions} from '../../core/utils/shipping-profile-catalog';

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
};

type ShippingRule = {
  id: string;
  shipping_product_id: string;
  rule_type?: string | null;
  match_name?: string | null;
  match_value?: string | null;
  effect_type?: string | null;
  package_count_delta?: number | null;
  active?: boolean;
};

export function currentProductCostProfiles(rows:any[]){
  return rows.filter(row=>Object.keys(row.options||{}).length>0||!rows.some(other=>other!==row&&other.kind===row.kind&&Boolean(other.standard_top_excluded)===Boolean(row.standard_top_excluded)&&Object.keys(other.options||{}).length>0));
}

@Component({
  selector: 'app-shipping-data',
  standalone: true,
  imports:[PackageDrawingsComponent,WixProductSnapshotComponent,WixCatalogReviewComponent,PackagingVariantsComponent,CatalogCostEditorComponent,ProductWorkCostComponent,BoxDrawingComponent,ProductDetailsComponent,ProductPartsComponent,DialogModule,DrawerModule,FormsModule],
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
      @for(p of visibleProducts();track p.id){<tr><td class="number">{{$index+1}}</td><td><button class="product-link" (click)="openProduct(p.id)">{{p.product_name}}</button></td><td>{{p.short_name||'—'}}</td><td>{{productSizes(p).join(' · ')||'—'}}</td><td>{{p.saved_profiles?.length||0}}</td></tr>}
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
                @if(productSizes(p).length){<div class="small product-header-size">{{productSizes(p).join(' · ')}}</div>}
              </div>
              <span class="badge">{{p.saved_profiles?.length||0}} reusable profile(s)</span>
            </div>

            <section class="shipsection"><app-product-details [product]="p" [wixSizes]="wixSizes(p)" (saved)="updateDetails($event)">
            <span class="product-drawing-label">Product drawing</span>
            <app-box-drawing [productId]="p.id" />
            <p class="small product-drawing-help">For size-specific drawings, use the matching variant below.</p>
            </app-product-details></section>
            <nav class="product-card-tabs" aria-label="Product card sections"><button [class.on]="detailTab==='cost'" (click)="detailTab='cost'">Product cost</button><button [class.on]="detailTab==='packing'" (click)="detailTab='packing'">Packing</button><button [class.on]="detailTab==='minutes'" (click)="detailTab='minutes'">Estimated min</button></nav>
            @if(detailTab==='cost'){
            <section class="shipsection"><app-product-work-cost [product]="p" /></section>
            <section class="shipsection"><h3>Product cost · incl. GST</h3>
            <p class="small">Add materials here. Planned work is calculated above from Estimated min and Work Rates. Order Costing shows the combined order summary.</p>
            @if(costing.error()){<p role="alert">{{costing.error()}}</p>}
            @if(isBackdrop(p)){<p class="small">Raw and painted use one material profile. Painting changes only the calculated work cost above.</p>}
            @for(part of costProfiles(p.id);track part.variant_key){<details><summary>Edit materials · {{costProfileLabel(part,p.id)}}</summary><app-catalog-cost-editor [part]="part" [showWork]="false" [hideColour]="isBackdrop(p)" /><h4>Variant product drawing</h4><app-box-drawing [productId]="p.id" [variantKey]="part.variant_key" /></details>}
            @empty{<p class="mut">No order variant available yet. Open Add materials on an order to define its costs.</p>}
            </section>
            }
            @if(detailTab==='packing'){
            @for(profile of p.saved_profiles||[];track profile.signature){
             <section class="shipsection"><h3>Packaging and box drawings · {{profileOptions(profile)}}</h3>
             <p class="small">Used automatically for matching size, structural options and quantity. Colour (including Raw) does not change packaging. This is the saved profile, not a second copy.</p>
             <div class="tablewrap"><table class="shiptable packaging-table"><thead><tr><th>Box</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th>Contents</th><th>Drawing</th></tr></thead><tbody>
             @for(box of profile.packages;track $index){<tr><td>{{box.package_name}}</td><td>{{box.length_mm}}</td><td>{{box.width_mm}}</td><td>{{box.height_mm}}</td><td>{{box.weight_kg}}</td><td>@for(c of box.contents||[];track $index){<div>{{contentLabel(c)}} · Unit {{c.unit_index}}</div>}</td><td><app-package-drawings [signature]="profile.signature" [index]="$index" [box]="box" [backdrop]="isBackdrop(p)" [sharedSize]="isBackdrop(p)?sharedSize(profile,p):''" [sizeLabel]="sizeLabel(sharedSize(profile,p))" /></td></tr>}
             </tbody></table></div></section>
            }
            @if(!p.saved_only){
            @for (variantProduct of [p]; track variantProduct.id) {<app-packaging-variants [product]="variantProduct" [initialSignature]="requestedVariant" />}
            <div class="shipsection">
              <h3>Packages</h3>
              <div class="tablewrap">
                <table class="shiptable">
                  <thead><tr><th>Source</th><th>Box</th><th>Name</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th></th></tr></thead>
                  <tbody>
                    @for (pkg of productPackages(p.id); track pkg.id) {
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
              <h3>Rules</h3>
              @if (productRules(p.id).length) {
                @for (r of productRules(p.id); track r.id) {
                  <div class="rule">
                    <div><b>{{ r.rule_type }}</b><div class="small">{{ r.active ? 'Active' : 'Inactive' }}</div></div>
                    <div><b>{{ r.match_name }}</b><div class="small">{{ r.match_value ? 'Value: '+r.match_value : 'Any value' }}</div></div>
                    <div>{{ r.effect_type }}</div>
                    <div>Boxes: <input class="delta" type="number" [value]="r.package_count_delta??0" (input)="setRuleDraft(r.id,$any($event.target).value)"></div>
                    <button class="btn" (click)="saveRule(r)">Save</button>
                  </div>
                }
              } @else {
                <div class="mut">No rules for this product.</div>
              }
            </div>
            }
            <section class="shipsection"><app-wix-product-snapshot [productId]="p.id" /></section>
            }
            @if(detailTab==='minutes'){
             <section class="shipsection"><app-product-parts [product]="p" /></section>
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
  search='';libraryOpen=false;libraryLoading=false;libraryError='';newSize='';detailTab:'cost'|'packing'|'minutes'='cost';extraSizes=signal<string[]>([]);parseSize=backdropSizeKey;sizeLabel=sizeKeyLabel;
  openProduct(id:string){this.requestedVariant='';this.detailTab='cost';this.selectedId.set(id);}
  isBackdrop(p?:ShippingProduct){return /backdrop/i.test(p?.product_name||'');}
  contentLabel(c:any){return [...new Set([c.product_name,c.component_name].filter(Boolean).map((s:string)=>s.trim()))].join(' · ');}
  updateDetails(details:any){this.products.update(rows=>rows.map(p=>p.id===details.id?{...p,...details}:p));}
  wixSizes(p:ShippingProduct){return [...new Set([...(p.saved_profiles||[]).flatMap(profile=>packagingSizes(profile,p.product_name)),...this.costing.parts().filter(part=>part.shipping_product_id===p.id).flatMap(part=>optionSizes(part.options))])];}
  productSizes(p:ShippingProduct){const imported=this.wixSizes(p);return imported.length?imported:[...new Set((p.manual_sizes||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];}
  newFolding='';libraryMessage='';qualifiedKey=qualifiedDrawingKey;legacyFolding:Record<string,string>={};legacyRevisions:Record<string,string>={};classifying='';
  sharedSize(profile:any,p:ShippingProduct){return backdropDrawingKey(profile,p.product_name);}
  librarySizes(){return [...new Set([...this.extraSizes(),...this.products().filter(p=>this.isBackdrop(p)).flatMap(p=>(p.saved_profiles||[]).map(profile=>this.sharedSize(profile,p)).filter(Boolean))])].sort();}
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
  ruleDrafts = new Map<string, number>();
  filters = [
    {key:'all' as const,label:'All'},
    {key:'backdrops' as const,label:'Backdrops'},
    {key:'carts' as const,label:'Carts'},
    {key:'others' as const,label:'Others'}
  ];

  visibleProducts = (() => this.products().filter(p => (this.kindFilter()==='all' || this.kind(p.product_name)===this.kindFilter())&&`${p.product_name} ${p.short_name||''}`.toLowerCase().includes(this.search.toLowerCase())));
  selectedProduct = computed(() => this.products().find(p => p.id===this.selectedId()) ?? null);

  constructor(private supabase: SupabaseService,@Optional() private route?:ActivatedRoute,@Optional() public costing:CostingService=new CostingService(supabase),@Optional() private cdr?:ChangeDetectorRef) {}
  costProfiles(id:string){const saved=this.costing.profiles().filter(p=>p.shipping_product_id===id&&p.costing_version===2).map(profile=>({...profile.template_item,item_id:profile.template_item.source_item_id,variant_key:profile.variant_key,product_name:profile.product_name,profile}));const rows=currentProductCostProfiles([...new Map([...saved,...this.costing.parts().filter(p=>p.shipping_product_id===id)].map(p=>[p.variant_key,p])).values()]);if(!this.isBackdrop(this.products().find(p=>p.id===id) as ShippingProduct))return rows;const groups=new Map<string,any[]>();for(const row of rows){const key=this.costProfileGroup(row);groups.set(key,[...(groups.get(key)||[]),row]);}return [...groups.values()].map(parts=>({...parts[0],shared_parts:parts}));}
  costProfileGroup(p:any){return `${p.kind}|${p.standard_top_excluded?'topless':'complete'}|${JSON.stringify(Object.fromEntries(Object.entries(p.options||{}).filter(([key])=>!['colour','color'].includes(key.toLowerCase())).sort(([a],[b])=>a.localeCompare(b))))}`;}
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
    const backdrop=this.isBackdrop(this.products().find(row=>row.id===productId) as ShippingProduct);
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

  productPackages(id: string) { return this.packages().filter(x => x.shipping_product_id===id).sort((a,b)=>(a.package_no??0)-(b.package_no??0)); }
  basePackages(id: string) { return this.productPackages(id).filter(x => x.source_type==='Base'); }
  productRules(id: string) { return this.rules().filter(x => x.shipping_product_id===id && x.effect_type!=='No effect' && Number(x.package_count_delta||0)!==0); }
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

  setRuleDraft(id: string, value: string) { this.ruleDrafts.set(id, Number(value||0)); }

  async saveRule(rule: ShippingRule) {
    const delta = this.ruleDrafts.get(rule.id) ?? Number(rule.package_count_delta||0);
    const { error } = await this.supabase.client.from('wc_shipping_rules').update({package_count_delta:delta,updated_at:new Date().toISOString()}).eq('id',rule.id);
    if (error) { this.error.set(error.message); return; }
    this.rules.update(rows => rows.map(x => x.id===rule.id ? {...x,package_count_delta:delta} : x));
  }
}
