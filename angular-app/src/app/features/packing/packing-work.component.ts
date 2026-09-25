import {Component,OnDestroy,OnInit,signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {BoxDrawingComponent} from '../shipping-data/box-drawing.component';
import {backdropDrawingKey} from '../shipping-data/product-sizes';

interface WorkFile {file_id:string;box_index:number;box_name:string;filename:string;copies:number;object_path:string}
interface WorkTask {id:string;unit_id:string;order_number:string;product_name:string;profile_signature:string;state:string;files:WorkFile[];packages:any[];assigned_at:string}
interface Profile {signature:string;packages:any[];template_item:any}
interface Station {station_name:string;last_seen:string}
interface Transfer {id:string;task_id:string;state:string;error:string|null;claimed_at:string|null;requested_at:string}

@Component({selector:'app-packing-work',standalone:true,imports:[BoxDrawingComponent],template:`
 <section class="work-page"><h1>Packing work</h1><p class="sub">Tasks sent to the whole team. RD files transfer once to the laptop. Cut counts are instructions for the operator; set and start cutting at the machine.</p>
 @if(loading()){<p role="status">Loading assignments…</p>}
 @if(error()){<p class="error" role="alert">{{error()}} <button type="button" (click)="load()" [disabled]="loading()||!!busy()">Retry</button></p>}
 @if(success()){<p class="success" role="status">{{success()}}</p>}
 <div class="controls"><span class="station" [class.online]="stationOnline()">{{stationOnline()?'Cutting laptop connected':'Cutting laptop offline'}}</span><button type="button" (click)="load()" [disabled]="loading()||!!busy()">Refresh</button></div>
 <div class="cards">@for(task of visibleTasks();track task.id){<article class="task">
  <div class="task-head"><div><span class="order">#{{task.order_number}}</span><h2>{{task.product_name}}</h2></div><strong class="state">{{stateLabel(task.state)}}</strong></div>
  <div class="files">@for(box of task.packages||[];track $index){<div class="box"><b>{{box.package_name||'Box '+($index+1)}}</b><div class="drawing"><span>Packaging drawing:</span><app-box-drawing [readOnly]="true" [signature]="task.profile_signature" [index]="$index" [box]="box" [sharedSize]="drawingKey(task)" /></div>
   @for(file of filesFor(task,$index);track file.file_id){<div class="file"><span>{{file.filename}}</span><strong>Cut {{file.copies}} {{file.copies===1?'copy':'copies'}}</strong></div>}
  </div>}</div>
  @if(lastTransfer(task)?.state==='failed'){<p class="error" role="alert">{{lastTransfer(task)?.error||'Transfer failed.'}} Check the controller file list before retrying.</p>}
  @if(task.state==='assigned'){<button type="button" class="primary" (click)="requestTransfer(task)" [disabled]="!!busy()||!stationOnline()">{{busy()===task.id?'Requesting transfer…':'Load to laser'}}</button>
   @if(!stationOnline()){<p class="hint">Start the cutting station on the connected laptop, then refresh.</p>}}
  @if(task.state==='transfer_requested'){<p class="hint" role="status">Waiting for the laptop to confirm transfer. Check the machine file list before cutting.</p>
   @if(members.manager()&&staleClaim(task)){<button type="button" (click)="resetStale(task)" [disabled]="!!busy()">Reset stalled transfer</button>}}
  @if(task.state==='transferred'){<p class="hint">The controller acknowledged the transfer. Check its file list, then start and supervise cutting at the machine.</p><button type="button" (click)="complete(task)" [disabled]="!!busy()">Mark Packing work complete</button>}
 </article>}@empty{<p>No Packing work sent yet.</p>}</div>
 </section>`,styles:[`
 :host{display:block}.work-page h1{margin:0}.sub{margin:4px 0 16px;color:var(--wc-muted)}.controls{display:flex;align-items:center;gap:10px;margin-bottom:14px}.controls button,.task button{min-height:36px;border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:7px 12px;cursor:pointer}.station{border:1px solid #fecaca;background:#fff1f1;color:#991b1b;border-radius:8px;padding:7px 10px;font-size:.85rem}.station.online{border-color:#bbf7d0;background:#f0fdf4;color:#166534}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:14px}.task{background:#fff;border:1px solid var(--wc-border);border-radius:12px;padding:14px}.task-head{display:flex;justify-content:space-between;gap:10px}.task h2{margin:2px 0 0;font-size:1.1rem}.order{color:var(--wc-muted);font-size:.83rem}.state{font-size:.8rem}.assignee,.hint{font-size:.83rem;color:var(--wc-muted)}.files{display:flex;flex-direction:column;gap:5px;margin:14px 0}.file{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--wc-border);border-radius:7px;padding:7px}.file div{min-width:0}.file b,.file small{display:block;overflow-wrap:anywhere}.file small{color:var(--wc-muted)}.file strong{white-space:nowrap}.task button.primary{background:var(--p-primary-color,#116dff);color:#fff;border-color:transparent}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;border-radius:6px;padding:9px}.success{color:#166534}@media(max-width:650px){.cards{display:block}.task+.task{margin-top:12px}}
 .box{border:1px solid var(--wc-border);border-radius:8px;padding:8px;margin-bottom:8px}.drawing{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0;font-size:.83rem}.file{border:0;border-top:1px solid var(--wc-border);border-radius:0;padding:7px 0}.file span{overflow-wrap:anywhere}.file strong{white-space:nowrap}
 `]})
export class PackingWorkComponent implements OnInit,OnDestroy {
 readonly tasks=signal<WorkTask[]>([]);readonly profiles=signal<Profile[]>([]);readonly stations=signal<Station[]>([]);readonly transfers=signal<Transfer[]>([]);readonly loading=signal(false);readonly error=signal('');readonly success=signal('');readonly busy=signal('');
 private refreshTimer?:ReturnType<typeof setInterval>;
 constructor(private db:SupabaseService,readonly members:HubMembersService){}
 ngOnInit(){void this.load();this.refreshTimer=setInterval(()=>void this.load(true),10000);}
 ngOnDestroy(){if(this.refreshTimer)clearInterval(this.refreshTimer);}
 async load(silent=false){if(!silent)this.loading.set(true);if(!silent)this.error.set('');
  try{await this.members.load();const {data:user,error:authError}=await this.db.client.auth.getUser();if(authError||!user.user)throw authError||Error('Sign in again.');
   const [taskResult,stationResult,transferResult]=await Promise.all([
    this.db.client.from('wc_packing_tasks').select('id,unit_id,order_number,product_name,profile_signature,state,files,packages,assigned_at').neq('state','cancelled').neq('state','completed').order('assigned_at'),
    this.db.client.from('wc_packing_stations').select('station_name,last_seen'),
    this.db.client.from('wc_packing_transfers').select('id,task_id,state,error,claimed_at,requested_at').order('requested_at',{ascending:false}).limit(200),
   ]);
   if(taskResult.error)throw taskResult.error;if(stationResult.error)throw stationResult.error;if(transferResult.error)throw transferResult.error;
   const tasks=(taskResult.data||[]) as unknown as WorkTask[];
   const signatures=[...new Set(tasks.map(task=>task.profile_signature))];
   if(signatures.length){const {data,error}=await this.db.client.from('wc_delivery_packaging_profiles').select('signature,packages,template_item').in('signature',signatures);if(error)throw error;this.profiles.set((data||[]) as Profile[]);}else this.profiles.set([]);
   this.tasks.set(tasks);this.stations.set((stationResult.data||[]) as Station[]);this.transfers.set((transferResult.data||[]) as Transfer[]);
  }catch(e){this.error.set(`Could not load Packing assignments. ${(e as Error)?.message||'Check the connection and retry.'}`);}
  finally{if(!silent)this.loading.set(false);}
 }
 visibleTasks(){return this.tasks();}
 profileFor(task:WorkTask){return this.profiles().find(profile=>profile.signature===task.profile_signature);}
 filesFor(task:WorkTask,index:number){return task.files.filter(file=>file.box_index===index);}
 drawingKey(task:WorkTask){const profile=this.profileFor(task);return profile&&/backdrop/i.test(task.product_name)?backdropDrawingKey({...profile,packages:task.packages},task.product_name):'';}
 stationOnline(){return this.stations().some(station=>Date.now()-Date.parse(station.last_seen)<35000);}
 lastTransfer(task:WorkTask){return this.transfers().find(transfer=>transfer.task_id===task.id);}
 staleClaim(task:WorkTask){const transfer=this.lastTransfer(task);return !this.stationOnline()&&transfer?.state==='claimed'&&!!transfer.claimed_at&&Date.now()-Date.parse(transfer.claimed_at)>120000;}
 stateLabel(state:string){return state==='assigned'?'Sent':state==='transfer_requested'?'Transferring':state==='transferred'?'Transfer acknowledged':state;}
 async requestTransfer(task:WorkTask){if(this.busy())return;this.busy.set(task.id);this.error.set('');this.success.set('');
  try{const {data,error}=await this.db.client.rpc('wc_request_packing_transfer',{p_task:task.id});if(error||!data?.id)throw error||Error('The laptop did not receive the request.');
   this.tasks.update(tasks=>tasks.map(row=>row.id===task.id?{...row,state:'transfer_requested'}:row));this.success.set('Transfer requested. Wait for confirmation from the connected laptop.');
  }catch(e){this.error.set(`Could not transfer #${task.order_number}. ${(e as Error)?.message||'Check the laptop and retry.'}`);}
  finally{this.busy.set('');}
 }
 async complete(task:WorkTask){if(this.busy())return;this.busy.set(task.id);this.error.set('');this.success.set('');
  try{const {data,error}=await this.db.client.rpc('wc_complete_packing_task',{p_id:task.id});if(error||!data?.id)throw error||Error('Server did not confirm completion.');this.tasks.update(tasks=>tasks.filter(row=>row.id!==task.id));this.success.set('Packing work marked complete.');}
  catch(e){this.error.set(`Could not complete Packing work. ${(e as Error)?.message||'Check the task and retry.'}`);}finally{this.busy.set('');}
 }
 async resetStale(task:WorkTask){const transfer=this.lastTransfer(task);if(!transfer||this.busy())return;this.busy.set(task.id);this.error.set('');this.success.set('');
  try{const {error}=await this.db.client.rpc('wc_reset_stale_packing_transfer',{p_transfer:transfer.id});if(error)throw error;this.success.set('Stalled transfer reset. Check the controller file list before requesting it again.');await this.load(true);}
  catch(e){this.error.set(`Could not reset transfer. ${(e as Error)?.message||'Check the task and retry.'}`);}finally{this.busy.set('');}
 }
}
