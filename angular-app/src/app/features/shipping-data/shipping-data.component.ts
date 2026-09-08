import { Component, OnInit, computed, signal, Optional } from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import {PackagingVariantsComponent} from './packaging-variants.component';
import {CatalogCostEditorComponent} from '../costing/catalog-cost-editor.component';
import {CostingService} from '../costing/costing.service';
import {shippingProfileCatalog,savedProfileOptions} from '../../core/utils/shipping-profile-catalog';

type ShippingProduct = {
  id: string;
  product_name: string;
  product_type?: string | null;
  active?: boolean;
  saved_profiles?:any[];
  saved_only?:boolean;
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

@Component({
  selector: 'app-shipping-data',
  standalone: true,
  imports:[PackagingVariantsComponent,CatalogCostEditorComponent],
  template: `
    @if (error()) { <div class="error">{{ error() }}</div> }
    <section class="shipping">
      <div class="shiphead">
        <b>Shipping Data</b>
        <span>{{ visibleProducts().length }} products</span>
        <div class="typefilter">
          @for (k of filters; track k.key) {
            <button [class.on]="kindFilter()===k.key" (click)="setFilter(k.key)">{{ k.label }}</button>
          }
        </div>
        <span class="mut push">Shared product catalogue · packaging, materials, work and Pans</span>
      </div>

      <div class="shipgrid">
        <div class="shiplist">
          @for (p of visibleProducts(); track p.id) {
            <button class="shipitem" [class.on]="selectedId()===p.id" [attr.aria-pressed]="selectedId()===p.id" (click)="selectedId.set(p.id);requestedVariant=''">
              <div class="pn">{{ p.product_name }}</div>
              <div class="pm">{{p.saved_profiles?.length||0}} saved profile(s) · {{ basePackages(p.id).length }} base boxes</div>
            </button>
          }
        </div>

        <div class="shipdetail">
          @if (selectedProduct(); as p) {
            <div class="detailhead">
              <div>
                <h2>{{ p.product_name }}</h2>
                <div class="small">{{ p.product_type }}</div>
              </div>
              <span class="badge">{{p.saved_profiles?.length||0}} reusable profile(s)</span>
            </div>

            <section class="shipsection"><h3>Product cost profiles · incl. GST</h3>
            @if(costing.error()){<p role="alert">{{costing.error()}}</p>}
            @for(part of costProfiles(p.id);track part.variant_key){<details><summary>{{costProfileLabel(part)}}</summary><app-catalog-cost-editor [part]="part" /></details>}
            @empty{<p class="mut">No order variant available yet. Open Add materials on an order to define its costs.</p>}
            </section>
            @for(profile of p.saved_profiles||[];track profile.signature){
             <section class="shipsection"><h3>Saved packaging · {{profileOptions(profile)}}</h3>
             <p class="small">Used automatically for an identical composition and quantity. This is the saved profile, not a second copy.</p>
             <div class="tablewrap"><table class="shiptable"><thead><tr><th>Box</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th>Contents</th></tr></thead><tbody>
             @for(box of profile.packages;track $index){<tr><td>{{box.package_name}}</td><td>{{box.length_mm}}</td><td>{{box.width_mm}}</td><td>{{box.height_mm}}</td><td>{{box.weight_kg}}</td><td>@for(c of box.contents||[];track $index){<div>{{c.product_name}} · {{c.component_name}} · Unit {{c.unit_index}}</div>}</td></tr>}
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
          } @else {
            <div class="mut">No products in this filter.</div>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './shipping-data.component.css',
})
export class ShippingDataComponent implements OnInit {
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

  visibleProducts = computed(() => this.products().filter(p => this.kindFilter()==='all' || this.kind(p.product_name)===this.kindFilter()));
  selectedProduct = computed(() => this.products().find(p => p.id===this.selectedId()) ?? null);

  constructor(private supabase: SupabaseService,@Optional() private route?:ActivatedRoute,@Optional() public costing:CostingService=new CostingService(supabase)) {}
  costProfiles(id:string){const saved=this.costing.profiles().filter(p=>p.shipping_product_id===id&&p.costing_version===2).map(profile=>({...profile.template_item,item_id:profile.template_item.source_item_id,variant_key:profile.variant_key,product_name:profile.product_name,profile}));return [...new Map([...saved,...this.costing.parts().filter(p=>p.shipping_product_id===id)].map(p=>[p.variant_key,p])).values()];}
  costProfileLabel(p:any){return `${p.kind} · ${Object.entries(p.options||{}).map(([k,v])=>k+': '+v).join(' · ')||'No options'}${p.standard_top_excluded?' · Standard top excluded':''}`;}

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
    const requested=params?.get('product'),requestedId=params?.get('productId');
    this.requestedVariant=params?.get('variant')||'';
    if(requestedId!==null&&requestedId!==undefined||requested!==null&&requested!==undefined){
      const saved=params?.get('savedProfile');
      const matches=this.products().filter(p=>(requestedId!==null&&requestedId!==undefined?p.id===requestedId:p.product_name===requested)&&(!saved||p.saved_profiles?.some(x=>x.signature===saved)));
      this.selectedId.set(matches.length===1?matches[0].id:null);
      if(matches.length!==1)this.error.set('No matching shipping product is available. Return to the order and add boxes there.');
      return; // An explicit, missing target must never fall back to the first product.
    }
    if (!this.selectedId() && this.products().length) this.selectedId.set(this.products()[0].id);
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
    if (!visible.some(p => p.id===this.selectedId())) this.selectedId.set(visible[0]?.id ?? null);
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
