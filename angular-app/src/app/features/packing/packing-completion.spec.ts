import {describe,it,expect,vi,afterEach} from 'vitest';
import {PackingWorkComponent} from './packing-work.component';
import {PackingManageComponent} from './packing-manage.component';

const task=()=>({id:'task',unit_id:'unit',order_number:'TEST-1',product_name:'Test arch',profile_signature:'profile',state:'transferred',files:Array.from({length:4},(_,i)=>({file_id:`f${i}`,box_index:0,box_name:'Box',filename:`D${i+1}.rd`,copies:1,object_path:`test/${i}`})),packages:[],assigned_at:'2026-09-29T00:00:00Z'});
function work(){const rpc=vi.fn().mockResolvedValue({data:{id:'task',state:'completed'},error:null});const c=new PackingWorkComponent({client:{rpc}} as any,{manager:()=>true} as any);c.tasks.set([task()]);return {c,rpc};}
afterEach(()=>vi.useRealTimers());
describe('Manual cutting completion',()=>{
 it('does not mark transferred files made until the operator confirms cutting',async()=>{
  const {c,rpc}=work();await c.complete(task());expect(rpc).not.toHaveBeenCalled();
  c.confirmCut('task',true);await c.complete(task());expect(rpc).toHaveBeenCalledWith('wc_complete_packing_task',{p_id:'task'});expect(c.tasks()).toEqual([]);expect(c.success()).toContain('Boxes made');
 });
 it('cannot complete a task before transfer even if a confirmation is present',async()=>{
  const {c,rpc}=work();c.confirmCut('task',true);await c.complete({...task(),state:'assigned'});expect(rpc).not.toHaveBeenCalled();
 });
 it('retains the task and confirmation after an error or unconfirmed server response',async()=>{
  const {c,rpc}=work();c.confirmCut('task',true);rpc.mockResolvedValueOnce({data:null,error:{message:'Connection lost'}});
  await c.complete(task());expect(c.tasks()).toHaveLength(1);expect(c.cutConfirmed()).toEqual(['task']);expect(c.taskError()?.message).toContain('Connection lost');expect(c.success()).toBe('');
  rpc.mockResolvedValueOnce({data:{id:'task',state:'transferred'},error:null});await c.complete(task());expect(c.tasks()).toHaveLength(1);expect(c.taskError()?.message).toContain('Server did not confirm');
 });
 it('does not queue a transfer while the station is offline',async()=>{
  const {c,rpc}=work();await c.requestTransfer({...task(),state:'assigned'});expect(rpc).not.toHaveBeenCalled();
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
