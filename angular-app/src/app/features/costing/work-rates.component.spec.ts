import {describe,expect,it,vi} from 'vitest';
import {emptyWorkRates,WorkRatesComponent} from './work-rates.component';

describe('Work Rates initial rendering',()=>{
 it('provides all work rows before the database request finishes',async()=>{
  let resolveQuery!:(value:any)=>void;
  const pending=new Promise(resolve=>{resolveQuery=resolve;});
  const db={client:{from:()=>({select:()=>({order:()=>({abortSignal:()=>pending})})})}};
  const component=new WorkRatesComponent(db as any);
  const loading=component.load();
  expect(component.loading()).toBe(true);
  expect(component.rows.map(row=>row.label)).toEqual(['CNC','Assembly','Sanding','Painting']);
  resolveQuery({data:emptyWorkRates(),error:null});
  await loading;
  expect(component.loading()).toBe(false);
 });
 it('stops waiting and offers a retry when the request stalls',async()=>{
  vi.useFakeTimers();
  try{
   const db={client:{from:()=>({select:()=>({order:()=>({abortSignal:()=>new Promise(()=>{})})})})}};
   const component=new WorkRatesComponent(db as any);
   const loading=component.load();
   await vi.advanceTimersByTimeAsync(10000);
   await loading;
   expect(component.loading()).toBe(false);
   expect(component.error()).toContain('taking too long');
  }finally{vi.useRealTimers();}
 });
});
