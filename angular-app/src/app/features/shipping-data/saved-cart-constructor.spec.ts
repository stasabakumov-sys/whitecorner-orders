import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {signal} from '@angular/core';
import {describe,it,expect,vi} from 'vitest';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {SavedPackingComponent} from './saved-packing.component';
import {CartBoxConstructorComponent} from './cart-box-constructor.component';
import {PackingFilesCellComponent} from './packing-files-cell.component';

const boxes=[
 {package_name:'Top/Bottom/Shelf',length_mm:1230,width_mm:630,height_mm:90,weight_kg:20,contents:[{component_key:'main',unit_index:1}]},
 {package_name:'Front/Sides',length_mm:1190,width_mm:800,height_mm:60,weight_kg:17,contents:[{component_key:'main',unit_index:1}]}
];
async function setup(failed=false,type='Cart',manager=true){
 const query:any={select:()=>query,eq:()=>query,order:()=>query,then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};
 const rpc=vi.fn(async(_name:string,params:any)=>({data:params.p_index===0?'base-box':null,error:failed?{message:'Unavailable'}:null}));
 const from=vi.fn(()=>query);
 TestBed.configureTestingModule({providers:[
  {provide:SupabaseService,useValue:{client:{from,rpc}}},
  {provide:HubMembersService,useValue:{manager:signal(manager)}}
 ]});
 const fixture=TestBed.createComponent(SavedPackingComponent);
 fixture.componentRef.setInput('product',{id:'cart',product_name:type==='Cart'?'Classic Cart':'Serving cabinet',product_type:type});
 fixture.componentRef.setInput('profile',{signature:'exact-order-size-and-shelf',packages:structuredClone(boxes),template_item:{id:'cart',product_name:'Classic Cart',wix_options:{Size:'Size I','Internal Shelf':'Yes'}}});
 fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
 return {fixture,rpc,from,constructors:()=>fixture.debugElement.queryAll(By.directive(CartBoxConstructorComponent)).map(node=>node.componentInstance as CartBoxConstructorComponent)};
}

describe('Constructor in saved Cart configuration packing',()=>{
 it('uses the exact shared Base box when resolved and the exact profile index for a custom box',async()=>{
  const s=await setup();
  await vi.waitFor(()=>{
   s.fixture.detectChanges();
   expect(s.constructors()[0].box.id).toBe('base-box');
  });
  const [base,custom]=s.constructors();
  expect(base.box).toEqual({...boxes[0],id:'base-box'});expect(base.profileSignature).toBe('');
  expect(custom.box).toEqual(boxes[1]);expect(custom.profileSignature).toBe('exact-order-size-and-shelf');expect(custom.profileIndex).toBe(1);
  expect(s.fixture.componentInstance.profile.packages).toEqual(boxes);
  for(const name of boxes.map(box=>'Create SVG and RD for '+box.package_name)){
   const button=s.fixture.nativeElement.querySelector(`[aria-label="${name}"]`);
   expect(button).not.toBeNull();expect(button.disabled).toBe(false);
   expect(button.closest('td').querySelector('app-packing-files-cell')).not.toBeNull();
  }
  s.fixture.destroy();
 });
 it('refreshes both file checks after Constructor saves and hides Constructor during dimension editing',async()=>{
  const s=await setup();s.constructors()[0].filesSaved.emit();s.fixture.detectChanges();await s.fixture.whenStable();s.fixture.detectChanges();
  const cells=s.fixture.debugElement.queryAll(By.directive(PackingFilesCellComponent)).map(node=>node.componentInstance as PackingFilesCellComponent);
  expect(cells).toHaveLength(4);expect(cells.every(cell=>cell.refreshVersion===1)).toBe(true);
  s.fixture.nativeElement.querySelector('[aria-label="Edit packaging"]').click();s.fixture.detectChanges();await s.fixture.whenStable();
  expect(s.constructors()).toHaveLength(0);s.fixture.destroy();
 });
 it('blocks opening when the shared-box identity cannot be checked',async()=>{
  const s=await setup(true);
  expect(s.constructors().every(component=>component.locked)).toBe(true);
  expect(s.fixture.nativeElement.querySelector('[aria-label="Create SVG and RD for Top/Bottom/Shelf"]').disabled).toBe(true);
  expect(s.fixture.nativeElement.textContent).toContain('Could not check files');s.fixture.destroy();
 });
 it('does not expose manager Constructor actions for workers or non-Cart profiles',async()=>{
  const s=await setup(false,'Cart',false);
  expect(s.fixture.nativeElement.querySelector('[aria-label^="Create SVG and RD"]')).toBeNull();s.fixture.destroy();TestBed.resetTestingModule();
  const other=await setup(false,'Other');expect(other.constructors()).toHaveLength(0);other.fixture.destroy();
 });
});
