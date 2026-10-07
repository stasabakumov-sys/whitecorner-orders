import {BACKDROP_REFERENCE} from './backdrop-box-geometry';
import {Component} from '@angular/core';
import {BoxConstructorComponent} from './box-constructor.component';
import {ConstructorCustomSendComponent} from './constructor-custom-send.component';
import {HubMembersService} from '../../core/services/hub-members.service';

@Component({
  selector: 'app-constructor-page', standalone: true, imports: [BoxConstructorComponent,ConstructorCustomSendComponent],
  template: `
    <h1>Constructor</h1>
    <div class="tabs" role="tablist" aria-label="Box type">
      @for(tab of tabs; track tab.id){
        <button type="button" role="tab" [id]="'constructor-tab-'+tab.id"
          [attr.aria-controls]="'constructor-panel-'+tab.id" [attr.aria-selected]="active===tab.id"
          [attr.tabindex]="active===tab.id?0:-1" [disabled]="sender.busy" (click)="active=tab.id" (keydown)="navigate($event,tab.id)">{{tab.label}}</button>
      }
    </div>
    <section id="constructor-panel-card" role="tabpanel" aria-labelledby="constructor-tab-card" [hidden]="active!=='card'">
      <fieldset [disabled]="sender.busy||!!sender.pending"><app-box-constructor #editor [showHeading]="false" [customCut]="members.manager()" (customCutRequested)="sender.open()" /></fieldset>
      <app-constructor-custom-send #sender [editor]="editor" />
    </section>
    <section id="constructor-panel-small" role="tabpanel" aria-labelledby="constructor-tab-small" [hidden]="active!=='small'">
      <app-box-constructor [showHeading]="false" boxType="small" [initialDimensions]="smallDimensions" />
    </section>
    <section id="constructor-panel-backdrop" role="tabpanel" aria-labelledby="constructor-tab-backdrop" [hidden]="active!=='backdrop'">
      <app-box-constructor [showHeading]="false" boxType="backdrop" [initialDimensions]="backdropDimensions" />
    </section>
  `,
  styles: [`
    :host{display:block}h1{margin:0}.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 14px}
    .tabs button{border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:9px 14px;color:inherit;font:inherit;cursor:pointer}
    .tabs button[aria-selected="true"]{background:#e8f5f2;border-color:#32a69a;color:#16665d}
    .tabs button:focus-visible{outline:2px solid #32a69a;outline-offset:2px}
    section[hidden]{display:none}
    fieldset{padding:0;margin:0;border:0;min-width:0}
  `],
})
export class ConstructorPageComponent {
  constructor(readonly members:HubMembersService){}
  readonly tabs=[{id:'card',label:'Card box'},{id:'small',label:'Small box'},{id:'backdrop',label:'Backdrop box'}];
  active='card';
  readonly smallDimensions={length:270,width:140,depth:140};
  readonly backdropDimensions=BACKDROP_REFERENCE;
  navigate(event:KeyboardEvent,id:string):void {
    const index=this.tabs.findIndex(tab=>tab.id===id);
    const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;
    if(next<0)return;
    event.preventDefault();this.active=this.tabs[next].id;
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLButtonElement>('#constructor-tab-'+this.active)?.focus();
  }
}
