import {ChangeDetectorRef,Component,EventEmitter,Input,Output,ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DialogModule} from 'primeng/dialog';
import {HubMembersService} from '../../core/services/hub-members.service';
import {BoxConstructorComponent} from '../packing/box-constructor.component';
import {exportBoxSvg} from '../packing/box-constructor-geometry';
import {CartConstructorFilesService,CartConstructorSave,CartConstructorState,cartConstructorDimensions} from './cart-constructor-files.service';

@Component({selector:'app-cart-box-constructor',standalone:true,imports:[FormsModule,DialogModule,BoxConstructorComponent],template:`
 @if(members.manager()){
 <button class="icon" type="button" aria-label="Open box Constructor" [title]="locked?'Save packaging dimensions before opening Constructor':'Create SVG and RD for this Cart box'" [disabled]="locked||!box.id" (click)="show()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/></svg></button>
 }
 <p-dialog [(visible)]="open" [modal]="true" appendTo="body" [draggable]="false" [closable]="!busy&&!pending" [closeOnEscape]="!busy&&!pending" [header]="'Constructor · '+(snapshot?.package_name||'Cart box')" [style]="{width:'1100px',maxWidth:'calc(100vw - 24px)'}">
 @if(open){
 <p>Packaging: {{snapshot.length_mm}} × {{snapshot.width_mm}} × {{snapshot.height_mm}} mm. Bottom: L/W − 15 mm. Lid: L/W − 5 mm. Height stays unchanged.</p>
 @if(progress){<p role="status">{{progress}}</p>}
 @if(error){<p class="error" role="alert">{{error}} @if(loadFailed){<button type="button" (click)="load()">Retry load</button>}</p>}
 @if(success){<p role="status">{{success}}</p>}
 @if(!loading&&!loadFailed&&seed){
 @if(state.drawing){<button type="button" (click)="download()" [disabled]="busy">Saved SVG · {{state.drawing.filename}}</button>}
 <fieldset [disabled]="busy||!!pending"><app-box-constructor [initialDimensions]="seed" [fixedDimensions]="true" /></fieldset>
 @if(editor?.rdFiles?.length===2){<ul>@for(file of editor!.rdFiles;track file.filename){<li>{{file.filename}} · 2 copies</li>}</ul>}
 @if(state.files.length===2){
 <p>Saving replaces the two selected RD files and updates unfinished packing tasks. Each file will have 2 copies.</p>
 <div class="replacements">@for(label of ['Bottom','Lid'];track label;let i=$index){<label>{{label}} RD to replace<select [(ngModel)]="replacementIds[i]" [disabled]="busy||!!pending"><option value="">Choose existing file</option>@for(file of state.files;track file.id){<option [value]="file.id">{{file.filename}}</option>}</select></label>}</div>
 }@else if(state.files.length>0){<p class="error" role="alert">This box has {{state.files.length}} RD files. Review its RD set first; Constructor requires either no files or exactly two.</p>}
 <div class="save"><button type="button" class="icon" aria-label="Save SVG and two RD files to packaging" title="Save SVG and two RD files to packaging" [disabled]="busy||!canSave" (click)="save()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button><span>{{pending?'Retry saving the same files to packaging':'Save SVG and both RD files to this packaging box · 2 copies each'}}</span></div>
 @if(pending&&!busy){<button type="button" (click)="leavePending()">Close and check saved files later</button>}
 }
 }
 </p-dialog>
 `,styles:[`
 :host{display:inline-block}.icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid var(--wc-border,#dce4ee);border-radius:6px;background:var(--wc-surface,#fff);cursor:pointer}.icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round}fieldset{border:0;padding:0;margin:14px 0;min-width:0}.error{color:#991b1b;background:#fff1f1;padding:10px;border:1px solid #fecaca;border-radius:6px}.save,.replacements{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}.replacements label{display:flex;flex-direction:column;gap:6px}.replacements select{max-width:100%;padding:8px;border:1px solid #dce4ee;border-radius:6px}[disabled]{opacity:.6;cursor:default}
 `]})
export class CartBoxConstructorComponent {
 @Input()box:any={};@Input()locked=false;@Output()filesSaved=new EventEmitter<void>();
 @ViewChild(BoxConstructorComponent)editor?:BoxConstructorComponent;
 open=false;busy=false;loading=false;loadFailed=false;error='';progress='';success='';snapshot:any;private loadVersion=0;
 seed:{length:number;width:number;depth:number}|null=null;state:CartConstructorState={drawing:null,files:[]};replacementIds=['',''];pending:CartConstructorSave|null=null;private savedFiles:unknown=null;
 constructor(private files:CartConstructorFilesService,readonly members:HubMembersService,private cdr:ChangeDetectorRef){}
 async show(){if(this.locked||!this.box.id||!this.members.manager())return;this.snapshot={...this.box};this.open=true;this.seed=null;this.error='';this.success='';this.pending=null;
  try{this.seed=cartConstructorDimensions(this.snapshot);await this.load();}catch(error){this.error=this.message(error);this.cdr.markForCheck();}
 }
 async load(){const version=++this.loadVersion;this.loading=true;this.loadFailed=false;this.error='';this.progress='Loading saved packaging files…';
  try{const state=await this.files.load(this.snapshot.id);if(version!==this.loadVersion)return;this.state=state;const ids=this.state.drawing?.constructor_data?.rd_ids||[];this.replacementIds=[0,1].map(i=>this.state.files.some(file=>file.id===ids[i])?ids[i]:'');}
  catch(error){if(version===this.loadVersion){this.loadFailed=true;this.error=`Could not load packaging files. ${this.message(error)} Retry load.`;}}
  finally{if(version===this.loadVersion){this.loading=false;this.progress='';this.cdr.markForCheck();}}
 }
 get canSave(){return !!this.pending||!!this.editor?.drawing&&this.editor.rdFiles!==this.savedFiles&&this.editor.rdFiles.length===2&&!this.editor.rdBusy&&(this.state.files.length===0||this.state.files.length===2&&new Set(this.replacementIds).size===2&&this.replacementIds.every(Boolean));}
 async save(){if(this.busy||!this.canSave)return;this.busy=true;this.error='';this.success='';
  try{
   if(!this.pending){const editor=this.editor!;this.pending=await this.files.prepare(this.snapshot,exportBoxSvg(editor.drawing!),editor.rdFiles,structuredClone(editor.rdSettings),this.state,this.replacementIds,text=>{this.progress=text;this.cdr.markForCheck();});}
   this.progress='Saving SVG and both RD files to packaging…';
   this.state=await this.files.save(this.pending);this.pending=null;this.savedFiles=this.editor?.rdFiles;this.replacementIds=this.state.files.map(file=>file.id);this.success='SVG and two RD files saved to this packaging box. Each RD has 2 copies.';this.filesSaved.emit();
  }catch(error){this.error=`Could not save packaging files. ${this.message(error)} ${this.pending?'Retry Save to check and finish the same operation.':'Generated files and settings are kept; retry Save.'}`;}
  finally{this.busy=false;this.progress='';this.cdr.markForCheck();}
 }
 leavePending(){this.pending=null;this.open=false;this.filesSaved.emit();}
 async download(){this.error='';try{await this.files.downloadSvg(this.state.drawing.object_path,this.state.drawing.filename);}catch(error){this.error=`Could not download SVG. ${this.message(error)} Retry.`;}this.cdr.markForCheck();}
 private message(error:unknown){return (error as {message?:string})?.message||'Connection or server error.';}
}
