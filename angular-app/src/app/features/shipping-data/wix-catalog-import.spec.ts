import {TestBed} from '@angular/core/testing';
import {describe,it,expect} from 'vitest';
import {WixCatalogImportComponent} from './wix-catalog-import.component';
describe('Catalogue import progress',()=>{
 it('resumes server progress after failure without restarting and reports completion only on confirmation',async()=>{
  const requests:any[]=[];let fail=true;
  const db:any={client:{functions:{invoke:async(_:string,{body}:any)=>{
   requests.push(body);
   if(fail)return{error:{context:{json:async()=>({error:'Wix temporarily unavailable'})}}};
   return{data:{ok:true,run_id:'run',next_offset:178,expected_total:178,complete:true}};
  }}}};
  const c=TestBed.runInInjectionContext(()=>new WixCatalogImportComponent(db));
  await c.run(false);expect(c.error()).toContain('temporarily');expect(c.message()).not.toContain('complete');
  fail=false;await c.run(false);expect(c.message()).toContain('178 / 178');expect(c.message()).toContain('complete');
  expect(requests.every(r=>r.restart===false)).toBe(true);
 });
 it('does not loop forever when a page stops advancing',async()=>{
  let calls=0;
  const db:any={client:{functions:{invoke:async()=>{calls++;return{data:{ok:true,run_id:'run',next_offset:25,expected_total:178,complete:false}};}}}};
  const c=TestBed.runInInjectionContext(()=>new WixCatalogImportComponent(db));await c.run(false);
  expect(calls).toBe(2);expect(c.error()).toContain('stalled');expect(c.busy()).toBe(false);
 });
});
