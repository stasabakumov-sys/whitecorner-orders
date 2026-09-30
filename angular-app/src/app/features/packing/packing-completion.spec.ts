import {describe,it,expect,vi,afterEach} from 'vitest';
import {PackingWorkComponent} from './packing-work.component';
import {PackingManageComponent} from './packing-manage.component';

const task=()=>({id:'task',unit_id:'unit',order_number:'TEST-1',product_name:'Test arch',profile_signature:'profile',state:'transferred',files:Array.from({length:4},(_,i)=>({file_id:`f${i}`,box_index:0,box_name:'Box',filename:`D${i+1}.rd`,copies:1,object_path:`test/${i}`})),cut_file_ids:[],packages:[],assigned_at:'2026-09-29T00:00:00Z'});
function work(){const rpc=vi.fn();const c=new PackingWorkComponent({client:{rpc}} as any,{manager:()=>true} as any);c.tasks.set([task()]);return {c,rpc};}
afterEach(()=>vi.useRealTimers());
describe('Manual cutting progress',()=>{
 it('saves each file and keeps three checked files on the task',async()=>{
  const {c,rpc}=work();
  for(let index=0;index<3;index++){
   const current=c.tasks()[0];const next=[...current.cut_file_ids,current.files[index].file_id];
   rpc.mockResolvedValueOnce({data:{...current,cut_file_ids:next},error:null});
   await c.saveFileCut(current,current.files[index],true);
  }
  expect(c.cutCount(c.tasks()[0])).toBe(3);expect(c.tasks()[0].state).toBe('transferred');
  expect(rpc).toHaveBeenCalledWith('wc_set_packing_file_done',{p_task:'task',p_file:'f2',p_done:true});
  const saved=c.tasks()[0];c.tasks.set([saved]);expect(c.fileDone(c.tasks()[0],saved.files[2])).toBe(true);
 });
 it('keeps all checked files open until completion is explicitly confirmed',async()=>{
  const {c,rpc}=work();const current={...task(),cut_file_ids:['f0','f1','f2']};c.tasks.set([current]);
  rpc.mockResolvedValueOnce({data:{...current,cut_file_ids:['f0','f1','f2','f3']},error:null});
  await c.saveFileCut(current,current.files[3],true);
  expect(c.tasks()).toHaveLength(1);expect(c.completionTask()?.id).toBe('task');expect(rpc).toHaveBeenCalledTimes(1);
  c.closeCompletion();expect(c.completionTask()).toBeNull();expect(c.cutCount(c.tasks()[0])).toBe(4);
  c.openCompletion(c.tasks()[0]);rpc.mockResolvedValueOnce({data:{...c.tasks()[0],state:'completed'},error:null});
  await c.confirmCompletion();expect(rpc).toHaveBeenLastCalledWith('wc_complete_packing_task',{p_id:'task'});
  expect(c.tasks()).toEqual([]);expect(c.completionTask()).toBeNull();expect(c.success()).toContain('Boxes made confirmed');
 });
 it('keeps confirmation open and progress saved when closing fails',async()=>{
  const {c,rpc}=work();const current={...task(),cut_file_ids:['f0','f1','f2','f3']};c.tasks.set([current]);c.openCompletion(current);
  let finish:any;rpc.mockReturnValueOnce(new Promise(resolve=>finish=resolve));const saving=c.confirmCompletion();
  c.closeCompletion();await c.confirmCompletion();expect(c.completionTask()).toBe(current);expect(rpc).toHaveBeenCalledOnce();
  finish({data:null,error:{message:'Connection lost'}});await saving;
  expect(c.completionError()).toContain('Connection lost');expect(c.cutCount(c.tasks()[0])).toBe(4);expect(c.completionTask()).toBe(current);
 });
 it('does not offer confirmation before all files are saved',()=>{
  const {c}=work();c.openCompletion(task());expect(c.completionTask()).toBeNull();
 });
 it('retains saved progress and restores the checkbox after a save failure',async()=>{
  const {c,rpc}=work();const current={...task(),cut_file_ids:['f0','f1','f2']};c.tasks.set([current]);
  const input={checked:true} as HTMLInputElement;
  rpc.mockResolvedValueOnce({data:null,error:{message:'Connection lost'}});
  await c.saveFileCut(current,current.files[3],true,input);
  expect(input.checked).toBe(false);expect(c.cutCount(c.tasks()[0])).toBe(3);
  expect(c.taskError()?.message).toContain('Connection lost');expect(c.success()).toBe('');
 });
 it('rejects marking a file done before transfer',async()=>{
  const {c,rpc}=work();await c.saveFileCut({...task(),state:'assigned'},task().files[0],true);expect(rpc).not.toHaveBeenCalled();
 });
 it('does not queue a transfer while the station is offline',async()=>{
  const {c,rpc}=work();await c.requestTransfer({...task(),state:'assigned'});expect(rpc).not.toHaveBeenCalled();
 });
 it('allows reloading a transferred task without losing saved cutting progress',async()=>{
  const {c,rpc}=work();c.stations.set([{station_name:'Test',last_seen:new Date().toISOString()}]);c.tasks.set([{...task(),cut_file_ids:['f0']}]);
  rpc.mockResolvedValueOnce({data:null,error:{message:'Offline'}});await c.requestTransfer(task());
  expect(c.tasks()[0].state).toBe('transferred');expect(c.tasks()[0].cut_file_ids).toEqual(['f0']);
  rpc.mockResolvedValueOnce({data:{id:'reload'},error:null});await c.requestTransfer(task());
  expect(c.tasks()[0].state).toBe('transfer_requested');expect(c.tasks()[0].cut_file_ids).toEqual(['f0']);
  rpc.mockClear();await c.requestTransfer({...task(),state:'completed'});expect(rpc).not.toHaveBeenCalled();
 });
});
describe('Manage Packing status updates',()=>{
 function manage(){const query=vi.fn().mockResolvedValue({data:[{...task(),state:'completed',completed_at:'2026-09-29T01:00:00Z'}],error:null});const c=new PackingManageComponent({client:{from:()=>({select:()=>({neq:query})})}} as any,{manager:()=>true} as any);return {c,query};}
 it('refreshes completion without clearing the search or selected profile',async()=>{
  const {c}=manage();c.search.set('TEST');c.profileSignature='chosen';await c.refreshTasks();
  expect(c.stateLabel(c.tasks()[0].state)).toBe('Boxes made');expect(c.tasks()[0].completed_at).toBeTruthy();expect(c.search()).toBe('TEST');expect(c.profileSignature).toBe('chosen');
 });
 it('keeps saved status visible when refreshing fails',async()=>{
  const {c,query}=manage();await c.refreshTasks();query.mockResolvedValue({data:null,error:{message:'Network lost'}});await c.refreshTasks();
  expect(c.tasks()[0].state).toBe('completed');expect(c.taskSyncError()).toContain('Network lost');
 });
 it('polls every ten seconds and stops when the manager leaves the page',async()=>{
  vi.useFakeTimers();const {c}=manage();vi.spyOn(c,'load').mockResolvedValue();const refresh=vi.spyOn(c,'refreshTasks').mockResolvedValue();c.ngOnInit();await vi.advanceTimersByTimeAsync(10000);expect(refresh).toHaveBeenCalledTimes(1);c.ngOnDestroy();await vi.advanceTimersByTimeAsync(10000);expect(refresh).toHaveBeenCalledTimes(1);
 });
});
