import {Component,OnInit,OnDestroy,signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {packingStateLabel} from './packing-state';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {DrawerModule} from 'primeng/drawer';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {OrderItemRow} from '../../core/models/order.models';
import {orderItemImageUrl} from '../../core/utils/order-item-image';
import {canonicalPackagingSignature,variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {PackingCustomComponent} from './packing-custom.component';

interface Candidate {unit_id:string;order_number:string;product_name:string;production_status:string;product_id:string|null;item_id:string;item:OrderItemRow}
interface Profile {signature:string;shipping_product_id:string;packages:{package_name:string}[];template_item:any}
interface RdFile {id:string;profile_signature:string;box_index:number;filename:string;copies:number}
interface Task {id:string;unit_id:string;profile_signature:string;state:string;files:any[];cut_file_ids:string[];completed_at?:string|null}

@Component({selector:'app-packing-manage',standalone:true,imports:[FormsModule,RouterLink,DrawerModule,DatePipe,PackingCustomComponent],template:`
 <section class="packing-page"><h1>Manage Packing</h1>
 <div class="tabs" role="tablist" aria-label="Packing job types"><button type="button" role="tab" id="product-jobs-tab" aria-controls="product-jobs-panel" [attr.aria-selected]="activeTab()==='product'" [class.active]="activeTab()==='product'" (click)="activeTab.set('product')">Product jobs</button><button type="button" role="tab" id="custom-jobs-tab" aria-controls="custom-jobs-panel" [attr.aria-selected]="activeTab()==='custom'" [class.active]="activeTab()==='custom'" (click)="activeTab.set('custom')">Custom jobs</button></div>
 @if(activeTab()==='custom'){<div id="custom-jobs-panel" role="tabpanel" aria-labelledby="custom-jobs-tab"><app-packing-custom/></div>}
 @else{<div id="product-jobs-panel" role="tabpanel" aria-labelledby="product-jobs-tab"><p class="sub">Send box cutting work to everyone in Packing work. Products nearest Packing appear first.</p>
 @if(loading()){<p role="status">Loading Packing work…</p>}
 @if(error()){<p class="error" role="alert">{{error()}} <button type="button" (click)="load()" [disabled]="loading()||!!busy()">Retry</button></p>}
 @if(success()){<p class="success" role="status">{{success()}}</p>}
 @if(taskSyncError()){<p class="error" role="alert">{{taskSyncError()}}</p>}
 @if(!members.manager()&&!loading()){<p class="error" role="alert">Manager access is required.</p>}
 @if(members.manager()){
  <div class="controls"><input aria-label="Search Packing products" placeholder="Search order or product" [ngModel]="search()" (ngModelChange)="search.set($event)"><button type="button" (click)="load()" [disabled]="loading()||!!busy()">Refresh</button></div>
  <div class="table-wrap"><table><colgroup><col class="order-col"><col><col class="stage-col"><col class="task-col"><col class="action-col"></colgroup><thead><tr><th>Order</th><th>Product</th><th>Stage</th><th>Packing task</th><th></th></tr></thead><tbody>
   @for(row of visible();track row.unit_id){<tr><td>#{{row.order_number}}</td><td class="product-cell"><a class="product-link" routerLink="/production" [queryParams]="{unit:row.unit_id}" title="Open this unit on Production Board">@if(imageUrl(row);as src){<img class="product-image" [src]="src" alt="" loading="lazy" (error)="failedImages.add(row.unit_id)">}@else{<span class="product-image image-empty" aria-hidden="true"></span>}<span class="product-name">{{row.product_name}}</span></a></td><td><span class="stage">{{row.production_status}}</span></td><td><span class="packing-state" [class.made]="taskFor(row)?.state==='completed'">{{stateLabel(taskFor(row)?.state)}}</span>@if(taskFor(row);as task){@if(task.state==='transferred'){<small class="finished-at">{{task.cut_file_ids?.length||0}}/{{task.files.length}} files done</small>}}@if(taskFor(row)?.completed_at;as finished){<small class="finished-at">{{finished|date:'short'}}</small>}</td><td class="row-actions"><button type="button" (click)="select(row)" [disabled]="!!busy()">Details</button><button type="button" (click)="send(row)" [disabled]="!!busy()||!!taskFor(row)" title="Send box cutting task to Packing work">{{busy()===row.unit_id?'Sending…':'Send'}}</button>@if(rowError()?.unit===row.unit_id){<small class="row-error" role="alert">{{rowError()?.message}}</small>}</td></tr>}
   @empty{<tr><td colspan="5">No products match the search.</td></tr>}
  </tbody></table></div>
  @if(selected();as row){<p-drawer [visible]="true" position="right" appendTo="body" header="Packing details" ariaCloseLabel="Close" [modal]="true" [blockScroll]="true" [style]="{width:'min(680px,100vw)'}" (onHide)="selected.set(null)">
   <section class="detail"><h2>#{{row.order_number}} · {{row.product_name}}</h2><p>Current stage: <strong>{{row.production_status}}</strong></p>
   @if(error()){<p class="error" role="alert">{{error()}}</p>}
   @if(success()){<p class="success" role="status">{{success()}}</p>}
 @if(taskSyncError()){<p class="error" role="alert">{{taskSyncError()}}</p>}
   @if(!row.product_id){<p class="error" role="alert">No Product card is linked to this order item. Link it in Products before assigning Packing.</p>}
   @else if(!matchingProfiles(row).length){<p class="error" role="alert">No saved Packing profile matches this order variant. Open the Product card, save its Packing profile and add RD files for every box.</p>}
   @else{
    <div class="assign-controls"><label>Packing profile<select aria-label="Packing profile" [(ngModel)]="profileSignature"><option value="">Choose profile</option>@for(profile of matchingProfiles(row);track profile.signature){<option [value]="profile.signature">{{profileLabel(profile)}}</option>}</select></label>
     <button type="button" (click)="send(row)" [disabled]="!!busy()||!profileSignature||!!taskFor(row)">{{busy()===row.unit_id?'Sending…':'Send to Packing work'}}</button></div>
    @if(profileSignature){<div class="file-count"><p>RD files and operator cutting quantities saved in the Product card:</p>@for(box of selectedProfile()?.packages||[];track $index){<div><b>{{box.package_name||'Box '+($index+1)}}</b>@for(file of filesFor(profileSignature,$index);track file.id){<span> {{file.filename}} · {{file.copies}} cuts</span>}@empty{<span class="missing"> No RD files</span>}</div>}</div>}
    @if(taskFor(row);as task){<p>Sent to Packing work · {{stateLabel(task.state)}}</p>@if(task.state==='assigned'||task.state==='transfer_requested'){<button type="button" (click)="cancel(task)" [disabled]="!!busy()">Cancel task</button>}}
    <p><a routerLink="/shipping-data">Open Products to add or update box RD files</a></p>
   }
  </section></p-drawer>}
 }</div>}
 </section>`,styles:[`
 :host{display:block}.packing-page h1{margin:0}.tabs{display:flex;gap:8px;margin:16px 0}.tabs button{border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:8px 14px;min-height:36px;cursor:pointer}.tabs button.active{border-color:var(--p-primary-color);color:var(--p-primary-color);font-weight:600}.sub{margin:4px 0 16px;color:var(--wc-muted)}.controls{display:flex;gap:8px;align-items:center;margin-bottom:14px}.controls input,.controls button,.assign-controls select,.assign-controls button,.detail button{border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:7px 10px;min-height:36px;box-sizing:border-box}.controls input{min-width:220px}.controls button,.assign-controls button,.detail button{cursor:pointer}.table-wrap{border:1px solid var(--wc-border);border-radius:12px;background:#fff;overflow:auto}table{border-collapse:collapse;width:100%;min-width:760px;table-layout:fixed}.order-col{width:88px}.stage-col{width:100px}.task-col{width:140px}.action-col{width:76px}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--wc-border)}tr:last-child td{border-bottom:0}.product-cell{min-width:0}.product-link{display:flex;align-items:center;gap:10px;min-width:0;color:inherit;text-decoration:none}.product-link:hover .product-name{text-decoration:underline}.product-link:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:2px;border-radius:4px}.product-image{display:block;width:36px;height:36px;flex:0 0 36px;border-radius:6px;object-fit:cover;background:#f4f6f8}.image-empty{border:1px solid var(--wc-border);box-sizing:border-box}.product-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stage{font-weight:600}.detail{overflow-wrap:anywhere}.detail h2{margin:0;font-size:1.15rem}.assign-controls{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.assign-controls label{display:flex;flex-direction:column;gap:4px}.assign-controls select{min-width:180px}.file-count{color:var(--wc-muted);font-size:.85rem}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;padding:9px;border-radius:6px}.success{color:#166534}@media(max-width:650px){.controls input{min-width:0;flex:1}.assign-controls label,.assign-controls select{width:100%}}
 .packing-state.made{color:#166534;font-weight:600}.finished-at{display:block;color:var(--wc-muted);margin-top:4px;font-size:.78rem}
 table{min-width:820px}.action-col{width:146px}.row-actions{white-space:nowrap}.row-actions button+button{margin-left:6px}.row-error{display:block;white-space:normal;min-width:130px;color:#991b1b;margin-top:6px}.file-count span{display:inline-block;margin-left:8px}.missing{color:#991b1b}
 `]})
export class PackingManageComponent implements OnInit,OnDestroy {
 readonly activeTab=signal<'product'|'custom'>('product');
 readonly candidates=signal<Candidate[]>([]);readonly profiles=signal<Profile[]>([]);readonly tasks=signal<Task[]>([]);readonly rdFiles=signal<RdFile[]>([]);
 readonly failedImages=new Set<string>();
 readonly selected=signal<Candidate|null>(null);readonly search=signal('');readonly loading=signal(false);readonly error=signal('');readonly success=signal('');readonly busy=signal('');readonly rowError=signal<{unit:string;message:string}|null>(null);
 profileSignature='';
 constructor(private db:SupabaseService,readonly members:HubMembersService){}
 readonly stateLabel=packingStateLabel;
 readonly taskSyncError=signal('');
 private refreshTimer?:ReturnType<typeof setInterval>;
 private taskVersion=0;private refreshingTasks=false;
 ngOnInit(){void this.load();this.refreshTimer=setInterval(()=>void this.refreshTasks(),10000);}
 ngOnDestroy(){if(this.refreshTimer)clearInterval(this.refreshTimer);++this.taskVersion;}
 async refreshTasks(){
  if(this.loading()||this.busy()||this.refreshingTasks||!this.members.manager())return;
  const version=++this.taskVersion;this.refreshingTasks=true;
  try{const {data,error}=await this.db.client.from('wc_packing_tasks').select('id,unit_id,profile_signature,state,files,cut_file_ids,completed_at').neq('state','cancelled');
   if(version!==this.taskVersion)return;
   if(error)throw error;this.tasks.set((data||[]) as Task[]);this.taskSyncError.set('');
  }catch(e){if(version===this.taskVersion)this.taskSyncError.set(`Could not refresh box status. ${(e as Error)?.message||'Check the connection.'} Press Refresh to retry.`);}
  finally{this.refreshingTasks=false;}
 }
 async load(){if(this.loading()||this.busy())return;++this.taskVersion;this.taskSyncError.set('');this.loading.set(true);this.error.set('');this.success.set('');
  try{await this.members.load();if(!this.members.manager())return;
   const [candidateResult,taskResult,profiles,files]=await Promise.all([
    this.db.client.rpc('wc_packing_candidates'),
    this.db.client.from('wc_packing_tasks').select('id,unit_id,profile_signature,state,files,cut_file_ids,completed_at').neq('state','cancelled'),
    this.allProfiles(),
    this.allRdFiles(),
   ]);
   if(candidateResult.error)throw candidateResult.error;if(taskResult.error)throw taskResult.error;
   this.candidates.set((candidateResult.data||[]) as Candidate[]);this.tasks.set((taskResult.data||[]) as Task[]);this.profiles.set(profiles);this.rdFiles.set(files);
  }catch(e){this.error.set(`Could not load Packing work. ${(e as Error)?.message||'Check the connection and retry.'}`);}
  finally{this.loading.set(false);}
 }
 private async allProfiles(){const all:Profile[]=[];for(let start=0;;start+=250){const {data,error}=await this.db.client.from('wc_delivery_packaging_profiles').select('signature,shipping_product_id,packages,template_item').order('signature').range(start,start+249);if(error)throw error;all.push(...(data||[]) as Profile[]);if((data||[]).length<250)return all;}}
 private async allRdFiles(){const all:RdFile[]=[];for(let start=0;;start+=250){const {data,error}=await this.db.client.from('wc_box_rd_files').select('id,profile_signature,box_index,filename,copies').order('created_at').range(start,start+249);if(error)throw error;all.push(...(data||[]) as RdFile[]);if((data||[]).length<250)return all;}}
 visible(){const term=this.search().toLowerCase().trim();return this.candidates().filter(row=>!term||`${row.order_number} ${row.product_name}`.toLowerCase().includes(term));}
 imageUrl(row:Candidate){return this.failedImages.has(row.unit_id)?'':orderItemImageUrl(row.item);}
 taskFor(row:Candidate){return this.tasks().find(task=>task.unit_id===row.unit_id);}
 selectedProfile(){return this.profiles().find(profile=>profile.signature===this.profileSignature);}
 filesFor(signature:string,index:number){return this.rdFiles().filter(file=>file.profile_signature===signature&&file.box_index===index);}
 matchingProfiles(row:Candidate){if(!row.product_id)return[];let exact='';try{exact=variantSignature(row.item);}catch{return[];}
  return this.profiles().filter(profile=>profile.shipping_product_id===row.product_id&&canonicalPackagingSignature(profile.signature)===exact);
 }
 profileLabel(profile:Profile){const names=(profile.packages||[]).map(box=>box.package_name).filter(Boolean);return `${names.join(' + ')||'Packing profile'} · ${profile.packages?.length||0} ${profile.packages?.length===1?'box':'boxes'}`;}
 select(row:Candidate){this.selected.set(row);this.rowError.set(null);const current=this.taskFor(row),profiles=this.matchingProfiles(row);
  this.profileSignature=current?.profile_signature||(profiles.length===1?profiles[0].signature:'');
  this.error.set('');this.success.set('');
 }
 async send(row:Candidate){if(this.busy()||this.taskFor(row))return;const profiles=this.matchingProfiles(row);
  const signature=this.selected()?.unit_id===row.unit_id?this.profileSignature:profiles.length===1?profiles[0].signature:'';
  if(!signature){this.select(row);const message=profiles.length?'Choose a Packing profile in Details, then press Send.':'No matching Packing profile. Save one in the Product card first.';this.error.set(message);this.rowError.set({unit:row.unit_id,message});return;}
  ++this.taskVersion;this.busy.set(row.unit_id);this.error.set('');this.rowError.set(null);this.success.set('');
  try{const {data,error}=await this.db.client.rpc('wc_send_packing_task',{p_unit:row.unit_id,p_profile:signature});if(error||!data?.id)throw error||Error('Server did not confirm the task.');
   this.tasks.update(tasks=>[...tasks,data]);this.success.set(`#${row.order_number} sent to everyone in Packing work.`);
  }catch(e){const message=`Could not send #${row.order_number}. ${(e as Error)?.message||'Check the profile and retry.'}`;this.error.set(message);this.rowError.set({unit:row.unit_id,message});}
  finally{this.busy.set('');}
 }
 async cancel(task:Task){if(this.busy())return;++this.taskVersion;this.busy.set('cancel');this.error.set('');this.success.set('');
  try{const {error}=await this.db.client.rpc('wc_cancel_packing_task',{p_id:task.id});if(error)throw error;this.tasks.update(tasks=>tasks.filter(item=>item.id!==task.id));this.success.set('Packing task cancelled.');}
  catch(e){this.error.set(`Could not cancel task. ${(e as Error)?.message||'Reload and retry.'}`);}finally{this.busy.set('');}
 }
}
