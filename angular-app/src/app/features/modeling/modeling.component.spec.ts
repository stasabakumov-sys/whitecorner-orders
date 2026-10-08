import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ModelingComponent, casterGroupKey, isTopPanelName } from './modeling.component';
import { HubMembersService } from '../../core/services/hub-members.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { TestBed } from '@angular/core/testing';
import { ModelingCacheService } from './modeling-cache.service';
import { MODEL_CATALOG_LINKS } from './modeling-pricing';

function testCache() {
  return new ModelingCacheService({ client: { auth: { onAuthStateChange: vi.fn() } } } as unknown as SupabaseService);
}

function setup(uploadError: Error | null = null) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const query: any = { eq: () => query, select: () => query, single: async () => ({ error: null }) };
  const client: any = {
    storage: { from: () => ({ upload, remove }) },
    from: () => ({ update: () => query }),
  };
  const component = new ModelingComponent(
    { manager: () => true } as unknown as HubMembersService,
    { client } as SupabaseService,
    testCache(),
  );
  const original = new File(['test'], 'classic.glb', { type: 'application/octet-stream' });
  component.selectedFile.set(original);
  return { component, upload, remove, original };
}

describe('Modeling GLB upload', () => {
  it('sends a parsed GLB with its supported MIME type', async () => {
    const { component, upload } = setup();
    await component.saveModel();
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][1]).toBeInstanceOf(File);
    expect(upload.mock.calls[0][1].type).toBe('model/gltf-binary');
    expect(component.selectedFile()).toBeNull();
  });

  it('keeps the selected file available after an upload failure', async () => {
    const { component, original, remove } = setup(new Error('network failed'));
    await component.saveModel();
    expect(component.selectedFile()).toBe(original);
    expect(component.error()).toContain('network failed');
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('Tabletop image textures', () => {
  it('loads and reuses the supplied oak image', async () => {
    const { component } = setup();
    const texture = new THREE.Texture();
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture);
    try {
      await component.setTopFinish('oak');
      expect(load.mock.calls[0][0]).toMatch(/modeling-textures\/tasmanian-oak\.png$/);
      expect(component.topFinish()).toBe('oak');
      expect(texture.channel).toBe(2);
      expect(texture.repeat.toArray()).toEqual([2.5, 2.5]);
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
      await component.setTopFinish('oak');
      expect(load).toHaveBeenCalledOnce();
    } finally { load.mockRestore(); }
  });
  it('offers real plywood faces and edges independently of RAW MDF', async () => {
    const { component } = setup();
    component.activeSlug.set('decorative-wheel-roof-cart-mdf');
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new THREE.Texture());
    try {
      await component.setTopFinish('plywood');
      expect(load.mock.calls.map(call => call[0])).toEqual([
        expect.stringMatching(/plywood-face\.jpg$/), expect.stringMatching(/plywood-edge\.jpg$/), expect.stringMatching(/pine\.jpg$/),
      ]);
      expect(component.topFinish()).toBe('plywood');
      await component.setTopFinish('mdf');
      expect(component.topFinish()).toBe('mdf');
    } finally { load.mockRestore(); }
  });
  it('preserves the current finish on failure and allows retry', async () => {
    const { component } = setup();
    component.topFinish.set('body');
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new THREE.Texture());
    try {
      await component.setTopFinish('oak');
      expect(component.topFinish()).toBe('body');
      expect(component.finishLoading()).toBe(false);
      expect(component.finishError()).toContain('offline');
      await component.setTopFinish('oak');
      expect(component.topFinish()).toBe('oak');
      expect(component.finishError()).toBe('');
    } finally { load.mockRestore(); }
  });
  it('does not replace a newer finish when an older image finishes loading', async () => {
    const { component } = setup();
    let resolve!: (texture: THREE.Texture) => void;
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockReturnValue(new Promise(r => { resolve = r; }));
    try {
      const oak = component.setTopFinish('oak');
      expect(component.finishLoading()).toBe(true);
      await component.setTopFinish('mdf');
      resolve(new THREE.Texture()); await oak;
      expect(component.topFinish()).toBe('mdf');
      expect(component.finishLoading()).toBe(false);
    } finally { load.mockRestore(); }
  });
});

describe('STEP part names after GLTF loading', () => {
  it('keeps each caster separate from the scalable body', () => {
    expect(casterGroupKey('Caster_L_front_rubber_tire')).toBe('L-front');
    expect(casterGroupKey('Caster R rear plate')).toBe('R-rear');
    expect(casterGroupKey('Buttom_part1')).toBeNull();
  });

  it('identifies top panels for their independent finish', () => {
    expect(isTopPanelName('Top_part2')).toBe(true);
    expect(isTopPanelName('Top part1')).toBe(true);
    expect(isTopPanelName('Front_part1')).toBe(false);
  });
});

describe('Independent editor models', () => {
  const classic = { slug: 'classic-bar-plywood', product_name: 'Classic Bar', material_name: 'Plywood',
    model_path: null, model_filename: null, base_width_mm: 1200, base_depth_mm: 600, base_body_height_mm: 805, caster_height_mm: 95 };
  const roof = { ...classic, slug: 'decorative-wheel-roof-cart-mdf', product_name: 'Cart with decorative wheels & roof',
    material_name: 'MDF', base_body_height_mm: 827, caster_height_mm: 73 };

  it('keeps the picker aligned with the open model when its options arrive asynchronously', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ModelingComponent], providers: [
      { provide: HubMembersService, useValue: { manager: () => true } },
      { provide: SupabaseService, useValue: { client: {} } },
      { provide: ModelingCacheService, useValue: testCache() },
    ] });
    const fixture = TestBed.createComponent(ModelingComponent);
    fixture.componentInstance.ngAfterViewInit = () => {};
    try {
      fixture.detectChanges();
      fixture.componentInstance.models.set([roof, classic]);
      await fixture.whenStable(); fixture.detectChanges();
      const picker = fixture.nativeElement.querySelector('#model-choice') as HTMLButtonElement;
      expect(picker.closest('.settings')).toBeTruthy();
      expect(picker.textContent).toContain('Classic Bar / Plywood');
      fixture.componentInstance.catalog.set({publishedAt:'2026-10-08T00:00:00Z',products:[roof,classic].map(model=>({
        ...MODEL_CATALOG_LINKS[model.slug],name:model.product_name,currency:'AUD' as const,options:[],variants:[],imageUrl:`https://example.com/${model.slug}.jpg`,
      }))});
      fixture.detectChanges();picker.click();fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.model-choice-options [role="option"]')).toHaveLength(2);
      expect(fixture.nativeElement.querySelectorAll('.model-choice-options img')).toHaveLength(2);
      await fixture.componentInstance.selectModel(roof.slug);
      fixture.detectChanges(); expect(picker.textContent).toContain(roof.product_name);
    } finally { fixture.destroy(); TestBed.resetTestingModule(); }
  });

  it('loads the roof dimensions independently and resets Classic when switching back', async () => {
    const { component } = setup();
    component.models.set([classic, roof]);
    await component.selectModel(roof.slug);
    expect(component.height()).toBe(900);
    expect(component.materialLabel()).toBe('MDF');
    expect(component.parts.map(part => part.key)).toContain('shelf');
    expect(component.modelLabel()).toBe('Cart with decorative wheels & roof / MDF');
    expect(component.selectedFile()).toBeNull();
    component.setDimension('height', '850');
    expect(component.height()).toBe(850);
    expect(component.overallHeight()).toBe(1880);
    await component.selectModel(classic.slug);
    expect(component.height()).toBe(900);
    expect(component.isClassic()).toBe(true);
  });

  it('keeps the roofless cart separate from the roof record and blocks a derived upload', async () => {
    const {component,upload}=setup();
    component.models.set([classic,roof,{...roof,slug:'decorative-wheel-cart-mdf',product_name:'MDF Mobile Bar Cart with Decorative Wheels – Foldable Serving Cart',derived_from_roof:true}]);
    await component.selectModel('decorative-wheel-cart-mdf');
    expect(component.isRooflessCart()).toBe(true);
    expect(component.hasRoof()).toBe(false);
    expect(component.parts.map(part=>part.key)).toContain('decorative-wheels');
    expect(component.parts.map(part=>part.key)).not.toContain('roof');
    expect(component.iceShelfIncluded()).toBe(false);
    component.selectedFile.set(new File(['cart'],'cart.glb'));
    await component.saveModel();
    expect(upload).not.toHaveBeenCalled();
    expect(component.error()).toContain('cannot overwrite');
  });

  it('opens the compact 2-in-1 cart with its own dimensions and independent options', async () => {
    const {component,upload}=setup();
    const source={...classic,slug:'side-shelf-cart-mdf',product_name:'Charcuterie cart',material_name:'MDF',base_width_mm:1500,base_body_height_mm:755};
    const compact={...source,slug:'two-in-one-cart-mdf',product_name:'2-in-1 Mobile Bar',base_width_mm:1200,derived_from_side_shelf:true};
    component.models.set([source,compact]);await component.selectModel(compact.slug);
    expect([component.width(),component.depth(),component.height()]).toEqual([1200,600,850]);
    expect(component.isCharcuterieCart()).toBe(true);expect(component.sideShelvesIncluded()).toBe(true);
    expect(component.shelfIncluded()).toBe(false);expect(component.iceShelfIncluded()).toBe(false);
    component.setDimension('width','1500');component.setDimension('height','950');expect([component.width(),component.height()]).toEqual([1200,850]);
    component.umbrellaPosition.set('left');expect(component.umbrellaX()).toBe(200);
    component.umbrellaPosition.set('centre');expect(component.umbrellaX()).toBe(600);
    component.umbrellaPosition.set('right');expect(component.umbrellaX()).toBe(1000);
    component.selectedFile.set(new File(['cart'],'cart.glb'));await component.saveModel();expect(upload).not.toHaveBeenCalled();
  });

  it('saves an uploaded roof model only into its own record and Storage folder', async () => {
    const { component, upload } = setup();
    component.models.set([classic, roof]);
    await component.selectModel(roof.slug);
    const file = new File(['roof'], 'roof-cart.glb');
    component.selectedFile.set(file);
    await component.saveModel();
    expect(upload.mock.calls[0][0]).toMatch(/^decorative-wheel-roof-cart-mdf\//);
    expect(component.models().find(model => model.slug === classic.slug)?.model_path).toBeNull();
    expect(component.models().find(model => model.slug === roof.slug)?.model_filename).toBe(file.name);
  });

  it('discards an earlier signed-link request after the user switches models', async () => {
    const { component } = setup();
    const editor = component as any;
    let finishLink!: (value: any) => void;
    editor.db.client.storage.from = () => ({ createSignedUrl: () => new Promise(resolve => { finishLink = resolve; }) });
    const open = vi.spyOn(editor, 'openModel').mockResolvedValue(undefined);
    component.models.set([classic, { ...roof, model_path: `${roof.slug}/old.glb` }]);
    const previous = component.selectModel(roof.slug);
    await component.selectModel(classic.slug);
    finishLink({ data: { signedUrl: 'https://example.test/old' }, error: null });
    await previous;
    expect(open).not.toHaveBeenCalled();
    expect(component.activeSlug()).toBe(classic.slug);
    expect(component.height()).toBe(900);
  });
});

describe('Modeling dimensions', () => {
  it('moves the camera back as the cart grows', () => {
    const { component } = setup();
    const editor = component as any;
    editor.body = new THREE.Group();
    editor.controls = { target: new THREE.Vector3(0.6, 0.45, 0.3), update: vi.fn() };
    editor.camera.position.set(1.92, 1.05, 1.8);
    const before = editor.camera.position.distanceTo(editor.controls.target);
    component.setDimension('width', '1500');
    const after = editor.camera.position.distanceTo(editor.controls.target);
    expect(after / before).toBeCloseTo(1500 / 1200);
  });

  it('limits length to 120–150 cm and height to 85–100 cm in 5 cm steps', () => {
    const { component } = setup();
    component.setDimension('width', '2000');
    component.setDimension('height', '1300');
    expect(component.width()).toBe(1500);
    expect(component.height()).toBe(1000);
    component.setDimension('width', '800');
    component.setDimension('height', '650');
    expect(component.width()).toBe(1200);
    expect(component.height()).toBe(850);
    component.setDimension('height', '942');
    expect(component.height()).toBe(950);
    component.setDimension('width', '1340');
    expect(component.width()).toBe(1300);
    expect(component.depth()).toBe(600);
  });
});

describe('Plywood finishes', () => {
  it('runs pine grain along rails and plywood layers along vertical edges', () => {
    const { component } = setup();
    const editor = component as any;
    editor.modelPineTexture = new THREE.Texture();
    editor.modelPlywoodEdgeTexture = new THREE.Texture();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0.1, 0.1, 0.02, 1.1, 0.1, 0.02], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, -1, 0, 0, -1], 3));
    editor.addWoodUvs(geometry, 'Buttom part2', false, true);
    let uv = geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(uv.getX(1));
    expect(uv.getY(1)).toBeGreaterThan(uv.getY(0));
    for (const name of ['Front part1', 'Left side part1', 'Right side part2', 'Front part2']) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0.03, 0.11, 0.02, 0.03, 0.885, 0.02], 3));
      editor.addWoodUvs(geometry, name, true);
      uv = geometry.getAttribute('uv');
      expect(uv.getY(0)).toBeCloseTo(uv.getY(1));
      expect(uv.getX(1)).toBeGreaterThan(uv.getX(0));
    }
    geometry.dispose();
  });
  it('uses the embedded birch texture for RAW and varnished plywood and restores it after painting', async () => {
    const { component } = setup();
    const editor = component as any;
    const birch = new THREE.Texture();
    const layers = new THREE.Texture();
    const pine = new THREE.Texture();
    editor.modelPlywoodTexture = birch;
    editor.modelPlywoodEdgeTexture = layers;
    editor.modelPineTexture = pine;
    const paintBump = new THREE.Texture();
    editor.modelPaintBumpTexture = paintBump;
    editor.rawTexture = new THREE.Texture();
    const oak = new THREE.Texture();
    editor.finishTextures.set('tasmanian-oak.png', oak);
    editor.plywoodTexture = new THREE.Texture();
    editor.body = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const top = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const topEdge = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    const trim = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    front.name = 'Front_part1';
    top.name = 'Top_part1';
    edge.name = 'Front_part1_1';
    edge.material.name = 'Front part1 plywood edge';
    topEdge.name = 'Top_part1_1';
    topEdge.material.name = 'Top part1 plywood edge';
    trim.name = 'Top_part2';
    trim.material.name = 'Top part2 pine trim';
    editor.body.add(front, top, edge, topEdge, trim);
    component.setRawBody();
    expect(front.material.map).toBe(birch);
    expect(top.material.map).toBe(birch);
    expect(edge.material.map).toBe(layers);
    expect(front.material.color.r).toBeCloseTo(1.05);
    expect(edge.material.color.r).toBeCloseTo(1.30);
    expect(topEdge.material.map).toBe(layers);
    expect(trim.material.map).toBe(pine);
    expect(trim.material.color.r).toBeCloseTo(1.15*1.05);
    expect(trim.material.color.b).toBeCloseTo(2.4*1.05);
    expect(top.material.roughness).toBe(front.material.roughness);
    expect(top.material.color.equals(front.material.color)).toBe(true);
    expect(topEdge.material.color.equals(edge.material.color)).toBe(true);
    expect(front.material.bumpMap).toBeNull();
    component.setBodyColor('#33383e');
    expect(front.material.map).toBeNull();
    expect(edge.material.map).toBeNull();
    expect(trim.material.map).toBe(pine);
    expect(front.material.bumpMap).toBe(paintBump);
    expect(trim.material.bumpMap).toBeNull();
    expect(top.material.bumpMap).toBeNull();
    expect(top.material.map).toBe(birch);
    component.setTopFinish('body');
    expect(trim.material.map).toBeNull();
    expect(trim.material.bumpMap).toBe(paintBump);
    expect(front.material.roughness).toBe(0.78);
    const reflection = new THREE.Texture();
    vi.spyOn(editor, 'paintReflection').mockImplementation(() => component.paintFinish() === 'semi-gloss' ? reflection : null);
    component.setPaintFinish('semi-gloss');
    for (const colour of ['#f6f6f3', '#33383e', '#708471', '#aa6553', '#123456']) {
      component.setBodyColor(colour);
      for (const panel of [front, top, trim]) {
        expect(panel.material.bumpMap).toBeNull();
        expect(panel.material.roughness).toBe(0.26);
        expect(panel.material.envMap).toBe(reflection);
        expect(panel.material.color.getHexString()).toBe(colour.slice(1));
      }
    }
    component.setPaintFinish('matte');
    expect(front.material.bumpMap).toBe(paintBump);
    expect(front.material.roughness).toBe(0.78);
    expect(front.material.envMap).toBeNull();
    component.setTopFinish('plywood');
    component.setRawBody();
    expect(front.material.map).toBe(birch);
    expect(top.material.envMap).toBeNull();
    expect(edge.material.map).toBe(layers);
    expect(trim.material.map).toBe(pine);
    expect(front.material.bumpMap).toBeNull();
    await component.setTopFinish('oak');
    expect(top.material.map).toBe(oak);
    expect(topEdge.material.map).toBe(oak);
    expect(trim.material.map).toBe(oak);
    expect(trim.material.color.equals(top.material.color)).toBe(true);
    expect(front.material.map).toBe(birch);
  });
});


describe('MDF front variants', () => {
  it('keeps Shaker exclusive from flat moulding and rebinds visibility after changing styles', async () => {
    const { component } = setup(); const editor = component as any;
    vi.spyOn(component, 'isClassic').mockReturnValue(false);
    const apply = vi.spyOn(editor, 'applyDimensions').mockImplementation(() => {});
    const moulding = vi.spyOn(editor, 'updateMoulding').mockImplementation(() => {});
    for (const style of ['shaker', 'plain', 'moulding'] as const) {
      await component.setFrontStyle(style);
      expect(component.frontStyle()).toBe(style);
      expect(component.moulding()).toBe(style === 'moulding');
    }
    expect(apply).toHaveBeenCalledTimes(3); expect(moulding).toHaveBeenCalledTimes(3);
  });
});


it('uses plywood layers across the MDF cart tabletop and border edges', async () => {
  const { component } = setup(); const editor = component as any;
  component.activeSlug.set('decorative-wheel-roof-cart-mdf');
  editor.body = new THREE.Group(); editor.rawTexture = new THREE.Texture(); editor.plywoodTexture = new THREE.Texture();
  const face = new THREE.Texture(), edge = new THREE.Texture(), pine = new THREE.Texture();
  editor.finishTextures.set('plywood-face.jpg', face); editor.finishTextures.set('plywood-edge.jpg', edge); editor.finishTextures.set('pine.jpg', pine);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, .016, .6), new THREE.MeshStandardMaterial()); top.name = 'Top_1';
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.2, .045, .016), new THREE.MeshStandardMaterial()); trim.name = 'Top_2';
  editor.body.add(top, trim); await component.setTopFinish('plywood');
  const topMaterials = top.material as unknown as THREE.MeshPhysicalMaterial[], trimMaterials = trim.material as unknown as THREE.MeshPhysicalMaterial[];
  expect(topMaterials.map(material => material.map)).toEqual([face, edge]);
  expect(topMaterials[0].color.r).toBeCloseTo(1.05); expect(topMaterials[1].color.r).toBeCloseTo(1.30);
  expect(trimMaterials.map(material => material.map)).toEqual([face, edge]);
  expect(trimMaterials[0].color.r).toBeCloseTo(1.05);
  expect(trimMaterials[1].color.r).toBeCloseTo(1.30);
  expect(trim.geometry.hasAttribute('uv')).toBe(true);
});

it.each(['classic-bar-plywood','decorative-wheel-roof-cart-mdf'])('shows the parts menu only in Select parts for %s',slug=>{
 TestBed.resetTestingModule();TestBed.configureTestingModule({imports:[ModelingComponent],providers:[{provide:HubMembersService,useValue:{manager:()=>true}},{provide:SupabaseService,useValue:{client:{}}},{provide:ModelingCacheService,useValue:testCache()}]});
 const fixture=TestBed.createComponent(ModelingComponent);fixture.componentInstance.ngAfterViewInit=()=>{};fixture.componentInstance.activeSlug.set(slug);
 try{fixture.detectChanges();const root:HTMLElement=fixture.nativeElement;const mode=(name:string)=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent?.trim()===name)!;
 expect(root.querySelector('.parts-list')).toBeNull();mode('Select parts').click();fixture.detectChanges();expect(root.querySelector('.parts-list')).not.toBeNull();expect(mode('Return all')).toBeDefined();mode('Rotate').click();fixture.detectChanges();expect(root.querySelector('.parts-list')).toBeNull();expect(mode('Return all')).toBeUndefined();expect(mode('Select parts').getAttribute('aria-expanded')).toBe('false');
 }finally{fixture.destroy();TestBed.resetTestingModule();}
});
it('Shaker recess contrast stays subtle across paint changes and returns to base for Plain',()=>{
 const {component}=setup();const editor=component as any;component.activeSlug.set('decorative-wheel-roof-cart-mdf');component.frontStyle.set('shaker');editor.body=new THREE.Group();editor.rawTexture=new THREE.Texture();editor.plywoodTexture=new THREE.Texture();
 const panel=new THREE.Mesh(new THREE.BoxGeometry(1.168,.645,.012),new THREE.MeshStandardMaterial());panel.name='Front_part1';editor.body.add(panel);component.setBodyColor('#f6f6f3');
 const materials=panel.material as unknown as THREE.MeshStandardMaterial[],source=new THREE.Color('#f6f6f3');expect(materials[0].color.r).toBeCloseTo(source.r);expect(materials[2].color.r).toBeCloseTo(source.r*.92);
 component.setPaintFinish('semi-gloss');expect(materials[2].color.r).toBeCloseTo(source.r*.92);component.frontStyle.set('plain');editor.applyFinishes();expect(materials[2].color.r).toBeCloseTo(source.r);
});

it('restores the neutral studio after selecting either photographic scene', () => {
  const { component } = setup(); const scene = (component as any).scene as THREE.Scene;
  for (const backdrop of ['event', 'office'] as const) { component.setPreviewScene(backdrop); expect(scene.background).toBeNull(); expect(component.previewScene()).toBe(backdrop); }
  component.setPreviewScene('studio'); expect((scene.background as THREE.Color).getHexString()).toBe('eceae8');
});


describe('Optional shelf',()=>{
 it('keeps the shelf excluded when geometry is rebound, and restores it when enabled',()=>{
  const {component}=setup();
  const body=new THREE.Group(),shelf=new THREE.Group();shelf.name='Shelf';body.add(shelf);
  const internal=component as unknown as {body:THREE.Group;model:THREE.Group;bindAssembly():void};
  internal.body=body;internal.model=body;
  component.setShelfIncluded(false);
  expect(shelf.visible).toBe(false);expect(shelf.userData['assemblyHidden']).toBe(true);
  const replacement=new THREE.Group();replacement.name='Shelf';body.remove(shelf);body.add(replacement);
  internal.bindAssembly();expect(replacement.visible).toBe(false);
  component.restoreAssembly();expect(component.shelfIncluded()).toBe(false);
  component.setShelfIncluded(true);expect(replacement.visible).toBe(true);expect(replacement.userData['assemblyHidden']).toBe(false);
 });
 it('does not generate a support drawing while the shelf is excluded',()=>{
  const {component}=setup();component.setShelfIncluded(false);component.generateShelfDrawing();
  expect(component.buildingError()).toContain('Turn the shelf on');expect(component.shelfDrawing()).toBeNull();
 });
});

describe('Hub catalogue names and export pricing',()=>{
 it('shows an actionable catalogue error and clears previous prices after a failed refresh',async()=>{
  const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({error:new Error('Network unavailable'),data:null})};
  const component=new ModelingComponent({} as HubMembersService,{client:{from:()=>chain}} as unknown as SupabaseService,testCache());
  component.catalog.set({publishedAt:'2026-10-04',products:[]});await component.loadCatalog();
  expect(component.catalog()).toBeNull();expect(component.catalogBusy()).toBe(false);expect(component.catalogError()).toContain('Retry');expect(component.pricing()).toBeNull();
 });
 it('defaults PDF exports to no prices and blocks with-prices export until Hub data is loaded',async()=>{
  const {component}=setup();expect(component.pdfWithPrices()).toBe(false);
  const internal=component as unknown as {model:THREE.Group;renderer:THREE.WebGLRenderer};internal.model=new THREE.Group();internal.renderer={} as THREE.WebGLRenderer;
  component.loading.set(false);component.pdfWithPrices.set(true);await component.saveConfiguration();
  expect(component.configurationError()).toContain('Load the Hub catalogue');expect(component.savedConfiguration()).toBeNull();expect(component.configurationBusy()).toBe(false);
 });
});

it('shows the paint surcharge for the colour that selecting Painted will actually apply',()=>{
 const {component}=setup();component.shelfIncluded.set(false);component.bodyColor.set('#d4b894');
 const size='Size I (W1200mm x D600mm x H900mm)';
 component.catalog.set({publishedAt:'2026-10-04',products:[{id:'750a0827-801d-4cb4-b630-1e07167ad400',path:'/product-page/collapsible-plywood-mobile-bar-classic-mobile-food-service-event-bar-cart',name:'Fixture',currency:'AUD',options:[{name:'Size',values:[size]}],variants:[{id:'raw',price:100,choices:{Size:size,Colour:'Raw','Internal Shelf':'No','Tabletop material':'Plywood'}},{id:'white',price:150,choices:{Size:size,Colour:'White','Internal Shelf':'No','Tabletop material':'Plywood'}}]}]});
 expect(component.optionSurcharge('Finish / colour')).toBe('+$50');
 component.setPaintedBody();expect(component.pricing()?.subtotal).toBe(150);
});


describe('Modeling cached file access', () => {
  const roof = { slug: 'decorative-wheel-roof-cart-mdf', product_name: 'Roof cart', material_name: 'MDF', model_path: null, model_filename: null, base_width_mm: 1200, base_depth_mm: 600, base_body_height_mm: 827, caster_height_mm: 73 };
  it('obtains a fresh private Storage grant before reading a cached model', async () => {
    const { component } = setup(); const editor = component as any;
    component.models.set([{ ...roof, model_path: 'roof/version.glb' }]);
    editor.db.client.storage.from = () => ({ createSignedUrl: vi.fn().mockResolvedValue({ error: new Error('Access denied'), data: null }) });
    const read = vi.spyOn(editor.modelCache, 'readFile');
    await component.selectModel(roof.slug);
    expect(read).not.toHaveBeenCalled(); expect(component.error()).toContain('Access denied'); expect(component.loading()).toBe(false);
  });
  it('evicts downloaded bytes after a GLB parse failure so a retry can download again', async () => {
    const { component } = setup(); const editor = component as any;
    component.models.set([{ ...roof, model_path: 'roof/version.glb' }]);
    editor.db.client.storage.from = () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/model' }, error: null }) });
    const bytes = new ArrayBuffer(16); vi.spyOn(editor.modelCache, 'readFile').mockResolvedValue(bytes);
    const invalidate = vi.spyOn(editor.modelCache, 'invalidateFile');
    const open = vi.spyOn(editor, 'openModel').mockRejectedValue(new Error('Could not decode GLB'));
    await component.selectModel(roof.slug);
    expect(open).toHaveBeenCalledWith('https://example.test/model', bytes);
    expect(invalidate).toHaveBeenCalledWith('roof/version.glb');
    expect(component.error()).toContain('Could not decode GLB'); expect(component.loading()).toBe(false);
  });
});


it('keeps source tabletop grouping flags independent across repeated geometry rebuilds', async () => {
  const { component } = setup(); const editor = component as any;
  component.activeSlug.set('decorative-wheel-roof-cart-mdf'); component.roundingSupported.set(true);
  const geometry = new THREE.BoxGeometry(.3, .016, .2);
  const top = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); top.name = 'Top_1';
  editor.body = new THREE.Group(); editor.body.add(top); editor.sourceParts = [top];
  editor.sourcePositions.set(geometry, geometry.getAttribute('position').clone());
  const frame = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0; });
  vi.spyOn(editor, 'woodTexture').mockReturnValue(new THREE.CanvasTexture(document.createElement('canvas')));
  try {
    for (const radius of [1.5, 2, 1.5]) {
      await component.setRounding(radius);
      expect(geometry.userData['topFinishGroups']).toBeUndefined();
      const copy = editor.body.children[0] as THREE.Mesh;
      expect(copy.geometry.userData['topFinishGroups']).toBe(true);
      expect(copy.geometry.groups.every(group => group.materialIndex! < (copy.material as THREE.Material[]).length)).toBe(true);
    }
  } finally { frame.mockRestore(); editor.model = editor.body; component.ngOnDestroy(); }
});

it('toggles shelf, ice shelf and side shelves independently without adding a roof', () => {
  const {component}=setup();component.activeSlug.set('side-shelf-cart-mdf');component.sideShelvesIncluded.set(true);
  component.height.set(850);component.width.set(1500);
  const body=new THREE.Group(), model=new THREE.Group();model.add(body);
  const make=(name:string)=>{const part=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));part.name=name;body.add(part);return part;};
  const shelf=make('Shelf'),ice=make('Ice_shelf_4'),side=make('Side_shelf_left_1'),solid=make('Top_part1'),cut=make('Top_part1_cutouts'),plug=make('Top_part1_cutout_plug_4');
  (component as any).body=body;(component as any).model=model;
  component.setCutoutsIncluded(false);expect(solid.visible).toBe(true);expect(cut.visible).toBe(false);
  component.setCutoutsIncluded(true);expect(solid.visible).toBe(false);expect(cut.visible).toBe(true);expect(plug.visible).toBe(false);component.setCutoutIncluded(4,false);expect(plug.visible).toBe(true);
  component.setIceShelfIncluded(false);expect(ice.visible).toBe(false);expect(shelf.visible).toBe(true);expect(side.visible).toBe(true);
  component.setShelfIncluded(false);expect(shelf.visible).toBe(false);expect(side.visible).toBe(true);
  component.setSideShelvesIncluded(false);expect(side.visible).toBe(false);
  component.setIceShelfIncluded(true);expect(ice.visible).toBe(true);expect(shelf.visible).toBe(false);expect(side.visible).toBe(false);
  expect(component.overallHeight()).toBe(850);expect(component.hasRoof()).toBe(false);
  expect(component.parts.some(part=>part.key==='side-shelves')).toBe(true);
  component.activeSlug.set('classic-bar-plywood');expect(component.parts.some(part=>part.key==='side-shelves')).toBe(true);
});

it('selects individual trays, includes matching cutouts, and clears trays when cutouts are removed',()=>{
  const {component}=setup();component.activeSlug.set('side-shelf-cart-mdf');
  component.setCutoutIncluded(0,true);component.setCutoutIncluded(4,true);component.setTrayIncluded(0,true);component.setTrayIncluded(4,true);
  expect(component.selectedTrays()).toEqual([0,4]);expect(component.cutoutsIncluded()).toBe(true);expect(component.traySummary()).toBe('1 × GN 1/1 · 1 × GN 1/6');
  component.setTrayIncluded(0,false);expect(component.selectedTrays()).toEqual([4]);
  component.setCutoutsIncluded(false);expect(component.selectedTrays()).toEqual([]);expect(component.traysIncluded()).toBe(false);
});

it('fills only selected cutouts and removes a tray when its cutout is removed',()=>{
 const {component}=setup();component.activeSlug.set('side-shelf-cart-mdf');component.setCutoutIncluded(0,true);component.setCutoutIncluded(7,true);component.setTraysIncluded(true);
 expect(component.selectedTrays()).toEqual([0,7]);component.setCutoutIncluded(0,false);expect(component.selectedTrays()).toEqual([7]);expect(component.cutoutSummary()).toBe('1 × GN 1/6');
 component.setTrayIncluded(4,true);expect(component.selectedTrays()).toEqual([7]);
});


it('mirrors cutout geometry left to right without changing rows or accumulating transforms',()=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('side-shelf-cart-mdf');component.width.set(1500);component.depth.set(600);component.height.set(850);
 editor.body=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(.152,.016,.14));mesh.name='Top_part1_cutout_plug_1';mesh.geometry.translate(.63347,.842,.12385);editor.body.add(mesh);editor.originalPositions.set(mesh,mesh.geometry.getAttribute('position').clone());vi.spyOn(editor,'updateMoulding').mockImplementation(()=>{});vi.spyOn(editor,'applyFinishes').mockImplementation(()=>{});
 const original=editor.originalPositions.get(mesh),normal=mesh.geometry.getAttribute('normal').clone(),indices=Array.from(mesh.geometry.index!.array);component.setReverseCutoutLayout(true);let p=mesh.geometry.getAttribute('position');expect(p.getX(0)).toBeCloseTo(1.5-original.getX(0));expect(p.getZ(0)).toBeCloseTo(original.getZ(0));
 expect(mesh.geometry.getAttribute('normal').getX(0)).toBeCloseTo(-normal.getX(0));expect(mesh.geometry.getAttribute('normal').getY(0)).toBeCloseTo(normal.getY(0));component.setReverseCutoutLayout(false);expect(Array.from(mesh.geometry.index!.array)).toEqual(indices);expect(p.getX(0)).toBeCloseTo(original.getX(0));expect(p.getZ(0)).toBeCloseTo(original.getZ(0));component.setReverseCutoutLayout(true);expect(p.getX(0)).toBeCloseTo(1.5-original.getX(0));expect(component.trayLayoutIndices()).toEqual([10,11,12,7,8,9,4,5,6,1,2,3,0]);
});


it.each([0,1.5])('removes side shelf notches from side panels at rounding %s and restores them',async radius=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('side-shelf-cart-mdf');component.roundingSupported.set(true);editor.body=new THREE.Group();
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(.012,.723,.556),new THREE.MeshStandardMaterial());mesh.name='Right side 1';mesh.userData['roundingProfile']={axis:'x',origin:.02,thickness:.012,outline:[[0,.111],[.556,.111],[.556,.834],[.112,.834],[.112,.764],[.1,.764],[.1,.834],[0,.834]],holes:[]};editor.sourceParts=[mesh];editor.sourcePositions.set(mesh.geometry,mesh.geometry.getAttribute('position').clone());vi.spyOn(editor,'applyDimensions').mockImplementation(()=>{});vi.spyOn(editor,'applyFinishes').mockImplementation(()=>{});
 const hasNotch=()=>{const p=editor.body.children[0].geometry.getAttribute('position');return Array.from({length:p.count},(_,i)=>i).some(i=>p.getZ(i)>.09&&p.getZ(i)<.12&&p.getY(i)>.75&&p.getY(i)<.78);};
 component.sideShelvesIncluded.set(false);await component.setRounding(radius);expect(hasNotch()).toBe(false);component.sideShelvesIncluded.set(true);await component.setRounding(1.5);expect(hasNotch()).toBe(true);
});


it('drills aligned umbrella openings through the top, middle shelf and ice shelf and restores solid panels',async()=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('side-shelf-cart-mdf');component.roundingSupported.set(true);component.height.set(850);component.width.set(1500);editor.body=new THREE.Group();
 for(const [name,y] of [['Top part1',.834],['Shelf',.4565],['Ice shelf 4',.7],['Body5',.111]] as const){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.5,.016,.6).translate(.75,y+.008,.3),new THREE.MeshStandardMaterial());mesh.name=name;if(name!=='Shelf'&&name!=='Body5')mesh.userData['roundingProfile']={axis:'y',origin:y,thickness:.016,outline:[[0,0],[1.5,0],[1.5,.6],[0,.6]],holes:[]};editor.sourceParts.push(mesh);editor.sourcePositions.set(mesh.geometry,mesh.geometry.getAttribute('position').clone());}
 vi.spyOn(editor,'applyDimensions').mockImplementation(()=>{});vi.spyOn(editor,'applyFinishes').mockImplementation(()=>{});
 component.umbrellaHole.set(true);await component.setRounding(1.5);expect(editor.body.children).toHaveLength(4);
 const ray=new THREE.Raycaster(new THREE.Vector3(.75,1,.3),new THREE.Vector3(0,-1,0));for(const mesh of editor.body.children){mesh.updateMatrixWorld();expect(ray.intersectObject(mesh)).toHaveLength(0);}
 component.umbrellaHole.set(false);await component.setRounding(1.5);for(const mesh of editor.body.children){mesh.updateMatrixWorld();expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);}
});


it('limits umbrella diameter to 32–50 mm and includes its bottom holder only with the hole option',()=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('side-shelf-cart-mdf');component.width.set(1500);vi.spyOn(component,'setRounding').mockResolvedValue();component.setUmbrellaDiameter(20);expect(component.umbrellaDiameter()).toBe(32);component.setUmbrellaDiameter(80);expect(component.umbrellaDiameter()).toBe(50);
 editor.body=new THREE.Group();editor.model=new THREE.Group();editor.model.add(editor.body);const holder=new THREE.Mesh(new THREE.BoxGeometry(.074,.016,.053));holder.name='Body5';editor.body.add(holder);editor.bindAssembly();expect(holder.visible).toBe(false);component.umbrellaHole.set(true);editor.bindAssembly();expect(holder.visible).toBe(true);
});

it.each(['left','centre','right'] as const)('aligns the compact cart umbrella through top, shelves and bottom holder at %s',async position=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('two-in-one-cart-mdf');component.roundingSupported.set(true);component.width.set(1200);component.height.set(850);component.umbrellaHole.set(true);component.umbrellaPosition.set(position);editor.body=new THREE.Group();
 for(const [name,y] of [['Top part1',.834],['Shelf',.4565],['Ice shelf 4',.7],['Body5',.111]] as const){
  const geometry=new THREE.BoxGeometry(name==='Body5'?.074:1.5,.016,name==='Body5'?.053:.6).translate(.75,y+.008,.3);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name=name;
  if(name!=='Shelf'&&name!=='Body5')mesh.userData['roundingProfile']={axis:'y',origin:y,thickness:.016,outline:[[0,0],[1.5,0],[1.5,.6],[0,.6]],holes:[]};
  editor.sourceParts.push(mesh);editor.sourcePositions.set(geometry,geometry.getAttribute('position').clone());
 }
 vi.spyOn(editor,'applyFinishes').mockImplementation(()=>{});vi.spyOn(editor,'updateMoulding').mockImplementation(()=>{});
 await component.setRounding(1.5);
 const x=component.umbrellaX()/1000,ray=new THREE.Raycaster(new THREE.Vector3(x,1,.3),new THREE.Vector3(0,-1,0));
 for(const mesh of editor.body.children){mesh.updateMatrixWorld();expect(ray.intersectObject(mesh)).toHaveLength(0);}
});

it('switches the middle shelf between one panel and the Ice shelf divider cutout',async()=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('two-in-one-cart-mdf');component.width.set(1200);component.height.set(850);component.roundingSupported.set(true);component.shelfIncluded.set(true);component.iceShelfIncluded.set(false);
 editor.body=new THREE.Group();editor.model=new THREE.Group();editor.model.add(editor.body);
 const shelf=new THREE.Mesh(new THREE.BoxGeometry(1.436,.016,.556).translate(.75,.4645,.278),new THREE.MeshStandardMaterial());shelf.name='Shelf';
 const divider=new THREE.Mesh(new THREE.BoxGeometry(.012,.589,.556).translate(.69075,.4055,.278),new THREE.MeshStandardMaterial());divider.name='Ice shelf 3';
 for(const mesh of [shelf,divider]){editor.sourceParts.push(mesh);editor.sourcePositions.set(mesh.geometry,mesh.geometry.getAttribute('position').clone());}
 vi.spyOn(editor,'applyFinishes').mockImplementation(()=>{});vi.spyOn(editor,'updateMoulding').mockImplementation(()=>{});
 const shelfAt=()=>editor.body.children.find((part:THREE.Object3D)=>part.name==='Shelf') as THREE.Object3D;
 const intersects=()=>{const part=shelfAt();part.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(.555,.6,.3),new THREE.Vector3(0,-1,0)).intersectObject(part,true).length>0;};
 await component.setRounding(1.5);expect(intersects()).toBe(true);expect(shelfAt().children).toHaveLength(1);
 component.setIceShelfIncluded(true);await vi.waitFor(()=>expect(component.roundingBusy()).toBe(false));expect(intersects()).toBe(false);expect(shelfAt().children).toHaveLength(2);
 component.setIceShelfIncluded(false);await vi.waitFor(()=>expect(component.roundingBusy()).toBe(false));expect(intersects()).toBe(true);expect(shelfAt().children).toHaveLength(1);
});


it.each(['left','centre','right'] as const)('drills aligned Classic Ply holes at %s across product lengths and restores its panels',async position=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('classic-bar-plywood');component.roundingSupported.set(true);component.height.set(900);editor.body=new THREE.Group();
 for(const [name,y] of [['Top part1',.885],['Shelf',.49]] as const){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.162,.015,.562).translate(.6,y+.0075,.3),new THREE.MeshStandardMaterial());mesh.name=name;mesh.userData['roundingProfile']={axis:'y',origin:y,thickness:.015,outline:[[.019,.019],[1.181,.019],[1.181,.581],[.019,.581]],holes:[]};editor.sourceParts.push(mesh);editor.sourcePositions.set(mesh.geometry,mesh.geometry.getAttribute('position').clone());}
 vi.spyOn(editor,'applyFinishes').mockImplementation(()=>{});vi.spyOn(editor,'updateMoulding').mockImplementation(()=>{});
 component.umbrellaHole.set(true);component.umbrellaPosition.set(position);
 for(const width of [1200,1500]){component.width.set(width);await component.setRounding(1.5);const x=position==='left'?.2:position==='right'?width/1000-.2:width/2000;
  const ray=new THREE.Raycaster(new THREE.Vector3(x,1.2,.3),new THREE.Vector3(0,-1,0));for(const mesh of editor.body.children){mesh.updateMatrixWorld();expect(ray.intersectObject(mesh)).toHaveLength(0);ray.ray.origin.x=x+.025;expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);ray.ray.origin.x=x;}
 }
 component.umbrellaHole.set(false);await component.setRounding(1.5);const ray=new THREE.Raycaster(new THREE.Vector3(component.umbrellaX()/1000,1.2,.3),new THREE.Vector3(0,-1,0));for(const mesh of editor.body.children){mesh.updateMatrixWorld();expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);}
});


it('follows the tabletop finish on side-shelf tops and full edges until separately overridden',async()=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('side-shelf-cart-mdf');editor.body=new THREE.Group();editor.rawTexture=new THREE.Texture();editor.plywoodTexture=new THREE.Texture();
 const face=new THREE.Texture(),edge=new THREE.Texture(),oak=new THREE.Texture();editor.finishTextures.set('plywood-face.jpg',face);editor.finishTextures.set('plywood-edge.jpg',edge);editor.finishTextures.set('pine.jpg',new THREE.Texture());editor.finishTextures.set('tasmanian-oak.png',oak);
 const make=(name:string)=>{const material=new THREE.MeshStandardMaterial();const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.016,.6),[material,material]);mesh.name=name;editor.body.add(mesh);return mesh;};
 const top=make('Top_part1'),left=make('Side_shelf_left_1'),trim=make('Side_shelf_right_3'),support=make('Side_shelf_right_5');
 await component.setTopFinish('plywood');
 for(const mesh of [top,left,trim]){const materials=mesh.material as THREE.MeshPhysicalMaterial[];expect(materials[0].map).toBe(face);expect(materials[1].map).toBe(edge);expect(materials[0]).not.toBe(materials[1]);}
 expect((support.material as THREE.MeshPhysicalMaterial[])[0].map).toBeNull();
 await component.setSideShelfFinish('body');expect((left.material as THREE.MeshPhysicalMaterial[])[1].map).toBeNull();expect((top.material as THREE.MeshPhysicalMaterial[])[1].map).toBe(edge);
 await component.setTopFinish('oak');expect(component.effectiveSideShelfFinish()).toBe('body');expect((left.material as THREE.MeshPhysicalMaterial[])[0].map).toBeNull();
 await component.setSideShelfFinish('top');expect((left.material as THREE.MeshPhysicalMaterial[])[1].map).toBe(oak);expect(component.sideShelfFinishSummary()).toBe('Same as table top · Tasmanian oak');
});

it('retains the previous side-shelf finish and reports a texture load failure',async()=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set('side-shelf-cart-mdf');vi.spyOn(editor,'loadFinishTexture').mockRejectedValue(new Error('Offline'));
 await component.setSideShelfFinish('plywood');expect(component.sideShelfFinish()).toBe('top');expect(component.finishError()).toContain('Offline');expect(component.finishLoading()).toBe(false);
});

it.each(['classic-bar-plywood','decorative-wheel-roof-cart-mdf'])('adds optional side shelves, preserves their finish on resizing and removes them for %s',slug=>{
 const {component}=setup(),editor=component as any;component.activeSlug.set(slug);editor.body=new THREE.Group();editor.model=new THREE.Group();editor.model.add(editor.body);
 editor.rawTexture=new THREE.Texture();editor.plywoodTexture=new THREE.Texture();editor.finishTextures.set('tasmanian-oak.png',new THREE.Texture());component.sideShelfFinish.set('oak');
 expect(component.sideShelvesIncluded()).toBe(false);component.setSideShelvesIncluded(true);
 let group=editor.body.getObjectByName('Side shelf extensions');expect(group).toBeDefined();
 expect(group.getObjectByName('Side shelf left 1').material[0].map).toBe(editor.finishTextures.get('tasmanian-oak.png'));
 component.setDimension('width','1500');group=editor.body.getObjectByName('Side shelf extensions');
 expect(new THREE.Box3().setFromObject(group.getObjectByName('Side shelf right 2')).max.x).toBeCloseTo(1.7,6);
 expect(group.getObjectByName('Side shelf right 1').material[0].map).toBe(editor.finishTextures.get('tasmanian-oak.png'));
 expect(component.previewWidth()).toBe(1900);component.setSideShelvesIncluded(false);expect(editor.body.getObjectByName('Side shelf extensions')).toBeUndefined();expect(component.previewWidth()).toBe(1500);
});

it('Home restores the standard viewpoint after orbit, pan and zoom while keeping the configuration',()=>{
 const {component}=setup(),editor=component as any;component.width.set(1500);component.sideShelvesIncluded.set(true);
 editor.turntable=new THREE.Group();editor.turntable.rotation.y=1.8;
 editor.camera.position.set(4,2,3);editor.orbitCamera.position.set(-2,3,4);editor.camera.zoom=editor.orbitCamera.zoom=2;
 editor.controls={target:new THREE.Vector3(2,1,1),mouseButtons:{LEFT:THREE.MOUSE.PAN},enableDamping:true,reset:vi.fn(),update:vi.fn()};
 component.navigationMode.set('move');component.resetView();
 expect(editor.controls.target.toArray()).toEqual([.75,.45,.3]);expect(editor.camera.zoom).toBe(1);expect(editor.orbitCamera.zoom).toBe(1);
 expect(editor.turntable.rotation.y).toBe(Math.PI);expect(component.navigationMode()).toBe('rotate');expect(editor.controls.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
 expect(editor.orbitCamera.position.toArray()).toEqual(editor.camera.position.toArray());expect(component.width()).toBe(1500);expect(component.sideShelvesIncluded()).toBe(true);
});
