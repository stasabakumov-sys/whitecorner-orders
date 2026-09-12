import {Injectable, signal, inject} from '@angular/core';
import {SwUpdate} from '@angular/service-worker';

interface InstallPrompt extends Event {
 prompt(): Promise<void>;
 userChoice: Promise<{outcome:'accepted'|'dismissed'}>;
}

@Injectable({providedIn:'root'})
export class ShopPhoneService {
 readonly online=signal(navigator.onLine);
 readonly installed=signal(window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & {standalone?:boolean}).standalone);
 readonly canInstall=signal(false);
 readonly updateReady=signal(false);
 readonly error=signal('');
 readonly installing=signal(false);
 readonly ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
 private promptEvent:InstallPrompt|null=null;
 private updates=inject(SwUpdate,{optional:true});
 constructor(){
  window.addEventListener('online',()=>{this.online.set(true);if(this.updates?.isEnabled)void this.updates.checkForUpdate().catch(()=>{});});
  window.addEventListener('offline',()=>this.online.set(false));
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();this.promptEvent=event as InstallPrompt;this.canInstall.set(true);});
  window.addEventListener('appinstalled',()=>{this.installed.set(true);this.canInstall.set(false);this.promptEvent=null;});
  this.updates?.versionUpdates.subscribe(event=>{if(event.type==='VERSION_READY')this.updateReady.set(true);});
 }
 async install(){
  if(!this.promptEvent||this.installing())return;
  const event=this.promptEvent;this.promptEvent=null;this.canInstall.set(false);this.installing.set(true);this.error.set('');
  try{await event.prompt();await event.userChoice;}catch{this.error.set('Installation could not start. Open this page in Safari or Chrome and use Add to Home Screen.');}
  finally{this.installing.set(false);}
 }
 reload(){window.location.reload();}
}
