import {Component,Input,Output,EventEmitter,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {PackageDrawingsComponent} from './package-drawings.component';
import {packagingError,reviewComponents} from '../../../../../supabase/functions/_shared/delivery-review-domain';

@Component({selector:'app-saved-packing',standalone:true,imports:[FormsModule,PackageDrawingsComponent],template:`
 <div class="actions">
 @if(!editing){<button type="button" (click)="edit()">Edit packaging</button><button type="button" (click)="replace()">Replace packaging</button>}
 @else{<button type="button" [disabled]="saving()" (click)="save()">{{saving()?'Saving…':'Save'}}</button><button type="button" [disabled]="saving()" (click)="cancel()">Cancel</button>}
 </div>
 @if(replacing){<p>Add the new boxes below, then Save to replace the current packaging.</p>}
 @if(error()){<p role="alert">{{error()}}</p>}
 @if(saved()){<p role="status">Packaging saved.</p>}
 <div class="tablewrap"><table><thead><tr><th>Box</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th>{{editing?'Contents':'Drawing'}}</th></tr></thead><tbody>
 @for(box of editing?draft:profile.packages;track $index){<tr>
 @if(editing){
 <td><input aria-label="Box name" [disabled]="saving()" [(ngModel)]="box.package_name"></td>
 <td><input aria-label="Length mm" type="number" min="1" [disabled]="saving()" [(ngModel)]="box.length_mm"></td>
 <td><input aria-label="Width mm" type="number" min="1" [disabled]="saving()" [(ngModel)]="box.width_mm"></td>
 <td><input aria-label="Height mm" type="number" min="1" [disabled]="saving()" [(ngModel)]="box.height_mm"></td>
 <td><input aria-label="Weight kg" type="number" min="0.001" step="0.1" [disabled]="saving()" [(ngModel)]="box.weight_kg"></td>
 <td>@if(components().length>1){@for(c of components();track c.id){<label><input type="checkbox" [disabled]="saving()" [checked]="assigned(box,c)" (change)="toggle(box,c,$any($event.target).checked)">{{c.component_name}}</label>}}@else{ {{product.product_name}} }
 @if(replacing){<button type="button" [disabled]="saving()" (click)="draft.splice($index,1)">Remove box</button>}</td>
 }@else{
 <td>{{box.package_name}}</td><td>{{box.length_mm}}</td><td>{{box.width_mm}}</td><td>{{box.height_mm}}</td><td>{{box.weight_kg}}</td>
 <td><app-package-drawings [signature]="profile.signature" [index]="$index" [box]="box" [backdrop]="backdrop" [sharedSize]="backdrop?sharedSize:''" [sizeLabel]="sharedSizeLabel" /></td>
 }
 </tr>}
 </tbody></table></div>
 @if(replacing){<button type="button" [disabled]="saving()" (click)="addBox()">Add box</button>}
 `,styles:[`:host{display:block}.actions{display:flex;gap:8px;margin:8px 0}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--wc-border)}input:not([type=checkbox]){width:90px;max-width:100%;box-sizing:border-box}td:first-child input{width:180px}label{display:block}p{font-size:.875rem}[role=alert]{color:#b91c1c}`]})
export class SavedPackingComponent{
 @Input()product:any;@Input()profile:any;@Input()rules:any[]=[];@Input()backdrop=false;@Input()sharedSize='';@Input()sharedSizeLabel='';
 @Output()profileSaved=new EventEmitter<any>();
 editing=false;replacing=false;draft:any[]=[];saving=signal(false);error=signal('');saved=signal(false);
 constructor(private db:SupabaseService){}
 components(){return reviewComponents({wc_order_items:[{...this.profile.template_item,id:this.product.id,product_name:this.product.product_name,quantity:1}]},this.rules);}
 edit(){this.editing=true;this.replacing=false;this.saved.set(false);this.error.set('');const components=this.components();this.draft=structuredClone(this.profile.packages).map((box:any)=>({...box,contents:(box.contents||[]).flatMap((c:any)=>{const match=components.find(x=>x.component_key===(c.component_key||'main')&&x.unit_index===(c.unit_index||1));return match?[match]:[];})}));}
 replace(){this.edit();this.replacing=true;this.draft=[];this.addBox();}
 cancel(){if(this.saving())return;this.editing=false;this.replacing=false;this.draft=[];this.error.set('');}
 addBox(){const components=this.components();this.draft.push({package_name:'Box '+(this.draft.length+1),length_mm:null,width_mm:null,height_mm:null,weight_kg:null,contents:components.length===1?components:[]});}
 assigned(box:any,c:any){return box.contents.some((x:any)=>x.id===c.id);}
 toggle(box:any,c:any,on:boolean){box.contents=on?[...box.contents.filter((x:any)=>x.id!==c.id),c]:box.contents.filter((x:any)=>x.id!==c.id);}
 async save(){
  if(this.saving())return;
  const issue=packagingError(this.draft,this.components());if(issue){this.error.set(issue);return;}
  this.saving.set(true);this.error.set('');
  try{
   const packages=structuredClone(this.draft),options=Object.entries(this.profile.template_item.wix_options||{}).map(([name,value])=>({name,value:String(value)}));
   const {data,error}=await this.db.client.functions.invoke('delivery-cost-review',{body:{action:'save-packaging-variant',productId:this.product.id,sourceItemId:this.profile.template_item.source_item_id||'',options,packages}});
   if(error||!data?.ok){const detail=await error?.context?.json?.().catch(()=>null);throw Error(detail?.error||data?.error||error?.message||'Server did not confirm saving.');}
   this.profileSaved.emit({...this.profile,packages});this.editing=false;this.replacing=false;this.saved.set(true);
  }catch(e:any){this.error.set('Could not save packaging: '+e.message+' Your edits are kept. Please retry.');}
  finally{this.saving.set(false);}
 }
}
