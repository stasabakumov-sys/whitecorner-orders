import {describe,expect,it,vi} from 'vitest';
import {PackingFilesCellComponent} from './packing-files-cell.component';
import {TestBed} from '@angular/core/testing';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

function setup(data:any[],error:any=null){
 const eq=vi.fn().mockResolvedValue({data,error}),select=vi.fn().mockReturnValue({eq}),from=vi.fn().mockReturnValue({select});
 const c=new PackingFilesCellComponent({client:{from}} as any,{markForCheck:vi.fn()} as any);
 c.box={id:'box',package_name:'Shelf',package_no:1,length_mm:300,width_mm:200,height_mm:40,weight_kg:5};
 return {c,from,eq};
}
describe('Cart file presence columns',()=>{
 it('opens the RD editor from its cell without rendering file controls in the table',async()=>{
  TestBed.resetTestingModule();
  const response=Promise.resolve({data:[],error:null}),query:any={select:()=>query,eq:()=>query,order:()=>response,then:response.then.bind(response)};
  await TestBed.configureTestingModule({imports:[PackingFilesCellComponent],providers:[{provide:SupabaseService,useValue:{client:{from:()=>query}}},{provide:HubMembersService,useValue:{manager:()=>true}}]}).compileComponents();
  const fixture=TestBed.createComponent(PackingFilesCellComponent);fixture.componentRef.setInput('box',{id:'shelf',package_name:'Shelf',package_no:1});
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  expect(document.querySelector('input[aria-label="Add RD file"]')).toBeNull();
  fixture.nativeElement.querySelector('button.edit').click();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('RD · Shelf · Box 1');
  expect(document.querySelector('input[aria-label="Add RD file"]')).not.toBeNull();
  fixture.destroy();
 });
 it('shows RD presence independently of file count and looks up this reusable box',async()=>{
  const {c,from,eq}=setup([{id:'rd1'},{id:'rd2'}]);await c.load();
  expect(c.present).toBe(true);expect(c.label).toBe('RD: file uploaded');expect(from).toHaveBeenCalledWith('wc_box_rd_files');expect(eq).toHaveBeenCalledWith('cart_base_package_id','box');
 });
 it('checks CDR geometry, retaining the check after weight changes but hiding an outdated drawing',async()=>{
  const {c}=setup([{cart_base_package_id:'box',box_snapshot:{package_name:'Shelf',length_mm:300,width_mm:200,height_mm:40}}]);c.kind='cdr';
  await c.load();expect(c.present).toBe(true);c.box.weight_kg=10;await c.load();expect(c.present).toBe(true);
  c.box.length_mm=301;await c.load();expect(c.present).toBe(false);
 });
 it('distinguishes a failed check from no saved file and supports retry',async()=>{
  const {c,eq}=setup([],new Error('offline'));await c.load();expect(c.error).toBe(true);expect(c.label).toBe('RD: check failed');
  eq.mockResolvedValue({data:[],error:null});await c.load();expect(c.error).toBe(false);expect(c.label).toBe('RD: no saved file');
 });
});

describe('Shared and profile-local packaging file ownership',()=>{
 function cell(){const eq=vi.fn();const response=Promise.resolve({data:[{id:'rd'}],error:null});const query:any={select:()=>query,eq:(...args:any[])=>{eq(...args);return query;},then:response.then.bind(response)};const rpc=vi.fn().mockResolvedValue({data:null,error:null});const c=new PackingFilesCellComponent({client:{rpc,from:()=>query}} as any,{markForCheck:vi.fn()} as any);return {c,rpc,eq};}
 it('uses exact Backdrop Size + Foldable ownership without Cart resolution',async()=>{const {c,rpc,eq}=cell();c.sharedSize='2000x1000:foldable';await c.load();expect(c.present).toBe(true);expect(rpc).not.toHaveBeenCalled();expect(eq).toHaveBeenCalledWith('backdrop_size_key','2000x1000:foldable');});
 it('uses signature and box index when custom packaging has no shared Cart owner',async()=>{const {c,rpc,eq}=cell();c.signature='custom';c.index=2;await c.load();expect(c.present).toBe(true);expect(rpc).toHaveBeenCalledWith('wc_cart_base_package',{p_signature:'custom',p_index:2});expect(eq).toHaveBeenCalledWith('profile_signature','custom');expect(eq).toHaveBeenCalledWith('box_index',2);});
});
