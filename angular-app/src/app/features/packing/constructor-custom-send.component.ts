import {ChangeDetectorRef,Component,Input} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DialogModule} from 'primeng/dialog';
import {BoxConstructorComponent} from './box-constructor.component';
import {drawingWithLid,exportBoxSvg} from './box-constructor-geometry';
import {ConstructorCustomRequest,ConstructorCustomService} from './constructor-custom.service';

@Component({selector:'app-constructor-custom-send',standalone:true,imports:[DialogModule,RouterLink],template:`
  @if(success){<p class="success" role="status">{{success}} <a routerLink="/packing/manage" [queryParams]="{tab:'custom'}">Open Custom jobs</a></p>}
  @if(error&&!confirmation){<p class="error" role="alert">{{error}} <button type="button" (click)="open()">Retry</button></p>}
  <p-dialog [(visible)]="confirmation" header="Send to Custom cut" [modal]="true" appendTo="body" [closable]="!busy" [closeOnEscape]="!busy" [style]="{width:'520px',maxWidth:'calc(100vw - 24px)'}">
    <p><strong>{{title}}</strong></p>
    <p>Create a Custom job with one SVG drawing and two RD files: bottom and lid, 2 copies each.</p>
    <p>The job will appear in Manage Packing → Custom jobs.</p>
    @if(progress){<p role="status">{{progress}}</p>}
    @if(error){<p class="error" role="alert">{{error}}</p>}
    <div class="actions"><button type="button" (click)="confirmation=false" [disabled]="busy">Cancel</button><button type="button" (click)="confirm()" [disabled]="busy">{{busy?'Creating…':pending?'Retry creation':'Create Custom job'}}</button></div>
  </p-dialog>
`,styles:[`.actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}button{border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:9px 12px;cursor:pointer}p{overflow-wrap:anywhere}.error{color:#991b1b;background:#fff1f1;padding:10px;border-radius:8px}.success{color:#166534}`]})
export class ConstructorCustomSendComponent {
  @Input({required:true}) editor!:BoxConstructorComponent;
  confirmation=false;busy=false;title='';progress='';error='';success='';pending:ConstructorCustomRequest|null=null;
  constructor(private files:ConstructorCustomService,private cdr:ChangeDetectorRef){}
  open(){if(this.busy||!this.editor.net)return;this.title=this.pending?.p_title||this.files.title(this.editor.net);this.confirmation=true;}
  async confirm(){if(this.busy||!this.confirmation||!this.editor.net)return;this.busy=true;this.error='';this.success='';
    try{
      if(!this.pending){
        if(this.editor.rdFiles.length!==2){this.progress='Generating two RD files…';await this.editor.generateRd();}
        if(this.editor.rdFiles.length!==2)throw Error(this.editor.rdError||'Could not generate both RD files. Retry.');
        this.pending=await this.files.prepare(this.editor.net,exportBoxSvg(drawingWithLid(this.editor.net,this.editor.layout)),this.editor.rdFiles,this.editor.rdSettings,text=>{this.progress=text;this.cdr.markForCheck();});
      }
      this.progress='Saving Custom job…';const job=await this.files.save(this.pending);
      this.success=`Custom job “${job.title}” created with SVG and two RD files.`;this.pending=null;this.confirmation=false;
    }catch(error){this.error=`Could not create Custom job. ${(error as Error)?.message||'Check the connection.'} Your drawing and RD files are kept; retry.`;}
    finally{this.busy=false;this.progress='';this.cdr.markForCheck();}
  }
}
