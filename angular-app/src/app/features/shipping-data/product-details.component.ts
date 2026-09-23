import {Component,Input,Output,EventEmitter,OnChanges,SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
@Component({selector:'app-product-details',standalone:true,imports:[FormsModule],template:`
 <div class="fields">
 <div class="field short-name-field"><label for="product-short-name">Short name</label>
 <div class="actions"><input id="product-short-name" [(ngModel)]="shortName" maxlength="100" [readOnly]="!editingName" [disabled]="busy" placeholder="Not set">
 @if(!editingName){<button (click)="editName()" [disabled]="busy||product.saved_only">{{product.short_name?'Edit':'Add'}}</button>}
 @else{<button (click)="save('name')" [disabled]="busy">Save</button><button (click)="cancelName()" [disabled]="busy">Cancel</button>}
 </div></div>
 <div class="field">
 @if(wixSizes.length){<label for="product-size">Product sizes · Wix</label><select id="product-size" [ngModel]="selectedSize" (ngModelChange)="selectedSizeChange.emit($event)">@for(size of wixSizes;track size){<option [value]="size">{{size}}</option>}</select><p>Select a size to view its drawing and details.</p>}
 @else{<label>Product sizes</label><p>No size data available.</p>}
 @if(backdrop){<label>Construction</label><div class="folding-choice" role="group" aria-label="Product folding option"><button type="button" [class.active]="selectedFolding==='foldable'" [attr.aria-pressed]="selectedFolding==='foldable'" (click)="selectedFoldingChange.emit('foldable')">Foldable</button><button type="button" [class.active]="selectedFolding==='nonfoldable'" [attr.aria-pressed]="selectedFolding==='nonfoldable'" (click)="selectedFoldingChange.emit('nonfoldable')">Non-foldable</button></div>}
 </div><div class="field drawing-field"><ng-content /></div></div>
 @if(product.saved_only){<p>This packaging-only entry needs a saved product record before details can be edited.</p>}
 @if(error){<p role="alert">{{error}}</p>}
 @if(done){<p role="status">Saved</p>}
 `,styles:[`:host{display:block;container-type:inline-size}.fields{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.9fr) minmax(0,1fr);gap:16px;align-items:start}.field{display:flex;flex-direction:column;gap:6px;min-width:0}.field .wix-size{max-width:100%;text-overflow:ellipsis}.size-table{border:1px solid var(--wc-border);border-radius:10px;overflow:hidden}.size-table table{width:100%;border-collapse:collapse}.size-table th,.size-table td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--wc-border)}.size-table tr:last-child td{border-bottom:0}.size-table th:first-child,.size-table td:first-child{width:28px}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.actions input{flex:1;min-width:100px}input,textarea{width:100%;box-sizing:border-box}textarea{min-height:36px;max-height:120px;resize:vertical}input{min-width:0}.actions button{flex-shrink:0}.folding-choice{display:flex;gap:6px;flex-wrap:wrap}.folding-choice button{border:1px solid var(--wc-border);border-radius:7px;background:var(--wc-surface);padding:7px 10px;font:inherit}.folding-choice button.active{border-color:var(--p-primary-color);color:var(--p-primary-color);font-weight:600}p{margin:0;font-size:.875rem;color:var(--wc-muted)}[role=alert]{color:var(--p-red-600)}@container(max-width:620px){.fields{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.drawing-field{grid-column:1/-1}}@container(max-width:400px){.fields{grid-template-columns:minmax(0,1fr)}}`]})
export class ProductDetailsComponent implements OnChanges {
 @Input() product:any;@Input() wixSizes:string[]=[];@Input() sizeTable=false;@Input() selectedSize='';@Input() backdrop=false;@Input() selectedFolding:'foldable'|'nonfoldable'='foldable';@Output() selectedSizeChange=new EventEmitter<string>();@Output() selectedFoldingChange=new EventEmitter<'foldable'|'nonfoldable'>();@Output() saved=new EventEmitter<any>();shortName='';busy=false;error='';done=false;editingName=false;
 constructor(private db:SupabaseService){}
 ngOnChanges(changes:SimpleChanges){if(changes['product']){this.shortName=this.product?.short_name||'';this.editingName=false;this.error='';this.done=false;}}
 editName(){this.shortName=this.product.short_name||'';this.editingName=true;this.done=false;}
 cancelName(){this.shortName=this.product.short_name||'';this.editingName=false;this.error='';}
 async save(field:'name'){if(this.busy||this.product.saved_only||!this.editingName)return;const id=this.product.id;
 const patch={short_name:this.shortName.trim()};
 this.busy=true;this.error='';this.done=false;
 try{const {data,error}=await this.db.client.from('wc_shipping_products').update(patch).eq('id',id).select('id,short_name').single();if(error)throw error;if(!data)throw Error('Product not found');this.saved.emit(data);if(this.product.id===id){this.done=true;this.editingName=false;}}
 catch{if(this.product.id===id)this.error='Could not save product details. Please retry.';}finally{this.busy=false;}
 }
}
