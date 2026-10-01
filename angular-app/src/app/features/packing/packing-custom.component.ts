import {Component,OnInit,signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {packingStateLabel} from './packing-state';

interface CustomJob {id:string;title:string;instructions:string;updated_at:string;revision:string}
interface CustomRdFile {id:string;job_id:string;object_path:string;filename:string;size_bytes:number;copies:number;revision:string}
interface SentTask {id:string;custom_job_id:string;state:string}

@Component({selector:'app-packing-custom',standalone:true,imports:[FormsModule,DatePipe],template:`
 <section class="custom-page">
  <p class="sub">Create and save Packing jobs that do not belong to a product or order.</p>
  @if(loading()){<p role="status">Loading Custom jobs…</p>}
  @if(loadError()){<p class="error" role="alert">{{loadError()}} <button type="button" (click)="load()" [disabled]="loading()||saving()">Retry</button></p>}
  @if(success()){<p class="success" role="status">{{success()}}</p>}
  <div class="controls"><input aria-label="Search Custom jobs" placeholder="Search Custom jobs" [ngModel]="search()" (ngModelChange)="search.set($event)">
   <button type="button" class="icon" aria-label="Add Custom job" title="Add Custom job" (click)="newJob()" [disabled]="saving()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
   <button type="button" (click)="load()" [disabled]="loading()||saving()">Refresh</button></div>
  @if(editing()!==undefined){
   <form class="editor" (ngSubmit)="save()">
    <h2>{{editing()?.id?'Edit Custom job':'New Custom job'}}</h2>
    <label>Job name <input name="title" [(ngModel)]="title" maxlength="160" required [disabled]="saving()" placeholder="Name this job"></label>
    <label>Instructions <textarea name="instructions" [(ngModel)]="instructions" maxlength="5000" rows="5" [disabled]="saving()" placeholder="Describe the work"></textarea></label>
    @if(saveError()){<p class="error" role="alert">{{saveError()}}</p>}
    <div class="editor-actions"><button type="button" (click)="closeEditor()" [disabled]="saving()">Cancel</button>
     <button type="submit" class="icon" aria-label="Save Custom job" title="Save Custom job" [disabled]="saving()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button>
     @if(saving()){<span role="status">Saving Custom job…</span>}</div>
   </form>
  }
  @if(selected();as job){<section class="editor" aria-label="Custom job RD files"><h2>{{job.title}} · RD files</h2>
   @if(fileError()){<p class="error" role="alert">{{fileError()}}</p>}
   @if(fileSuccess()){<p class="success" role="status">{{fileSuccess()}}</p>}
   @if(fileBusy()){<p role="status">{{fileBusy()==='upload'?'Uploading and saving RD file…':fileBusy()==='send'?'Sending Custom job…':fileBusy()==='cancel'?'Cancelling Packing task…':'Saving RD files…'}}</p>}
   @for(file of filesFor(job);track file.id){<div class="rd-row"><button type="button" (click)="download(file)" [disabled]="!!fileBusy()">{{file.filename}}</button>
    <label>Copies <input type="number" min="1" max="1000" step="1" [ngModel]="copiesFor(file)" (ngModelChange)="fileCopies.set(file.id,$event)" [disabled]="!!fileBusy()||!!activeTask(job)" [attr.aria-label]="'Copies for '+file.filename"></label>
    <button type="button" class="icon" [attr.aria-label]="'Save copies for '+file.filename" [attr.title]="'Save copies for '+file.filename" (click)="saveCopies(file)" [disabled]="!!fileBusy()||!!activeTask(job)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button>
    <button type="button" [attr.aria-label]="'Remove '+file.filename" [disabled]="!!fileBusy()||!!activeTask(job)" (click)="remove(file)">Remove</button></div>}
   @empty{<p>No RD files saved yet.</p>}
   <div class="rd-row"><label class="upload icon" title="Add RD file" aria-label="Add RD file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><input type="file" accept=".rd" aria-label="Add RD file" [disabled]="!!fileBusy()||!!activeTask(job)" (change)="upload($event,job)"></label>
    <label>Copies <input type="number" min="1" max="1000" step="1" [(ngModel)]="newCopies" [disabled]="!!fileBusy()||!!activeTask(job)" aria-label="Copies for new RD file"></label></div>
   @if(activeTask(job);as sent){<p>Sent to Packing work · {{stateLabel(sent.state)}}. RD files can be changed after this task is completed or cancelled.</p>
    @if(sent.state==='assigned'||sent.state==='transfer_requested'){<button type="button" (click)="cancel(sent)" [disabled]="!!fileBusy()">Cancel task</button>}}
   <div class="editor-actions"><button type="button" (click)="send(job)" [disabled]="!!fileBusy()||!!activeTask(job)||!filesFor(job).length">{{fileBusy()==='send'?'Sending…':'Send to Packing work'}}</button><button type="button" (click)="selected.set(null)" [disabled]="!!fileBusy()">Close</button></div>
  </section>}
  <div class="table-wrap"><table><thead><tr><th>Custom job</th><th>Instructions</th><th>Updated</th><th></th></tr></thead><tbody>
   @for(job of visible();track job.id){<tr><td><strong>{{job.title}}</strong></td><td class="instructions">{{job.instructions||'—'}}</td><td>{{job.updated_at|date:'mediumDate'}}</td><td><div class="row-actions"><button type="button" class="icon" [attr.aria-label]="'Edit '+job.title" [attr.title]="'Edit '+job.title" (click)="edit(job)" [disabled]="saving()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4-.8L19 8.2 15.8 5 4.8 16zM14.5 6.3l3.2 3.2"/></svg></button><button type="button" (click)="selected.set(job)" [disabled]="saving()">RD files · {{filesFor(job).length}}</button><button type="button" [attr.aria-label]="'Send '+job.title+' to Packing work'" [attr.title]="!filesFor(job).length?'Add an RD file before sending':activeTask(job)?'Already sent to Packing work':'Send to Packing work'" (click)="send(job)" [disabled]="loading()||saving()||!!fileBusy()||!!activeTask(job)||!filesFor(job).length">{{sendingJob()===job.id?'Sending…':activeTask(job)?'Sent':'Send'}}</button></div>@if(rowError()?.id===job.id){<small class="row-error" role="alert">{{rowError()?.message}}</small>}</td></tr>}
   @empty{<tr><td colspan="4">No Custom jobs found.</td></tr>}
  </tbody></table></div>
 </section>`,styles:[`
 :host{display:block}.sub{margin:4px 0 16px;color:var(--wc-muted)}.controls{display:flex;align-items:center;gap:8px;margin-bottom:14px}.controls input,.controls button,.editor input,.editor textarea,.editor button,.table-wrap button{border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:7px 10px;min-height:36px;box-sizing:border-box}.controls input{min-width:220px}.controls button,.editor button,.table-wrap button{cursor:pointer}.icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;min-width:36px;padding:0!important}.icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.table-wrap{border:1px solid var(--wc-border);border-radius:12px;background:#fff;overflow:auto}table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--wc-border)}tr:last-child td{border-bottom:0}th:last-child,td:last-child{width:240px}.row-actions,.rd-row{display:flex;align-items:center;gap:8px}.row-actions{white-space:nowrap}.row-error{display:block;white-space:normal;color:#991b1b;margin-top:6px;max-width:340px}.instructions{white-space:pre-wrap;overflow-wrap:anywhere;max-width:500px}.editor{border:1px solid var(--wc-border);border-radius:12px;background:#fff;padding:16px;margin-bottom:14px;max-width:700px}.editor h2{font-size:1.1rem;margin:0 0 14px}.editor label{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}.editor input,.editor textarea{width:100%;font:inherit}.editor-actions{display:flex;align-items:center;gap:8px}.rd-row{flex-wrap:wrap;margin:8px 0}.rd-row label{margin:0}.rd-row input[type=number]{width:70px}.upload{position:relative;overflow:hidden}.upload input{position:absolute;inset:0;opacity:0;cursor:pointer}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;padding:9px;border-radius:6px}.success{color:#166534}[disabled]{opacity:.55;cursor:default!important}@media(max-width:650px){.controls input{min-width:0;flex:1}}
 `]})
export class PackingCustomComponent implements OnInit {
 readonly jobs=signal<CustomJob[]>([]);readonly search=signal('');readonly loading=signal(false);readonly saving=signal(false);
 readonly files=signal<CustomRdFile[]>([]);readonly tasks=signal<SentTask[]>([]);readonly selected=signal<CustomJob|null>(null);
 readonly sendingJob=signal<string|null>(null);readonly rowError=signal<{id:string;message:string}|null>(null);
 readonly fileBusy=signal('');readonly fileError=signal('');readonly fileSuccess=signal('');readonly fileCopies=new Map<string,number>();newCopies=1;
 readonly stateLabel=packingStateLabel;
 readonly loadError=signal('');readonly saveError=signal('');readonly success=signal('');readonly editing=signal<CustomJob|null|undefined>(undefined);
 title='';instructions='';
 constructor(private db:SupabaseService,readonly members:HubMembersService){}
 ngOnInit(){void this.load();}
 async load(){if(this.loading()||this.saving())return;this.loading.set(true);this.loadError.set('');
  try{await this.members.load();if(!this.members.manager())throw Error('Manager access is required.');
   const [jobResult,fileResult,taskResult]=await Promise.all([
    this.db.client.from('wc_custom_packing_jobs').select('id,title,instructions,updated_at,revision').order('updated_at',{ascending:false}),
    this.db.client.from('wc_custom_packing_rd_files').select('id,job_id,object_path,filename,size_bytes,copies,revision').order('created_at'),
    this.db.client.from('wc_packing_tasks').select('id,custom_job_id,state').not('custom_job_id','is',null).not('state','in','(cancelled,completed)')]);
   if(jobResult.error)throw jobResult.error;if(fileResult.error)throw fileResult.error;if(taskResult.error)throw taskResult.error;
   this.jobs.set((jobResult.data||[]) as CustomJob[]);this.files.set((fileResult.data||[]) as CustomRdFile[]);this.tasks.set((taskResult.data||[]) as SentTask[]);
  }catch(e){this.loadError.set(`Could not load Custom jobs. ${(e as Error)?.message||'Check the connection.'} Retry.`);}
  finally{this.loading.set(false);}
 }
 visible(){const term=this.search().trim().toLowerCase();return this.jobs().filter(job=>!term||`${job.title} ${job.instructions}`.toLowerCase().includes(term));}
 filesFor(job:CustomJob){return this.files().filter(file=>file.job_id===job.id);}
 activeTask(job:CustomJob){return this.tasks().find(task=>task.custom_job_id===job.id);}
 copiesFor(file:CustomRdFile){return this.fileCopies.get(file.id)??file.copies;}
 newJob(){this.editing.set(null);this.title='';this.instructions='';this.saveError.set('');this.success.set('');}
 edit(job:CustomJob){this.editing.set(job);this.title=job.title;this.instructions=job.instructions;this.saveError.set('');this.success.set('');}
 closeEditor(){if(this.saving())return;this.editing.set(undefined);this.saveError.set('');}
 async save(){if(this.saving()||this.editing()===undefined)return;this.saveError.set('');this.success.set('');
  if(!this.title.trim()||this.title.trim().length>160){this.saveError.set('Enter a job name of 1 to 160 characters.');return;}
  if(this.instructions.length>5000){this.saveError.set('Instructions must be 5000 characters or fewer.');return;}
  this.saving.set(true);const current=this.editing();
  try{const {data,error}=await this.db.client.rpc('wc_save_custom_packing_job',{p_id:current?.id||null,p_title:this.title,p_instructions:this.instructions,p_expected:current?.revision||null});
   if(error||!data?.id||!data?.revision)throw error||Error('Server did not confirm the saved job.');
   this.jobs.update(jobs=>[data as CustomJob,...jobs.filter(job=>job.id!==data.id)]);this.selected.set(data as CustomJob);this.editing.set(undefined);this.success.set(`Custom job “${data.title}” saved. Add RD files before sending.`);
  }catch(e){this.saveError.set(`Could not save Custom job. ${(e as Error)?.message||'Check the connection.'} Keep your text and retry.`);}
  finally{this.saving.set(false);}
 }
 async upload(event:Event,job:CustomJob){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||this.fileBusy())return;
  this.fileError.set('');this.fileSuccess.set('');const copies=Number(this.newCopies);
  if(!Number.isInteger(copies)||copies<1||copies>1000){this.fileError.set('Enter a whole copy count from 1 to 1000, then choose the RD file again.');return;}
  if(!/\.rd$/i.test(file.name)){this.fileError.set(`${file.name}: choose an .rd laser cutting file.`);return;}
  if(!file.size||file.size>20971520){this.fileError.set(`${file.name} (${this.size(file.size)}) cannot be uploaded. File must be non-empty and at most 20 MB.`);return;}
  if(file.name.length>255){this.fileError.set(`${file.name}: filename is over 255 characters. Rename it and retry.`);return;}
  this.fileBusy.set('upload');let path='',uploaded=false,attaching=false;
  try{const {data,error:authError}=await this.db.client.auth.getUser();if(authError||!data.user)throw authError||Error('Sign in again.');
   path=`${data.user.id}/${crypto.randomUUID()}`;const bucket=this.db.client.storage.from('box-rd-files');
   const {error:uploadError}=await bucket.upload(path,file,{contentType:'application/octet-stream',upsert:false});if(uploadError)throw uploadError;uploaded=true;
   attaching=true;const {data:saved,error}=await this.db.client.rpc('wc_save_custom_packing_rd_file',{p_id:null,p_job:job.id,p_path:path,p_filename:file.name,p_bytes:file.size,p_copies:copies,p_expected:null});
   if(error||!saved?.id)throw error||Error('Server did not confirm the saved file.');
   this.files.update(files=>[...files,saved as CustomRdFile]);this.newCopies=1;this.fileSuccess.set(`${file.name} uploaded and saved with ${copies} ${copies===1?'copy':'copies'}.`);
  }catch(e){this.fileError.set(`${file.name}: ${(e as Error)?.message||'Upload failed.'} ${attaching?'Refresh to check whether it was saved, then retry.':'Check the file and connection, then retry.'}`);if(uploaded&&!attaching)await this.db.client.storage.from('box-rd-files').remove([path]);}
  finally{this.fileBusy.set('');}
 }
 async saveCopies(file:CustomRdFile){if(this.fileBusy())return;const copies=Number(this.copiesFor(file));this.fileError.set('');this.fileSuccess.set('');
  if(!Number.isInteger(copies)||copies<1||copies>1000){this.fileError.set(`${file.filename}: enter a whole copy count from 1 to 1000.`);return;}
  this.fileBusy.set('save');try{const {data,error}=await this.db.client.rpc('wc_save_custom_packing_rd_file',{p_id:file.id,p_job:file.job_id,p_path:null,p_filename:null,p_bytes:null,p_copies:copies,p_expected:file.revision});if(error||!data?.revision)throw error||Error('Server did not confirm the copy count.');this.files.update(rows=>rows.map(row=>row.id===file.id?data as CustomRdFile:row));this.fileCopies.delete(file.id);this.fileSuccess.set(`${file.filename}: copy count saved.`);}
  catch(e){this.fileError.set(`Could not save copies for ${file.filename}. ${(e as Error)?.message||'Check the connection.'} Retry.`);}finally{this.fileBusy.set('');}
 }
 async remove(file:CustomRdFile){if(this.fileBusy())return;this.fileBusy.set('save');this.fileError.set('');this.fileSuccess.set('');
  try{const {data,error}=await this.db.client.rpc('wc_delete_custom_packing_rd_file',{p_id:file.id,p_expected:file.revision});if(error||!data)throw error||Error('Server did not confirm removal.');this.files.update(rows=>rows.filter(row=>row.id!==file.id));this.fileSuccess.set(`${file.filename} removed.`);await this.db.client.storage.from('box-rd-files').remove([data]);}
  catch(e){this.fileError.set(`Could not remove ${file.filename}. ${(e as Error)?.message||'Refresh and retry.'}`);}finally{this.fileBusy.set('');}
 }
 async download(file:CustomRdFile){this.fileError.set('');try{const {data,error}=await this.db.client.storage.from('box-rd-files').createSignedUrl(file.object_path,60,{download:file.filename});if(error||!data)throw error||Error('File unavailable.');const link=document.createElement('a');link.href=data.signedUrl;link.download=file.filename;link.rel='noopener';link.click();}catch(e){this.fileError.set(`Could not download ${file.filename}. ${(e as Error)?.message||'Retry.'}`);}}
 async send(job:CustomJob){if(this.fileBusy()||this.activeTask(job))return;this.fileBusy.set('send');this.sendingJob.set(job.id);this.fileError.set('');this.fileSuccess.set('');this.rowError.set(null);this.success.set('');
  try{const {data,error}=await this.db.client.rpc('wc_send_custom_packing_job',{p_job:job.id});if(error||!data?.id)throw error||Error('Server did not confirm the task.');this.tasks.update(rows=>[...rows,{id:data.id,custom_job_id:job.id,state:data.state}]);this.fileSuccess.set(`${job.title} sent to everyone in Packing work.`);this.success.set(`${job.title} sent to Packing work.`);}
  catch(e){const message=`Could not send ${job.title}. ${(e as Error)?.message||'Check the files and retry.'}`;this.fileError.set(message);this.rowError.set({id:job.id,message});}finally{this.fileBusy.set('');this.sendingJob.set(null);}
 }
 async cancel(task:SentTask){if(this.fileBusy())return;this.fileBusy.set('cancel');this.fileError.set('');this.fileSuccess.set('');
  try{const {data,error}=await this.db.client.rpc('wc_cancel_packing_task',{p_id:task.id});if(error||data?.state!=='cancelled')throw error||Error('Server did not confirm cancellation.');this.tasks.update(rows=>rows.filter(row=>row.id!==task.id));this.fileSuccess.set('Custom Packing task cancelled.');}
  catch(e){this.fileError.set(`Could not cancel task. ${(e as Error)?.message||'Refresh and retry.'}`);}finally{this.fileBusy.set('');}
 }
 private size(bytes:number){return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
}
