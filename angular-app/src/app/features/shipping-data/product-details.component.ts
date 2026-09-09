import {Component,Input,Output,EventEmitter,OnChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
@Component({selector:'app-product-details',standalone:true,imports:[FormsModule],template:`
 <h3>Product details</h3>
 <div class="fields">
 <label>Short name<input [(ngModel)]="shortName" maxlength="100" [disabled]="busy" placeholder="e.g. Classic Cart"></label>
 <label>Manual product sizes<textarea [(ngModel)]="sizes" maxlength="2000" rows="3" [disabled]="busy" placeholder="Size II: W1400 × D600 × H1000 mm"></textarea></label>
 </div>
 <p>Enter one size per line, including units. These sizes appear alongside sizes received from Wix. They do not change packaging dimensions.</p>
 <button (click)="save()" [disabled]="busy||product.saved_only">{{busy?'Saving…':'Save details'}}</button>
 @if(product.saved_only){<p>This packaging-only entry needs a saved product record before details can be edited.</p>}
 @if(error){<p role="alert">{{error}}</p>}
 @if(done){<p role="status">Saved</p>}
 `,styles:[`.fields{display:flex;gap:16px;flex-wrap:wrap}label{display:flex;flex-direction:column;gap:6px;flex:1;min-width:220px}input,textarea{width:100%;box-sizing:border-box}p{font-size:.875rem;color:var(--wc-muted)}[role=alert]{color:var(--p-red-600)}`]})
export class ProductDetailsComponent implements OnChanges {
 @Input() product:any;@Output() saved=new EventEmitter<any>();shortName='';sizes='';busy=false;error='';done=false;
 constructor(private db:SupabaseService){}
 ngOnChanges(){this.shortName=this.product?.short_name||'';this.sizes=this.product?.manual_sizes||'';this.error='';this.done=false;}
 async save(){if(this.busy||this.product.saved_only)return;const id=this.product.id;
 const patch={short_name:this.shortName.trim(),manual_sizes:[...new Set(this.sizes.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))].join('\n')};
 this.busy=true;this.error='';this.done=false;
 try{const {data,error}=await this.db.client.from('wc_shipping_products').update(patch).eq('id',id).select('id,short_name,manual_sizes').single();if(error)throw error;if(!data)throw Error('Product not found');this.saved.emit(data);if(this.product.id===id)this.done=true;}
 catch{if(this.product.id===id)this.error='Could not save product details. Please retry.';}finally{this.busy=false;}
 }
}
