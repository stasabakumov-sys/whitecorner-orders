import {TestBed} from '@angular/core/testing';
import {BoxConstructorComponent} from './box-constructor.component';
import {LaserSetupService,initialLaserSetup} from './laser-setup.service';

beforeEach(()=>TestBed.configureTestingModule({providers:[{provide:LaserSetupService,useValue:{load:async()=>({settings:initialLaserSetup(),revision:'test'})}}]}));

describe('Constructor input and download recovery', () => {
  it('blocks export for a cleared dimension and restores the preview after correction', async () => {
    const fixture = TestBed.createComponent(BoxConstructorComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#box-length') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('positive');
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    input.value = '1515';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.preview .fold')).toHaveLength(12);
  });

  it('retains the entered dimensions and reports a failed file preparation', () => {
    const component = TestBed.createComponent(BoxConstructorComponent).componentInstance;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {throw new Error('Unavailable');});
    try {
      component.download();
      expect(component.error).toContain('try downloading again');
      expect(component.result).toBe('');
      expect(component.length).toBe(1515);
      expect(component.drawing).not.toBeNull();
      expect(component.busy).toBe(false);
    } finally { create.mockRestore(); }
  });

  it('reports a failed RD generation and retains previous files, inputs and settings for retry', async () => {
    const component = TestBed.createComponent(BoxConstructorComponent).componentInstance;
    const existing = {filename: 'previous.rd', bytes: new Uint8Array(120)};
    await component.loadLaserSetup();
    component.rdFiles = [existing];
    vi.stubGlobal('Worker', class {
      onerror: (() => void) | null = null;
      postMessage() {queueMicrotask(() => this.onerror?.());}
      terminate() {}
    });
    try {
      await component.generateRd();
      expect(component.rdError).toContain('Could not start');
      expect(component.rdFiles).toEqual([existing]);
      expect(component.rdSettings.cut.speed).toBe(120);
      expect(component.length).toBe(1515);
      expect(component.rdBusy).toBe(false);
      expect(component.rdResult).toBe('');
    } finally {vi.unstubAllGlobals();}
  });

  it('discards an export that finishes after dimensions change', async () => {
    const component = TestBed.createComponent(BoxConstructorComponent).componentInstance;
    await component.loadLaserSetup();
    const terminate = vi.fn();
    vi.stubGlobal('Worker', class {postMessage() {} terminate = terminate;});
    try {
      const pending = component.generateRd();
      component.length = 715; component.update();
      await pending;
      expect(terminate).toHaveBeenCalled();
      expect(component.rdFiles).toEqual([]);
      expect(component.rdResult).toBe('');
    } finally {vi.unstubAllGlobals();}
  });
});
