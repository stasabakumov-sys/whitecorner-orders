import {TestBed} from '@angular/core/testing';
import {LaserSetupComponent} from './laser-setup.component';
import {LaserSetupService,initialLaserSetup,laserSetupError} from './laser-setup.service';
import {HubMembersService} from '../../core/services/hub-members.service';
import {BoxConstructorComponent} from './box-constructor.component';
import {prepareRdRequest} from './box-constructor-rd';
import {boxNet} from './box-constructor-geometry';

afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();vi.useRealTimers();});
describe('Shared laser setup',()=>{
 it('uses owner Dot spacing and distinct speed/power for each layer in RD geometry',async()=>{
  const settings=initialLaserSetup();settings.cut={speed:110,minPower:60,maxPower:75};settings.dot={speed:100,minPower:50,maxPower:65};
  TestBed.configureTestingModule({providers:[{provide:LaserSetupService,useValue:{load:async()=>({settings,revision:'r'})}}]});
  const c=TestBed.createComponent(BoxConstructorComponent).componentInstance;await c.loadLaserSetup();
  expect(c.rdSettings.dotTime).toBe(.2);expect(c.rdSettings.dotInterval).toBe(4);expect(c.rdSettings.dotLength).toBe(2);
  const layers=prepareRdRequest(boxNet(715,415,49.3),c.rdSettings).jobs[0].layers;
  expect(layers[0].paths.slice(0,2)).toEqual([[[49.3,0],[49.3,2]],[[49.3,4],[49.3,6]]]);
  expect([layers[0].speed,layers[0].minPower,layers[0].maxPower]).toEqual([100,50,65]);
  expect([layers[1].speed,layers[1].minPower,layers[1].maxPower]).toEqual([110,60,75]);
 });
 it('requires Edit, shows Save only for changes, retains failed saves and can cancel',async()=>{
  const saved={settings:initialLaserSetup(),revision:'r'};const save=vi.fn().mockRejectedValueOnce(Error('Connection lost')).mockImplementation(async settings=>({settings:structuredClone(settings),revision:'r2'}));
  TestBed.configureTestingModule({providers:[{provide:LaserSetupService,useValue:{load:async()=>saved,save}},{provide:HubMembersService,useValue:{manager:()=>true,load:async()=>{}}}]});
  const fixture=TestBed.createComponent(LaserSetupComponent);const c=fixture.componentInstance;const loading=c.load();fixture.detectChanges();await loading;await fixture.whenStable();fixture.detectChanges();expect(c.saved).not.toBeNull();
  expect(fixture.nativeElement.querySelector('input').disabled).toBe(true);expect(fixture.nativeElement.querySelector('[aria-label="Save laser setup"]')).toBeNull();
  fixture.nativeElement.querySelector('[aria-label="Edit laser setup"]').click();fixture.detectChanges();
  const lengthInput=Array.from(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>).find(label=>label.textContent?.includes('Dot length'))!.querySelector('input')!;
  lengthInput.value='1.5';lengthInput.dispatchEvent(new Event('input'));await fixture.whenStable();fixture.detectChanges();expect(fixture.nativeElement.querySelector('[aria-label="Save laser setup"]')).not.toBeNull();
  await c.save();expect(c.error()).toContain('Connection lost');expect(c.editing()).toBe(true);expect(c.draft.dotLength).toBe(1.5);expect(c.done()).toBe(false);
  await c.save();expect(c.done()).toBe(true);expect(c.editing()).toBe(false);expect(c.saved?.revision).toBe('r2');
  c.edit();c.draft.cut.speed=99;c.cancel();expect(c.draft.cut.speed).toBe(120);
 });
 it('blocks export on a setup load failure and keeps previous files and dimensions for retry',async()=>{
  const load=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({settings:initialLaserSetup(),revision:'r'});
  TestBed.configureTestingModule({providers:[{provide:LaserSetupService,useValue:{load}}]});
  const c=TestBed.createComponent(BoxConstructorComponent).componentInstance;const files=[{filename:'old.rd',bytes:new Uint8Array(100)}];c.rdFiles=files;
  await c.loadLaserSetup();await c.generateRd();expect(c.laserError).toContain('offline');expect(c.rdFiles).toBe(files);expect(c.length).toBe(1515);expect(c.rdError).toContain('Load Laser setup');
  await c.loadLaserSetup();expect(c.laserReady).toBe(true);expect(c.laserError).toBe('');expect(c.rdFiles).toEqual([]);
 });
 it('rejects overlapping dots and invalid power and times',()=>{
  for(const mutate of [(s:any)=>s.dotLength=4,(s:any)=>s.dot.maxPower=101,(s:any)=>s.cut.minPower=90,(s:any)=>s.dotTime=null]){const s=initialLaserSetup();mutate(s);expect(laserSetupError(s)).not.toBe('');}
 });
 it('does not report success for a mismatched response and bounds stalled loads',async()=>{
  const settings=initialLaserSetup();const rpc=vi.fn().mockResolvedValue({data:{settings:{...settings,dotTime:.3},revision:'r2'},error:null});
  const service=new LaserSetupService({client:{rpc}} as any);await expect(service.save(settings,'r')).rejects.toThrow('did not confirm');
  vi.useFakeTimers();const stalled=new LaserSetupService({client:{from:()=>({select:()=>({eq:()=>({single:()=>new Promise(()=>{})})})})}} as any);
  const promise=stalled.load();const assertion=expect(promise).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(15000);await assertion;
 });
});
