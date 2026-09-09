import {orderMetrics} from './order-metrics';
describe('Order summary',()=>{
  it('compares Brisbane calendar periods, sums totals and excludes cancellations and other currencies',()=>{
    const row=(date:string,total:number,extra={})=>({id:date,order_number:'test',wix_created_at:date,total,currency:'AUD',...extra});
    const result=orderMetrics([
      row('2026-09-09T01:00:00Z',300),row('2026-08-10T14:00:00Z',100),
      row('2026-08-10T13:59:59Z',200),
      row('2026-09-08T01:00:00Z',999,{raw_order:{status:'CANCELED'}}),
      row('2026-09-08T01:00:00Z',999,{currency:'USD'}),
    ],30,Date.parse('2026-09-09T07:00:00Z'));
    expect(result.map(m=>m.value)).toEqual([400,2,200]);
    expect(result.map(m=>m.change)).toEqual([100,100,0]);
    expect(orderMetrics([],30).every(m=>m.change===null&&m.value===0)).toBe(true);
  });
});
