import {Component,EventEmitter,Input,OnChanges,Output,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DialogModule} from 'primeng/dialog';
import {SupabaseService} from '../../core/services/supabase.service';
import {canonicalPackagingItemKey,packagingError,reviewComponents} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {cartSizeFromOptions} from './cart-size';
import {PackingFilesCellComponent} from './packing-files-cell.component';
import {baseDrawingBox,sameDrawingBox} from './box-drawing.component';
import {CartBoxConstructorComponent} from './cart-box-constructor.component';

@Component({selector:'app-cart-main-packaging',standalone:true,imports:[FormsModule,DialogModule,PackingFilesCellComponent,CartBoxConstructorComponent],template:`
 <section class="editor">
  <h4>Main + {{combinationLabel()}}</h4>
  <p class="mut">The reusable Main above remains unchanged. Enter the complete replacement packaging for this exact Add-on combination.</p>
  <div class="states"><span [class.ready]="hasVariant()">{{hasVariant()?'Variant saved ✓':'Variant required before quoting'}}</span></div>
  @if(error()){<p role="alert">{{error()}}</p>}
  <h5>{{sizeLabel||'All sizes'}} · Main + {{combinationLabel()}}</h5>
  <div class="tablewrap"><table><thead><tr><th>Box</th><th>L mm</th><th>W mm</th><th>H mm</th><th>kg</th><th>.CDR</th><th>.RD</th><th>Contents</th><th></th></tr></thead><tbody>
  @for(box of boxes;track $index){<tr>
   <td><input class="name" aria-label="Box name" [disabled]="!editingBoxes.has(box)||busy()" (ngModelChange)="changed()" [(ngModel)]="box.package_name"></td><td><input aria-label="Length mm" type="number" min="1" [disabled]="!editingBoxes.has(box)||busy()" (ngModelChange)="changed()" [(ngModel)]="box.length_mm"></td><td><input aria-label="Width mm" type="number" min="1" [disabled]="!editingBoxes.has(box)||busy()" (ngModelChange)="changed()" [(ngModel)]="box.width_mm"></td><td><input aria-label="Height mm" type="number" min="1" [disabled]="!editingBoxes.has(box)||busy()" (ngModelChange)="changed()" [(ngModel)]="box.height_mm"></td><td><input aria-label="Weight kg" type="number" min="0.01" step="0.1" [disabled]="!editingBoxes.has(box)||busy()" (ngModelChange)="changed()" [(ngModel)]="box.weight_kg">@if(weightNote(box.weight_kg);as note){<span class="weight-note" [class.over]="Number(box.weight_kg)>25">{{note}}</span>}</td>
   <td><app-packing-files-cell [signature]="variants()[0]?.signature||''" [box]="fileBox($index)" [index]="$index" [locked]="!fileReady($index)" [refreshVersion]="constructorRefresh[$index]||0" kind="cdr" /></td><td><div class="file-actions"><app-packing-files-cell [signature]="variants()[0]?.signature||''" [box]="fileBox($index)" [index]="$index" [locked]="!fileReady($index)" [refreshVersion]="constructorRefresh[$index]||0" kind="rd" /><app-cart-box-constructor [box]="fileBox($index)" [profileSignature]="variants()[0]?.signature||''" [profileIndex]="$index" [locked]="!fileReady($index)" (filesSaved)="constructorRefresh[$index]=(constructorRefresh[$index]||0)+1" /></div></td>
   <td><div class="contents-cell"><button type="button" class="icon" [disabled]="busy()" (click)="contentsBox=box" [title]="(editingBoxes.has(box)?'Edit contents for ':'View contents for ')+box.package_name" [attr.aria-label]="(editingBoxes.has(box)?'Edit contents for ':'View contents for ')+box.package_name"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7zm0 0 9 4 9-4M12 11v10M7.5 5l9 4"/></svg></button><span>{{box.contents.length}}</span></div></td>
   <td><div class="file-actions">
    @if(editingBoxes.has(box)){
     <button type="button" class="icon" [disabled]="busy()||!!issue()" title="Save packaging variant" aria-label="Save packaging variant" (click)="requestSave()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button>
    }@else{
     <button type="button" class="icon" [disabled]="busy()" [title]="'Edit '+box.package_name" [attr.aria-label]="'Edit '+box.package_name" (click)="startEdit(box)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg></button>
    }
    <button type="button" class="icon remove" [disabled]="busy()" [title]="'Remove '+box.package_name" [attr.aria-label]="'Remove '+box.package_name" (click)="requestRemove(box)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13"/></svg></button></div></td>
  </tr>}
  </tbody></table></div>
  <button type="button" class="icon" title="Add box" aria-label="Add box" [disabled]="busy()" (click)="addBox()">+</button>
  <p class="mut">Save packaging changes before editing its CDR or RD files.</p>
  @if(issue()){<p class="mut">{{issue()}}</p>}
  @if(dirty){<button type="button" class="primary icon" title="Save Main + Add-ons variant" aria-label="Save Main + Add-ons variant" [disabled]="busy()||!!issue()" (click)="requestSave()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button>}
  @if(saved()){<p role="status">Main + Add-ons variant saved ✓</p>}
 </section>
 <p-dialog [header]="'Contents · '+(contentsBox?.package_name||'Box')" [visible]="!!contentsBox" (visibleChange)="contentsBox=null" [modal]="true" appendTo="body" [style]="{width:'30rem',maxWidth:'95vw'}">
  @if(contentsBox;as box){@for(component of components();track component.id){<label class="choice"><input type="checkbox" [disabled]="!editingBoxes.has(box)||busy()" [checked]="assigned(box,component)" (change)="toggle(box,component,$any($event.target).checked)">{{component.component_name}} · Unit {{component.unit_index}}</label>}}
  <p class="mut">Changes stay in this draft. Save the packaging variant to apply them.</p>
  <ng-template #footer><button type="button" (click)="contentsBox=null">Done</button></ng-template>
 </p-dialog>
 <p-dialog header="Save packaging variant" [(visible)]="saveConfirmOpen" [modal]="true" appendTo="body" [closable]="!busy()" [closeOnEscape]="!busy()" [style]="{width:'30rem',maxWidth:'95vw'}">
  <p><strong>{{sizeLabel||'All sizes'}} · Main + {{combinationLabel()}}</strong></p>
  <p>Save the complete packaging variant with {{boxes.length}} boxes, including their measurements, weight and contents.</p>
  <label class="choice"><input type="checkbox" [(ngModel)]="confirmed" [disabled]="busy()">I checked this variant's composition, measurements, weight and contents.</label>
  @if(error()){<p role="alert">{{error()}}</p>}
  <ng-template #footer><button type="button" [disabled]="busy()" (click)="saveConfirmOpen=false">Cancel</button><button type="button" class="primary icon" title="Save packaging variant" aria-label="Confirm save packaging variant" [disabled]="busy()||!!issue()||!confirmed" (click)="save()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button></ng-template>
 </p-dialog>
 <p-dialog header="Remove packaging box" [visible]="!!removeCandidate" (visibleChange)="removeCandidate=null" [modal]="true" appendTo="body" [style]="{width:'26rem',maxWidth:'95vw'}">
  <p>Remove <strong>{{removeCandidate?.package_name}}</strong> from this packaging draft? Reassign its contents before saving.</p>
  <ng-template #footer><button type="button" (click)="removeCandidate=null">Cancel</button><button type="button" (click)="confirmRemove()">Remove box</button></ng-template>
 </p-dialog>
 `,styles:[`.icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}:host{display:block;flex-basis:100%;width:100%}.editor{border-top:1px solid var(--wc-border);margin-top:4px;padding:14px 0 2px}.states{display:flex;gap:8px;flex-wrap:wrap}.states span{padding:5px 9px;border-radius:8px;background:var(--p-orange-50);color:var(--p-orange-800)}.states span.ready{background:var(--p-green-50);color:var(--p-green-800)}.tools{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:10px 0}.tools label{display:flex;flex-direction:column;gap:5px}.tools input{width:165px;max-width:100%}.box{border-top:1px solid var(--wc-border);padding:10px 0}.choice{display:flex;align-items:center;gap:7px;margin:8px 0}.mut{color:var(--wc-muted)}.weight-note{font-size:.75rem;color:var(--p-orange-700)}.weight-note.over{color:var(--p-red-600)}[role=alert]{color:var(--p-red-600)}[role=status]{color:var(--p-green-700)}h4{margin:0 0 6px}h5{margin:14px 0 6px} .tablewrap{overflow:auto;border:1px solid var(--wc-border);border-radius:12px;background:var(--wc-surface)}table{width:100%;min-width:660px;border-collapse:collapse}th,td{text-align:left;vertical-align:middle;padding:8px 6px;border-bottom:1px solid var(--wc-border)}table input:not([type=checkbox]){width:58px;padding:6px;box-sizing:border-box}table input.name{width:150px}.contents-cell{display:flex;align-items:center;gap:4px}.remove{color:#991b1b}.file-actions{display:flex;align-items:center;gap:6px}.icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0}`]})
export class CartMainPackagingComponent implements OnChanges{
 @Input() product:any;@Input() sizeKey='';@Input() sizeLabel='';@Input() addOns:any[]=[];
 @Output() profileSaved=new EventEmitter<any>();
 contentsBox:any=null;removeCandidate:any=null;editingBoxes=new Set<any>();saveConfirmOpen=false;dirty=false;
 variants=signal<any[]>([]);error=signal('');busy=signal(false);saved=signal(false);boxes:any[]=[];confirmed=false;rules:any[]=[];constructorRefresh:Record<number,number>={};
 constructor(private db:SupabaseService){}
 Number=Number;
 async ngOnChanges(){this.editingBoxes.clear();this.saveConfirmOpen=false;this.dirty=false;this.contentsBox=null;this.removeCandidate=null;this.boxes=[];this.confirmed=false;this.saved.set(false);await this.load();}
 async load(){if(!this.product?.id||!this.addOns.length)return;this.busy.set(true);this.error.set('');try{const [profiles,rules]=await Promise.all([this.db.client.from('wc_delivery_packaging_profiles').select('*').eq('shipping_product_id',this.product.id),this.db.client.from('wc_shipping_rules').select('match_name,match_value,effect_type,active').eq('active',true).eq('effect_type','No effect')]);if(profiles.error||rules.error)throw Error('Main + Add-ons variant could not be loaded.');this.rules=rules.data||[];this.variants.set((profiles.data||[]).filter((p:any)=>p.template_item?.profile_scope==='cart-main'&&cartSizeFromOptions(p.template_item?.wix_options)===this.sizeKey&&this.profileKey(p)===this.combinationKey()));const profile=this.variants()[0];this.boxes=profile?structuredClone(profile.packages||[]):[];if(profile)this.remap();this.editingBoxes.clear();}catch(e:any){this.error.set(e.message||'Main + Add-ons variant could not be loaded.');}finally{this.busy.set(false);}}
 descriptor(rule:any){return{rule_type:String(rule.rule_type||''),match_name:String(rule.match_name||''),match_value:String(rule.match_value||'')};}
 descriptorKey(value:any){return [value.rule_type,value.match_name,value.match_value].map(v=>String(v||'').trim().toLowerCase()).join(':');}
 combinationKey(){return this.addOns.map(rule=>this.descriptorKey(this.descriptor(rule))).sort().join('|');}
 profileKey(profile:any){const stored=profile.template_item?.merged_add_ons;if(Array.isArray(stored))return stored.map((value:any)=>this.descriptorKey(value)).sort().join('|');return Object.entries(profile.template_item?.wix_options||{}).filter(([name,value])=>!['size','dimension','dimensions'].includes(String(name).trim().toLowerCase())&&/^(yes|true|included|selected)$/i.test(String(value))).map(([name,value])=>this.descriptorKey({rule_type:'Option',match_name:name,match_value:value})).sort().join('|');}
 optionRules(){return this.addOns.filter(rule=>String(rule.rule_type||'').toLowerCase()==='option');}
 addonRules(){return this.addOns.filter(rule=>String(rule.rule_type||'').toLowerCase()==='add-on');}
 item(){return{id:this.product.id,product_name:this.product.product_name,quantity:1,catalog_reference:this.product.wix_product_id?{catalogItemId:this.product.wix_product_id}:{},wix_options:Object.fromEntries([...(this.sizeLabel?[['Size',this.sizeLabel]]:[]),...this.optionRules().map(rule=>[String(rule.match_name),String(rule.match_value||'Yes')])])};}
 items(){return[this.item(),...this.addonRules().map(rule=>({id:`rule:${rule.id}`,product_name:String(rule.match_name),quantity:1,wix_options:{},catalog_reference:{}}))];}
 components(){return reviewComponents({wc_order_items:this.items()},this.rules);}
 combinationLabel(){return this.addOns.map(rule=>rule.match_name).join(' + ');}
 hasVariant(){return this.variants().length>0;}
 fileBox(index:number){return this.variants()[0]?.packages?.[index]||this.boxes[index];}
 fileReady(index:number){if(this.editingBoxes.has(this.boxes[index]))return false;const stored=this.variants()[0]?.packages?.[index],draft=this.boxes[index];if(!stored||!draft)return false;const shape=(box:any)=>({...baseDrawingBox(box),weight_kg:box.weight_kg,contents:(box.contents||[]).map((c:any)=>[canonicalPackagingItemKey(c.profile_item_key||''),c.component_key,c.unit_index]).sort()});return sameDrawingBox(shape(stored),shape(draft));}
 remap(){const components=this.components();this.boxes=this.boxes.map(box=>({...box,contents:(box.contents||[]).flatMap((content:any)=>{const match=components.find(c=>c.profile_item_key===canonicalPackagingItemKey(content.profile_item_key||'')&&c.component_key===content.component_key&&c.unit_index===content.unit_index);return match?[match]:[];})}));}
 startEdit(box:any){if(this.busy())return;this.editingBoxes.add(box);this.changed();}
 changed(){this.dirty=true;this.confirmed=false;this.saved.set(false);}
 requestSave(){if(this.busy()||this.issue())return;this.confirmed=false;this.saveConfirmOpen=true;}
 addBox(){const box={package_name:'Main box '+(this.boxes.length+1),length_mm:0,width_mm:0,height_mm:0,weight_kg:0,contents:[]};this.boxes.push(box);this.editingBoxes.add(box);this.changed();}
 requestRemove(box:any){if(!this.busy()&&this.boxes.includes(box))this.removeCandidate=box;}
 confirmRemove(){const index=this.boxes.indexOf(this.removeCandidate);if(this.busy()||index<0)return;this.editingBoxes.delete(this.removeCandidate);this.boxes.splice(index,1);this.removeCandidate=null;this.changed();}
 assigned(box:any,component:any){return box.contents.some((content:any)=>content.id===component.id);}
 toggle(box:any,component:any,on:boolean){box.contents=on?[...box.contents.filter((c:any)=>c.id!==component.id),component]:box.contents.filter((c:any)=>c.id!==component.id);this.changed();}
 issue(){return packagingError(this.boxes,this.components());}
 weightNote(value:any){const weight=Number(value);return weight>25?'Over the common 25 kg carrier limit':weight>=24?'Close to the common 25 kg carrier limit':'';}
 async save(){if(this.busy()||this.issue()||!this.confirmed)return;this.busy.set(true);this.error.set('');this.saved.set(false);try{const {data,error}=await this.db.client.functions.invoke('delivery-cost-review',{body:{action:'save-packaging-variant',profileScope:'cart-main',productId:this.product.id,options:this.sizeLabel?[{name:'Size',value:this.sizeLabel}]:[],addOnRuleIds:this.addOns.map(rule=>rule.id),packages:this.boxes}});if(error||!data?.ok){const detail=await error?.context?.json?.().catch(()=>null);throw Error(detail?.error||data?.error||'Main + Add-ons variant was not saved.');}await this.load();this.confirmed=false;this.saveConfirmOpen=false;this.dirty=false;this.saved.set(true);if(this.variants()[0])this.profileSaved.emit(this.variants()[0]);}catch(e:any){this.error.set((e?.message||'Main + Add-ons variant was not saved.')+' Your entries are retained; retry after checking the connection.');}finally{this.busy.set(false);}}
}
