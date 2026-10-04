import {Component,OnInit,signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {DrawerModule} from 'primeng/drawer';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {packingStateLabel} from './packing-state';

interface CustomJob {id:string;title:string;instructions:string;updated_at:string;revision:string}
interface CustomRdFile {id:string;job_id:string;object_path:string;filename:string;size_bytes:number;copies:number;revision:string}
interface CustomDrawing {id:string;job_id:string;object_path:string;filename:string;size_bytes:number;revision:string}
interface SentTask {id:string;custom_job_id:string;state:string}

@Component({selector:'app-packing-custom',standalone:true,imports:[FormsModule,DatePipe,DrawerModule],templateUrl:'./packing-custom.component.html',styleUrl:'./packing-custom.component.css'})
export class PackingCustomComponent implements OnInit {
 readonly jobs=signal<CustomJob[]>([]);readonly search=signal('');readonly loading=signal(false);readonly saving=signal(false);
 readonly files=signal<CustomRdFile[]>([]);readonly drawings=signal<CustomDrawing[]>([]);readonly tasks=signal<SentTask[]>([]);readonly selected=signal<CustomJob|null>(null);
 readonly sendingJob=signal<string|null>(null);readonly rowError=signal<{id:string;message:string}|null>(null);
 readonly fileBusy=signal('');readonly fileError=signal('');readonly fileSuccess=signal('');readonly fileCopies=new Map<string,number>();newCopies=1;
 readonly pendingDrawing=signal<{jobId:string;file:File}|null>(null);readonly cleanupPending=signal<{path:string;filename:string}|null>(null);
 readonly stateLabel=packingStateLabel;
 readonly loadError=signal('');readonly saveError=signal('');readonly success=signal('');readonly editing=signal<CustomJob|null|undefined>(undefined);
 title='';instructions='';
 constructor(private db:SupabaseService,readonly members:HubMembersService){}
 ngOnInit(){void this.load();}
 async load(){if(this.loading()||this.saving())return;this.loading.set(true);this.loadError.set('');
  try{await this.members.load();if(!this.members.manager())throw Error('Manager access is required.');
   const [jobResult,fileResult,drawingResult,taskResult]=await Promise.all([
    this.db.client.from('wc_custom_packing_jobs').select('id,title,instructions,updated_at,revision').order('updated_at',{ascending:false}),
    this.db.client.from('wc_custom_packing_rd_files').select('id,job_id,object_path,filename,size_bytes,copies,revision').order('created_at'),
    this.db.client.from('wc_custom_packing_drawings').select('id,job_id,object_path,filename,size_bytes,revision').order('created_at'),
    this.db.client.from('wc_packing_tasks').select('id,custom_job_id,state').not('custom_job_id','is',null).not('state','in','(cancelled,completed)')]);
   if(jobResult.error)throw jobResult.error;if(fileResult.error)throw fileResult.error;if(drawingResult.error)throw drawingResult.error;if(taskResult.error)throw taskResult.error;
   this.jobs.set((jobResult.data||[]) as CustomJob[]);this.files.set((fileResult.data||[]) as CustomRdFile[]);this.drawings.set((drawingResult.data||[]) as CustomDrawing[]);this.tasks.set((taskResult.data||[]) as SentTask[]);
  }catch(e){this.loadError.set(`Could not load Custom jobs. ${(e as Error)?.message||'Check the connection.'} Retry.`);}
  finally{this.loading.set(false);}
 }
 visible(){const term=this.search().trim().toLowerCase();return this.jobs().filter(job=>!term||`${job.title} ${job.instructions}`.toLowerCase().includes(term));}
 filesFor(job:CustomJob){return this.files().filter(file=>file.job_id===job.id);}
 drawingsFor(job:CustomJob){return this.drawings().filter(drawing=>drawing.job_id===job.id);}
 activeTask(job:CustomJob){return this.tasks().find(task=>task.custom_job_id===job.id);}
 copiesFor(file:CustomRdFile){return this.fileCopies.get(file.id)??file.copies;}
 drawerOpen(){return this.selected()!==null||this.editing()!==undefined;}
 onDrawerVisible(visible:boolean){if(!visible)this.closeDrawer();}
 closeDrawer(){if(this.saving()||this.fileBusy())return;this.selected.set(null);this.editing.set(undefined);this.saveError.set('');this.fileError.set('');this.fileSuccess.set('');}
 openJob(job:CustomJob){this.selected.set(job);this.editing.set(undefined);this.saveError.set('');this.fileError.set('');this.fileSuccess.set('');}
 newJob(){this.selected.set(null);this.editing.set(null);this.title='';this.instructions='';this.saveError.set('');this.success.set('');}
 edit(job:CustomJob){this.selected.set(job);this.editing.set(job);this.title=job.title;this.instructions=job.instructions;this.saveError.set('');this.success.set('');}
 closeEditor(){if(this.saving())return;if(this.editing()===null){this.closeDrawer();return;}this.editing.set(undefined);this.saveError.set('');}
 async save(){if(this.saving()||this.editing()===undefined)return;this.saveError.set('');this.success.set('');
  if(!this.title.trim()||this.title.trim().length>160){this.saveError.set('Enter a job name of 1 to 160 characters.');return;}
  if(this.instructions.length>5000){this.saveError.set('Instructions must be 5000 characters or fewer.');return;}
  this.saving.set(true);const current=this.editing();
  try{const {data,error}=await this.db.client.rpc('wc_save_custom_packing_job',{p_id:current?.id||null,p_title:this.title,p_instructions:this.instructions,p_expected:current?.revision||null});
   if(error||!data?.id||!data?.revision)throw error||Error('Server did not confirm the saved job.');
   this.jobs.update(jobs=>[data as CustomJob,...jobs.filter(job=>job.id!==data.id)]);this.selected.set(data as CustomJob);this.editing.set(undefined);this.fileSuccess.set(`Custom job “${data.title}” saved.`);this.success.set(`Custom job “${data.title}” saved.`);
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
 async uploadDrawing(event:Event,job:CustomJob){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||this.fileBusy())return;
  this.fileError.set('');this.fileSuccess.set('');this.pendingDrawing.set(null);
  if(!/\.(cdr|svg)$/i.test(file.name)){this.fileError.set(`${file.name}: choose an SVG or CDR source drawing.`);return;}
  if(!file.size||file.size>52428800){this.fileError.set(`${file.name} (${this.size(file.size)}) cannot be uploaded. File must be non-empty and at most 50 MB.`);return;}
  if(file.name.length>255){this.fileError.set(`${file.name}: filename is over 255 characters. Rename it and retry.`);return;}
  this.pendingDrawing.set({jobId:job.id,file});await this.saveDrawingUpload(file,job);
 }
 async retryDrawing(job:CustomJob){const pending=this.pendingDrawing();if(pending?.jobId!==job.id||this.fileBusy())return;await this.saveDrawingUpload(pending.file,job);}
 private async saveDrawingUpload(file:File,job:CustomJob){
  this.fileError.set('');this.fileSuccess.set('');
  this.fileBusy.set('drawing-upload');let path='',uploaded=false,attaching=false;
  try{const {data,error:authError}=await this.db.client.auth.getUser();if(authError||!data.user)throw authError||Error('Sign in again.');
   path=`${data.user.id}/${crypto.randomUUID()}`;const bucket=this.db.client.storage.from('custom-packing-drawings');
   const {error:uploadError}=await bucket.upload(path,file,{contentType:'application/octet-stream',upsert:false});if(uploadError)throw uploadError;uploaded=true;
   attaching=true;const {data:saved,error}=await this.db.client.rpc('wc_save_custom_packing_drawing',{p_job:job.id,p_path:path,p_filename:file.name,p_bytes:file.size});
   if(error||!saved?.id)throw error||Error('Server did not confirm the saved drawing.');
   this.drawings.update(rows=>[...rows,saved as CustomDrawing]);this.pendingDrawing.set(null);this.fileSuccess.set(`${file.name} uploaded and saved for managers. It will not be sent to Packing work.`);
  }catch(e){if(attaching)this.pendingDrawing.set(null);this.fileError.set(`${file.name}: ${(e as Error)?.message||'Upload failed.'} ${attaching?'Refresh to check whether it was saved, then choose it again if missing.':'Use Retry CDR upload after checking the connection.'}`);if(uploaded&&!attaching)await this.db.client.storage.from('custom-packing-drawings').remove([path]);}
  finally{this.fileBusy.set('');}
 }
 async removeDrawing(drawing:CustomDrawing){if(this.fileBusy())return;this.fileBusy.set('drawing-save');this.fileError.set('');this.fileSuccess.set('');
  try{const {data,error}=await this.db.client.rpc('wc_delete_custom_packing_drawing',{p_id:drawing.id,p_expected:drawing.revision});if(error||!data)throw error||Error('Server did not confirm removal.');this.drawings.update(rows=>rows.filter(row=>row.id!==drawing.id));const cleanup=await this.db.client.storage.from('custom-packing-drawings').remove([data]);if(cleanup.error){this.cleanupPending.set({path:data,filename:drawing.filename});this.fileError.set(`${drawing.filename} removed from the job, but storage cleanup failed. ${cleanup.error.message||'Check the connection.'} Use Retry drawing cleanup.`);}else this.fileSuccess.set(`${drawing.filename} removed.`);}
  catch(e){this.fileError.set(`Could not remove ${drawing.filename}. ${(e as Error)?.message||'Refresh and retry.'}`);}finally{this.fileBusy.set('');}
 }
 async retryDrawingCleanup(){const pending=this.cleanupPending();if(!pending||this.fileBusy())return;this.fileBusy.set('drawing-save');this.fileError.set('');try{const {error}=await this.db.client.storage.from('custom-packing-drawings').remove([pending.path]);if(error)throw error;this.cleanupPending.set(null);this.fileSuccess.set(`${pending.filename} storage cleanup complete.`);}catch(e){this.fileError.set(`Could not clean up ${pending.filename}. ${(e as Error)?.message||'Check the connection.'} Retry.`);}finally{this.fileBusy.set('');}}
 async downloadDrawing(drawing:CustomDrawing){this.fileError.set('');try{const {data,error}=await this.db.client.storage.from('custom-packing-drawings').createSignedUrl(drawing.object_path,60,{download:drawing.filename});if(error||!data)throw error||Error('Drawing unavailable.');const link=document.createElement('a');link.href=data.signedUrl;link.download=drawing.filename;link.rel='noopener';link.click();}catch(e){this.fileError.set(`Could not download ${drawing.filename}. ${(e as Error)?.message||'Retry.'}`);}}
 async send(job:CustomJob){if(this.fileBusy()||this.activeTask(job))return;this.fileBusy.set('send');this.sendingJob.set(job.id);this.fileError.set('');this.fileSuccess.set('');this.rowError.set(null);this.success.set('');
  try{const {data,error}=await this.db.client.rpc('wc_send_custom_packing_job',{p_job:job.id});if(error||!data?.id)throw error||Error('Server did not confirm the task.');this.tasks.update(rows=>[...rows,{id:data.id,custom_job_id:job.id,state:data.state}]);this.fileSuccess.set(`${job.title} sent to everyone in Packing work.`);this.success.set(`${job.title} sent to Packing work.`);}
  catch(e){const message=`Could not send ${job.title}. ${(e as Error)?.message||'Check the files and retry.'}`;this.fileError.set(message);this.rowError.set({id:job.id,message});}finally{this.fileBusy.set('');this.sendingJob.set(null);}
 }
 async cancel(task:SentTask){if(this.fileBusy())return;this.fileBusy.set('cancel');this.fileError.set('');this.fileSuccess.set('');
  try{const {data,error}=await this.db.client.rpc('wc_cancel_packing_task',{p_id:task.id});if(error||data?.state!=='cancelled')throw error||Error('Server did not confirm cancellation.');this.tasks.update(rows=>rows.filter(row=>row.id!==task.id));this.fileSuccess.set('Custom Packing task cancelled.');}
  catch(e){this.fileError.set(`Could not cancel task. ${(e as Error)?.message||'Refresh and retry.'}`);}finally{this.fileBusy.set('');}
 }
 size(bytes:number){return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
}
