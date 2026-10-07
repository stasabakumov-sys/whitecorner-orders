import {Component,OnInit,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {LaserSetupService,SavedLaserSetup,initialLaserSetup,laserSetupError} from './laser-setup.service';
import {HubMembersService} from '../../core/services/hub-members.service';

@Component({selector:'app-laser-setup',standalone:true,imports:[FormsModule],template:`
 <section aria-labelledby="laser-setup-heading">
  <div class="heading"><div><h2 id="laser-setup-heading">Laser setup</h2><p>Shared settings for new box RD files.</p></div>
   <div class="actions">
    @if(!editing()){<button type="button" title="Reload saved laser setup" (click)="load()" [disabled]="loading()||busy()">Refresh</button><button type="button" class="icon" aria-label="Edit laser setup" title="Edit laser setup" (click)="edit()" [disabled]="loading()||!saved||!members.manager()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>}
    @else{<button type="button" (click)="cancel()" [disabled]="busy()">Cancel</button>@if(changed()){<button type="button" class="icon" aria-label="Save laser setup" title="Save laser setup" (click)="save()" [disabled]="busy()||!!validation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-8h8v8"/></svg></button>}}
   </div>
  </div>
  @if(loading()){<p role="status">Loading laser setup…</p>}
  @if(busy()){<p role="status">Saving laser setup…</p>}
  @if(error()){<p class="error" role="alert">{{error()}} @if(!editing()){<button type="button" (click)="load()" [disabled]="loading()">Retry</button>}</p>}
  @if(done()){<p class="success" role="status">Laser setup saved. New RD exports will use these settings.</p>}
  <div class="modes">
   @for(mode of modes;track mode.key){<section class="mode" [attr.aria-label]="mode.name+' settings'"><h3>{{mode.name}}</h3><div class="fields">
    <label>{{mode.name}} speed, mm/s<input type="number" min="0.1" max="1000" step="0.1" [(ngModel)]="draft[mode.key].speed" (ngModelChange)="done.set(false)" [disabled]="!editing()||busy()||loading()"></label>
    <label>{{mode.name}} min power, %<input type="number" min="0" max="100" step="0.1" [(ngModel)]="draft[mode.key].minPower" (ngModelChange)="done.set(false)" [disabled]="!editing()||busy()||loading()"></label>
    <label>{{mode.name}} max power, %<input type="number" min="0" max="100" step="0.1" [(ngModel)]="draft[mode.key].maxPower" (ngModelChange)="done.set(false)" [disabled]="!editing()||busy()||loading()"></label>
    @if(mode.key==='dot'){
     <label>Dot time, s<input type="number" min="0.001" max="60" step="0.001" [(ngModel)]="draft.dotTime" (ngModelChange)="done.set(false)" [disabled]="!editing()||busy()||loading()"></label>
     <label>Dot interval, mm<input type="number" min="0.1" max="10000" step="0.1" [(ngModel)]="draft.dotInterval" (ngModelChange)="done.set(false)" [disabled]="!editing()||busy()||loading()"></label>
     <label>Dot length, mm<input type="number" min="0.1" max="10000" step="0.1" [(ngModel)]="draft.dotLength" (ngModelChange)="done.set(false)" [disabled]="!editing()||busy()||loading()"></label>
    }
   </div></section>}
  </div>
  @if(editing()&&validation){<p class="error" role="alert">{{validation}}</p>}
  <p class="note">Dot interval is the distance between the starts of two dashes. Dot length is the laser-on length. Dot time applies to stationary dots; moving dashes use the selected speed.</p>
 </section>`,styles:[`
 :host{display:block}.heading{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:14px}h2,h3{margin:0;font-size:1rem}.heading p,.note{margin:5px 0 0;color:var(--wc-muted)}.note{margin-top:12px;font-size:.85rem}.actions{display:flex;align-items:center;gap:6px}.modes{display:grid;gap:14px}.mode{background:#fff;border:1px solid var(--wc-border);border-radius:12px;padding:14px}.fields{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}label{display:flex;flex-direction:column;gap:4px;font-size:.85rem}input,button{box-sizing:border-box;border:1px solid var(--wc-border);border-radius:7px;background:#fff;color:inherit;font:inherit;height:32px;padding:4px 8px}input{width:116px}input:disabled{opacity:1;color:var(--wc-muted);background:#f8fafb}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0}.icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}button:focus-visible,input:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:2px}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;padding:9px;border-radius:7px}.success{color:#166534}@media(max-width:500px){label{flex:1 1 115px}input{width:100%}}
 `]})
export class LaserSetupComponent implements OnInit {
 readonly modes=[{key:'cut',name:'Cut'},{key:'dot',name:'Dot'}] as const;
 readonly loading=signal(false);readonly busy=signal(false);readonly editing=signal(false);readonly error=signal('');readonly done=signal(false);
 saved:SavedLaserSetup|null=null;draft=initialLaserSetup();
 constructor(private setup:LaserSetupService,readonly members:HubMembersService){}
 ngOnInit(){void this.load();}
 get validation(){return laserSetupError(this.draft);}
 changed(){return !!this.saved&&JSON.stringify(this.draft)!==JSON.stringify(this.saved.settings);}
 async load(){if(this.loading()||this.busy()||this.editing())return;this.loading.set(true);this.error.set('');this.done.set(false);
  try{await this.members.load();if(!this.members.manager())throw Error('Manager access is required.');this.saved=await this.setup.load();this.draft=structuredClone(this.saved.settings);}
  catch(error){this.error.set(`Could not load laser setup. ${(error as Error)?.message||'Check the connection and retry.'}`);}finally{this.loading.set(false);}
 }
 edit(){if(!this.saved||this.loading()||this.busy()||!this.members.manager())return;this.draft=structuredClone(this.saved.settings);this.error.set('');this.done.set(false);this.editing.set(true);}
 cancel(){if(this.busy())return;if(this.saved)this.draft=structuredClone(this.saved.settings);this.editing.set(false);this.error.set('');}
 async save(){if(!this.saved||!this.editing()||!this.changed()||this.busy()||this.validation||!this.members.manager())return;this.busy.set(true);this.error.set('');this.done.set(false);
  try{this.saved=await this.setup.save(this.draft,this.saved.revision);this.draft=structuredClone(this.saved.settings);this.editing.set(false);this.done.set(true);}
  catch(error){this.error.set(`Could not save laser setup. ${(error as Error)?.message||'Check the connection and retry.'} Your changes are retained.`);}finally{this.busy.set(false);}
 }
}
