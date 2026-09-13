import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {describe,it,expect,vi} from 'vitest';
import {PackageDrawingsComponent} from './package-drawings.component';
import {BoxDrawingComponent} from './box-drawing.component';
import {SupabaseService} from '../../core/services/supabase.service';
async function render(backdrop:boolean,key:string,records:Record<string,any>={}){
 const lookups:string[]=[];
 const client={from:(table:string)=>{let key='';const q:any={select:()=>q,eq:(field:string,value:string)=>{if(field==='size_key')key=value;return q;},maybeSingle:async()=>{lookups.push(table+':'+key);return {data:records[key]||null};}};return q;}};
 TestBed.configureTestingModule({imports:[PackageDrawingsComponent],providers:[{provide:SupabaseService,useValue:{client}}]});
 const f=TestBed.createComponent(PackageDrawingsComponent);f.componentRef.setInput('signature','original');f.componentRef.setInput('box',{length_mm:1230});f.componentRef.setInput('backdrop',backdrop);f.componentRef.setInput('sharedSize',key);f.detectChanges();await vi.waitFor(()=>{for(const d of f.debugElement.queryAll(By.directive(BoxDrawingComponent)))expect(d.componentInstance.loading).toBe(false);});f.detectChanges();return {f,lookups};
}
describe('One shared packing drawing',()=>{
 it('shows one shared file and one replacement control, never a second package upload',async()=>{
  const key='2000x1000:foldable';const {f,lookups}=await render(true,key,{[key]:{filename:'shared.cdr',size_bytes:1024}});
  expect(f.debugElement.queryAll(By.directive(BoxDrawingComponent))).toHaveLength(1);
  expect(f.nativeElement.querySelectorAll('input[type=file]')).toHaveLength(1);
  expect(f.nativeElement.textContent).toContain('already exists');expect(f.nativeElement.textContent).toContain('shared.cdr');
  expect(f.nativeElement.querySelector('input[type=file]').getAttribute('aria-label')).toContain('Replace');
  expect(lookups).toEqual(['wc_backdrop_box_drawings:'+key]);
 });
 it('provides one upload only when neither qualified nor unclassified drawing exists',async()=>{
  const {f}=await render(true,'2000x1000:nonfoldable');expect(f.nativeElement.querySelectorAll('input[type=file]')).toHaveLength(1);expect(f.nativeElement.textContent).toContain('Upload drawing');
 });
 it('shows the unclassified existing drawing for review and blocks a second upload',async()=>{
  const {f}=await render(true,'2000x1000:foldable',{'2000x1000':{filename:'legacy.cdr',size_bytes:1024}});
  expect(f.nativeElement.textContent).toContain('legacy.cdr');expect(f.nativeElement.textContent).toContain('classify');expect(f.nativeElement.querySelectorAll('input[type=file]')).toHaveLength(0);
 });
 it('blocks ambiguous backdrop variants instead of offering an individual upload',async()=>{
  const {f,lookups}=await render(true,'');expect(f.nativeElement.textContent).toContain('Foldable Yes/No');expect(f.nativeElement.querySelectorAll('input[type=file]')).toHaveLength(0);expect(lookups).toHaveLength(0);
 });
 it('retains individual package drawings for other products',async()=>{
  const {f,lookups}=await render(false,'',{'':{filename:'cart.cdr',size_bytes:1024,box_snapshot:{length_mm:1230}}});expect(f.nativeElement.textContent).toContain('cart.cdr');expect(lookups).toEqual(['wc_box_drawings:']);
 });
});
