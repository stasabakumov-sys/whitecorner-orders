import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {PackingManageComponent} from './packing-manage.component';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';

async function setup(){
 TestBed.configureTestingModule({imports:[PackingManageComponent],providers:[provideRouter([]),
  {provide:SupabaseService,useValue:{}},{provide:HubMembersService,useValue:{manager:()=>true}},
 ]});
 const fixture=TestBed.createComponent(PackingManageComponent),component=fixture.componentInstance;
 vi.spyOn(component,'load').mockResolvedValue();
 const item={id:'item',wix_line_item_id:'test-line',product_name:'Test Arch',wix_options:{Size:'2m x 1m',Foldable:'Yes'}};
 const row={unit_id:'unit',order_number:'TEST-1',product_name:item.product_name,production_status:'New',product_id:'product',item_id:item.id,item};
 const signature=variantSignature(item);
 component.candidates.set([row]);
 component.profiles.set([{signature,shipping_product_id:'product',packages:[{package_name:'Arch box'}],template_item:item}]);
 component.rdFiles.set([{id:'file',profile_signature:signature,box_index:0,filename:'arch.rd',copies:2}]);
 fixture.detectChanges();await fixture.whenStable();
 const open=async()=>{Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button=>button.textContent==='Details')!.click();fixture.detectChanges();await fixture.whenStable();};
 return {fixture,component,open,row};
}

afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();});
describe('Packing details',()=>{
 it('opens uploaded RD files in a modal outside the table and supports closing and reopening',async()=>{
  const {fixture,component,open}=await setup();await open();
  let dialog=document.body.querySelector('[role="complementary"]')!;
  expect(dialog).not.toBeNull();expect(fixture.nativeElement.querySelector('.table-wrap')!.contains(dialog)).toBe(false);
  expect(dialog.textContent).toContain('TEST-1');expect(dialog.textContent).toContain('arch.rd');expect(dialog.textContent).toContain('2 cuts');
  (dialog.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();fixture.detectChanges();await fixture.whenStable();
  expect(component.selected()).toBeNull();
  await open();dialog=document.body.querySelector('[role="complementary"]')!;expect(dialog.textContent).toContain('arch.rd');
 });
 it('shows a visible explanation when no profile matches',async()=>{
  const {component,open}=await setup();component.profiles.set([]);await open();
  expect(document.body.querySelector('[role="complementary"] [role="alert"]')?.textContent).toContain('No saved Packing profile');
 });
 it('keeps operation errors visible inside the open details panel',async()=>{
  const {component,fixture,open}=await setup();await open();component.error.set('Could not send. Retry after checking the connection.');fixture.detectChanges();
  expect(document.body.querySelector('[role="complementary"] [role="alert"]')?.textContent).toContain('Could not send');
 });
});
