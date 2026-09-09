import {OrderRow} from '../../core/models/order.models';

/** Rolling periods use the Brisbane calendar (UTC+10, without daylight saving). */
export type MetricsPeriod='today'|'yesterday'|'7'|'30'|'week'|'month';
export function orderMetrics(orders:OrderRow[], period:MetricsPeriod|number, now=Date.now()) {
  const day=86400000, offset=10*3600000;
  const today=Math.floor((now+offset)/day)*day-offset;
  const local=new Date(now+offset);
  let end=today+day,start=end-Number(period)*day;
  if(period==='today')start=today;
  if(period==='yesterday'){end=today;start=today-day;}
  if(period==='week')start=today-((local.getUTCDay()+6)%7)*day;
  if(period==='month')start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-offset;
  const previousStart=start-(end-start);
  const current={count:0,cents:0}, previous={count:0,cents:0};
  for(const order of orders){
    if(order.currency && order.currency!=='AUD')continue;
    const status=String(order.raw_order?.['status']??'').toUpperCase();
    if(status==='CANCELED'||status==='CANCELLED')continue;
    const date=Date.parse(order.wix_created_at??'');
    if(!Number.isFinite(date)||date<previousStart||date>=end||date>now)continue;
    const bucket=date>=start?current:previous;
    bucket.count++;
    const total=Number(order.total??0);
    if(Number.isFinite(total))bucket.cents+=Math.round(total*100);
  }
  const average=(v:typeof current)=>v.count?v.cents/v.count/100:0;
  const change=(value:number,old:number)=>old===0?null:Math.round((value-old)/old*100);
  return [
    {label:'Sales',value:current.cents/100,change:change(current.cents,previous.cents),money:true},
    {label:'Orders',value:current.count,change:change(current.count,previous.count),money:false},
    {label:'Avg. order value',value:average(current),change:change(average(current),average(previous)),money:true},
  ];
}
