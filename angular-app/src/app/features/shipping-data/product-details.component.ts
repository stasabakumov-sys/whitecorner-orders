import {Component,Input,Output,EventEmitter,OnChanges,SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
@Component({selector:'app-product-details',standalone:true,imports:[FormsModule],template:`
 <h3>Product details</h3>
 <div class="fields">
 <div class="field short-name-field"><label for="product-short-name">Short name</label>
 <div class="actions"><input id="product-short-name" [(ngModel)]="shortName" maxlength="100" [readOnly]="!editingName" [disabled]="busy" placeholder="Not set">
 @if(!editingName){<button (click)="editName()" [disabled]="busy||product.saved_only">{{product.short_name?'Edit':'Add'}}</button>}
 @else{<button (click)="save('name')" [disabled]="busy">Save</button><button (click)="cancelName()" [disabled]="busy">Cancel</button>}
 </div></div>
 <div class="field">
 @if(wixSizes.length){<label for="product-size">Product size · Wix</label><input id="product-size" class="wix-size" [value]="wixSizes.join(' · ')" [title]="wixSizes.join(' · ')" readonly><p>Size from Wix is read-only.</p>}
 @else{<label for="product-size">Manual product sizes</label><textarea id="product-size" [(ngModel)]="sizes" maxlength="2000" rows="1" [disabled]="busy" placeholder="Size II: W1400 × D600 × H1000 mm"></textarea>
 <p>Enter one size per line, including units. Packaging dimensions remain unchanged.</p>
 <button (click)="save('sizes')" [disabled]="busy||product.saved_only">Save sizes</button>}
 </div></div>
 @if(product.saved_only){<p>This packaging-only entry needs a saved product record before details can be edited.</p>}
 @if(error){<p role="alert">{{error}}</p>}
 @if(done){<p role="status">Saved</p>}
 `,styles:[`.fields{display:flex;gap:16px;flex-wrap:wrap}.field{display:flex;flex-direction:column;gap:6px;flex:1;min-width:220px}.field.short-name-field{flex:0 1 400px}.short-name-field input{max-width:320px}.field:has(#product-size){flex:0 1 320px}.field textarea{height:36px;min-height:36px;max-height:120px;resize:vertical}.field:has(#product-size)>button{align-self:flex-start}.field .wix-size{width:220px;max-width:100%;text-overflow:ellipsis}.actions{display:flex;gap:8px;align-items:center}input,textarea{width:100%;box-sizing:border-box}input{min-width:0}.actions button{flex-shrink:0}p{font-size:.875rem;color:var(--wc-muted)}[role=alert]{color:var(--p-red-600)}`]})
export class ProductDetailsComponent implements OnChanges {
 @Input() product:any;@Input() wixSizes:string[]=[];@Output() saved=new EventEmitter<any>();shortName='';sizes='';busy=false;error='';done=false;editingName=false;
 constructor(private db:SupabaseService){}
 ngOnChanges(changes:SimpleChanges){if(changes['product']){this.shortName=this.product?.short_name||'';this.sizes=this.product?.manual_sizes||'';this.editingName=false;this.error='';this.done=false;}}
 editName(){this.shortName=this.product.short_name||'';this.editingName=true;this.done=false;}
 cancelName(){this.shortName=this.product.short_name||'';this.editingName=false;this.error='';}
 async save(field:'name'|'sizes'){if(this.busy||this.product.saved_only||(field==='name'&&!this.editingName)||(field==='sizes'&&this.wixSizes.length))return;const id=this.product.id;
 const patch=field==='name'?{short_name:this.shortName.trim()}:{manual_sizes:[...new Set(this.sizes.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))].join('\n')};
 this.busy=true;this.error='';this.done=false;
 try{const {data,error}=await this.db.client.from('wc_shipping_products').update(patch).eq('id',id).select('id,short_name,manual_sizes').single();if(error)throw error;if(!data)throw Error('Product not found');this.saved.emit(data);if(this.product.id===id){this.done=true;if(field==='name')this.editingName=false;}}
 catch{if(this.product.id===id)this.error='Could not save product details. Please retry.';}finally{this.busy=false;}
 }
}
