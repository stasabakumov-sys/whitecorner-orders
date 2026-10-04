import {ChangeDetectorRef, Component, Input, Output, EventEmitter, OnChanges, OnDestroy, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {BoxDrawing, BoxLayout, BoxNet, boxNet, drawingWithLid, drawingNumber, exportBoxSvg} from './box-constructor-geometry';
import {RdFile, RdSettings, generateRdFiles, prepareRdRequest, rdSettingsError} from './box-constructor-rd';

@Component({
  selector: 'app-box-constructor', standalone: true, imports: [FormsModule],
  templateUrl: './box-constructor.component.html',
  styleUrl: './box-constructor.component.css',
})
export class BoxConstructorComponent implements OnChanges, OnDestroy {
  @Input() showHeading = true;
  @Input() customCut = false;
  @Output() customCutRequested = new EventEmitter<void>();
  @Input() initialDimensions: {length: number; width: number; depth: number} | null = null;
  @Input() fixedDimensions = false;
  private readonly changeDetector = inject(ChangeDetectorRef);
  private rdCancel?: () => void;
  private rdRevision = 0;
  rdBusy = false;
  rdProgress = '';
  rdError = '';
  rdResult = '';
  rdFiles: RdFile[] = [];
  rdSettings: RdSettings = {cut: {speed: 120, minPower: 70, maxPower: 80}, fold: {speed: 120, minPower: 70, maxPower: 80}, foldMode: 'dot', dash: null, gap: null, dotTime: 0.1, dotInterval: 2, dotLength: 1};
  readonly rdLayers = [{name: 'Cut', value: this.rdSettings.cut}, {name: 'Fold', value: this.rdSettings.fold}];
  length: number | null = 1515;
  width: number | null = 615;
  depth: number | null = 70;
  layout: BoxLayout = 'pair';
  net: BoxNet | null = null;
  drawing: BoxDrawing | null = null;
  error = '';
  result = '';
  busy = false;
  readonly number = drawingNumber;

  constructor() { this.update(); }

  ngOnChanges(): void {
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
    try {
      this.net = boxNet(Number(this.length), Number(this.width), Number(this.depth));
      this.drawing = drawingWithLid(this.net, this.layout);
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
    const revision = ++this.rdRevision;
    this.rdBusy = true;
    this.rdError = '';
    this.rdResult = '';
    this.rdProgress = 'Preparing RD export…';
    try {
      const generation = generateRdFiles(prepareRdRequest(this.net, this.rdSettings), stage => {
        if (revision === this.rdRevision) {this.rdProgress = stage; this.changeDetector.markForCheck();}
      });
      this.rdCancel = generation.cancel;
      const files = await generation.result;
      if (revision !== this.rdRevision) return;
      this.rdFiles = files;
      this.rdResult = 'Two RD files prepared: bottom and lid. Cut each half twice.';
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

  ngOnDestroy(): void {this.rdRevision++; this.rdCancel?.();}

  download(): void {
    if (!this.net || !this.drawing || this.busy) return;
    this.busy = true;
    this.error = '';
    this.result = '';
    let url = '';
    try {
      const content = exportBoxSvg(this.drawing);
      const filename = `box-L${this.number(this.net.length)}-W${this.number(this.net.width)}-D${this.number(this.net.depth)}-bottom-and-lid-${this.layout === 'pair' ? '4-pieces' : '2-pieces-cut-each-twice'}.svg`;
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
