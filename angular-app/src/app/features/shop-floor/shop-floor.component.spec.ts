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
