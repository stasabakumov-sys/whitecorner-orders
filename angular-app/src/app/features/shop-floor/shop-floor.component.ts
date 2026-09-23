import {Component, OnDestroy, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DatePipe} from '@angular/common';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {AuthService} from '../../core/services/auth.service';
import {OrdersService} from '../../core/services/orders.service';
import {ProductionService} from '../../core/services/production.service';
import {ShopPhoneService} from '../../core/services/shop-phone.service';
import {ProductionStatus} from '../../core/models/production.models';
import {orderItemOptionLabels} from '../../core/utils/order-item-display';
import {ShopFloorService} from './shop-floor.service';
import {ProductCncComponent} from '../shipping-data/product-cnc.component';
import {ShopProductChoice,ShopInterval,ShopShift,PAINT_OPERATIONS,paintLabel,needsPaintVolume,parsePaintVolume,OTHER_OPERATIONS,availablePaint,isSameProductTask,onlyRemainingPartId,requiresSanding,brisbaneDate,rangeBounds,intervalSeconds,duration,localInput,fromLocalInput,csvCell} from './shop-floor.models';
import {catalogProductForItem,matchingProductTemplates,orderedFinish,orderedFolding} from './shop-floor-selection';

@Component({selector:'app-shop-floor',standalone:true,imports:[FormsModule,DatePipe,RouterLink,ProductCncComponent],templateUrl:'./shop-floor.component.html',styleUrl:'./shop-floor.component.css'})
export class ShopFloorComponent implements OnDestroy {
 menuOpen=false;mobileStage:ProductionStatus='CNC';mobileDetail=false;
 failedImages=new Set<string>();
 mobileStages(){return this.production.statuses.filter(stage=>stage!=='New');}
 mobileChoices(stage=this.mobileStage){return this.units().filter(v=>v.status===stage&&!this.s.confirmedData().units.find(u=>u.unit_id===v.unit.id)?.completed.includes(stage+':finished'));}
 chooseStage(stage:ProductionStatus){this.mobileStage=stage;this.mobileDetail=false;}
 chooseProduct(v:ShopProductChoice){this.unitId=v.unit.id;this.selectUnit();this.mobileDetail=true;}
 remainingParts(){return this.snapshot()?.parts.filter(p=>!this.done(this.selected()?.status+':'+p.id))||[];}
 image(v:ShopProductChoice){const item=this.liveUnits().find(u=>u.unit.id===v.unit.id)?.mainItem;return !item||this.failedImages.has(v.unit.id)?'':this.production.imageUrl(item);}
 orderNumber(v:ShopProductChoice){return this.liveUnits().find(u=>u.unit.id===v.unit.id)?.order.order_number||v.code.replace(/^#/, '');}
 shortProductName(name:string|null|undefined){return (name||'Product').split(/\s+[-–—]\s+|[–—]/,1)[0].trim();}
 cardOptions(v:ShopProductChoice){const live=this.liveUnits().find(u=>u.unit.id===v.unit.id);return live?[...orderItemOptionLabels(live.mainItem,Infinity),...(live.addons||[]).flatMap(addon=>[`${addon.item.product_name||'Add-on'} × ${addon.quantity}`,...orderItemOptionLabels(addon.item,Infinity)])]:[];}
 remainingPaint(){return this.paint.filter(op=>!this.done('Painting:'+op));}
 paintingStatus(op:string){const active=this.active();if(active?.unit_id===this.unitId&&active.stage==='Painting'&&active.operation===op)return 'Running';if(this.done('Painting:'+op))return op==='Repaint'?'Recorded · repeatable':'✓ Complete';if(!availablePaint(op,this.snapshot()?.completed||[],this.paint))return 'Waiting for previous operations';return this.productTime('Painting',undefined,op)>0?'In progress':'Not started';}
 pausedTask(){return this.active()?.stage==='Pause'?this.previous():undefined;}
 dockTask(){return this.workRunning()?this.active():this.pausedTask();}
 dockLabel(){const row=this.dockTask();return row?row.unit_id?this.label(row.unit_id):row.operation:this.mode==='other'?this.other:this.mobileDetail?this.label(this.unitId):'';}
 dockHint(){const row=this.dockTask();return row?`${row.stage} · ${this.partName(row)||row.operation}`:this.mode==='other'?this.other:!this.mobileDetail?'Choose a stage and product':this.selected()?.status+' · '+(this.snapshot()?.parts.find(p=>p.id===this.partId)?.name||this.operation||'Choose work');}
 dockSeconds(){const row=this.dockTask();if(!row)return 0;return this.s.data().intervals.filter(r=>r.unit_id===row.unit_id&&r.stage===row.stage&&r.part_id===row.part_id&&r.operation===row.operation).reduce((sum,r)=>sum+intervalSeconds(r,this.now()),0);}
 async dockPrimary(){if(!this.shift()){await this.action('shift-start');return;}if(this.workRunning()){await this.action('pause');return;}if(this.pausedTask()){await this.resume();return;}await this.start();}
 now=signal(Date.now());private tick=setInterval(()=>this.now.set(Date.now()),1000);
 tab='timer';unitId='';stageFilter='';partId='';operation='';other='Cleaning';mode='product';
 templateId='';finish='';assigning=false;
 date=brisbaneDate();period='day';editId='';editType='interval';editStart='';editEnd='';notice='';localError='';moving=false;
 paintFinishOpen=false;paintFinishIntervalId='';paintVolumeMl='';paintVolumeError='';
 get paint(){return this.snapshot()?.paint_operations||PAINT_OPERATIONS;}paintLabel=paintLabel;needsPaintVolume=needsPaintVolume;others=OTHER_OPERATIONS;format=duration;seconds=intervalSeconds;paintAvailable=availablePaint;
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
 selectedItem(){return this.liveUnits().find(v=>v.unit.id===this.unitId)?.mainItem;}
 selectedCatalogProduct(){return catalogProductForItem(this.selectedItem(),this.s.catalog());}
 selectedProductId(){return this.selectedCatalogProduct()?.id||'';}
 cncBackdrop(){const product=this.selectedCatalogProduct();return String(product?.product_type||'').trim().toLowerCase()==='backdrop'||/backdrop/i.test(product?.product_name||this.selectedItem()?.product_name||'');}
 cncFolding(){return orderedFolding(this.selectedItem());}
 productTemplates(){return matchingProductTemplates(this.s.data().templates,this.selectedCatalogProduct(),this.selectedItem());}
 snapshot(){return this.s.confirmedData().units.find(v=>v.unit_id===this.unitId);}
 shift(){return this.s.data().shifts.find(v=>!v.ended_at);}
 active(){return this.s.data().intervals.find(v=>!v.ended_at);}
 previous(){const r=[...this.s.data().intervals].filter(v=>v.stage!=='Pause'&&v.shift_id===this.shift()?.id).sort((a,b)=>b.started_at.localeCompare(a.started_at))[0];if(!r)return undefined;
  if(r.ended_at&&this.active()?.started_at===r.ended_at&&this.s.pending().some(c=>['finish-operation','finish-stage'].includes(c.action)))return undefined;
  const valid=(()=>{
  if(!r.unit_id)return true;const u=this.s.data().units.find(u=>u.unit_id===r.unit_id),v=this.units().find(v=>v.unit.id===r.unit_id);
  return v?.status===r.stage&&!u?.completed.includes(r.stage+':finished')&&(r.operation==='Repaint'||!u?.completed.includes(r.stage+':'+(r.part_id||r.operation)));
 })();return valid?r:undefined;}
 blocked(){return !this.phone.online()||this.s.busy()||this.moving||this.assigning||this.s.pending().length>0;}
 timerBlocked(){return this.s.busy()||this.moving||this.s.conflict()||!this.s.loaded();}
 workRunning(){return !!this.active()&&this.active()?.stage!=='Pause';}
 oldShift(){return this.shift()&&brisbaneDate(this.shift()!.started_at)!==brisbaneDate();}
 async selectUnit(){const saved=this.snapshot(),stage=this.selected()?.status,item=this.selectedItem();this.partId=onlyRemainingPartId(saved,stage);this.operation='';const candidates=this.productTemplates();this.templateId=saved?.template_id||(candidates.length===1?candidates[0].id:'');this.finish=saved?.finish||orderedFinish(item?.wix_options,item?.product_name);if(!saved&&this.templateId&&this.finish&&this.phone.online()&&!this.s.busy()&&!this.s.pending().length){await this.assign();this.partId=onlyRemainingPartId(this.snapshot(),stage);}}
 label(id:string|null){const unit=this.units().find(v=>v.unit.id===id);return unit?`${unit.code} · ${unit.mainItem.product_name}`:id?'Production unit '+id.slice(0,8):'';}
 partName(row:ShopInterval){return this.s.data().units.find(u=>u.unit_id===row.unit_id)?.parts.find(p=>p.id===row.part_id)?.name||'';}
 done(key:string){return this.snapshot()?.completed.includes(key)||false;}
 estimate(){const v=this.selected();const key=v?.status==='Painting'?'Painting:'+this.operation:v?.status==='Assembly'||v?.status==='Sanding'?v.status+':'+this.partId:v?.status;return key?this.snapshot()?.estimates[key]:undefined;}
 productTime(stage:string,part?:string,operation?:string){return this.s.data().intervals.filter(r=>r.unit_id===this.unitId&&r.stage===stage&&(!part||r.part_id===part)&&(!operation||r.operation===operation)).reduce((sum,r)=>sum+intervalSeconds(r,this.now()),0);}
 paintUsed(operation:string){return this.s.data().intervals.filter(r=>r.unit_id===this.unitId&&r.stage==='Painting'&&r.operation===operation).reduce((sum,r)=>sum+(r.paint_volume_ml||0),0);}
 selectedTaskActive(){return this.mode==='product'&&isSameProductTask(this.active(),this.unitId,this.selected()?.status,this.partId,this.operation);}
 canStart(){const v=this.selected(),u=this.s.data().units.find(u=>u.unit_id===this.unitId);if(!this.shift()||this.oldShift()||this.timerBlocked()||this.workRunning())return false;if(this.mode==='other')return true;
  if(!v||!u||this.selectedTaskActive()||u.completed.includes(v.status+':finished'))return false;
  if(v.status==='CNC')return true;
  if(v.status==='Assembly'||v.status==='Sanding')return !!this.partId&&!u.completed.includes(v.status+':'+this.partId);
  return v.status==='Painting'&&availablePaint(this.operation,u.completed,this.paint);
 }
 async action(action:string,payload:Record<string,unknown>={}){this.notice='';this.localError='';const ok=await this.s.command(action,payload);if(ok)this.notice='Saved';return ok;}
 async start(){if(!this.canStart())return;const stage=this.selected()?.status;
  await this.action('start',this.mode==='other'?{stage:'Other',operation:this.other}:{unitId:this.unitId,stage,partId:['Assembly','Sanding'].includes(stage||'')?this.partId:null,operation:stage==='Painting'?this.operation:stage});
 }
 async resume(){const row=this.previous();if(!row)return;this.unitId=row.unit_id||'';this.mode=row.stage==='Other'?'other':'product';this.partId=row.part_id||'';this.operation=row.operation;this.other=row.operation;await this.start();}
 async finishWork(stage=false,paintVolumeMl?:number){if(this.timerBlocked()||!this.workRunning())return;const row=this.active();if(row?.stage==='Painting'&&needsPaintVolume(row.operation)&&paintVolumeMl===undefined){this.paintFinishIntervalId=row.id;this.paintVolumeMl='';this.paintVolumeError='';this.paintFinishOpen=true;return;}
  const unitId=row?.unit_id,oldStage=row?.stage;if(await this.action(stage?'finish-stage':'finish-operation',paintVolumeMl===undefined?{}:{paintVolumeMl})){this.paintFinishOpen=false;this.paintFinishIntervalId='';this.paintVolumeMl='';this.paintVolumeError='';if(unitId){this.unitId=unitId;this.mobileStage=oldStage as ProductionStatus;this.partId=onlyRemainingPartId(this.snapshot(),this.selected()?.status);await this.advance();this.mobileDetail=this.selected()?.status===oldStage;}}}
 async confirmPaintFinish(){if(this.active()?.id!==this.paintFinishIntervalId){this.paintVolumeError='The active task changed. Close this dialog and review the timer.';return;}const volume=parsePaintVolume(this.paintVolumeMl);if(volume===null){this.paintVolumeError='Enter paint used in mL, greater than zero (up to 100,000 mL).';return;}this.paintVolumeError='';await this.finishWork(false,volume);}
 async finishPainting(){if(await this.action('finish-painting',{unitId:this.unitId}))await this.advance();}
 async advance(){const v=this.selected(),u=this.snapshot();if(!v||!u||!u.completed.includes(v.status+':finished'))return;
  const live=this.liveUnits().find(x=>x.unit.id===v.unit.id);
  const pickup=/pick[ -]?up/i.test(`${live?.order.delivery_type||''} ${live?.order.delivery_title||''}`);
  const dispatchStage:ProductionStatus=pickup?'Ready':'Packing';
  const afterSanding:ProductionStatus=u.finish==='raw'?dispatchStage:'Painting';
  const next:Record<string,ProductionStatus>={CNC:'Assembly',Assembly:requiresSanding(u)?'Sanding':afterSanding,Sanding:afterSanding,Painting:dispatchStage};
  if(!next[v.status])return;this.moving=true;
  try{if(!this.phone.online()||!live)throw Error('Reconnect and refresh products before changing the board.');await this.production.changeStatus(live,next[v.status]);await this.cacheChoices();this.notice='Stage completed and board updated';this.localError='';this.partId='';this.operation='';this.mobileDetail=false;}
  catch(e){this.localError='Work is saved, but the board could not advance. '+(e instanceof Error?e.message:'Retry the transition.');}finally{this.moving=false;}
 }
 async enterCnc(){const v=this.liveUnits().find(x=>x.unit.id===this.unitId);if(!v||!this.phone.online())return;this.moving=true;this.localError='';try{await this.production.changeStatus(v,'CNC');await this.cacheChoices();}catch(e){this.localError=e instanceof Error?e.message:'Could not move to CNC';}finally{this.moving=false;}}
 async assign(){if(this.assigning||!this.unitId||!this.templateId||!this.finish)return;this.assigning=true;try{await this.action('assign',{unitId:this.unitId,templateId:this.templateId,finish:this.finish});}finally{this.assigning=false;}}
 bounds(){return rangeBounds(this.date,this.period);}
 logs(){const [a,b]=this.bounds();return this.s.data().intervals.filter(r=>Date.parse(r.started_at)<b&&(r.ended_at?Date.parse(r.ended_at):this.now())>=a).sort((x,y)=>y.started_at.localeCompare(x.started_at));}
 summary(){const totals=new Map<string,number>();for(const r of this.logs()){const key=r.stage==='Other'?r.operation:r.stage;totals.set(key,(totals.get(key)||0)+intervalSeconds(r,this.now(),this.bounds()));}return [...totals].map(([name,seconds])=>({name,seconds}));}
 total(kind:string){return this.summary().filter(r=>kind==='work'?!['Pause','Rest'].includes(r.name):r.name===kind).reduce((n,r)=>n+r.seconds,0);}
 shifts(){const [a,b]=this.bounds();return this.s.data().shifts.filter(r=>Date.parse(r.started_at)<b&&Date.parse(r.ended_at||new Date(this.now()).toISOString())>=a).sort((x,y)=>y.started_at.localeCompare(x.started_at));}
 edit(row:ShopInterval|ShopShift,type:string){this.editId=row.id;this.editType=type;this.editStart=localInput(row.started_at);this.editEnd=localInput(row.ended_at||new Date().toISOString());}
 async saveEdit(){try{if(await this.action('edit-'+this.editType,{id:this.editId,start:fromLocalInput(this.editStart),end:fromLocalInput(this.editEnd)}))this.editId='';}catch{this.localError='Enter valid start and end times.';}}
 export(type:string){const rows=this.logs();const text=type==='csv'?'\uFEFF'+[['Start (UTC)','End (UTC)','Employee','Product','Stage','Operation','Part','Seconds in period','Paint used (mL)'],...rows.map(r=>[r.started_at,r.ended_at||'',this.auth.userEmail(),this.label(r.unit_id),r.stage,r.operation,this.partName(r),Math.round(intervalSeconds(r,this.now(),this.bounds())),r.paint_volume_ml??''])].map(r=>r.map(csvCell).join(',')).join('\r\n'):JSON.stringify({exportDate:new Date().toISOString(),timezone:'Australia/Brisbane',dateFilter:this.date,period:this.period,logs:rows,boardState:this.s.data().units},null,2);
  const url=URL.createObjectURL(new Blob([text],{type:type==='csv'?'text/csv;charset=utf-8':'application/json'}));const a=document.createElement('a');a.href=url;a.download=`shop-floor-${this.date}.${type}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}
