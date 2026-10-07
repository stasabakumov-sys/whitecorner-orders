import {Injectable} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {RdLayerSettings} from './box-constructor-rd';

export interface LaserSetup {
 cut: RdLayerSettings;
 dot: RdLayerSettings;
 dotTime: number | null;
 dotInterval: number | null;
 dotLength: number | null;
}
export interface SavedLaserSetup {settings: LaserSetup; revision: string}
export const initialLaserSetup=():LaserSetup=>({cut:{speed:120,minPower:70,maxPower:80},dot:{speed:120,minPower:70,maxPower:80},dotTime:0.2,dotInterval:4,dotLength:2});
export function laserSetupError(value:LaserSetup):string {
 for(const [name,layer] of [['Cut',value.cut],['Dot',value.dot]] as const){
  if(!layer||typeof layer.speed!=='number'||!Number.isFinite(layer.speed)||layer.speed<=0||layer.speed>1000)return `${name}: enter speed greater than 0 and up to 1000 mm/s.`;
  if([layer.minPower,layer.maxPower].some(power=>typeof power!=='number'||!Number.isFinite(power)||power<0||power>100))return `${name}: enter power between 0 and 100%.`;
  if(layer.minPower!>layer.maxPower!)return `${name}: minimum power cannot exceed maximum power.`;
 }
 if(typeof value.dotTime!=='number'||!Number.isFinite(value.dotTime)||value.dotTime<=0||value.dotTime>60)return 'Enter Dot time greater than 0 and up to 60 seconds.';
 if([value.dotInterval,value.dotLength].some(length=>typeof length!=='number'||!Number.isFinite(length)||length<0.1||length>10000))return 'Enter Dot interval and length between 0.1 and 10000 mm.';
 if(value.dotLength!>=value.dotInterval!)return 'Dot interval must exceed Dot length to leave an uncut gap.';
 return '';
}
function checked(row:any):SavedLaserSetup {
 if(!row||typeof row.revision!=='string'||!row.settings||laserSetupError(row.settings))throw Error('Laser setup is missing or invalid. Open Manage cutting and retry loading Laser setup.');
 return {settings:row.settings,revision:row.revision};
}
async function bounded<T>(request:PromiseLike<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The request timed out. Check the connection and retry.')),15000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
@Injectable({providedIn:'root'})
export class LaserSetupService {
 constructor(private db:SupabaseService){}
 async load():Promise<SavedLaserSetup>{
  const {data,error}=await bounded(this.db.client.from('wc_laser_setup').select('settings,revision').eq('id',true).single());
  if(error)throw error;return checked(data);
 }
 async save(settings:LaserSetup,revision:string):Promise<SavedLaserSetup>{
  const invalid=laserSetupError(settings);if(invalid)throw Error(invalid);
  const {data,error}=await bounded(this.db.client.rpc('wc_save_laser_setup',{p_settings:structuredClone(settings),p_expected:revision}));
  if(error)throw error;const saved=checked(data);
  if(JSON.stringify(saved.settings)!==JSON.stringify(settings)){
   // JSONB can reorder keys; compare the known fields rather than key order.
   for(const layer of ['cut','dot'] as const)for(const field of ['speed','minPower','maxPower'] as const)if(saved.settings[layer][field]!==settings[layer][field])throw Error('Server did not confirm the saved laser settings. Retry loading before editing.');
   for(const field of ['dotTime','dotInterval','dotLength'] as const)if(saved.settings[field]!==settings[field])throw Error('Server did not confirm the saved laser settings. Retry loading before editing.');
  }
  return saved;
 }
}
