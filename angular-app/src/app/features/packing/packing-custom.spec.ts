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
});
