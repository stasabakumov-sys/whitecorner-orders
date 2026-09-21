import {Component,EventEmitter,Input,Output,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';

@Component({selector:'app-add-main-package',standalone:true,imports:[FormsModule],template:`
 @if(!editing){<button type="button" [disabled]="!sizeKey" (click)="start()">Add packaging</button>}
 @if(!sizeKey){<p>Select a product size before adding packaging.</p>}
 @if(editing){
  <fieldset [disabled]="saving()"><legend>New Main box · {{sizeLabel}}</legend>
   <div class="fields">
    <label>Box name<input [(ngModel)]="draft.package_name"></label>
    <label>L mm<input type="number" min="1" [(ngModel)]="draft.length_mm"></label>
    <label>W mm<input type="number" min="1" [(ngModel)]="draft.width_mm"></label>
    <label>H mm<input type="number" min="1" [(ngModel)]="draft.height_mm"></label>
    <label>kg<input type="number" min="0.001" step="0.1" [(ngModel)]="draft.weight_kg"></label>
   </div>
   <button type="button" (click)="save()">{{saving()?'Saving…':'Save packaging'}}</button>
   <button type="button" (click)="cancel()">Cancel</button>
  </fieldset>
 }
 @if(error()){<p role="alert">{{error()}}</p>}
 @if(saved()){<p role="status">Packaging saved.</p>}
`,styles:[`:host{display:block;margin:12px 0}fieldset{border:0;padding:0;min-width:0}.fields{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}label{display:flex;flex-direction:column;gap:5px}input{width:130px;max-width:100%}button{margin-right:8px}[role=alert]{color:#b91c1c}[role=status]{color:#17643d}`]})
export class AddMainPackageComponent {
 @Input() productId='';@Input() sizeKey='';@Input() sizeLabel='';
 @Output() packageSaved=new EventEmitter<any>();
 editing=false;saving=signal(false);error=signal('');saved=signal(false);
 draft={package_name:'',length_mm:null as number|null,width_mm:null as number|null,height_mm:null as number|null,weight_kg:null as number|null};
 constructor(private db:SupabaseService){}
 start(){this.editing=true;this.error.set('');this.saved.set(false);}
 cancel(){if(this.saving())return;this.editing=false;this.error.set('');}
 async save(){
  if(this.saving())return;
  this.saved.set(false);this.error.set('');
  if(!this.productId||!this.sizeKey||!this.draft.package_name.trim()||[this.draft.length_mm,this.draft.width_mm,this.draft.height_mm,this.draft.weight_kg].some(v=>v==null||!Number.isFinite(Number(v))||Number(v)<=0)){
   this.error.set('Enter a box name and positive length, width, height and weight, then save again.');return;
  }
  this.saving.set(true);
  try{
   // Include inactive rows to avoid reusing a reserved package number.
   const last=await this.db.client.from('wc_shipping_packages').select('package_no').eq('shipping_product_id',this.productId).eq('size_key',this.sizeKey).eq('source_type','Base').order('package_no',{ascending:false}).limit(1);
   if(last.error)throw last.error;
   const payload={...this.draft,package_name:this.draft.package_name.trim(),shipping_product_id:this.productId,size_key:this.sizeKey,source_type:'Base',package_no:Number(last.data?.[0]?.package_no||0)+1,active:true};
   const {data,error}=await this.db.client.from('wc_shipping_packages').insert(payload).select('*').single();
   if(error)throw error;
   if(!data?.id)throw Error('The server did not confirm saving.');
   this.packageSaved.emit(data);this.editing=false;this.saved.set(true);
   this.draft={package_name:'',length_mm:null,width_mm:null,height_mm:null,weight_kg:null};
  }catch(e:any){this.error.set(`Could not save packaging: ${e?.message||'Connection error'}. Your entries are kept. Please retry.`);}
  finally{this.saving.set(false);}
 }
}
