import {TestBed} from '@angular/core/testing';
import {LaserSetupService,initialLaserSetup} from './laser-setup.service';
import {ConstructorPageComponent} from './constructor-page.component';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

describe('Constructor box tabs',()=>{
  it('keeps independent Card, Small and Backdrop box inputs when switching tabs',async()=>{
    TestBed.configureTestingModule({providers:[{provide:SupabaseService,useValue:{client:{}}},{provide:HubMembersService,useValue:{manager:()=>true}},{provide:LaserSetupService,useValue:{load:async()=>({settings:initialLaserSetup(),revision:'test'})}}]});
    const fixture=TestBed.createComponent(ConstructorPageComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const input=root.querySelector<HTMLInputElement>('#box-length')!;
    input.value='1215';input.dispatchEvent(new Event('input'));fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#constructor-tab-small')!.click();fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('#constructor-panel-card')!.hidden).toBe(true);
    const smallInput=root.querySelector<HTMLInputElement>('#small-box-length')!;
    expect(smallInput.value).toBe('270');
    smallInput.value='300';smallInput.dispatchEvent(new Event('input'));fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#constructor-tab-small')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));fixture.detectChanges();
    expect(root.querySelector('#constructor-tab-backdrop')!.getAttribute('aria-selected')).toBe('true');
    const backdropInput=root.querySelector<HTMLInputElement>('#backdrop-box-length')!;
    expect(backdropInput.value).toBe('930');
    expect(root.querySelector('#constructor-panel-backdrop')!.textContent).toContain('Each piece stays whole when it fits');
    backdropInput.value='1215';backdropInput.dispatchEvent(new Event('input'));fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#constructor-tab-card')!.click();fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('#box-length')!.value).toBe('1215');
    root.querySelector<HTMLButtonElement>('#constructor-tab-small')!.click();fixture.detectChanges();
    expect(smallInput.value).toBe('300');
    root.querySelector<HTMLButtonElement>('#constructor-tab-backdrop')!.click();fixture.detectChanges();
    expect(backdropInput.value).toBe('1215');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    fixture.destroy();
  });
});
