import {describe,expect,it} from 'vitest';
import {emptyWorkRates,WorkRatesComponent} from './work-rates.component';

describe('Work Rates initial rendering',()=>{
 it('provides all work rows before the database request finishes',()=>{
  let resolveQuery!:(value:any)=>void;
  const pending=new Promise(resolve=>{resolveQuery=resolve;});
  const db={client:{from:()=>({select:()=>({order:()=>pending})})}};
  const component=new WorkRatesComponent(db as any);
  component.ngOnInit();
  expect(component.loading).toBe(true);
  expect(component.rows.map(row=>row.label)).toEqual(['CNC','Assembly','Sanding','Painting']);
  resolveQuery({data:emptyWorkRates(),error:null});
 });
});
