import {historyOrder,mergeOrderHistory,OrderHistoryService} from './order-history.service';
describe('Full Wix history',()=>{
  it('maps fulfilled and cancelled history without units and keeps the operational row for duplicates',()=>{
    const order=historyOrder({synced_at:'2026-09-09',raw_order:{id:'wix-id',number:100,fulfillmentStatus:'FULFILLED',status:'CANCELED',archived:true,priceSummary:{total:{amount:'110'}},lineItems:[{id:'line',quantity:1,price:{amount:'110'},productName:{original:'Backdrop'}}]}});
    expect(order.is_history).toBe(true);expect(order.wc_order_items?.[0].wc_production_units).toBeUndefined();expect(order.total).toBe(110);
    const live={...order,id:'local-id',is_history:false,fulfillment_status:'PARTIALLY_FULFILLED'};
    expect(mergeOrderHistory([live],[order])).toEqual([live]);expect(order.fulfillment_status).toBe('FULFILLED');
  });
  it('loads stored history beyond the database page limit',async()=>{
    const ranges:number[]=[];const service=new OrderHistoryService({client:{from:()=>({select:()=>({order:()=>({range:async(start:number)=>{ranges.push(start);return{data:Array.from({length:Math.min(500,1100-start)},(_,i)=>({raw_order:{id:String(start+i),number:start+i}})),error:null};}})})})}} as any);
    await service.load();expect(ranges).toEqual([0,500,1000]);expect(service.orders().length).toBe(1100);
  });
});
