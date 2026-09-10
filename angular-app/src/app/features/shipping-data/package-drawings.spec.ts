import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {describe,it,expect} from 'vitest';
import {PackageDrawingsComponent} from './package-drawings.component';
import {BoxDrawingComponent} from './box-drawing.component';
import {SupabaseService} from '../../core/services/supabase.service';
describe('Saved package drawing visibility',()=>{
 it('loads the exact legacy package drawing even when backdrop size is missing',async()=>{
  const lookups:string[]=[];
  const client={from:(table:string)=>{lookups.push(table);const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{filename:'box.cdr',box_snapshot:{length_mm:1230}}})};return q;}};
  TestBed.configureTestingModule({imports:[PackageDrawingsComponent],providers:[{provide:SupabaseService,useValue:{client}}]});
  const f=TestBed.createComponent(PackageDrawingsComponent);f.componentRef.setInput('signature','saved-original-signature');f.componentRef.setInput('backdrop',true);f.componentRef.setInput('box',{length_mm:1230});f.detectChanges();await f.whenStable();f.detectChanges();
  const drawing=f.debugElement.query(By.directive(BoxDrawingComponent)).componentInstance;
  expect(drawing.signature).toBe('saved-original-signature');expect(drawing.sharedSize).toBe('');expect(lookups).toContain('wc_box_drawings');expect(f.nativeElement.textContent).toContain('box.cdr');
 });
 it('keeps package and shared size drawings available together',()=>{
  const client={from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null})};return q;}};
  TestBed.configureTestingModule({imports:[PackageDrawingsComponent],providers:[{provide:SupabaseService,useValue:{client}}]});
  const f=TestBed.createComponent(PackageDrawingsComponent);f.componentRef.setInput('signature','original');f.componentRef.setInput('sharedSize','2000x1200');f.detectChanges();
  const drawings=f.debugElement.queryAll(By.directive(BoxDrawingComponent)).map(x=>x.componentInstance);
  expect(drawings.length).toBe(2);expect(drawings[0].signature).toBe('original');expect(drawings[1].sharedSize).toBe('2000x1200');
 });
});
