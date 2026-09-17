import {Component,Input,Output,EventEmitter,signal,OnChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {PackageDrawingsComponent} from './package-drawings.component';
import {packagingError,reviewComponents} from '../../../../../supabase/functions/_shared/delivery-review-domain';

@Component({selector:'app-saved-packing',standalone:true,imports:[FormsModule,PackageDrawingsComponent],template:`
 @if(backdrop&&backdropDimensions){
 <div class="tablewrap"><table><thead><tr><th>Box</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th>Drawing</th></tr></thead><tbody><tr>
 <td>{{backdropDimensions.package_name}}</td><td>{{backdropDimensions.length_mm}}</td><td>{{backdropDimensions.width_mm}}</td><td>{{backdropDimensions.height_mm}}</td>
 <td><input aria-label="Weight kg" type="number" min="0.001" step="0.1" [disabled]="saving()" [(ngModel)]="weightDraft" (ngModelChange)="saved.set(false)"></td>
 <td><app-package-drawings [signature]="profile.signature" [index]="0" [box]="canonical(profile.packages[0])" [backdrop]="true" [sharedSize]="sharedSize" [sizeLabel]="sharedSizeLabel" /></td>
 </tr></tbody></table></div>
 <div class="actions"><button type="button" [disabled]="saving()" (click)="saveWeight()">{{saving()?'Saving…':'Save weight'}}</button><button type="button" [disabled]="saving()" (click)="resetWeight()">Cancel</button></div>
 @if(error()){<p role="alert">{{error()}}</p>}@if(saved()){<p role="status">Weight saved.</p>}
 }@else{
 <div class="actions">
 @if(!editing){<button type="button" (click)="edit()">Edit packaging</button><button type="button" (click)="replace()">Replace packaging</button>}
 @else{<button type="button" [disabled]="saving()" (click)="save()">{{saving()?'Saving…':'Save'}}</button><button type="button" [disabled]="saving()" (click)="cancel()">Cancel</button>}
 </div>
 @if(replacing){<p>Add the new boxes below, then Save to replace the current packaging.</p>}
 @if(editing&&backdrop&&!backdropDimensions){<p role="status">Confirm these dimensions as shared for all matching Backdrops. Weight remains specific to this model and size.</p>}
 @if(error()){<p role="alert">{{error()}}</p>}
 @if(saved()){<p role="status">Packaging saved.</p>}
 <div class="tablewrap"><table><thead><tr><th>Box</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th>{{editing?'Contents':'Drawing'}}</th></tr></thead><tbody>
 @for(box of editing?draft:profile.packages;track $index){<tr>
 @if(editing){
 <td><input aria-label="Box name" [disabled]="saving()||(backdrop&&!!backdropDimensions)" [(ngModel)]="box.package_name"></td>
 <td><input aria-label="Length mm" type="number" min="1" [disabled]="saving()||(backdrop&&!!backdropDimensions)" [(ngModel)]="box.length_mm"></td>
 <td><input aria-label="Width mm" type="number" min="1" [disabled]="saving()||(backdrop&&!!backdropDimensions)" [(ngModel)]="box.width_mm"></td>
 <td><input aria-label="Height mm" type="number" min="1" [disabled]="saving()||(backdrop&&!!backdropDimensions)" [(ngModel)]="box.height_mm"></td>
 <td><input aria-label="Weight kg" type="number" min="0.001" step="0.1" [disabled]="saving()" [(ngModel)]="box.weight_kg"></td>
 <td>@if(components().length>1){@for(c of components();track c.id){<label><input type="checkbox" [disabled]="saving()" [checked]="assigned(box,c)" (change)="toggle(box,c,$any($event.target).checked)">{{c.component_name}}</label>}}@else{ {{product.product_name}} }
 @if(replacing){<button type="button" [disabled]="saving()" (click)="draft.splice($index,1)">Remove box</button>}</td>
 }@else{
 <td>{{canonical(box).package_name}}</td><td>{{canonical(box).length_mm}}</td><td>{{canonical(box).width_mm}}</td><td>{{canonical(box).height_mm}}</td><td>{{box.weight_kg??'Enter weight'}}</td>
 <td><app-package-drawings [signature]="profile.signature" [index]="$index" [box]="canonical(box)" [backdrop]="backdrop" [sharedSize]="backdrop?sharedSize:''" [sizeLabel]="sharedSizeLabel" /></td>
 }
 </tr>}
 </tbody></table></div>
 @if(replacing&&!backdrop){<button type="button" [disabled]="saving()" (click)="addBox()">Add box</button>}
 }
 `,styles:[`:host{display:block}.actions{display:flex;gap:8px;margin:8px 0}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--wc-border)}input:not([type=checkbox]){width:90px;max-width:100%;box-sizing:border-box}td:first-child input{width:180px}label{display:block}p{font-size:.875rem}[role=alert]{color:#b91c1c}`]})
export class SavedPackingComponent implements OnChanges{
 @Input()product:any;@Input()profile:any;@Input()rules:any[]=[];@Input()backdrop=false;@Input()sharedSize='';@Input()sharedSizeLabel='';@Input()fallbackOptions:Record<string,string>={};@Input()backdropDimensions:any=null;
 @Output()profileSaved=new EventEmitter<any>();@Output()dimensionsSaved=new EventEmitter<any>();
 editing=false;replacing=false;draft:any[]=[];saving=signal(false);error=signal('');saved=signal(false);
 constructor(private db:SupabaseService){}
 weightDraft:number|null=null;private weightIdentity='';
 ngOnChanges(){const identity=this.product?.id+'|'+this.profile?.signature;if(identity!==this.weightIdentity){this.weightIdentity=identity;this.resetWeight();}}
 resetWeight(){this.weightDraft=this.profile?.packages?.[0]?.weight_kg??null;this.error.set('');this.saved.set(false);}
 async saveWeight(){this.draft=[{...this.canonical(this.profile.packages[0]),weight_kg:this.weightDraft,contents:this.components()}];await this.save();}
 components(){const stored=this.profile.template_item?.wix_options||{};return reviewComponents({wc_order_items:[{...this.profile.template_item,id:this.product.id,product_name:this.product.product_name,quantity:1,catalog_reference:{catalogItemId:this.product.wix_product_id},wix_options:Object.keys(stored).length?stored:this.fallbackOptions}]},this.rules);}
 canonical(box:any){return this.backdrop&&this.backdropDimensions?{...box,package_name:this.backdropDimensions.package_name,length_mm:Number(this.backdropDimensions.length_mm),width_mm:Number(this.backdropDimensions.width_mm),height_mm:Number(this.backdropDimensions.height_mm)}:box;}
 edit(){this.saved.set(false);this.error.set('');this.editing=true;this.replacing=false;const components=this.components();this.draft=structuredClone(this.profile.packages).map((box:any)=>this.canonical({...box,contents:(box.contents||[]).flatMap((c:any)=>{const match=components.find(x=>x.component_key===(c.component_key||'main')&&x.unit_index===(c.unit_index||1));return match?[match]:[];})}));}
 replace(){this.edit();if(!this.editing)return;this.replacing=true;this.draft=[];this.addBox();}
 cancel(){if(this.saving())return;this.editing=false;this.replacing=false;this.draft=[];this.error.set('');}
 addBox(){const components=this.components();if(this.backdrop&&this.draft.length)return;this.draft.push(this.canonical({package_name:'Box '+(this.draft.length+1),length_mm:null,width_mm:null,height_mm:null,weight_kg:null,contents:components.length===1?components:[]}));}
 assigned(box:any,c:any){return box.contents.some((x:any)=>x.id===c.id);}
 toggle(box:any,c:any,on:boolean){box.contents=on?[...box.contents.filter((x:any)=>x.id!==c.id),c]:box.contents.filter((x:any)=>x.id!==c.id);}
 async save(){
  if(this.saving())return;
  const issue=packagingError(this.draft,this.components());if(issue){this.error.set(issue);return;}
  this.saving.set(true);this.error.set('');
  try{
   if(this.backdrop&&!this.backdropDimensions){
    if(!this.sharedSize)throw Error('This legacy profile has no exact Size and Foldable/Non-foldable identity. Classify it before saving.');
    const box=this.draft[0],result=await this.db.client.rpc('wc_save_backdrop_packaging_dimensions',{p_size:this.sharedSize,p_package_name:String(box.package_name||'').trim(),p_length:Number(box.length_mm),p_width:Number(box.width_mm),p_height:Number(box.height_mm),p_expected:null});
    if(result.error||!result.data?.revision)throw Error(result.error?.message||'Shared dimensions were not saved.');
    this.backdropDimensions=result.data;this.dimensionsSaved.emit(result.data);
   }
   const packages=structuredClone(this.draft).map((box:any)=>this.canonical(box)),stored=this.profile.template_item?.wix_options||{},options=Object.entries(Object.keys(stored).length?stored:this.fallbackOptions).map(([name,value])=>({name,value:String(value)}));
   const {data,error}=await this.db.client.functions.invoke('delivery-cost-review',{body:{action:'save-packaging-variant',productId:this.product.id,sourceItemId:this.profile.template_item?.source_item_id||'',existingSignature:this.profile.reference_only?'':this.profile.signature,options,packages}});
   if(error||!data?.ok){const detail=await error?.context?.json?.().catch(()=>null);throw Error(detail?.error||data?.error||error?.message||'Server did not confirm saving.');}
   this.profileSaved.emit({...this.profile,reference_only:false,previousSignature:this.profile.signature,template_item:{...this.profile.template_item,wix_options:Object.fromEntries(options.map(option=>[option.name,option.value]))},signature:data.signature||this.profile.signature,packages});this.editing=false;this.replacing=false;this.saved.set(true);
  }catch(e:any){this.error.set('Could not save packaging: '+e.message+' Your edits are kept. Please retry.');}
  finally{this.saving.set(false);}
 }
}
