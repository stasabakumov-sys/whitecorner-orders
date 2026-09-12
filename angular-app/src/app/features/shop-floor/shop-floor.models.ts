export const PAINT_OPERATIONS = ['First primer', 'First sanding', 'Second primer', 'Second sanding', 'Finish coat'];
export const OTHER_OPERATIONS = ['Cleaning', 'Design', 'Administration', 'Development', 'Rest'];
export interface ShopPart { id: string; name: string }
export interface ShopProductChoice { unit:{id:string}; order:{id:string}; mainItem:{product_name:string}; code:string; status:string }
export function productChoice(view:ShopProductChoice):ShopProductChoice {
 return {unit:{id:view.unit.id},order:{id:view.order.id},mainItem:{product_name:view.mainItem.product_name||''},code:view.code,status:view.status};
}
export interface ShopTemplate { id: string; name: string; parts: ShopPart[]; estimates: Record<string, number>; version: number }
export interface ShopUnit { unit_id: string; template_id: string; parts: ShopPart[]; estimates: Record<string, number>; finish: 'raw'|'painted'; completed: string[] }
export interface ShopShift { id: string; worker_id: string; started_at: string; ended_at: string|null }
export interface ShopInterval extends ShopShift { shift_id: string; unit_id: string|null; stage: string; operation: string; part_id: string|null }
export interface ShopData { templates: ShopTemplate[]; units: ShopUnit[]; shifts: ShopShift[]; intervals: ShopInterval[] }
export interface ShopCommand { id: string; action: string; payload: Record<string, unknown> }
export function brisbaneDate(value: string|number = Date.now()): string {
 return new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
export function localInput(value: string): string { return new Date(Date.parse(value)+10*3600000).toISOString().slice(0,23); }
export function fromLocalInput(value: string): string { return new Date(value+(value.length===16?':00':'')+'+10:00').toISOString(); }
export function rangeBounds(date: string, period: string): [number,number] {
 const start=new Date(date+'T00:00:00+10:00');
 if(period==='week') start.setUTCDate(start.getUTCDate()-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
 if(period==='month') { const [y,m]=date.split('-').map(Number); return [Date.parse(`${y}-${String(m).padStart(2,'0')}-01T00:00:00+10:00`),Date.UTC(y,m,1)-10*3600000]; }
 return [start.getTime(),start.getTime()+(period==='week'?7:1)*86400000];
}
export function intervalSeconds(row: ShopInterval, now: number, bounds?: [number,number]): number {
 return Math.max(0, (Math.min(Date.parse(row.ended_at||'')||now,bounds?.[1]??Infinity)-Math.max(Date.parse(row.started_at),bounds?.[0]??-Infinity))/1000);
}
export function availablePaint(op: string, completed: string[]): boolean {
 return op==='Repaint'||(PAINT_OPERATIONS.includes(op)&&!completed.includes('Painting:'+op)&&PAINT_OPERATIONS.slice(0,PAINT_OPERATIONS.indexOf(op)).every(x=>completed.includes('Painting:'+x)));
}
export function duration(seconds: number): string {
 const s=Math.floor(seconds);return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
export function csvCell(value: unknown): string { const s=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"'; }

export const OFFLINE_ACTIONS=['shift-start','start','pause','finish-operation','finish-stage','shift-end'];
// Project only the durable timer queue. Server remains authoritative after replay.
export function projectCommands(base:ShopData,commands:ShopCommand[],worker:string):ShopData {
 const data=structuredClone(base);
 for(const c of commands){
  if(!OFFLINE_ACTIONS.includes(c.action))continue;
  const at=String(c.payload['at']);let shift=data.shifts.find(s=>!s.ended_at);
  const active=data.intervals.find(i=>!i.ended_at);
  if(c.action==='shift-start'){shift={id:c.id,worker_id:worker,started_at:at,ended_at:null};data.shifts.push(shift);}
  if(!shift)continue;
  if(active)active.ended_at=at;
  if(['finish-operation','finish-stage'].includes(c.action)&&active?.unit_id){
   const u=data.units.find(u=>u.unit_id===active.unit_id);
   if(u){
    u.completed.push(active.stage+':'+(active.part_id||active.operation));
    if(c.action==='finish-stage'||(['Assembly','Sanding'].includes(active.stage)&&u.parts.every(p=>u.completed.includes(active.stage+':'+p.id))))u.completed.push(active.stage+':finished');
   }
  }
  if(c.action==='shift-end'){shift.ended_at=at;continue;}
  const start=c.action==='start',p=c.payload;
  data.intervals.push({id:c.id,shift_id:shift.id,worker_id:worker,started_at:at,ended_at:null,
   unit_id:start?(p['unitId'] as string||null):null,stage:start?String(p['stage']):'Pause',operation:start?String(p['operation']||p['stage']):'Pause',part_id:start?(p['partId'] as string||null):null});
 }
 return data;
}
