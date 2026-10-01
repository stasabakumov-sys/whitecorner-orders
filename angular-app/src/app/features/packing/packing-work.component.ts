import {Component,OnDestroy,OnInit,signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {BoxDrawingComponent,sameDrawingBox} from '../shipping-data/box-drawing.component';
import {backdropDrawingKey} from '../shipping-data/product-sizes';
import {packingStateLabel} from './packing-state';
import {DialogModule} from 'primeng/dialog';
import {orderItemImageUrl} from '../../core/utils/order-item-image';
import {OrderItemRow} from '../../core/models/order.models';

interface WorkFile {file_id:string;box_index:number;box_name:string;filename:string;copies:number;object_path:string}
interface WorkTask {id:string;unit_id:string|null;custom_job_id?:string|null;custom_instructions?:string|null;order_number:string;product_name:string;profile_signature:string|null;state:string;files:WorkFile[];cut_file_ids:string[];packages:any[];assigned_at:string;unit?:{item:OrderItemRow|null}|null}
interface Profile {signature:string;packages:any[];template_item:any}
interface Station {station_name:string;last_seen:string}
interface Transfer {id:string;task_id:string;state:string;error:string|null;claimed_at:string|null;requested_at:string}

@Component({selector:'app-packing-work',standalone:true,imports:[BoxDrawingComponent,DialogModule],template:`
 <section class="work-page"><h1>Packing work</h1><p class="sub">Load RD files, cut them manually at the machine, then mark each file done. Confirm Boxes made separately to close the task.</p>
 @if(loading()){<p role="status">Loading assignments…</p>}
 @if(error()){<p class="error" role="alert">{{error()}} <button type="button" (click)="load()" [disabled]="loading()||!!busy()">Retry</button></p>}
 @if(success()){<p class="success" role="status">{{success()}}</p>}
 <div class="controls"><span class="station" [class.online]="stationOnline()">{{stationOnline()?'Cutting laptop connected':'Cutting laptop offline'}}</span><button type="button" (click)="load()" [disabled]="loading()||!!busy()">Refresh</button></div>
 <div class="cards">@for(task of visibleTasks();track task.id){<article class="task">
  <div class="task-head"><div class="product-heading"><span class="product-image">@if(imageUrl(task);as src){<img [src]="src" [alt]="task.product_name" loading="lazy" decoding="async" (error)="failedImages.add(src)">}@else{<svg viewBox="0 0 24 24" role="img" aria-label="No product image"><path d="M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01"/></svg>}</span><div><span class="order">{{task.custom_job_id?'Custom job':'#'+task.order_number}}</span><h2>{{task.product_name}}</h2></div></div><strong class="state">{{stateLabel(task.state)}}</strong></div>
  @if(task.custom_instructions){<p class="instructions">{{task.custom_instructions}}</p>}
  <div class="files">@for(box of task.packages||[];track $index){<div class="box"><b>{{box.package_name||'Box '+($index+1)}}</b>@if(!task.custom_job_id){<div class="drawing"><span>Packaging drawing:</span><app-box-drawing [readOnly]="true" [signature]="task.profile_signature!" [index]="$index" [box]="box" [sharedSize]="drawingKey(task)" /></div>}
   <div class="file-head"><span>RD file</span><span>Copy</span><span>Status</span></div>
   @for(file of filesFor(task,$index);track file.file_id){<div class="file"><span>{{file.filename}}</span><strong [attr.aria-label]="'Cut '+file.copies+' '+(file.copies===1?'copy':'copies')">{{file.copies}}</strong>
    @if(task.state==='transferred'){<label class="file-done" [title]="fileDone(task,file)?'Done':'Not done'"><input type="checkbox" [checked]="fileDone(task,file)" (change)="saveFileCut(task,file,$any($event.target).checked,$any($event.target))" [disabled]="!!busy()" [attr.aria-label]="'Done cutting '+file.filename+' in '+file.copies+' '+(file.copies===1?'copy':'copies')"></label>}
   </div>}
  </div>}</div>
  @if(lastTransfer(task)?.state==='failed'){<p class="error" role="alert">{{lastTransfer(task)?.error||'Transfer failed.'}} Check the controller file list before retrying.</p>}
  @if(task.state==='assigned'||task.state==='transferred'){<button type="button" class="primary" (click)="requestTransfer(task)" [disabled]="!!busy()||!stationOnline()">{{busy()===task.id?'Requesting transfer…':(task.state==='transferred'?'Reload ':'Load ')+task.files.length+' files to laser'}}</button>
   @if(!stationOnline()){<p class="hint">Start the cutting station on the connected laptop, then refresh.</p>}}
  @if(task.state==='transfer_requested'){<p class="hint" role="status">Waiting for the laptop to confirm transfer. Check the machine file list before cutting.</p>
   @if(members.manager()&&staleClaim(task)){<button type="button" (click)="resetStale(task)" [disabled]="!!busy()">Reset stalled transfer</button>}}
  @if(task.state==='transferred'){<p class="hint">All {{task.files.length}} files transferred. Cut the listed quantities manually, then mark each file done.</p>
   <p class="cut-progress" role="status">{{cutCount(task)}} of {{task.files.length}} files done · Progress saved after each check.@if(busy()===task.id){ Saving…}</p>
   @if(allFilesDone(task)){<button type="button" class="primary" (click)="openCompletion(task)" [disabled]="!!busy()">Confirm boxes made</button>}}
  @if(taskError()?.id===task.id){<p class="error" role="alert">{{taskError()?.message}}</p>}
 </article>}@empty{<p>No Packing work sent yet.</p>}</div>
 </section>
 <p-dialog header="Confirm boxes made" [visible]="!!completionTask()" (visibleChange)="closeCompletion()" [modal]="true" [closable]="!busy()" [closeOnEscape]="!busy()" [dismissableMask]="false" [style]="{width:'30rem',maxWidth:'95vw'}" appendTo="body">
  @if(completionTask();as task){<p><strong>{{task.custom_job_id?'Custom job':'#'+task.order_number}} · {{task.product_name}}</strong></p><p>All {{task.files.length}} files are marked Done. Confirm that every required copy has been cut and the boxes are made. This closes the Packing task.</p>}
  @if(completionError()){<p class="error" role="alert">{{completionError()}}</p>}
  <ng-template #footer><button type="button" (click)="closeCompletion()" [disabled]="!!busy()">Keep task open</button><button type="button" (click)="confirmCompletion()" [disabled]="!!busy()">{{busy()?'Saving…':'Confirm boxes made'}}</button></ng-template>
 </p-dialog>`,styles:[`
 :host{display:block}.work-page h1{margin:0}.sub{margin:4px 0 16px;color:var(--wc-muted)}.controls{display:flex;align-items:center;gap:10px;margin-bottom:14px}.controls button,.task button{min-height:36px;border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:7px 12px;cursor:pointer}.station{border:1px solid #fecaca;background:#fff1f1;color:#991b1b;border-radius:8px;padding:7px 10px;font-size:.85rem}.station.online{border-color:#bbf7d0;background:#f0fdf4;color:#166534}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:14px}.task{background:#fff;border:1px solid var(--wc-border);border-radius:12px;padding:14px}.task-head{display:flex;justify-content:space-between;gap:10px}.task h2{margin:2px 0 0;font-size:1.1rem}.order{color:var(--wc-muted);font-size:.83rem}.state{font-size:.8rem}.assignee,.hint{font-size:.83rem;color:var(--wc-muted)}.files{display:flex;flex-direction:column;gap:5px;margin:14px 0}.file{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--wc-border);border-radius:7px;padding:7px}.file div{min-width:0}.file b,.file small{display:block;overflow-wrap:anywhere}.file small{color:var(--wc-muted)}.file strong{white-space:nowrap}.task button.primary{background:var(--p-primary-color,#116dff);color:#fff;border-color:transparent}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;border-radius:6px;padding:9px}.success{color:#166534}@media(max-width:650px){.cards{display:block}.task+.task{margin-top:12px}}
 .file-head,.file{display:grid;grid-template-columns:minmax(0,1fr) 50px 65px;column-gap:8px}.file-head{color:var(--wc-muted);font-size:.8rem;padding:5px 0}.file-head span:not(:first-child),.file strong{text-align:center}.file-done{justify-content:center}
 .box{border:1px solid var(--wc-border);border-radius:8px;padding:8px;margin-bottom:8px}.drawing{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0;font-size:.83rem}.file{border:0;border-top:1px solid var(--wc-border);border-radius:0;padding:7px 0;flex-wrap:wrap}.file span{overflow-wrap:anywhere;min-width:0;flex:1}.file strong{white-space:nowrap}.file-done{display:flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer}.file-done input{cursor:pointer}.cut-progress{margin:12px 0;color:var(--wc-muted);font-size:.85rem}.task button:disabled{opacity:.55;cursor:not-allowed}
 .product-heading{display:flex;gap:10px;min-width:0}.product-heading>div{min-width:0}.product-image{display:flex;align-items:center;justify-content:center;flex:0 0 64px;width:64px;height:64px;background:#f4f6f8;border-radius:8px;overflow:hidden}.product-image img{width:100%;height:100%;object-fit:contain}.product-image svg{width:26px;height:26px;fill:none;stroke:var(--wc-muted);stroke-width:1.5}.task-head .state{flex:0 0 62px}.task-head h2{overflow-wrap:anywhere}.instructions{white-space:pre-wrap;overflow-wrap:anywhere}
 `]})
export class PackingWorkComponent implements OnInit,OnDestroy {
 readonly tasks=signal<WorkTask[]>([]);readonly profiles=signal<Profile[]>([]);readonly stations=signal<Station[]>([]);readonly transfers=signal<Transfer[]>([]);readonly loading=signal(false);readonly error=signal('');readonly success=signal('');readonly busy=signal('');
 readonly taskError=signal<{id:string;message:string}|null>(null);
 readonly completionTask=signal<WorkTask|null>(null);readonly completionError=signal('');
 readonly failedImages=new Set<string>();
 private loadInFlight=false;private loadVersion=0;
 private refreshTimer?:ReturnType<typeof setInterval>;
 constructor(private db:SupabaseService,readonly members:HubMembersService){}
 ngOnInit(){void this.load();this.refreshTimer=setInterval(()=>void this.load(true),10000);}
 ngOnDestroy(){if(this.refreshTimer)clearInterval(this.refreshTimer);}
 async load(silent=false){if(this.loadInFlight||this.busy()||this.completionTask())return;this.loadInFlight=true;const version=++this.loadVersion;if(!silent)this.loading.set(true);if(!silent)this.error.set('');
  try{await this.members.load();const {data:user,error:authError}=await this.db.client.auth.getUser();if(authError||!user.user)throw authError||Error('Sign in again.');
   const [taskResult,stationResult,transferResult]=await Promise.all([
    this.db.client.from('wc_packing_tasks').select('id,unit_id,custom_job_id,custom_instructions,order_number,product_name,profile_signature,state,files,cut_file_ids,packages,assigned_at,unit:wc_production_units(item:wc_order_items(image,raw_item))').neq('state','cancelled').neq('state','completed').order('assigned_at'),
    this.db.client.from('wc_packing_stations').select('station_name,last_seen'),
    this.db.client.from('wc_packing_transfers').select('id,task_id,state,error,claimed_at,requested_at').order('requested_at',{ascending:false}).limit(200),
   ]);
   if(taskResult.error)throw taskResult.error;if(stationResult.error)throw stationResult.error;if(transferResult.error)throw transferResult.error;
   const tasks=(taskResult.data||[]) as unknown as WorkTask[];
   const signatures=[...new Set(tasks.map(task=>task.profile_signature).filter((value):value is string=>!!value))];
   let profiles:Profile[]=[];
   if(signatures.length){const {data,error}=await this.db.client.from('wc_delivery_packaging_profiles').select('signature,packages,template_item').in('signature',signatures);if(error)throw error;profiles=(data||[]) as Profile[];}
   if(version!==this.loadVersion)return;
   this.profiles.set(profiles);
   this.tasks.set(silent?tasks.map(task=>this.retainPackages(task)):tasks);this.stations.set((stationResult.data||[]) as Station[]);this.transfers.set((transferResult.data||[]) as Transfer[]);
  }catch(e){if(version===this.loadVersion)this.error.set(`Could not load Packing assignments. ${(e as Error)?.message||'Check the connection and retry.'}`);}
  finally{this.loadInFlight=false;if(!silent)this.loading.set(false);}
 }
 visibleTasks(){return this.tasks();}
 imageUrl(task:WorkTask){const item=task.unit?.item||this.profileFor(task)?.template_item;const src=item?orderItemImageUrl(item):'';return this.failedImages.has(src)?'':src;}
 private retainPackages(task:WorkTask):WorkTask {
  const previous=this.tasks().find(row=>row.id===task.id&&row.profile_signature===task.profile_signature);
  if(!previous)return task;
  // Polling and Done responses deserialize identical boxes into new objects.
  // Keep those inputs stable so drawing controls do not collapse into Loading.
  return {...task,packages:(task.packages||[]).map((box,index)=>sameDrawingBox(previous.packages?.[index],box)?previous.packages[index]:box)};
 }
 profileFor(task:WorkTask){return this.profiles().find(profile=>profile.signature===task.profile_signature);}
 filesFor(task:WorkTask,index:number){return task.files.filter(file=>file.box_index===index);}
 drawingKey(task:WorkTask){const profile=this.profileFor(task);return profile&&/backdrop/i.test(task.product_name)?backdropDrawingKey({...profile,packages:task.packages},task.product_name):'';}
 stationOnline(){return this.stations().some(station=>Date.now()-Date.parse(station.last_seen)<35000);}
 lastTransfer(task:WorkTask){return this.transfers().find(transfer=>transfer.task_id===task.id);}
 staleClaim(task:WorkTask){const transfer=this.lastTransfer(task);return !this.stationOnline()&&transfer?.state==='claimed'&&!!transfer.claimed_at&&Date.now()-Date.parse(transfer.claimed_at)>120000;}
 stateLabel=packingStateLabel;
 fileDone(task:WorkTask,file:WorkFile){return (task.cut_file_ids||[]).includes(file.file_id);}
 cutCount(task:WorkTask){return task.files.filter(file=>this.fileDone(task,file)).length;}
 allFilesDone(task:WorkTask){return task.state==='transferred'&&task.files.length>0&&this.cutCount(task)===task.files.length;}
 openCompletion(task:WorkTask){if(this.busy()||!this.allFilesDone(task))return;++this.loadVersion;this.completionError.set('');this.completionTask.set(task);}
 closeCompletion(){if(this.busy())return;this.completionTask.set(null);this.completionError.set('');}
 async confirmCompletion(){const task=this.completionTask();if(!task||this.busy())return;++this.loadVersion;this.busy.set(task.id);this.completionError.set('');
  try{const {data,error}=await this.db.client.rpc('wc_complete_packing_task',{p_id:task.id});
   if(error||data?.id!==task.id||data?.state!=='completed')throw error||Error('Server did not confirm completion.');
   this.tasks.update(tasks=>tasks.filter(row=>row.id!==task.id));this.completionTask.set(null);this.success.set(`${task.custom_job_id?task.product_name:'#'+task.order_number}: Boxes made confirmed.`);
  }catch(e){this.completionError.set(`Could not complete Packing. ${(e as Error)?.message||'Check the connection and retry.'}`);}
  finally{this.busy.set('');}
 }
 async requestTransfer(task:WorkTask){if(this.busy()||!['assigned','transferred'].includes(task.state)||!this.stationOnline())return;++this.loadVersion;this.busy.set(task.id);this.error.set('');this.taskError.set(null);this.success.set('');
  try{const {data,error}=await this.db.client.rpc('wc_request_packing_transfer',{p_task:task.id});if(error||!data?.id)throw error||Error('The laptop did not receive the request.');
   this.tasks.update(tasks=>tasks.map(row=>row.id===task.id?{...row,state:'transfer_requested'}:row));this.success.set('Transfer requested. Wait for confirmation from the connected laptop.');
  }catch(e){this.taskError.set({id:task.id,message:`Could not transfer ${task.custom_job_id?task.product_name:'#'+task.order_number}. ${(e as Error)?.message||'Check the laptop and retry.'}`});}
  finally{this.busy.set('');}
 }
 async saveFileCut(task:WorkTask,file:WorkFile,done:boolean,input?:HTMLInputElement){
  if(input)input.checked=this.fileDone(task,file);
  if(this.busy()||task.state!=='transferred'||!task.files.some(item=>item.file_id===file.file_id))return;
  ++this.loadVersion;this.busy.set(task.id);this.error.set('');this.taskError.set(null);this.success.set('');
  try{const {data,error}=await this.db.client.rpc('wc_set_packing_file_done',{p_task:task.id,p_file:file.file_id,p_done:done});
   if(error||data?.id!==task.id||data?.state!=='transferred'||!Array.isArray(data?.cut_file_ids)||data.cut_file_ids.includes(file.file_id)!==done)throw error||Error('Server did not confirm the saved file status.');
   const saved=this.retainPackages({...task,...data});this.tasks.update(tasks=>tasks.map(row=>row.id===task.id?saved:row));this.success.set(`${file.filename}: progress saved.`);
   if(done&&this.allFilesDone(saved)){this.completionError.set('');this.completionTask.set(saved);}
  }catch(e){this.taskError.set({id:task.id,message:`Could not save ${file.filename}. ${(e as Error)?.message||'Check the connection and retry.'}`});}
  finally{this.busy.set('');}
 }
 async resetStale(task:WorkTask){const transfer=this.lastTransfer(task);if(!transfer||this.busy())return;++this.loadVersion;this.busy.set(task.id);this.error.set('');this.success.set('');
  try{const {error}=await this.db.client.rpc('wc_reset_stale_packing_transfer',{p_transfer:transfer.id});if(error)throw error;this.success.set('Stalled transfer reset. Check the controller file list before requesting it again.');this.tasks.update(rows=>rows.map(row=>row.id===task.id?{...row,state:'assigned'}:row));}
  catch(e){this.error.set(`Could not reset transfer. ${(e as Error)?.message||'Check the task and retry.'}`);}finally{this.busy.set('');}
 }
}
