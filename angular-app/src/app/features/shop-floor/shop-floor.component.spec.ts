import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {ShopFloorComponent} from './shop-floor.component';
import {ShopFloorService} from './shop-floor.service';
import {ShopPhoneService} from '../../core/services/shop-phone.service';
import {AuthService} from '../../core/services/auth.service';
import {OrdersService} from '../../core/services/orders.service';
import {ProductionService} from '../../core/services/production.service';
import {ShopData,projectCommands} from './shop-floor.models';

describe('Shop Floor mobile work selection',()=>{
 async function setup(){
  const started=new Date().toISOString();
  const base:ShopData={templates:[],units:[{unit_id:'u1',template_id:'t',parts:[{id:'body',name:'Body'},{id:'base',name:'Base'}],estimates:{},finish:'raw',completed:[]}],shifts:[{id:'shift',worker_id:'worker',started_at:started,ended_at:null}],intervals:[]};
  const views:any[]=['u1','u2'].map((id,index)=>({unit:{id},order:{order_number:'TEST',fulfillment_status:'NOT_FULFILLED'},mainItem:{product_name:'Test product'},code:`#TEST-${index+1}`,status:'Assembly'}));
  const service={data:signal(structuredClone(base)),confirmedData:signal(structuredClone(base)),pending:signal<any[]>([]),busy:signal(false),conflict:signal(false),loaded:signal(true),error:signal(''),catalog:signal([]),cacheProducts:vi.fn(),products:signal([]),load:vi.fn().mockResolvedValue(undefined),command:vi.fn().mockResolvedValue(false),sync:vi.fn()};
  const production={statuses:['New','CNC','Assembly','Sanding','Painting','Packing','Ready'],unitsForOrders:()=>views,imageUrl:()=>'',changeStatus:vi.fn()};
  TestBed.configureTestingModule({imports:[ShopFloorComponent],providers:[provideRouter([]),{provide:ShopPhoneService,useValue:{online:()=>true,installed:()=>true,error:()=>'',updateReady:()=>false}},{provide:ShopFloorService,useValue:service},{provide:AuthService,useValue:{userEmail:()=> 'worker@example.test'}},{provide:OrdersService,useValue:{orders:signal([]),error:signal(''),loading:signal(false)}},{provide:ProductionService,useValue:production}]});
  const fixture=TestBed.createComponent(ShopFloorComponent);await new Promise(resolve=>setTimeout(resolve,0));fixture.detectChanges();
  const c=fixture.componentInstance;
  function running(){service.data.update(d=>({...d,intervals:[{id:'work',shift_id:'shift',worker_id:'worker',unit_id:'u1',stage:'Assembly',operation:'Assembly',part_id:'body',started_at:started,ended_at:null}]}));service.confirmedData.set(structuredClone(service.data()));}
  return {fixture,c,service,views,production,running};
 }
 it('omits New, retains every other real stage and keeps physical units separate',async()=>{
  const {fixture,c}=await setup();fixture.nativeElement.querySelectorAll('.stage-buttons button')[1].click();fixture.detectChanges();
  expect(c.mobileStages()).toEqual(['CNC','Assembly','Sanding','Painting','Packing','Ready']);
  expect(fixture.nativeElement.querySelectorAll('.product-card')).toHaveLength(2);
  expect(fixture.nativeElement.querySelector('.product-card').textContent).toContain('#TEST-1');
  fixture.nativeElement.querySelectorAll('.stage-buttons button')[0].click();fixture.detectChanges();expect(fixture.nativeElement.querySelector('.empty-state').textContent).toContain('No products');
 });
 it('keeps the active task while browsing another stage and product',async()=>{
  const {c,service,views,running}=await setup();running();c.chooseStage('CNC');c.chooseProduct(views[1]);
  expect(c.active()?.unit_id).toBe('u1');expect(c.dockLabel()).toContain('#TEST-1');expect(c.canStart()).toBe(false);expect(service.command).not.toHaveBeenCalled();
 });
 it('distinguishes matching products by complete options and allocated add-ons',async()=>{
  const {fixture,c,views}=await setup();
  views[0].mainItem={product_name:'Essential Cart - Plywood Mobile Cart - Mobile Bar',wix_options:{Colour:'White',Size:'1300 mm','Side shelves':'Yes'},description_lines:[{name:{original:'Side shelves'},plainText:{original:'Yes'}}]};
  views[1].mainItem={product_name:'Essential Cart - Plywood Mobile Cart',wix_options:{Colour:'Black',Size:'1300 mm','Side shelves':'No'}};
  views[0].addons=[{item:{product_name:'Custom cutout',wix_options:{Shape:'Round'}},quantity:1}];
  c.chooseStage('Assembly');fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
  const cards=fixture.nativeElement.querySelectorAll('.product-card');
  expect(cards[0].querySelector('.product-name').textContent).toBe('Essential Cart');
  expect(cards[1].querySelector('.product-name').textContent).toBe('Essential Cart');
  expect(cards[0].textContent).toContain('Side shelves: Yes');
  expect(cards[1].textContent).toContain('Side shelves: No');
  expect(cards[0].textContent).toContain('Custom cutout × 1');
  expect(cards[0].textContent).toContain('Shape: Round');
  expect(cards[1].textContent).not.toContain('Custom cutout');
  expect(c.cardOptions(views[0]).filter(x=>x==='Side shelves: Yes')).toHaveLength(1);
  cards[1].click();expect(c.unitId).toBe('u2');
 });
 it('selects Other activities with buttons without starting work until Start is pressed',async()=>{
  const {fixture,c,service}=await setup();
  c.mode='other';fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
  const buttons=Array.from(fixture.nativeElement.querySelectorAll('.other-buttons button')) as HTMLButtonElement[];
  expect(buttons.map(b=>b.textContent?.trim())).toEqual(c.others);
  buttons.find(b=>b.textContent?.trim()==='Rest')!.click();fixture.detectChanges();
  expect(c.other).toBe('Rest');expect(buttons.find(b=>b.textContent?.trim()==='Rest')!.getAttribute('aria-pressed')).toBe('true');
  expect(service.command).not.toHaveBeenCalled();
  await c.start();expect(service.command).toHaveBeenCalledWith('start',{stage:'Other',operation:'Rest'});
 });
 it('shows unfinished painting buttons, preserves sequence and keeps history collapsed',async()=>{
  const {fixture,c,service,views}=await setup();views[0].status='Painting';
  service.confirmedData.update(d=>({...d,units:d.units.map(u=>({...u,completed:['Painting:First primer']}))}));
  service.data.set(structuredClone(service.confirmedData()));await c.chooseProduct(views[0]);fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
  const buttons=()=>Array.from(fixture.nativeElement.querySelectorAll('.painting-buttons button')) as HTMLButtonElement[];
  expect(buttons().map(b=>b.textContent?.trim())).toEqual(['First sanding','Second primer','Second sanding','Finish coat','Repaint (optional)']);
  expect(buttons()[0].disabled).toBe(false);expect(buttons()[1].disabled).toBe(true);
  buttons()[0].click();fixture.detectChanges();expect(c.operation).toBe('First sanding');expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
  const history=fixture.nativeElement.querySelector('.painting-statuses');expect(history.open).toBe(false);expect(history.textContent).toContain('First primer');expect(history.textContent).toContain('✓ Complete');
  expect(c.paintingStatus('Second primer')).toBe('Waiting for previous operations');
  // Optimistic offline completion must not hide an operation until confirmed.
  service.data.update(d=>({...d,units:d.units.map(u=>({...u,completed:[...u.completed,'Painting:First sanding']}))}));fixture.detectChanges();
  expect(buttons()[0].textContent).toContain('First sanding');
  service.confirmedData.set(structuredClone(service.data()));fixture.detectChanges();
  expect(buttons()[0].textContent).toContain('Second primer');expect(buttons()[0].disabled).toBe(false);
 });
 it('uses the saved backdrop painting sequence and reports active and repeatable work',async()=>{
  const {fixture,c,service,views}=await setup();views[0].status='Painting';
  service.confirmedData.update(d=>({...d,units:d.units.map(u=>({...u,paint_operations:['First primer','First sanding','Finish coat'],completed:['Painting:Repaint']}))}));
  service.data.set(structuredClone(service.confirmedData()));await c.chooseProduct(views[0]);fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
  const buttons=fixture.nativeElement.querySelector('.painting-buttons');
  expect(buttons.textContent).toContain('Primer');expect(buttons.textContent).not.toContain('Second');expect(buttons.textContent).toContain('Repaint again');
  expect(fixture.nativeElement.querySelectorAll('.painting-statuses tbody tr')).toHaveLength(4);
  const started=new Date().toISOString();service.data.update(d=>({...d,intervals:[{id:'paint',shift_id:'shift',worker_id:'worker',unit_id:'u1',stage:'Painting',operation:'First primer',part_id:null,started_at:started,ended_at:null}]}));
  expect(c.paintingStatus('First primer')).toBe('Running');expect(c.paintingStatus('Repaint')).toBe('Recorded · repeatable');
 });
 it('keeps meaningful hyphens and handles missing names and options',async()=>{
  const {c,views}=await setup();
  expect(c.shortProductName('Fold-out Cart — Long description')).toBe('Fold-out Cart');
  expect(c.shortProductName('Essential Cart – Plywood')).toBe('Essential Cart');
  expect(c.shortProductName('Essential Cart')).toBe('Essential Cart');
  expect(c.shortProductName(null)).toBe('Product');
  expect(c.cardOptions(views[0])).toEqual([]);
 });
 it('shows the selected product photo and options in detail and handles a broken image',async()=>{
  const {fixture,c,views,production}=await setup();
  production.imageUrl=()=>'/test-product.png';
  views[0].mainItem={product_name:'Essential Cart - Long description',wix_options:{'Side shelves':'Yes'}};
  c.chooseProduct(views[0]);fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
  const heading=fixture.nativeElement.querySelector('.product-detail-heading');
  const img=heading.querySelector('img');
  expect(img.getAttribute('src')).toBe('/test-product.png');
  expect(img.getAttribute('alt')).toBe('Essential Cart');
  expect(heading.textContent).toContain('#TEST-1');
  expect(fixture.nativeElement.querySelector('.product-detail > .product-options').textContent).toContain('Side shelves: Yes');
  img.dispatchEvent(new Event('error'));fixture.detectChanges();
  expect(heading.querySelector('img')).toBeNull();
  expect(heading.textContent).toContain('No image');
  expect(c.unitId).toBe('u1');
 });
 it('retains parts and selection until server confirmation, including queued failures',async()=>{
  const {c,service,views,running,fixture}=await setup();running();c.chooseProduct(views[0]);c.partId='body';
  const queued={id:'finish',action:'finish-operation',payload:{at:new Date().toISOString()}};
  service.command.mockImplementation(async()=>{service.pending.set([queued]);service.data.set(projectCommands(service.confirmedData(),[queued],'worker'));return false;});
  await c.finishWork();fixture.detectChanges();
  expect(c.partId).toBe('body');expect(c.remainingParts().map(p=>p.id)).toEqual(['body','base']);expect(c.canStart()).toBe(false);expect(c.mobileDetail).toBe(true);
  service.confirmedData.set(structuredClone(service.data()));service.pending.set([]);fixture.detectChanges();
  expect(c.remainingParts().map(p=>p.id)).toEqual(['base']);expect(fixture.nativeElement.querySelector('details table').textContent).toContain('✓ Complete');
  views[0].status='Sanding';expect(c.remainingParts()).toHaveLength(2);
 });
 it('pauses without completing a part and restores a paused task independently of selection',async()=>{
  const {c,service,views,running}=await setup();running();c.chooseProduct(views[0]);
  await c.dockPrimary();expect(service.command).toHaveBeenCalledWith('pause',{});
  service.data.set(projectCommands(service.confirmedData(),[{id:'pause',action:'pause',payload:{at:new Date(Date.parse(service.confirmedData().intervals[0].started_at)+2000).toISOString()}}],'worker'));
  c.chooseProduct(views[1]);expect(c.pausedTask()?.unit_id).toBe('u1');expect(c.dockSeconds()).toBe(2);expect(c.s.confirmedData().units[0].completed).toEqual([]);
  await c.dockPrimary();expect(service.command).toHaveBeenLastCalledWith('start',{unitId:'u1',stage:'Assembly',partId:'body',operation:'Assembly'});
 });
 it('continues with remaining parts after confirmed completion without moving the stage',async()=>{
  const {c,service,views,running,production}=await setup();running();c.chooseProduct(views[0]);
  service.command.mockImplementation(async()=>{const data=projectCommands(service.data(),[{id:'finish',action:'finish-operation',payload:{at:new Date().toISOString()}}],'worker');service.data.set(data);service.confirmedData.set(structuredClone(data));return true;});
  await c.finishWork();expect(c.partId).toBe('base');expect(c.mobileDetail).toBe(true);expect(production.changeStatus).not.toHaveBeenCalled();
 });
 it('keeps a saved final part accessible when advancing the board fails',async()=>{
  const {c,service,views,running,production}=await setup();running();
  service.data.update(d=>({...d,units:d.units.map(u=>({...u,completed:['Assembly:base']}))}));
  service.confirmedData.set(structuredClone(service.data()));c.chooseProduct(views[0]);
  service.command.mockImplementation(async()=>{const data=projectCommands(service.data(),[{id:'finish',action:'finish-operation',payload:{at:new Date().toISOString()}}],'worker');service.data.set(data);service.confirmedData.set(structuredClone(data));return true;});
  production.changeStatus.mockRejectedValueOnce(new Error('Network unavailable'));
  await c.finishWork();expect(c.done('Assembly:finished')).toBe(true);expect(c.mobileDetail).toBe(true);expect(c.localError).toContain('Work is saved');
  production.changeStatus.mockImplementation(async()=>{views[0].status='Sanding';});
  await c.advance();expect(c.mobileDetail).toBe(false);expect(c.localError).toBe('');
 });
 it('restores the active task and elapsed time after recreating the screen',async()=>{
  const {fixture,service,running}=await setup();running();fixture.destroy();
  const restored=TestBed.createComponent(ShopFloorComponent);await Promise.resolve();
  const c=restored.componentInstance;c.now.set(Date.parse(service.data().intervals[0].started_at)+30000);
  expect(c.dockTask()?.unit_id).toBe('u1');expect(c.dockSeconds()).toBe(30);expect(c.canStart()).toBe(false);
 });
});
