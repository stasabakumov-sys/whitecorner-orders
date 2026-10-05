import {Component,ElementRef,ViewChild,OnDestroy,effect,input,output,signal} from '@angular/core';
import {LogoPanel,LogoPlacement,fitLogo,centreLogo,logoHeight,logoDrawingSvg} from './modeling-logo';
@Component({selector:'app-modeling-logo',standalone:true,templateUrl:'./modeling-logo.component.html',styleUrl:'./modeling-logo.component.css'})
export class ModelingLogoComponent implements OnDestroy {
 ngOnDestroy():void{this.version++;}
 readonly panel=input.required<LogoPanel>();
 readonly modelKey=input.required<string>();
 readonly placed=output<LogoPlacement|null>();
 readonly busy=signal(false);readonly error=signal('');readonly notice=signal('');
 readonly draft=signal<LogoPlacement|null>(null);readonly applied=signal<LogoPlacement|null>(null);
 @ViewChild('editor') editor?:ElementRef<HTMLDialogElement>;
 private version=0;private previousModel='';
 private drag?:{id:number;x:number;y:number;logo:LogoPlacement;scaleX:number;scaleY:number};
 height=logoHeight;
 constructor(){effect(()=>{const key=this.modelKey(),panel=this.panel();if(key!==this.previousModel){this.previousModel=key;this.version++;this.draft.set(null);this.applied.set(null);this.error.set('');this.notice.set('');this.busy.set(false);if(this.editor?.nativeElement.open)this.editor.nativeElement.close();this.placed.emit(null);return;}
 const draft=this.draft();if(draft){const next=fitLogo(panel,draft);if(next.x!==draft.x||next.y!==draft.y||next.width!==draft.width)this.draft.set(next);}
 const applied=this.applied();if(applied){const next=fitLogo(panel,applied);if(next.x!==applied.x||next.y!==applied.y||next.width!==applied.width){this.applied.set(next);this.placed.emit(next);this.notice.set('Placement adjusted to fit the front panel.');}}
 });}
 async upload(event:Event):Promise<void>{
 const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;input.value='';this.error.set('');this.notice.set('');
 const max=10*1024*1024;
 if(!/\.png$/i.test(file.name)||!file.size||file.size>max){this.error.set(`${file.name}: ${(file.size/1024/1024).toFixed(2)} MB. Choose a PNG between 1 byte and 10 MB.`);return;}
 const version=++this.version;this.busy.set(true);
 try {const bytes=new Uint8Array(await file.slice(0,24).arrayBuffer());if(bytes.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10')throw new Error('The file is not a valid PNG.');
 const header=new DataView(bytes.buffer);if(bytes.length<24||header.getUint32(12)!==0x49484452)throw new Error('The PNG header is invalid.');const width=header.getUint32(16),height=header.getUint32(20);if(!width||!height||width>8192||height>8192||width*height>32000000)throw new Error('Maximum image size is 8192 px per side and 32 megapixels.');
 const png=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The file could not be read.'));reader.readAsDataURL(file);});
 const image=new Image();image.src=png;await image.decode();if(!image.width||!image.height||image.width>8192||image.height>8192||image.width*image.height>32000000)throw new Error('Maximum image size is 8192 px per side and 32 megapixels.');
 if(version!==this.version)return;
 const p=this.panel();this.draft.set(centreLogo(p,{png,name:file.name,ratio:image.width/image.height,width:(p.width-2*p.inset)*.45,x:0,y:0}));this.notice.set('PNG ready. Open the placement editor.');
 }catch(cause){if(version===this.version)this.error.set(`${file.name}: ${cause instanceof Error?cause.message:String(cause)} Choose another PNG and retry.`);}
 finally{if(version===this.version)this.busy.set(false);}
 }
 open():void{if(!this.draft())return;this.editor?.nativeElement.showModal();}
 cancel():void{this.editor?.nativeElement.close();if(this.applied())this.draft.set(this.applied());}
 apply():void{const logo=this.draft();if(!logo)return;const next=fitLogo(this.panel(),logo);this.applied.set(next);this.draft.set(next);this.placed.emit(next);this.editor?.nativeElement.close();this.notice.set('');}
 remove():void{this.version++;this.busy.set(false);this.draft.set(null);this.applied.set(null);this.placed.emit(null);this.notice.set('Logo removed.');this.error.set('');}
 previewField(field:'x'|'y'|'width',raw:string):void{const value=Number(raw),logo=this.draft();if(!logo||!raw||!Number.isFinite(value))return;const next=fitLogo(this.panel(),{...logo,[field]:value});if(Math.abs(next[field]-value)<.001)this.draft.set(next);}
 adjust(field:'x'|'y'|'width',raw:string):void{const value=Number(raw),logo=this.draft();if(!logo||!Number.isFinite(value))return;this.draft.set(fitLogo(this.panel(),{...logo,[field]:value}));}
 scale(factor:number):void{const logo=this.draft();if(!logo)return;const next=fitLogo(this.panel(),{...logo,width:logo.width*factor});next.x=logo.x+(logo.width-next.width)/2;next.y=logo.y+(logoHeight(logo)-logoHeight(next))/2;this.draft.set(fitLogo(this.panel(),next));}
 move(x:number,y:number):void{const logo=this.draft();if(logo)this.draft.set(fitLogo(this.panel(),{...logo,x:logo.x+x,y:logo.y+y}));}
 centre():void{const logo=this.draft();if(logo)this.draft.set(centreLogo(this.panel(),logo));}
 start(event:PointerEvent):void{const logo=this.draft(),target=event.currentTarget as SVGSVGElement;if(!logo||event.button!==0)return;const rect=target.getBoundingClientRect();const p=this.panel(),scale=Math.min(rect.width/p.width,rect.height/p.height);this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,logo,scaleX:scale,scaleY:scale};target.setPointerCapture(event.pointerId);event.preventDefault();}
 dragMove(event:PointerEvent):void{const drag=this.drag;if(drag?.id!==event.pointerId)return;this.draft.set(fitLogo(this.panel(),{...drag.logo,x:drag.logo.x+(event.clientX-drag.x)/drag.scaleX,y:drag.logo.y+(event.clientY-drag.y)/drag.scaleY}));}
 end():void{this.drag=undefined;}
 download():void{const logo=this.draft();if(!logo)return;const url=URL.createObjectURL(new Blob([logoDrawingSvg(this.panel(),logo)],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download=this.modelKey()+'-front-logo.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
