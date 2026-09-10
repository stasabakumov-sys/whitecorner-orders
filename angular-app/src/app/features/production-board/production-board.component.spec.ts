import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {ProductionBoardComponent} from './production-board.component';
import {OrdersService} from '../../core/services/orders.service';
import {ProductionService} from '../../core/services/production.service';

describe('Production board stage movement',()=>{
  const event=()=>({preventDefault:vi.fn(),dataTransfer:{effectAllowed:'',dropEffect:'',setData:vi.fn()}} as unknown as DragEvent);
  async function setup(){
    const order:any={id:'order',order_number:'TEST',wc_order_items:[]};
    const unit:any={unit:{id:'unit'},order,mainItem:{product_name:'Backdrop'},status:'Assembly',kind:'backdrops',code:'#TEST'};
    const changeStatus=vi.fn();
    TestBed.configureTestingModule({imports:[ProductionBoardComponent],providers:[
      {provide:OrdersService,useValue:{orders:signal([order]),loading:signal(false),error:signal('')}},
      {provide:ProductionService,useValue:{statuses:['New','CNC','Assembly','Sanding','Painting','Packing','Ready'],unitsForOrders:()=>[unit],changeStatus,imageUrl:()=>'',optionLabels:()=>[]}},
      {provide:Router,useValue:{navigate:vi.fn()}}
    ]});
    const fixture=TestBed.createComponent(ProductionBoardComponent);fixture.componentInstance.firstPaintComplete.set(true);fixture.detectChanges();
    return {fixture,board:fixture.componentInstance,unit,changeStatus};
  }
  it('renders Sanding between Assembly and Painting and saves one move',async()=>{
    const {fixture,board,unit,changeStatus}=await setup();
    expect(fixture.nativeElement.querySelector('.card .product a')).toBeNull();
    expect(Array.from(fixture.nativeElement.querySelectorAll('.stage-title b')).map((x:any)=>x.textContent)).toEqual(['New','CNC','Assembly','Sanding','Painting','Packing','Ready']);
    let finish!:()=>void;changeStatus.mockImplementation(()=>new Promise<void>(resolve=>finish=resolve));
    board.dragStart(event(),unit);const pending=board.drop(event(),'Sanding');
    expect(board.moving()).toBe(true);expect(changeStatus).toHaveBeenCalledWith(unit,'Sanding');
    board.dragStart(event(),unit);await board.drop(event(),'Painting');expect(changeStatus).toHaveBeenCalledTimes(1);
    finish();await pending;expect(board.moving()).toBe(false);expect(board.moveMessage()).toContain('Sanding');
  });
  it('keeps the original stage and shows a server refusal; same-column and external drops do nothing',async()=>{
    const {board,unit,changeStatus}=await setup();
    await board.drop(event(),'Sanding');board.dragStart(event(),unit);await board.drop(event(),'Assembly');expect(changeStatus).not.toHaveBeenCalled();
    changeStatus.mockRejectedValue(new Error('Delivery decision required'));
    board.dragStart(event(),unit);await board.drop(event(),'Sanding');
    expect(unit.status).toBe('Assembly');expect(board.moveError()).toBe('Delivery decision required');expect(board.moving()).toBe(false);
    board.open(unit);expect(board.selected()).toBeNull();
  });
});
