import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {PackingWorkComponent} from './packing-work.component';
import {BoxDrawingComponent} from '../shipping-data/box-drawing.component';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

async function setup(){
 let saved:any={id:'task',unit_id:'unit',order_number:'TEST-1',product_name:'Test cart',profile_signature:'profile',state:'transferred',assigned_at:'2026-09-30',cut_file_ids:[],packages:[{package_name:'Top',length_mm:100}],files:[{file_id:'f1',box_index:0,filename:'D1.rd',copies:2},{file_id:'f2',box_index:0,filename:'D2.rd',copies:1}]};
 const from=vi.fn((table:string)=>{const q:any={select:()=>q,neq:()=>q,order:()=>q,limit:()=>q,in:()=>q,then:(resolve:any)=>Promise.resolve({data:table==='wc_packing_tasks'?[structuredClone(saved)]:[],error:null}).then(resolve)};return q;});
 saved.unit={item:{image:{url:'https://example.invalid/product.jpg'}}};
 const rpc=vi.fn(async(name:string,args:any)=>{if(name==='wc_set_packing_file_done'){saved={...saved,cut_file_ids:[...saved.cut_file_ids,args.p_file]};}else saved={...saved,state:'completed'};return {data:structuredClone(saved),error:null};});
 const drawingLoad=vi.spyOn(BoxDrawingComponent.prototype,'load').mockImplementation(async function(this:BoxDrawingComponent){this.record={filename:'Top.cdr',size_bytes:18000,box_snapshot:this.box};});
 TestBed.configureTestingModule({imports:[PackingWorkComponent],providers:[{provide:SupabaseService,useValue:{client:{from,rpc,auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})}}}},{provide:HubMembersService,useValue:{load:async()=>{},manager:()=>true}}]});
 const fixture=TestBed.createComponent(PackingWorkComponent);fixture.detectChanges();await vi.waitFor(()=>expect(fixture.componentInstance.loading()).toBe(false));expect(fixture.componentInstance.error()).toBe('');fixture.detectChanges();await fixture.whenStable();
 return {fixture,c:fixture.componentInstance,rpc,drawingLoad,changeBox:()=>saved.packages[0].length_mm++};
}
afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();});
describe('Packing work viewing',()=>{
 it('requests a station restart only after confirmation and preserves tasks and Done marks',async()=>{
  const {fixture,c,rpc}=await setup();const saved=structuredClone(c.tasks());
  const control:any={station_name:'Test laptop',supervisor_seen:new Date().toISOString(),restart_id:null,restart_state:'idle',restart_error:null};
  c.stationControls.set([control]);fixture.detectChanges();c.openRestart();c.closeRestart();expect(rpc).not.toHaveBeenCalled();
  c.openRestart();rpc.mockResolvedValueOnce({data:null,error:{message:'Connection failed'}} as any);await c.confirmRestart();
  expect(c.restartOpen()).toBe(true);expect(c.restartError()).toContain('Connection failed');expect(c.tasks()).toEqual(saved);
  rpc.mockResolvedValueOnce({data:{...control,restart_id:'restart-1',restart_state:'requested'},error:null} as any);await c.confirmRestart();fixture.detectChanges();
  expect(rpc).toHaveBeenLastCalledWith('wc_request_packing_station_restart',{p_station:'Test laptop'});expect(c.restartOpen()).toBe(false);
  expect(fixture.nativeElement.textContent).toContain('Restart requested. Waiting');expect(fixture.nativeElement.textContent).not.toContain('station restart confirmed');expect(c.tasks()).toEqual(saved);
 });
 it('shows server-confirmed restart results and blocks restart requests for workers',async()=>{
  const {fixture,c,rpc}=await setup();c.stationControls.set([{station_name:'Test laptop',supervisor_seen:new Date().toISOString(),restart_id:'r',restart_state:'completed',restart_error:null}]);fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('station restart confirmed');
  vi.spyOn(c.members,'manager').mockReturnValue(false);fixture.changeDetectorRef.markForCheck();fixture.detectChanges();c.openRestart();await c.confirmRestart();
  expect(c.restartOpen()).toBe(false);expect(rpc).not.toHaveBeenCalled();expect(Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).some(button=>button.textContent==='Restart station')).toBe(false);
 });
 it('uses the original profile box and source index when displaying a standalone box drawing',async()=>{
  const {fixture,c}=await setup();const source={package_name:'Shelf',length_mm:1185,width_mm:670,height_mm:40,contents:[]};
  c.tasks.set([{...c.tasks()[0],unit_id:null,box_rd_source_key:'profile:profile:3',packages:[{...source,cutting_source_index:3,cutting_source_box:source}]}]);fixture.detectChanges();await fixture.whenStable();
  const drawing=fixture.debugElement.query(By.directive(BoxDrawingComponent)).componentInstance as BoxDrawingComponent;
  expect(drawing.index).toBe(3);expect(drawing.box).toBe(source);expect(drawing.current).not.toBeNull();
 });
 it('keeps direct box work until cancellation is separately confirmed by the server',async()=>{
  const {fixture,c,rpc}=await setup();const task={...c.tasks()[0],unit_id:null,profile_signature:null,box_rd_source_key:'cart:box',state:'assigned'};c.tasks.set([task]);fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.order').textContent).toBe('Box cutting');
  c.openCancellation(task);c.closeCancellation();expect(c.tasks()).toHaveLength(1);expect(rpc).not.toHaveBeenCalled();
  c.openCancellation(task);rpc.mockResolvedValueOnce({data:null,error:{message:'Already claimed by station'}} as any);await c.confirmCancellation();expect(c.tasks()).toHaveLength(1);expect(c.cancellationError()).toContain('Already claimed');
  rpc.mockResolvedValueOnce({data:{...task,state:'cancelled'},error:null});await c.confirmCancellation();expect(c.tasks()).toEqual([]);expect(c.cancellationTask()).toBeNull();
 });
 it('shows independent Custom work without a product drawing',async()=>{
  const custom={id:'custom-task',unit_id:null,custom_job_id:'custom-1',custom_instructions:'Cut two panels',order_number:'',product_name:'Special arch',profile_signature:null,state:'assigned',assigned_at:'2026-10-01',cut_file_ids:[],packages:[{package_name:'Custom job'}],files:[{file_id:'f1',box_index:0,filename:'D1.rd',copies:2,object_path:'owner/file'}]};
  const from=vi.fn((table:string)=>{const q:any={select:()=>q,neq:()=>q,order:()=>q,limit:()=>q,then:(resolve:any)=>Promise.resolve({data:table==='wc_packing_tasks'?[custom]:[],error:null}).then(resolve)};return q;});
  TestBed.configureTestingModule({imports:[PackingWorkComponent],providers:[
   {provide:SupabaseService,useValue:{client:{from,auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})}}}},
   {provide:HubMembersService,useValue:{load:async()=>{},manager:()=>true}}
  ]});
  const fixture=TestBed.createComponent(PackingWorkComponent);fixture.detectChanges();
  await vi.waitFor(()=>expect(fixture.componentInstance.loading()).toBe(false));fixture.detectChanges();
  const card=fixture.nativeElement.querySelector('.task') as HTMLElement;
  expect(card.textContent).toContain('Custom job');expect(card.textContent).toContain('Special arch');expect(card.textContent).toContain('Cut two panels');
  expect(card.querySelector('app-box-drawing')).toBeNull();expect(card.textContent).toContain('D1.rd');
 });
 it('keeps drawing controls stable during polling and progress saves but reloads changed boxes',async()=>{
  const {fixture,c,drawingLoad,changeBox}=await setup();const drawing=fixture.nativeElement.querySelector('app-box-drawing button');
  expect(drawingLoad).toHaveBeenCalledOnce();await c.load(true);fixture.detectChanges();await fixture.whenStable();
  expect(drawingLoad).toHaveBeenCalledOnce();expect(fixture.nativeElement.querySelector('app-box-drawing button')).toBe(drawing);
  await c.saveFileCut(c.tasks()[0],c.tasks()[0].files[0],true);fixture.detectChanges();await fixture.whenStable();expect(drawingLoad).toHaveBeenCalledOnce();
  changeBox();await c.load(true);fixture.detectChanges();await fixture.whenStable();expect(drawingLoad).toHaveBeenCalledTimes(2);
 });
 it('shows a Copy header and numeric quantities; cancelling the last-file dialog keeps the task',async()=>{
  const {fixture,c,rpc}=await setup();expect(fixture.nativeElement.querySelector('.file-head').textContent).toContain('Copy');expect(fixture.nativeElement.querySelector('.file-head').textContent).toContain('Status');
  const photo=fixture.nativeElement.querySelector('.product-image img') as HTMLImageElement;expect(photo.src).toBe('https://example.invalid/product.jpg');expect(photo.alt).toBe('Test cart');photo.dispatchEvent(new Event('error'));fixture.detectChanges();expect(fixture.nativeElement.querySelector('.product-image svg')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('.file-done').textContent).not.toContain('Done');
  expect(Array.from(fixture.nativeElement.querySelectorAll('.file strong') as NodeListOf<HTMLElement>).map(el=>el.textContent)).toEqual(['2','1']);
  for(const file of c.tasks()[0].files)await c.saveFileCut(c.tasks()[0],file,true);
  fixture.detectChanges();await fixture.whenStable();
  const dialog=document.body.querySelector('[role="dialog"]')!;expect(dialog.textContent).toContain('Confirm boxes made');expect(dialog.textContent).toContain('TEST-1');
  Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent==='Keep task open')!.click();fixture.detectChanges();await fixture.whenStable();
  expect(c.tasks()).toHaveLength(1);expect(c.cutCount(c.tasks()[0])).toBe(2);expect(rpc).toHaveBeenCalledTimes(2);
  const reopen=Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button=>button.textContent==='Confirm boxes made')!;reopen.click();fixture.detectChanges();await fixture.whenStable();
  Array.from(document.body.querySelector('[role="dialog"]')!.querySelectorAll('button')).find(button=>button.textContent==='Confirm boxes made')!.click();fixture.detectChanges();await fixture.whenStable();expect(c.tasks()).toEqual([]);
 });
});
