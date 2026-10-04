import {TestBed} from '@angular/core/testing';
import {ConstructorPageComponent} from './constructor-page.component';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

describe('Constructor box tabs',()=>{
  it('keeps Card box inputs when switching through the empty future panels',()=>{
    TestBed.configureTestingModule({providers:[{provide:SupabaseService,useValue:{client:{}}},{provide:HubMembersService,useValue:{manager:()=>true}}]});
    const fixture=TestBed.createComponent(ConstructorPageComponent);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const input=root.querySelector<HTMLInputElement>('#box-length')!;
    input.value='1215';input.dispatchEvent(new Event('input'));fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#constructor-tab-small')!.click();fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('#constructor-panel-card')!.hidden).toBe(true);
    expect(root.querySelector('#constructor-panel-small')!.childElementCount).toBe(0);
    root.querySelector<HTMLButtonElement>('#constructor-tab-small')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));fixture.detectChanges();
    expect(root.querySelector('#constructor-tab-backdrop')!.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('#constructor-panel-backdrop')!.childElementCount).toBe(0);
    root.querySelector<HTMLButtonElement>('#constructor-tab-card')!.click();fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('#box-length')!.value).toBe('1215');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    fixture.destroy();
  });
});
