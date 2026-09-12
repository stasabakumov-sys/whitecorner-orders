import {Component, OnDestroy, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DatePipe} from '@angular/common';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {AuthService} from '../../core/services/auth.service';
import {OrdersService} from '../../core/services/orders.service';
import {ProductionService} from '../../core/services/production.service';
import {ShopPhoneService} from '../../core/services/shop-phone.service';
import {ProductionStatus} from '../../core/models/production.models';
import {ShopFloorService} from './shop-floor.service';
import {ShopInterval,ShopShift,ShopTemplate,ShopPart,PAINT_OPERATIONS,OTHER_OPERATIONS,availablePaint,brisbaneDate,rangeBounds,intervalSeconds,duration,localInput,fromLocalInput,csvCell} from './shop-floor.models';

@Component({selector:'app-shop-floor',standalone:true,imports:[FormsModule,DatePipe,RouterLink],templateUrl:'./shop-floor.component.html',styleUrl:'./shop-floor.component.css'})
export class ShopFloorComponent implements OnDestroy {
 now=signal(Date.now());private tick=setInterval(()=>this.now.set(Date.now()),1000);
 tab='timer';unitId='';stageFilter='';partId='';operation='';other='Cleaning';mode='product';
 templateId='';finish='';templateName='';templateVersion=0;editingTemplateId='';parts:ShopPart[]=[];estimates:Record<string,number>={};
 date=brisbaneDate();period='day';editId='';editType='interval';editStart='';editEnd='';notice='';localError='';moving=false;
 paint=PAINT_OPERATIONS;others=OTHER_OPERATIONS;format=duration;seconds=intervalSeconds;paintAvailable=availablePaint;
 private reconnect=()=>{void this.refresh();};
 constructor(readonly s:ShopFloorService,readonly auth:AuthService,readonly orders:OrdersService,readonly production:ProductionService,route:ActivatedRoute,readonly phone:ShopPhoneService){
  this.unitId=route.snapshot.queryParamMap.get('unit')||'';void s.load().then(async()=>{await this.cacheChoices();this.selectUnit();});
  window.addEventListener('online',this.reconnect);
 }
 ngOnDestroy(){clearInterval(this.tick);window.removeEventListener('online',this.reconnect);}
 liveUnits(){return this.production.unitsForOrders(this.orders.orders()).filter(v=>!['FULFILLED','CANCELED','CANCELLED'].includes(String(v.order.fulfillment_status).toUpperCase()));}
 units(){return this.phone.online()&&!this.orders.error()?this.liveUnits():this.s.products();}
 async cacheChoices(){if(this.phone.online()&&!this.orders.error()&&!this.orders.loading())await this.s.cacheProducts(this.liveUnits().map(v=>({unit:{id:v.unit.id},order:{id:v.order.id},mainItem:{product_name:v.mainItem.product_name||''},code:v.code,status:v.status})));}
 async refresh(){if(this.phone.online())await this.orders.load();await this.s.load();await this.cacheChoices();}
 choices(){return this.units().filter(v=>!this.stageFilter||v.status===this.stageFilter);}
 selected(){return this.units().find(v=>v.unit.id===this.unitId);}
 snapshot(){return this.s.data().units.find(v=>v.unit_id===this.unitId);}
 shift(){return this.s.data().shifts.find(v=>!v.ended_at);}
 active(){return this.s.data().intervals.find(v=>!v.ended_at);}
 previous(){return [...this.s.data().intervals].filter(v=>v.stage!=='Pause').sort((a,b)=>b.started_at.localeCompare(a.started_at)).find(r=>{
  if(!r.unit_id)return true;const u=this.s.data().units.find(u=>u.unit_id===r.unit_id),v=this.units().find(v=>v.unit.id===r.unit_id);
  return v?.status===r.stage&&!u?.completed.includes(r.stage+':finished')&&(r.operation==='Repaint'||!u?.completed.includes(r.stage+':'+(r.part_id||r.operation)));
 });}
 blocked(){return !this.phone.online()||this.s.busy()||this.moving||this.s.pending().length>0;}
 timerBlocked(){return this.s.busy()||this.moving||this.s.conflict()||!this.s.loaded();}
 oldShift(){return this.shift()&&brisbaneDate(this.shift()!.started_at)!==brisbaneDate();}
 selectUnit(){this.partId='';this.operation='';this.templateId=this.snapshot()?.template_id||'';this.finish=this.snapshot()?.finish||'';}
 label(id:string|null){const unit=this.units().find(v=>v.unit.id===id);return unit?`${unit.code} · ${unit.mainItem.product_name}`:id?'Production unit '+id.slice(0,8):'';}
 partName(row:ShopInterval){return this.s.data().units.find(u=>u.unit_id===row.unit_id)?.parts.find(p=>p.id===row.part_id)?.name||'';}
 done(key:string){return this.snapshot()?.completed.includes(key)||false;}
 estimate(){const v=this.selected();const key=v?.status==='Painting'?'Painting:'+this.operation:v?.status==='Assembly'||v?.status==='Sanding'?v.status+':'+this.partId:v?.status;return key?this.snapshot()?.estimates[key]:undefined;}
 productTime(stage:string,part?:string,operation?:string){return this.s.data().intervals.filter(r=>r.unit_id===this.unitId&&r.stage===stage&&(!part||r.part_id===part)&&(!operation||r.operation===operation)).reduce((sum,r)=>sum+intervalSeconds(r,this.now()),0);}
 canStart(){const v=this.selected(),u=this.snapshot();if(!this.shift()||this.oldShift()||this.timerBlocked())return false;if(this.mode==='other')return true;
  if(!v||!u||u.completed.includes(v.status+':finished'))return false;
  if(v.status==='CNC')return true;
  if(v.status==='Assembly'||v.status==='Sanding')return !!this.partId&&!u.completed.includes(v.status+':'+this.partId);
  return v.status==='Painting'&&availablePaint(this.operation,u.completed);
 }
 async action(action:string,payload:Record<string,unknown>={}){this.notice='';this.localError='';const ok=await this.s.command(action,payload);if(ok)this.notice='Saved';return ok;}
 async start(){if(!this.canStart())return;const stage=this.selected()?.status;
  await this.action('start',this.mode==='other'?{stage:'Other',operation:this.other}:{unitId:this.unitId,stage,partId:['Assembly','Sanding'].includes(stage||'')?this.partId:null,operation:stage==='Painting'?this.operation:stage});
 }
 async resume(){const row=this.previous();if(!row)return;this.unitId=row.unit_id||'';this.mode=row.stage==='Other'?'other':'product';this.partId=row.part_id||'';this.operation=row.operation;this.other=row.operation;await this.start();}
 async finishWork(stage=false){const unitId=this.active()?.unit_id;if(await this.action(stage?'finish-stage':'finish-operation')){if(unitId){this.unitId=unitId;await this.advance();}}}
 async finishPainting(){if(await this.action('finish-painting',{unitId:this.unitId}))await this.advance();}
 async advance(){const v=this.selected(),u=this.snapshot();if(!v||!u||!u.completed.includes(v.status+':finished'))return;
  const next:Record<string,ProductionStatus>={CNC:'Assembly',Assembly:'Sanding',Sanding:u.finish==='raw'?'Packing':'Painting',Painting:'Packing'};
  if(!next[v.status])return;this.moving=true;
  try{const live=this.liveUnits().find(x=>x.unit.id===v.unit.id);if(!this.phone.online()||!live)throw Error('Reconnect and refresh products before changing the board.');await this.production.changeStatus(live,next[v.status]);await this.cacheChoices();this.notice='Stage completed and board updated';this.partId='';this.operation='';}
  catch(e){this.localError='Work is saved, but the board could not advance. '+(e instanceof Error?e.message:'Retry the transition.');}finally{this.moving=false;}
 }
 async enterCnc(){const v=this.liveUnits().find(x=>x.unit.id===this.unitId);if(!v||!this.phone.online())return;this.moving=true;this.localError='';try{await this.production.changeStatus(v,'CNC');await this.cacheChoices();}catch(e){this.localError=e instanceof Error?e.message:'Could not move to CNC';}finally{this.moving=false;}}
 async assign(){await this.action('assign',{unitId:this.unitId,templateId:this.templateId,finish:this.finish});}
 editTemplate(t?:ShopTemplate){this.editingTemplateId=t?.id||'';this.templateVersion=t?.version||0;this.templateName=t?.name||'';this.parts=structuredClone(t?.parts||[]);this.estimates={...t?.estimates};this.tab='templates';}
 addPart(){this.parts=[...this.parts,{id:crypto.randomUUID(),name:''}];}
 removePart(id:string){this.parts=this.parts.filter(p=>p.id!==id);}
 setEstimate(key:string,value:string|number|null){if(value===''||value===null)delete this.estimates[key];else this.estimates[key]=Number(value);}
 async saveTemplate(){this.notice='';if(!this.templateName.trim()||!this.parts.length||this.parts.some(p=>!p.name.trim())){this.localError='Enter a template name and at least one named part.';return;}
  if(await this.action('template',{...(this.editingTemplateId?{id:this.editingTemplateId,version:this.templateVersion}:{}),name:this.templateName.trim(),parts:this.parts.map(p=>({...p,name:p.name.trim()})),estimates:this.estimates})){const saved=this.s.data().templates.find(t=>t.id===this.editingTemplateId||(!this.editingTemplateId&&t.name===this.templateName.trim()));if(saved)this.editTemplate(saved);}
 }
 bounds(){return rangeBounds(this.date,this.period);}
 logs(){const [a,b]=this.bounds();return this.s.data().intervals.filter(r=>Date.parse(r.started_at)<b&&(r.ended_at?Date.parse(r.ended_at):this.now())>=a).sort((x,y)=>y.started_at.localeCompare(x.started_at));}
 summary(){const totals=new Map<string,number>();for(const r of this.logs()){const key=r.stage==='Other'?r.operation:r.stage;totals.set(key,(totals.get(key)||0)+intervalSeconds(r,this.now(),this.bounds()));}return [...totals].map(([name,seconds])=>({name,seconds}));}
 total(kind:string){return this.summary().filter(r=>kind==='work'?!['Pause','Rest'].includes(r.name):r.name===kind).reduce((n,r)=>n+r.seconds,0);}
 shifts(){const [a,b]=this.bounds();return this.s.data().shifts.filter(r=>Date.parse(r.started_at)<b&&Date.parse(r.ended_at||new Date(this.now()).toISOString())>=a).sort((x,y)=>y.started_at.localeCompare(x.started_at));}
 edit(row:ShopInterval|ShopShift,type:string){this.editId=row.id;this.editType=type;this.editStart=localInput(row.started_at);this.editEnd=localInput(row.ended_at||new Date().toISOString());}
 async saveEdit(){try{if(await this.action('edit-'+this.editType,{id:this.editId,start:fromLocalInput(this.editStart),end:fromLocalInput(this.editEnd)}))this.editId='';}catch{this.localError='Enter valid start and end times.';}}
 export(type:string){const rows=this.logs();const text=type==='csv'?'\uFEFF'+[['Start (UTC)','End (UTC)','Employee','Product','Stage','Operation','Part','Seconds in period'],...rows.map(r=>[r.started_at,r.ended_at||'',this.auth.userEmail(),this.label(r.unit_id),r.stage,r.operation,this.partName(r),Math.round(intervalSeconds(r,this.now(),this.bounds()))])].map(r=>r.map(csvCell).join(',')).join('\r\n'):JSON.stringify({exportDate:new Date().toISOString(),timezone:'Australia/Brisbane',dateFilter:this.date,period:this.period,logs:rows,boardState:this.s.data().units},null,2);
  const url=URL.createObjectURL(new Blob([text],{type:type==='csv'?'text/csv;charset=utf-8':'application/json'}));const a=document.createElement('a');a.href=url;a.download=`shop-floor-${this.date}.${type}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}
