import {Component,signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {it,expect} from 'vitest';
import {ModelingSectionComponent} from './modeling-section.component';
@Component({standalone:true,imports:[ModelingSectionComponent],template:`<app-modeling-section title="Shelf" sectionId="shelf" [summary]="included()?'Middle':'None'" [attention]="error()"><input type="checkbox" [checked]="included()" (change)="included.set($any($event.target).checked)"></app-modeling-section>`})
class Host {included=signal(false);error=signal(false);}
it('updates the collapsed summary without resetting the selected option and exposes errors',async()=>{
 const fixture=TestBed.createComponent(Host);fixture.detectChanges();
 try{
  const button=fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  const body=fixture.nativeElement.querySelector('.option-body') as HTMLElement;
  const checkbox=fixture.nativeElement.querySelector('input') as HTMLInputElement;
  expect(body.hidden).toBe(true);expect(button.textContent).toContain('None');expect(button.getAttribute('aria-expanded')).toBe('false');
  button.click();fixture.detectChanges();checkbox.click();fixture.detectChanges();button.click();fixture.detectChanges();
  expect(body.hidden).toBe(true);expect(checkbox.checked).toBe(true);expect(button.textContent).toContain('Middle');
  fixture.componentInstance.error.set(true);await fixture.whenStable();fixture.detectChanges();expect(body.hidden).toBe(false);
 }finally{fixture.destroy();}
});
