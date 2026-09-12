import {Injectable, signal, computed} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {AuthService} from '../../core/services/auth.service';
import {ShopData,ShopCommand,projectCommands,OFFLINE_ACTIONS} from './shop-floor.models';

@Injectable({providedIn:'root'})
export class ShopFloorService {
 private readonly serverData=signal<ShopData>({templates:[],units:[],shifts:[],intervals:[]});
 readonly data=computed(()=>projectCommands(this.serverData(),this.pending(),this.auth.session()?.user.id||''));
 readonly conflict=signal(false);
 readonly busy=signal(false);readonly error=signal('');readonly pending=signal<ShopCommand[]>([]);readonly loaded=signal(false);
 private owner=''; private syncing=false;
 private confirmed=new Set<string>();
 constructor(private db:SupabaseService,private auth:AuthService) {
  window.addEventListener('online',()=>{void this.sync();});
 }
 private async storage(write?: unknown):Promise<any> {
  const owner=this.auth.session()?.user.id;if(!owner)throw Error('Sign in required');
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('wc-shop-floor',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('cache');
   request.onerror=()=>reject(Error('Local storage unavailable. Free device storage and retry.'));
   request.onsuccess=()=>{
    const database=request.result,tx=database.transaction('cache',write===undefined?'readonly':'readwrite');
    const r=write===undefined?tx.objectStore('cache').get(owner):tx.objectStore('cache').put(write,owner);
    tx.oncomplete=()=>{database.close();resolve(r.result);};tx.onerror=()=>{database.close();reject(Error('Could not save on this device. Free storage and retry.'));};
   };
  });
 }
 private save(){return this.storage({data:this.serverData(),pending:this.pending()});}
 async load(){
  const owner=this.auth.session()?.user.id;if(!owner)return;
  if(this.owner!==owner){this.serverData.set({templates:[],units:[],shifts:[],intervals:[]});this.pending.set([]);this.loaded.set(false);this.owner=owner;
   try{const cache=await this.storage();if(cache){this.serverData.set(cache.data);this.pending.set(cache.pending||[]);this.loaded.set(true);}}catch(e){this.error.set(this.message(e));}
  }
  await this.sync();
 }
 private async rows(table:string){
  const all:any[]=[];for(let offset=0;;offset+=500){const {data,error}=await this.db.client.from(table).select('*').order(table==='wc_shop_units'?'unit_id':'id').range(offset,offset+499);if(error)throw error;all.push(...data);if(data.length<500)return all;}
 }
 async refresh(){
  const owner=this.owner;
  const [templates,units,shifts,intervals]=await Promise.all(['wc_shop_templates','wc_shop_units','wc_shop_shifts','wc_shop_intervals'].map(x=>this.rows(x)));
  if(owner!==this.auth.session()?.user.id)return;
  this.serverData.set({templates,units,shifts,intervals});this.loaded.set(true);await this.save();
 }
 async sync(){
  if(this.syncing||!this.auth.session()||this.owner!==this.auth.session()?.user.id)return;
  if(!navigator.onLine){this.error.set('Offline. Timer actions are saved on this device and will sync when connected.');this.busy.set(false);return;}
  this.syncing=true;this.busy.set(true);this.error.set('');this.conflict.set(false);
  try{
   for(const command of this.pending()){
    if(this.owner!==this.auth.session()?.user.id)throw Error('User session changed. Sign in again to sync.');
    const {error}=await this.db.client.rpc('wc_shop_command',{p_id:command.id,p_action:command.action,p:command.payload});
    if(error){
     const rejected=!!error.code&&!['','0'].includes(error.code);
     if(rejected&&!OFFLINE_ACTIONS.includes(command.action)){this.pending.update(rows=>rows.filter(x=>x.id!==command.id));await this.save();}
     this.conflict.set(rejected&&this.pending().length>0);throw error;
    }
    // Refresh before acknowledging locally, so a lost read cannot regress the timer.
    const [templates,units,shifts,intervals]=await Promise.all(['wc_shop_templates','wc_shop_units','wc_shop_shifts','wc_shop_intervals'].map(x=>this.rows(x)));
    this.serverData.set({templates,units,shifts,intervals});this.pending.update(rows=>rows.filter(x=>x.id!==command.id));await this.save();this.confirmed.add(command.id);
   }
   await this.refresh();
  }catch(e){this.error.set(this.message(e)+' Your saved data and queued actions are retained. Retry sync.');}
  finally{this.syncing=false;this.busy.set(false);}
 }
 async command(action:string,payload:Record<string,unknown>={}){
  if(this.busy())return false;
  this.busy.set(true);this.error.set('');
  const expected=OFFLINE_ACTIONS.includes(action)?{expectedActiveStart:this.data().intervals.find(i=>!i.ended_at)?.started_at||null}:{};
  const command={id:crypto.randomUUID(),action,payload:{...payload,...expected,at:new Date().toISOString()}};
  // Queue timer commands before transmitting; retain the UUID on every retry.
  this.pending.update(rows=>[...rows,command]);
  try{await this.save();}catch(e){this.pending.update(rows=>rows.filter(x=>x.id!==command.id));this.error.set(this.message(e));this.busy.set(false);return false;}
  await this.sync();return this.confirmed.delete(command.id);
 }
 async discardPending(){try{await this.refresh();this.pending.set([]);this.conflict.set(false);await this.save();}catch(e){this.error.set(this.message(e));}}
 private message(e:unknown){return e instanceof Error?e.message:(e as {message?:string})?.message||'Could not load or save Shop Floor.';}
}
