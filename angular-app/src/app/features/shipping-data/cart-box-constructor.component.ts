import {ChangeDetectorRef,Component,EventEmitter,Input,Output,ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DialogModule} from 'primeng/dialog';
import {HubMembersService} from '../../core/services/hub-members.service';
import {BoxConstructorComponent} from '../packing/box-constructor.component';
import {exportBoxSvg} from '../packing/box-constructor-geometry';
import {CartConstructorFilesService,CartConstructorSave,ProfileConstructorSave,BackdropConstructorSave,CartConstructorState,CartBoxType,cartConstructorDimensions} from './cart-constructor-files.service';
import {qualifiedDrawingKey,sizeKeyLabel} from './product-sizes';

@Component({selector:'app-cart-box-constructor',standalone:true,imports:[FormsModule,DialogModule,BoxConstructorComponent],template:`
 @if(members.manager()){
 <button class="icon" type="button" [attr.aria-label]="'Create SVG and RD for '+(box.package_name||'Packaging box')" [title]="locked?'Save packaging dimensions before opening Constructor':'Create SVG and RD for this packaging box'" [disabled]="locked||(!box.id&&!profileSignature&&!qualifiedSize(sharedSize))" (click)="show()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/></svg></button>
 }
 <p-dialog [(visible)]="open" [modal]="true" appendTo="body" [draggable]="false" [closable]="!busy&&!pending" [closeOnEscape]="!busy&&!pending" [header]="'Constructor · '+(snapshot?.package_name||'Packaging box')" [style]="{width:'1100px',maxWidth:'calc(100vw - 24px)'}">
 @if(sharedKey){<p><strong>{{sizeLabel(sharedKey)}}</strong> · Shared by all matching Backdrops, Painted and Raw. The other folding option uses a separate box and files.</p>}
 @if(open){
 <p>Packaging: {{snapshot.length_mm}} × {{snapshot.width_mm}} × {{snapshot.height_mm}} mm. {{boxType==='small'?'Small box: L/W − 5 mm.':'Bottom: L/W − 15 mm. Lid: L/W − 5 mm.'}} Height stays unchanged.</p>
 <label class="box-type" for="packing-constructor-type">Box type<select id="packing-constructor-type" [(ngModel)]="boxType" [disabled]="busy||!!pending||loading||editor?.rdBusy" (ngModelChange)="changeType()"><option value="card">Card box</option><option value="small">Small box</option></select></label>
 @if(progress){<p role="status">{{progress}}</p>}
 @if(error){<p class="error" role="alert">{{error}} @if(loadFailed){<button type="button" (click)="load()">Retry load</button>}</p>}
 @if(success){<p role="status">{{success}}</p>}
 @if(!loading&&!loadFailed&&seed){
 @if(state.drawing){<button type="button" (click)="download()" [disabled]="busy">Saved SVG · {{state.drawing.filename}}</button>}
 <fieldset [disabled]="busy||!!pending"><app-box-constructor [initialDimensions]="seed" [fixedDimensions]="true" [boxType]="boxType" [initialTuck]="tuckSeed" /></fieldset>
 @if(editor?.rdFiles?.length===fileCount){<ul>@for(file of editor!.rdFiles;track file.filename){<li>{{file.filename}} · {{copies}} {{copies===1?'copy':'copies'}}</li>}</ul>}
 @if(state.files.length===fileCount){
 <p>Saving replaces the selected RD files and updates unfinished packing tasks. Each file will have {{copies}} {{copies===1?'copy':'copies'}}.</p>
 <div class="replacements">@for(label of fileLabels;track label;let i=$index){<label>{{label}} RD to replace<select [(ngModel)]="replacementIds[i]" [disabled]="busy||!!pending"><option value="">Choose existing file</option>@for(file of state.files;track file.id){<option [value]="file.id">{{file.filename}}</option>}</select></label>}</div>
 }@else if(state.files.length>2){<p class="error" role="alert">This box has {{state.files.length}} RD files. Review its RD set first; Constructor supports one or two saved files.</p>}
 @else if(state.files.length>0){<p>Saving changes the RD set from {{state.files.length}} to {{fileCount}} files. Any active cutting task using the old files must be completed or cancelled first. @if(profileSignature){Remove the existing files in the RD editor before saving this box type.}</p>}
 <div class="save"><button type="button" class="icon" [attr.aria-label]="saveLabel" [title]="saveLabel" [disabled]="busy||!canSave" (click)="save()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button><span>{{pending?'Retry saving the same files to packaging':saveLabel+' · '+copies+' '+(copies===1?'copy':'copies')+' each'}}</span></div>
 @if(pending&&!busy){<button type="button" (click)="leavePending()">Close and check saved files later</button>}
 }
 }
 </p-dialog>
 <p-dialog [(visible)]="confirmOpen" header="Save packaging files" [modal]="true" appendTo="body" [draggable]="false" [closable]="!busy" [closeOnEscape]="!busy" [style]="{width:'480px',maxWidth:'calc(100vw - 24px)'}">
 <p><strong>{{snapshot?.package_name}} · {{boxType==='small'?'Small box':'Card box'}}</strong></p>
 <p>Save one SVG and {{fileCount}} RD {{fileCount===1?'file':'files'}} to this packaging box, {{copies}} {{copies===1?'copy':'copies'}} each. Existing files will be replaced. Matching unfinished cutting tasks are updated when the file count stays the same.</p>
 <div class="save"><button type="button" [disabled]="busy" (click)="confirmOpen=false">Cancel</button><button type="button" class="icon" [attr.aria-label]="saveLabel" [title]="saveLabel" [disabled]="busy" (click)="confirmSave()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button></div>
 </p-dialog>
 `,styles:[`
 :host{display:inline-block}.box-type{display:flex;flex-direction:column;gap:5px;width:180px}.box-type select{height:38px;border:1px solid var(--wc-border);border-radius:8px;background:#fff;padding:6px 10px;font:inherit}.icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid var(--wc-border,#dce4ee);border-radius:6px;background:var(--wc-surface,#fff);cursor:pointer}.icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round}fieldset{border:0;padding:0;margin:14px 0;min-width:0}.error{color:#991b1b;background:#fff1f1;padding:10px;border:1px solid #fecaca;border-radius:6px}.save,.replacements{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}.replacements label{display:flex;flex-direction:column;gap:6px}.replacements select{max-width:100%;padding:8px;border:1px solid #dce4ee;border-radius:6px}[disabled]{opacity:.6;cursor:default}
 `]})
export class CartBoxConstructorComponent {
 @Input()box:any={};@Input()locked=false;@Input()profileSignature='';@Input()profileIndex=0;@Input()sharedSize='';@Output()filesSaved=new EventEmitter<void>();
 readonly qualifiedSize=qualifiedDrawingKey;readonly sizeLabel=sizeKeyLabel;sharedKey='';
 @ViewChild(BoxConstructorComponent)editor?:BoxConstructorComponent;
 boxType:CartBoxType='card';tuckSeed=40;confirmOpen=false;
 open=false;busy=false;loading=false;loadFailed=false;error='';progress='';success='';snapshot:any;private loadVersion=0;
 seed:{length:number;width:number;depth:number}|null=null;state:CartConstructorState={drawing:null,files:[]};replacementIds=['',''];pending:CartConstructorSave|ProfileConstructorSave|BackdropConstructorSave|null=null;private savedFiles:unknown=null;
 constructor(private files:CartConstructorFilesService,readonly members:HubMembersService,private cdr:ChangeDetectorRef){}
 async show(){if(this.locked||this.sharedSize&&!qualifiedDrawingKey(this.sharedSize)||(!this.box.id&&!this.profileSignature&&!this.sharedSize)||!this.members.manager())return;this.sharedKey=this.sharedSize;this.snapshot=structuredClone(this.box);this.open=true;this.seed=null;this.error='';this.success='';this.pending=null;
  await this.load();
 }
 async load(){const version=++this.loadVersion;this.loading=true;this.loadFailed=false;this.error='';this.progress='Loading saved packaging files…';
  try{const state=this.sharedKey?await this.files.loadBackdrop(this.sharedKey):this.profileSignature?await this.files.loadProfile(this.profileSignature,this.profileIndex):await this.files.load(this.snapshot.id);if(version!==this.loadVersion)return;this.state=state;const ids=this.state.drawing?.constructor_data?.rd_ids||[];this.boxType=state.drawing?.constructor_data?.box_type==='small'||(this.sharedKey||this.profileSignature)&&state.files.length===1?'small':'card';this.changeType();this.tuckSeed=state.drawing?.constructor_data?.tuck??this.tuckSeed;this.replacementIds=this.fileLabels.map((_,i)=>this.state.files.some(file=>file.id===ids[i])?ids[i]:(this.sharedKey||this.profileSignature)&&this.state.files.length===this.fileCount?this.state.files[i]?.id||'':'');}
  catch(error){if(version===this.loadVersion){this.loadFailed=true;this.error=`Could not load packaging files. ${this.message(error)} Retry load.`;}}
  finally{if(version===this.loadVersion){this.loading=false;this.progress='';this.cdr.markForCheck();}}
 }
 get fileCount(){return this.boxType==='small'?1:2;}
 get copies(){return this.boxType==='small'?1:2;}
 get fileLabels(){return this.boxType==='small'?['Box']:['Bottom','Lid'];}
 get saveLabel(){return `Save SVG and ${this.fileCount===1?'one RD file':'two RD files'} to packaging`;}
 changeType(){this.error='';this.success='';this.confirmOpen=false;this.replacementIds=this.fileLabels.map(()=> '');
  try{this.seed=cartConstructorDimensions(this.snapshot,this.boxType);this.tuckSeed=Math.min(40,this.seed.depth,(this.seed.length-1)/2);}
  catch(error){this.seed=null;this.error=this.message(error);}this.cdr.markForCheck();
 }
 get canSave(){return !!this.pending||!!this.editor?.drawing&&this.editor.rdFiles!==this.savedFiles&&this.editor.rdFiles.length===this.fileCount&&!this.editor.rdBusy&&this.state.files.length<=2&&(!this.profileSignature||!this.state.files.length||this.state.files.length===this.fileCount)&&(this.state.files.length!==this.fileCount||new Set(this.replacementIds).size===this.fileCount&&this.replacementIds.every(Boolean));}
 save(){if(!this.busy&&this.canSave)this.confirmOpen=true;}
 async confirmSave(){if(this.busy||!this.canSave)return;this.busy=true;this.confirmOpen=false;this.error='';this.success='';
  try{
   if(!this.pending){const editor=this.editor!;const progress=(text:string)=>{this.progress=text;this.cdr.markForCheck();};this.pending=this.sharedKey?await this.files.prepareBackdrop(this.sharedKey,this.snapshot,exportBoxSvg(editor.drawing!),editor.rdFiles,structuredClone(editor.rdSettings),this.state,this.replacementIds,progress,this.boxType,Number(editor.tuck)):this.profileSignature?await this.files.prepareProfile(this.profileSignature,this.profileIndex,this.snapshot,exportBoxSvg(editor.drawing!),editor.rdFiles,structuredClone(editor.rdSettings),this.state,this.replacementIds,progress,this.boxType,Number(editor.tuck)):await this.files.prepare(this.snapshot,exportBoxSvg(editor.drawing!),editor.rdFiles,structuredClone(editor.rdSettings),this.state,this.replacementIds,progress,this.boxType,Number(editor.tuck));}
   this.confirmOpen=false;this.progress=`Saving SVG and ${this.fileCount} RD file${this.fileCount===1?'':'s'} to packaging…`;
   this.state=this.sharedKey?await this.files.saveBackdrop(this.pending as BackdropConstructorSave):this.profileSignature?await this.files.saveProfile(this.pending as ProfileConstructorSave):await this.files.save(this.pending as CartConstructorSave);this.pending=null;this.savedFiles=this.editor?.rdFiles;this.replacementIds=this.state.files.map(file=>file.id);this.success=`SVG and ${this.fileCount} RD file${this.fileCount===1?'':'s'} saved to this packaging box. Each RD has ${this.copies} ${this.copies===1?'copy':'copies'}.`;this.filesSaved.emit();
  }catch(error){this.error=`Could not save packaging files. ${this.message(error)} ${this.pending?'Retry Save to check and finish the same operation.':'Generated files and settings are kept; retry Save.'}`;}
  finally{this.busy=false;this.progress='';this.cdr.markForCheck();}
 }
 leavePending(){this.pending=null;this.open=false;this.filesSaved.emit();}
 async download(){this.error='';try{await this.files.downloadSvg(this.state.drawing.object_path,this.state.drawing.filename);}catch(error){this.error=`Could not download SVG. ${this.message(error)} Retry.`;}this.cdr.markForCheck();}
 private message(error:unknown){return (error as {message?:string})?.message||'Connection or server error.';}
}
