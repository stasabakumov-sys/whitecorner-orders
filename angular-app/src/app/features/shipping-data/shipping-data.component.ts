import { Component, OnInit, computed, signal } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

type ShippingProduct = {
  id: string;
  product_name: string;
  product_type?: string | null;
  active?: boolean;
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
        <span class="mut push">Packaging profiles for freight quotes</span>
      </div>

      <div class="shipgrid">
        <div class="shiplist">
          @for (p of visibleProducts(); track p.id) {
            <button class="shipitem" [class.on]="selectedId()===p.id" (click)="selectedId.set(p.id)">
              <div class="pn">{{ p.product_name }}</div>
              <div class="pm">{{ basePackages(p.id).length }} base boxes · {{ incompleteBaseCount(p.id) ? incompleteBaseCount(p.id)+' incomplete' : 'complete' }}</div>
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
              <span class="badge" [class.warn]="incompleteCount(p.id)>0" [class.ok]="incompleteCount(p.id)===0">
                {{ incompleteCount(p.id)>0 ? incompleteCount(p.id)+' packages incomplete' : 'Ready for quoting' }}
              </span>
            </div>

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
          } @else {
            <div class="mut">No products in this filter.</div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [`
    .shipping{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}
    .shiphead{padding:16px 18px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .push{margin-left:auto}.mut,.small{color:#758198;font-size:12px}.small{font-size:11px}
    .typefilter{display:inline-flex;gap:4px;padding:3px;background:#f3f5f8;border:1px solid #e1e5eb;border-radius:999px}
    .typefilter button{border:0;background:transparent;color:#5f6b7a;border-radius:999px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer}
    .typefilter button.on{background:#fff;color:#116dff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    .shipgrid{display:grid;grid-template-columns:360px 1fr;min-height:590px}.shiplist{counter-reset:prod;border-right:1px solid #e4e7ec}
    .shipitem{counter-increment:prod;position:relative;width:100%;border:0;border-bottom:1px solid #edf0f3;background:#fff;text-align:left;padding:17px 16px 17px 54px;cursor:pointer}
    .shipitem:before{content:counter(prod);position:absolute;left:18px;top:17px;width:24px;height:24px;border:1px solid #d9dde5;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;color:#566174}
    .shipitem.on{background:#f3f7ff;box-shadow:inset 3px 0 0 #116dff}.pn{font-weight:600;line-height:1.35}.pm{font-size:11px;color:#7d8797;margin-top:5px}
    .shipdetail{padding:22px}.detailhead{display:flex;gap:12px;align-items:flex-start}.detailhead h2{margin:0 0 4px;font-size:21px}.detailhead .badge{margin-left:auto}
    .shipsection{margin-top:24px}.tablewrap{overflow:auto}.shiptable{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e4e7ec;border-radius:9px;overflow:hidden;min-width:760px}
    .shiptable th,.shiptable td{padding:9px 8px;border-bottom:1px solid #edf0f3;text-align:left}.shiptable th{background:#fafbfc;color:#758198;font-size:10px;text-transform:uppercase}.shiptable tr:last-child td{border-bottom:0}
    input{width:82px;border:1px solid #d4d9e2;border-radius:8px;padding:7px 8px;background:#fff}.name{width:165px}input:disabled{background:#f7f8fa;color:#566174}.delta{width:55px}
    .rule{border:1px solid #e4e7ec;border-radius:8px;padding:11px 12px;margin-bottom:8px;display:grid;grid-template-columns:100px 1fr 120px 110px 78px;gap:8px;align-items:center}
    .btn{border:1px solid #d4d9e2;background:#fff;color:#116dff;border-radius:8px;padding:8px 11px;cursor:pointer}.btn.primary{background:#116dff;color:#fff;border-color:#116dff}
    .badge{display:inline-block;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:600}.warn{background:#fff0e6;color:#9a4b00}.ok{background:#d9f3e5;color:#17643d}.saved{margin-right:8px}
    .error{background:#fff1f1;color:#8c2f2f;border:1px solid #f0caca;padding:12px;border-radius:8px;margin-bottom:10px}
    @media(max-width:1000px){.shipgrid{grid-template-columns:1fr}.shiplist{border-right:0;border-bottom:1px solid #e4e7ec}.rule{grid-template-columns:1fr 1fr}}
  `]
})
export class ShippingDataComponent implements OnInit {
  products = signal<ShippingProduct[]>([]);
  packages = signal<ShippingPackage[]>([]);
  rules = signal<ShippingRule[]>([]);
  selectedId = signal<string | null>(null);
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

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.error.set('');
    const [pr, pk, rr] = await Promise.all([
      this.supabase.client.from('wc_shipping_products').select('*').eq('active',true).order('product_name'),
      this.supabase.client.from('wc_shipping_packages').select('*').eq('active',true).order('package_no'),
      this.supabase.client.from('wc_shipping_rules').select('*').order('created_at')
    ]);
    if (pr.error) { this.error.set(pr.error.message); return; }
    this.products.set((pr.data ?? []) as ShippingProduct[]);
    this.packages.set((pk.data ?? []) as ShippingPackage[]);
    this.rules.set((rr.data ?? []) as ShippingRule[]);
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
