import {describe,it,expect,vi} from 'vitest';
import {PackingCustomComponent} from './packing-custom.component';
import {TestBed} from '@angular/core/testing';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

function setup(){const rpc=vi.fn();const component=new PackingCustomComponent({client:{rpc}} as any,{manager:()=>true} as any);return {component,rpc};}

describe('Custom Packing jobs',()=>{
 it('keeps the draft and reports a server save failure',async()=>{
  const {component,rpc}=setup();component.newJob();component.title='Special arch';component.instructions='Cut four panels';
  rpc.mockResolvedValueOnce({data:null,error:{message:'Connection lost'}});await component.save();
  expect(component.editing()).toBeNull();expect(component.title).toBe('Special arch');expect(component.instructions).toBe('Cut four panels');
  expect(component.saveError()).toContain('Connection lost');expect(component.jobs()).toEqual([]);
 });
 it('saves the job before exposing its RD file editor and sends its saved ID',async()=>{
  const {component,rpc}=setup();component.newJob();component.title='Special arch';
  const job={id:'job-1',title:'Special arch',instructions:'',revision:'rev-1',updated_at:'2026-10-01'};
  rpc.mockResolvedValueOnce({data:job,error:null});await component.save();
  expect(component.selected()?.id).toBe('job-1');expect(component.jobs()).toEqual([job]);
  component.files.set([{id:'file-1',job_id:'job-1',object_path:'owner/file',filename:'D1.rd',size_bytes:10,copies:2,revision:'rev-f'}]);
  component.drawings.set([{id:'drawing-1',job_id:'job-1',object_path:'owner/drawing',filename:'Source.cdr',size_bytes:10,revision:'rev-d'}]);
  rpc.mockResolvedValueOnce({data:{id:'task-1',state:'assigned'},error:null});await component.send(job);
  expect(rpc).toHaveBeenLastCalledWith('wc_send_custom_packing_job',{p_job:'job-1'});
  expect(component.activeTask(job)?.id).toBe('task-1');
 });
 it('rejects an oversized RD file before upload and names the limit',async()=>{
  const {component,rpc}=setup();const job={id:'job-1',title:'Test',instructions:'',revision:'rev',updated_at:''};
  const input={files:[{name:'Huge.rd',size:20971521}],value:'chosen'} as unknown as HTMLInputElement;
  await component.upload({target:input} as unknown as Event,job);
  expect(component.fileError()).toContain('Huge.rd');expect(component.fileError()).toContain('20 MB');expect(rpc).not.toHaveBeenCalled();
 });
 it('validates CDR size and keeps the manager drawing separate from the laser files',async()=>{
  const {component,rpc}=setup();const job={id:'job-1',title:'Test',instructions:'',revision:'rev',updated_at:''};
  const input={files:[{name:'Source.cdr',size:52428801}],value:'chosen'} as unknown as HTMLInputElement;
  await component.uploadDrawing({target:input} as unknown as Event,job);
  expect(component.fileError()).toContain('Source.cdr');expect(component.fileError()).toContain('50 MB');expect(rpc).not.toHaveBeenCalled();
  expect(component.drawings()).toEqual([]);expect(component.files()).toEqual([]);
 });
 it('shows a failed CDR save beside the upload and preserves the source job',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'Storage unavailable'}});
  const upload=vi.fn().mockResolvedValue({error:null});
  const component=new PackingCustomComponent({client:{rpc,auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},storage:{from:()=>({upload})}}} as any,{manager:()=>true} as any);
  const job={id:'job-1',title:'Test',instructions:'',revision:'rev',updated_at:''};
  const input={files:[{name:'Source.cdr',size:12}],value:'chosen'} as unknown as HTMLInputElement;
  await component.uploadDrawing({target:input} as unknown as Event,job);
  expect(upload).toHaveBeenCalledOnce();expect(rpc).toHaveBeenCalledWith('wc_save_custom_packing_drawing',expect.objectContaining({p_job:'job-1',p_filename:'Source.cdr',p_bytes:12}));
  expect(component.fileError()).toContain('Storage unavailable');expect(component.drawings()).toEqual([]);
 });
 it('saves an uploaded CDR as a manager drawing, separate from RD cutting files',async()=>{
  const drawing={id:'drawing-1',job_id:'job-1',object_path:'owner/drawing',filename:'Source.cdr',size_bytes:12,revision:'rev-d'};
  const rpc=vi.fn().mockResolvedValue({data:drawing,error:null});
  const upload=vi.fn().mockResolvedValue({error:null});
  const component=new PackingCustomComponent({client:{rpc,auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},storage:{from:()=>({upload})}}} as any,{manager:()=>true} as any);
  const job={id:'job-1',title:'Test',instructions:'',revision:'rev',updated_at:''};
  const input={files:[{name:'Source.cdr',size:12}],value:'chosen'} as unknown as HTMLInputElement;
  await component.uploadDrawing({target:input} as unknown as Event,job);
  expect(component.drawings()).toEqual([drawing]);expect(component.files()).toEqual([]);
  expect(component.fileSuccess()).toContain('not be sent to Packing work');
 });
 it('keeps a CDR available for retry after the storage upload fails',async()=>{
  const drawing={id:'drawing-1',job_id:'job-1',object_path:'owner/drawing',filename:'Source.cdr',size_bytes:12,revision:'rev-d'};
  const upload=vi.fn().mockResolvedValueOnce({error:{message:'Network lost'}}).mockResolvedValueOnce({error:null});
  const component=new PackingCustomComponent({client:{rpc:vi.fn().mockResolvedValue({data:drawing,error:null}),auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},storage:{from:()=>({upload})}}} as any,{manager:()=>true} as any);
  const job={id:'job-1',title:'Test',instructions:'',revision:'rev',updated_at:''};
  const input={files:[{name:'Source.cdr',size:12}],value:'chosen'} as unknown as HTMLInputElement;
  await component.uploadDrawing({target:input} as unknown as Event,job);
  expect(component.pendingDrawing()?.file.name).toBe('Source.cdr');expect(component.fileError()).toContain('Network lost');
  await component.retryDrawing(job);
  expect(component.drawings()).toEqual([drawing]);expect(component.pendingDrawing()).toBeNull();expect(component.fileError()).toBe('');
 });
 it('opens the new job form from the Add icon',async()=>{
  const query:any={select:()=>query,order:()=>query,not:()=>query,then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};
  TestBed.configureTestingModule({imports:[PackingCustomComponent],providers:[
   {provide:SupabaseService,useValue:{client:{from:()=>query}}},
   {provide:HubMembersService,useValue:{load:async()=>{},manager:()=>true}}
  ]});
  const fixture=TestBed.createComponent(PackingCustomComponent);fixture.detectChanges();
  await vi.waitFor(()=>expect(fixture.componentInstance.loading()).toBe(false));fixture.detectChanges();
  (fixture.nativeElement.querySelector('[aria-label="Add Custom job"]') as HTMLButtonElement).click();fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('input[name="title"]')).not.toBeNull();
  TestBed.resetTestingModule();
 });
 it('opens the right-hand card from the job name and keeps Edit inside it',async()=>{
  const job={id:'job-1',title:'Ungles 73mm',instructions:'Manager note',revision:'rev-1',updated_at:'2026-10-01'};
  const file={id:'file-1',job_id:job.id,object_path:'owner/file',filename:'Ungles.rd',size_bytes:10,copies:1,revision:'rev-f'};
  const query=(table:string)=>{const chain:any={select:()=>chain,order:()=>chain,not:()=>chain,then:(resolve:any)=>Promise.resolve({data:table==='wc_custom_packing_jobs'?[job]:table==='wc_custom_packing_rd_files'?[file]:[],error:null}).then(resolve)};return chain;};
  TestBed.configureTestingModule({imports:[PackingCustomComponent],providers:[
   {provide:SupabaseService,useValue:{client:{from:query}}},
   {provide:HubMembersService,useValue:{load:async()=>{},manager:()=>true}}
  ]});
  const fixture=TestBed.createComponent(PackingCustomComponent);fixture.detectChanges();
  await vi.waitFor(()=>expect(fixture.componentInstance.loading()).toBe(false));fixture.detectChanges();
  const row=fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
  expect(row.querySelector('.number-col')?.textContent?.trim()).toBe('1');
  expect(row.querySelectorAll('.file-check')).toHaveLength(1);
  expect(row.querySelectorAll('.file-empty')).toHaveLength(1);
  expect(row.querySelector('[aria-label="Edit Ungles 73mm"]')).toBeNull();
  (row.querySelector('[aria-label="Open Ungles 73mm"]') as HTMLButtonElement).click();fixture.detectChanges();
  expect(fixture.componentInstance.drawerOpen()).toBe(true);
  const edit=fixture.nativeElement.querySelector('[aria-label="Edit Ungles 73mm"]') as HTMLButtonElement;
  expect(edit).not.toBeNull();edit.click();fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('input[name="title"]')).not.toBeNull();
  expect(row.querySelector('[aria-label="Edit Ungles 73mm"]')).toBeNull();
  TestBed.resetTestingModule();
 });
 it('sends from the table row and shows a failed send beside that row',async()=>{
  const job={id:'job-1',title:'Ungles 73mm',instructions:'',revision:'rev-1',updated_at:'2026-10-01'};
  const file={id:'file-1',job_id:job.id,object_path:'owner/file',filename:'Ungles.rd',size_bytes:10,copies:1,revision:'rev-f'};
  const query=(table:string)=>{const chain:any={select:()=>chain,order:()=>chain,not:()=>chain,then:(resolve:any)=>Promise.resolve({data:table==='wc_custom_packing_jobs'?[job]:table==='wc_custom_packing_rd_files'?[file]:[],error:null}).then(resolve)};return chain;};
  const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{message:'Connection lost'}}).mockResolvedValueOnce({data:{id:'task-1',state:'assigned'},error:null});
  TestBed.configureTestingModule({imports:[PackingCustomComponent],providers:[
   {provide:SupabaseService,useValue:{client:{from:query,rpc}}},
   {provide:HubMembersService,useValue:{load:async()=>{},manager:()=>true}}
  ]});
  const fixture=TestBed.createComponent(PackingCustomComponent);fixture.detectChanges();
  await vi.waitFor(()=>expect(fixture.componentInstance.loading()).toBe(false));fixture.detectChanges();
  const send=fixture.nativeElement.querySelector('[aria-label="Send Ungles 73mm to Packing work"]') as HTMLButtonElement;
  expect(send).not.toBeNull();expect(send.disabled).toBe(false);send.click();
  await vi.waitFor(()=>expect(fixture.componentInstance.rowError()?.message).toContain('Connection lost'));fixture.detectChanges();
  expect((fixture.nativeElement.querySelector('.row-error') as HTMLElement).textContent).toContain('Connection lost');
  send.click();await vi.waitFor(()=>expect(fixture.componentInstance.activeTask(job)?.id).toBe('task-1'));fixture.detectChanges();
  expect(send.disabled).toBe(true);expect(send.textContent).toContain('Sent');expect(rpc).toHaveBeenCalledTimes(2);
  TestBed.resetTestingModule();
 });
});
