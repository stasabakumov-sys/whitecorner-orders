import {TestBed} from '@angular/core/testing';
import {backdropBox, BACKDROP_REFERENCE, BACKDROP_LASER, BACKDROP_CARD} from './backdrop-box-geometry';
import {exportBoxSvg} from './box-constructor-geometry';
import {prepareBackdropRdRequest, RdSettings} from './box-constructor-rd';
import {BoxConstructorComponent} from './box-constructor.component';
import {LaserSetupService, initialLaserSetup} from './laser-setup.service';

const settings = (): RdSettings => ({cut:{speed:120,minPower:70,maxPower:80},fold:{speed:120,minPower:70,maxPower:80},foldMode:'dot',dotTime:0.2,dotInterval:4,dotLength:2,dash:null,gap:null});
const reference = () => backdropBox(930,930,80);
const fits = (box: ReturnType<typeof backdropBox>) => {
  for (const net of [...box.bottom,...box.lid]) {
    expect(net.sheetWidth).toBeLessThanOrEqual(Math.min(BACKDROP_CARD.width,BACKDROP_LASER.width));
    expect(net.sheetHeight).toBeLessThanOrEqual(Math.min(BACKDROP_CARD.height,BACKDROP_LASER.height));
    expect([...net.cuts,...net.folds].every(line=>[line.from,line.to].every(([x,y])=>x>=0&&y>=0&&x<=net.sheetWidth&&y<=net.sheetHeight))).toBe(true);
  }
};

describe('Backdrop box from Arch Box 180x90.cdr', () => {
  it('maps package 930×930×80 to measured CDR blanks within 0.5 mm', () => {
    const box = reference();
    // Independent CorelDRAW bounds: bottom main/short, lid main/short.
    const measured = [[1074.9895,866.0407],[1075.002,209.4255],[1084.9919,866.0458],[1085.0017,219.4248]];
    for (const [index, net] of [...box.bottom,...box.lid].entries()) {
      expect(Math.abs(net.sheetWidth-measured[index][0])).toBeLessThan(0.5);
      expect(Math.abs(net.sheetHeight-measured[index][1])).toBeLessThan(0.5);
      expect(net.folds[1].from[0]-net.folds[0].from[0]).toBe(index<2?915:925);
      expect(net.sheetHeight-net.panelLength).toBe(80);
      // The supplied joining edge is open. Do not add a laser pass there.
      expect(net.cuts.some(line=>line.from[1]===0&&line.to[1]===0)).toBe(false);
    }
    expect(box.bottom.map(net=>net.panelLength)).toEqual([786,129]);
    expect(box.lid.map(net=>net.panelLength)).toEqual([786,139]);
    expect(box.rim).toBe(80);expect(box.splitAdjusted).toBe(false);fits(box);
  });

  it('moves excess length into the second part without changing the main field', () => {
    const box=backdropBox(1500,930,80);
    expect(box.bottom[0].length).toBe(1485);expect(box.lid[0].length).toBe(1495);
    expect(box.bottom.map(net=>net.panelLength)).toEqual([910,575]);
    expect(box.lid.map(net=>net.panelLength)).toEqual([910,585]);
    expect(box.splitAdjusted).toBe(true);fits(box);
    fits(backdropBox(1825,930,80));
    expect(()=>backdropBox(1825.1,930,80)).toThrow('laser field in two parts');
  });

  it('shrinks only the border to fit cardboard and recalculates the laser split', () => {
    const box=backdropBox(1850,1100,80);
    expect(box.rim).toBe(37.5);
    expect(box.bottom[0].width).toBe(1085);expect(box.lid[0].width).toBe(1095);
    expect(box.bottom[0].length).toBe(1835);expect(box.lid[0].length).toBe(1845);
    expect(box.bottom[0].depth).toBe(80);
    expect(box.lid[0].sheetWidth).toBe(1170);
    expect(box.bottom[0].sheetHeight).toBe(990);
    expect(box.bottom[0].panelLength+box.bottom[1].panelLength).toBe(1835);
    expect(box.lid[0].panelLength+box.lid[1].panelLength).toBe(1845);fits(box);
    fits(backdropBox(1910,1100,80));
    expect(()=>backdropBox(1910.1,1100,80)).toThrow('laser field in two parts');
    expect(()=>backdropBox(930,1175,80)).toThrow('main box field');
  });

  it('checks fractional boundary sizes and all supported widths/depths', () => {
    for(const width of [300,930,1100,1174.8])for(const depth of [1,49.3,80,200]) {
      const rim=Math.min(depth,(1175-width)/2);
      const maximumLength=2*(990-rim)+5;
      fits(backdropBox(maximumLength,width,depth));
      expect(()=>backdropBox(maximumLength+0.01,width,depth)).toThrow();
    }
    for(const values of [[0,930,80],[930,NaN,80],[930,930,-80],[15,930,80],[930,15,80],[Infinity,930,80]]) {
      expect(()=>backdropBox(...values as [number,number,number])).toThrow();
    }
  });

  it('exports all four unequal pieces at 1:1 without overlapping parts', () => {
    const box=reference();expect(box.drawing.pieces).toBe(4);
    expect(box.drawing.parts![1].x).toBeGreaterThan(box.drawing.parts![0].drawing.width);
    const xml=new DOMParser().parseFromString(exportBoxSvg(box.drawing),'image/svg+xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.documentElement.getAttribute('width')).toBe('2170mm');
    expect(xml.documentElement.getAttribute('height')).toBe('1095mm');
    expect(xml.querySelectorAll('#Bottom-Cut line')).toHaveLength(22);
    expect(xml.querySelectorAll('#Lid-Fold line')).toHaveLength(6);
  });

  it('exports four unique RD parts with correct bounds, fold-first order and moving dots', () => {
    const jobs=prepareBackdropRdRequest(reference(),settings()).jobs;
    expect(jobs).toHaveLength(4);expect(new Set(jobs.map(job=>job.filename)).size).toBe(4);
    for(const [index,job] of jobs.entries()) {
      expect(job.filename).toMatch(/^[A-D][a-z0-9]{5}\.rd$/);
      expect(job.layers.map(layer=>layer.color)).toEqual([[69,214,255],[255,0,0]]);
      expect(job.layers.every(layer=>layer.speed===120&&layer.minPower===70&&layer.maxPower===80)).toBe(true);
      const cut=job.layers[1].paths.flat();
      expect(Math.max(...cut.map(point=>point[0]))).toBe(index<2?1075:1085);
      expect(Math.max(...cut.map(point=>point[1]))).toBe([866,209,866,219][index]);
      expect(job.layers[0].paths[0]).toEqual([[80,0],[80,2]]);
      expect(job.layers[0].paths[1]).toEqual([[80,4],[80,6]]);
    }
    const resized=prepareBackdropRdRequest(backdropBox(1500,930,80),settings()).jobs;
    expect(resized.every((job,index)=>job.filename!==jobs[index].filename)).toBe(true);
    const changed=settings();changed.cut.speed=121;
    expect(prepareBackdropRdRequest(reference(),changed).jobs[0].filename).not.toBe(jobs[0].filename);
  });

  it('retains inputs on invalid size, clears old exports and recovers with automatic adjustments', async () => {
    TestBed.configureTestingModule({providers:[{provide:LaserSetupService,useValue:{load:async()=>({settings:initialLaserSetup(),revision:'test'})}}]});
    const fixture=TestBed.createComponent(BoxConstructorComponent);
    fixture.componentRef.setInput('boxType','backdrop');fixture.componentRef.setInput('initialDimensions',BACKDROP_REFERENCE);
    fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const component=fixture.componentInstance, root=fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Main panel 786 mm');expect(root.textContent).toContain('Short panel 129 mm');
    component.rdFiles=[0,1,2,3].map(index=>({filename:`part${index}.rd`,bytes:new Uint8Array(100)}));fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
    expect([...root.querySelectorAll('button')].filter(button=>button.textContent?.includes('Download ')&&button.textContent?.includes(' RD'))).toHaveLength(4);
    const input=root.querySelector<HTMLInputElement>('#backdrop-box-length')!;
    input.value='2000';input.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(root.querySelector('[role=alert]')!.textContent).toContain('laser field in two parts');
    expect(component.rdFiles).toHaveLength(0);expect(component.net).toBeNull();expect(component.length).toBe(2000);
    input.value='1850';input.dispatchEvent(new Event('input'));
    const width=root.querySelector<HTMLInputElement>('#backdrop-box-width')!;width.value='1100';width.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(component.error).toBe('');expect(component.depth).toBe(80);
    expect(root.textContent).toContain('Border reduced to 37.5 mm');expect(root.textContent).toContain('990 mm');
    fixture.destroy();
  });
});
