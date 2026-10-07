import {ChangeDetectorRef, Component, Input, Output, EventEmitter, OnChanges, OnInit, OnDestroy, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {BoxDrawing, BoxLayout, BoxNet, boxNet, drawingWithLid, drawingNumber, exportBoxSvg} from './box-constructor-geometry';
import {RdFile, RdSettings, generateRdFiles, prepareRdRequest, prepareSmallRdRequest, prepareBackdropRdRequest, rdSettingsError} from './box-constructor-rd';
import {backdropBox, BackdropBox} from './backdrop-box-geometry';
import {smallBoxNet, smallBoxDrawing} from './small-box-geometry';
import {LaserSetupService,initialLaserSetup} from './laser-setup.service';

@Component({
  selector: 'app-box-constructor', standalone: true, imports: [FormsModule],
  templateUrl: './box-constructor.component.html',
  styleUrl: './box-constructor.component.css',
})
export class BoxConstructorComponent implements OnChanges, OnInit, OnDestroy {
  @Input() showHeading = true;
  @Input() boxType: 'card' | 'small' | 'backdrop' = 'card';
  @Input() customCut = false;
  @Output() customCutRequested = new EventEmitter<void>();
  @Input() initialDimensions: {length: number; width: number; depth: number} | null = null;
  @Input() fixedDimensions = false;
  @Input() initialTuck: number | null = null;
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly laserSetup = inject(LaserSetupService);
  private destroyed = false;
  laserLoading = false;
  laserReady = false;
  laserError = '';
  private rdCancel?: () => void;
  private rdRevision = 0;
  rdBusy = false;
  rdProgress = '';
  rdError = '';
  rdResult = '';
  rdFiles: RdFile[] = [];
  rdSettings: RdSettings = {cut:initialLaserSetup().cut,fold:initialLaserSetup().dot,foldMode:'dot',dash:null,gap:null,dotTime:initialLaserSetup().dotTime,dotInterval:initialLaserSetup().dotInterval,dotLength:initialLaserSetup().dotLength};
  get rdLayers(){return [{name:'Cut',value:this.rdSettings.cut},{name:'Dot',value:this.rdSettings.fold}];}
  length: number | null = 1515;
  width: number | null = 615;
  depth: number | null = 70;
  tuck: number | null = 40;
  get small(): boolean {return this.boxType === 'small';}
  get backdrop(): boolean {return this.boxType === 'backdrop';}
  backdropNet: BackdropBox | null = null;
  get idPrefix(): string {return this.small ? 'small-' : this.backdrop ? 'backdrop-' : '';}
  get rdDescription(): string {return this.small ? 'The RD contains the complete box. Cut once for each box.' : this.backdrop ? 'Four RD files: bottom main, bottom short, lid main and lid short. Cut each file once.' : 'Each RD contains one half: bottom or lid. Cut each file twice.';}
  rdLabel(index: number): string {return this.backdrop ? ['Bottom main', 'Bottom short', 'Lid main', 'Lid short'][index] : this.small ? 'Box' : ['Bottom', 'Lid'][index];}
  layout: BoxLayout = 'pair';
  net: BoxNet | null = null;
  drawing: BoxDrawing | null = null;
  error = '';
  result = '';
  busy = false;
  readonly number = drawingNumber;

  constructor() { this.update(); }
  ngOnInit(): void {void this.loadLaserSetup();}
  async loadLaserSetup():Promise<void>{
    if(this.laserLoading||this.rdBusy)return;this.laserLoading=true;this.laserReady=false;this.laserError='';
    try{
      const {settings}=await this.laserSetup.load();
      if(this.destroyed)return;
      this.rdChanged();
      this.rdSettings={...this.rdSettings,cut:structuredClone(settings.cut),fold:structuredClone(settings.dot),dotTime:settings.dotTime,dotInterval:settings.dotInterval,dotLength:settings.dotLength};
      this.laserReady=true;
    }catch(error){this.laserError=`Could not load laser setup. ${(error as Error)?.message||'Check the connection and retry.'} Your dimensions and files are retained.`;}
    finally{this.laserLoading=false;if(!this.destroyed)this.changeDetector.markForCheck();}
  }

  ngOnChanges(): void {
    if(this.initialTuck !== null) this.tuck=this.initialTuck;
    if (this.initialDimensions) {
      this.length = this.initialDimensions.length;
      this.width = this.initialDimensions.width;
      this.depth = this.initialDimensions.depth;
      this.update();
    }
  }

  update(): void {
    this.rdChanged();
    this.result = '';
    this.backdropNet = null;
    try {
      if(this.backdrop){
        this.backdropNet = backdropBox(Number(this.length), Number(this.width), Number(this.depth));
        this.net = this.backdropNet.bottom[0]; this.drawing = this.backdropNet.drawing;
      }else if(this.small){
        const net=smallBoxNet(Number(this.length),Number(this.width),Number(this.depth),Number(this.tuck));
        this.net=net;this.drawing=smallBoxDrawing(net);
      }else{
        this.net = boxNet(Number(this.length), Number(this.width), Number(this.depth));
        this.drawing = drawingWithLid(this.net, this.layout);
      }
      this.error = '';
    } catch (error) {
      this.net = null;
      this.drawing = null;
      this.error = error instanceof Error ? error.message : 'Could not create the drawing. Check the dimensions and try again.';
    }
  }

  get rdValidation(): string { return rdSettingsError(this.rdSettings); }

  rdChanged(): void {
    this.rdRevision++;
    this.rdCancel?.();
    this.rdCancel = undefined;
    this.rdBusy = false;
    this.rdProgress = '';
    this.rdError = '';
    this.rdResult = '';
    this.rdFiles = [];
  }

  async generateRd(): Promise<void> {
    if (!this.net || this.rdBusy) return;
    if(!this.laserReady){this.rdError='Load Laser setup before generating RD files.';return;}
    const revision = ++this.rdRevision;
    this.rdBusy = true;
    this.rdError = '';
    this.rdResult = '';
    this.rdProgress = 'Preparing RD export…';
    try {
      const generation = generateRdFiles(this.backdropNet ? prepareBackdropRdRequest(this.backdropNet, this.rdSettings) : this.small ? prepareSmallRdRequest(this.net,this.rdSettings,Number(this.tuck)) : prepareRdRequest(this.net, this.rdSettings), stage => {
        if (revision === this.rdRevision) {this.rdProgress = stage; this.changeDetector.markForCheck();}
      });
      this.rdCancel = generation.cancel;
      const files = await generation.result;
      if (revision !== this.rdRevision) return;
      this.rdFiles = files;
      this.rdResult = this.backdrop ? 'Four RD files prepared: bottom main, bottom short, lid main and lid short. Cut each once.' : this.small ? 'One RD file prepared. Cut once for each box.' : 'Two RD files prepared: bottom and lid. Cut each half twice.';
    } catch (error) {
      if (revision === this.rdRevision) this.rdError = (error instanceof Error ? error.message : 'Could not prepare RD files.') + ' Your dimensions and settings are kept.';
    } finally {
      if (revision === this.rdRevision) {this.rdBusy = false; this.rdProgress = ''; this.rdCancel = undefined; this.changeDetector.markForCheck();}
    }
  }

  downloadRd(file: RdFile): void {
    let url = '';
    this.rdError = '';
    try {
      url = URL.createObjectURL(new Blob([file.bytes], {type: 'application/octet-stream'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      try {link.click();} finally {link.remove();}
      this.rdResult = `${file.filename} prepared. Complete the download in your browser.`;
    } catch {
      this.rdError = 'Could not download the RD file. Your generated files and settings are kept; retry.';
    } finally {if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);}
  }

  ngOnDestroy(): void {this.destroyed=true;this.rdRevision++; this.rdCancel?.();}

  download(): void {
    if (!this.net || !this.drawing || this.busy) return;
    this.busy = true;
    this.error = '';
    this.result = '';
    let url = '';
    try {
      const content = exportBoxSvg(this.drawing);
      const filename = this.backdrop
        ? `backdrop-box-L${this.number(Number(this.length))}-W${this.number(Number(this.width))}-D${this.number(this.net.depth)}-4-pieces.svg`
        : this.small
        ? `small-box-L${this.number(this.net.length)}-W${this.number(this.net.width)}-D${this.number(this.net.depth)}-T${this.number(Number(this.tuck))}.svg`
        : `box-L${this.number(this.net.length)}-W${this.number(this.net.width)}-D${this.number(this.net.depth)}-bottom-and-lid-${this.layout === 'pair' ? '4-pieces' : '2-pieces-cut-each-twice'}.svg`;
      url = URL.createObjectURL(new Blob([content], {type: 'image/svg+xml'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
      this.result = `${filename} prepared. Complete the download in your browser.`;
    } catch {
      this.error = 'Could not prepare the file. Your dimensions are kept; try downloading again.';
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.busy = false;
    }
  }
}
