import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SupabaseService } from '../../core/services/supabase.service';
import { HubMembersService } from '../../core/services/hub-members.service';
import { fitFurnitureBolts, shortenCastorBrakes } from './modeling-hardware';
import { resizePlywoodPosition, resizeRoofCartPosition } from './modeling-geometry';
import { createRoundedPart, keepTrimJointSquare, keepPartJointsSquare, matingPartJoints, RoundingProfile } from './modeling-rounding';
import { createFrontMoulding } from './modeling-moulding';
import { pineWoodUv, addTopFinishUvs, groupTopFacesAndEdges, groupShakerRecess } from './modeling-textures';
import { createHangingGlass, hangingGlassLayout } from './modeling-glasses';
import { createRoofBottom, createGlassRack, glassRackLayout } from './modeling-roof';
import { ASSEMBLY_PARTS, AssemblyController, PartKey } from './modeling-assembly';

interface ModelRecord {
  slug: string;
  product_name: string;
  material_name: string;
  model_path: string | null;
  model_filename: string | null;
  base_width_mm: number;
  base_depth_mm: number;
  base_body_height_mm: number;
  caster_height_mm: number;
}

type TopFinish = 'body' | 'oak' | 'plywood' | 'mdf';
const BUCKET = 'hub-modeling-models';
const CLASSIC_SLUG = 'classic-bar-plywood';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// GLTFLoader sanitizes spaces in node names to underscores for animation paths.
export function casterGroupKey(name: string): string | null {
  const match = /^Caster[ _](L|R)[ _](front|rear)(?:[ _]|$)/i.exec(name);
  return match ? `${match[1].toUpperCase()}-${match[2].toLowerCase()}` : null;
}

export function isTopPanelName(name: string): boolean {
  return /^Top[ _](?:part)?\d/i.test(name);
}

@Component({
  selector: 'app-modeling',
  standalone: true,
  imports: [],
  templateUrl: './modeling.component.html',
  styleUrl: './modeling.component.css',
})
export class ModelingComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost') canvasHost!: ElementRef<HTMLDivElement>;

  readonly activeSlug = signal(CLASSIC_SLUG);
  readonly models = signal<ModelRecord[]>([]);
  readonly modelLabel = signal('Classic Bar / Plywood');
  private selectionVersion = 0;
  isClassic(): boolean { return this.activeSlug() === CLASSIC_SLUG; }
  materialLabel(): string { return this.record?.material_name || 'Plywood'; }
  overallHeight(): number { return this.height() + (this.isClassic() ? 0 : 1030); }

  readonly width = signal(1200);
  readonly depth = signal(600);
  readonly height = signal(900);
  readonly rounding = signal(1.5);
  readonly roundingEditing = signal(false);
  readonly moulding = signal(true);
  readonly frontStyle = signal<'shaker' | 'plain' | 'moulding'>('plain');
  private frontMoulding?: THREE.Mesh;
  readonly roofClosed = signal(false);
  private roofBottom?: THREE.Mesh;
  readonly previewScene = signal<'studio' | 'event' | 'office'>('studio');
  setPreviewScene(scene: 'studio' | 'event' | 'office'): void {
    this.previewScene.set(scene);
    // The stationary photographic floor remains visible through the renderer.
    this.scene.background = scene === 'studio' ? new THREE.Color('#eceae8') : null;
  }
  readonly showGlasses = signal(false);
  readonly glassDiameter = signal(80);
  glassLayout() { return hangingGlassLayout(this.glassDiameter(), this.rackLayout().bowlDiameter); }
  setShowGlasses(visible: boolean): void { this.showGlasses.set(visible); this.updateRoofBottom(); this.applyFinishes(); }
  setGlassDiameter(raw: string): void {
    const value = Number(raw); if (!Number.isFinite(value)) return;
    this.glassDiameter.set(hangingGlassLayout(value, null).diameter);
    this.updateRoofBottom(); this.applyFinishes();
  }
  readonly glassRackCount = signal(0);
  private glassRacks?: THREE.Group;
  rackLayout() { return glassRackLayout(this.width(), this.glassRackCount()); }
  setGlassRackCount(raw: string): void {
    const count = Number(raw);
    if (!Number.isFinite(count)) return;
    this.glassRackCount.set(Math.max(0, Math.min(this.rackLayout().maximum, Math.floor(count))));
    this.updateRoofBottom(); this.applyFinishes();
  }
  readonly roundingSupported = signal(false);
  readonly roundingBusy = signal(false);
  private sourceParts: THREE.Object3D[] = [];
  private generatedGeometries: THREE.BufferGeometry[] = [];
  private sourcePositions = new Map<THREE.BufferGeometry, THREE.BufferAttribute>();
  readonly bodyColor = signal('#d4b894');
  readonly rawBody = signal(true);
  readonly paintFinish = signal<'matte' | 'semi-gloss'>('matte');
  readonly topFinish = signal<TopFinish>('plywood');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly fileName = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly assemblyMode = signal(false);
  readonly assemblyRevision = signal(0);
  get parts() { return ASSEMBLY_PARTS.filter(part => this.isClassic()
    ? !['roof', 'posts', 'legs', 'decorative-wheels'].includes(part.key)
    : true); }
  private assembly?: AssemblyController;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.01, 30);
  private readonly orbitCamera = this.camera.clone();
  private viewAzimuth = Math.atan2(1.1, 1.25);
  private turntable?: THREE.Group;
  private readonly loader = new GLTFLoader();
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private resizeObserver?: ResizeObserver;
  private frame = 0;
  private model?: THREE.Group;
  private body?: THREE.Group;
  private readonly casters = new Map<string, THREE.Group>();
  private readonly originalPositions = new Map<THREE.Mesh, THREE.BufferAttribute>();
  private cameraSpan = 1.2;
  private record?: ModelRecord;
  private loadVersion = 0;
  private alive = true;
  private rawTexture?: THREE.CanvasTexture;
  readonly finishLoading = signal(false);
  readonly finishError = signal('');
  private finishVersion = 0;
  private readonly finishTextures = new Map<string, THREE.Texture>();
  private readonly finishRequests = new Map<string, Promise<THREE.Texture>>();
  private plywoodTexture?: THREE.CanvasTexture;
  private modelPlywoodTexture?: THREE.Texture;
  private modelPlywoodEdgeTexture?: THREE.Texture;
  private modelPineTexture?: THREE.Texture;
  private modelPaintBumpTexture?: THREE.Texture;
  private paintEnvironment?: THREE.WebGLRenderTarget;

  constructor(readonly members: HubMembersService, private readonly db: SupabaseService) {}

  ngAfterViewInit(): void {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.canvasHost.nativeElement.appendChild(this.renderer.domElement);
      this.scene.background = new THREE.Color('#eceae8');
      this.scene.add(new THREE.HemisphereLight('#ffffff', '#c7d0d9', 1.2));
      const light = new THREE.DirectionalLight('#ffffff', 1.3);
      light.position.set(2, 4, 3);
      light.castShadow = true;
      light.shadow.mapSize.set(4096, 4096);
      light.shadow.camera.left = light.shadow.camera.bottom = -2;
      light.shadow.camera.right = light.shadow.camera.top = 2;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 12;
      light.shadow.bias = -0.00002;
      light.shadow.normalBias = 0.001;
      this.scene.add(light);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.22 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.001;
      ground.receiveShadow = true;
      this.scene.add(ground);
      this.camera.position.set(1.7, 1.42, 2.1);
      this.orbitCamera.position.copy(this.camera.position);
      this.controls = new OrbitControls(this.orbitCamera, this.renderer.domElement);
      this.controls.target.set(0.6, 0.45, 0.3);
      this.controls.enableDamping = true;
      this.controls.maxPolarAngle = Math.PI / 2.05;
      this.controls.update();
      this.assembly = new AssemblyController(this.scene, this.camera, this.renderer.domElement,
        this.controls, () => this.assemblyRevision.update(value => value + 1));
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvasHost.nativeElement);
      window.addEventListener('resize', this.onPreviewResize);
      document.addEventListener('scroll', this.onPreviewResize, true);
      this.resize();
      this.animate();
      void this.loadSavedModel();
    } catch {
      this.loading.set(false);
      this.error.set('3D preview is unavailable in this browser. Enable WebGL and reload.');
    }
  }

  private readonly onPreviewResize = () => this.resize();

  private resize(): void {
    if (this.canvasHost && window.matchMedia('(min-width: 981px)').matches) {
      const card = this.canvasHost.nativeElement.parentElement!;
      const top = Math.max(10, card.getBoundingClientRect().top);
      card.style.setProperty('--viewer-top', `${top}px`);
    }
    if (!this.renderer) return;
    const { width, height } = this.canvasHost.nativeElement.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate = (): void => {
    if (!this.alive || !this.renderer) return;
    this.frame = requestAnimationFrame(this.animate);
    this.controls?.update();
    if (this.controls) {
      const offset = this.orbitCamera.position.clone().sub(this.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSphericalCoords(spherical.radius, spherical.phi, this.viewAzimuth));
      this.camera.lookAt(this.controls.target);
      if (this.turntable) this.turntable.rotation.y = this.viewAzimuth - spherical.theta;
    }
    this.assembly?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private async loadSavedModel(): Promise<void> {
    const requestVersion = ++this.selectionVersion;
    try {
      const { data, error } = await this.db.client.from('wc_modeling_models')
        .select('slug,product_name,material_name,model_path,model_filename,base_width_mm,base_depth_mm,base_body_height_mm,caster_height_mm')
        .order('product_name');
      if (error) throw error;
      if (!this.alive || requestVersion !== this.selectionVersion) return;
      this.models.set(data as ModelRecord[]);
      const record = this.models().find(model => model.slug === this.activeSlug());
      if (!record) throw new Error('The selected model is not available to your account');
      await this.loadRecord(record, requestVersion);
    } catch (cause) {
      if (this.alive && requestVersion === this.selectionVersion) this.error.set(`Could not open the saved 3D model: ${this.message(cause)}. Reload the page or choose a local GLB file.`);
    } finally {
      if (this.alive && requestVersion === this.selectionVersion) this.loading.set(false);
    }
  }

  async selectModel(slug: string): Promise<void> {
    if (this.saving() || this.roundingBusy() || slug === this.activeSlug()) return;
    const record = this.models().find(model => model.slug === slug);
    if (!record) return;
    const version = ++this.selectionVersion;
    ++this.loadVersion;
    ++this.finishVersion;
    this.finishLoading.set(false);
    this.finishError.set('');
    this.disposeModel();
    this.activeSlug.set(slug);
    this.selectedFile.set(null);
    this.fileName.set('');
    this.error.set('');
    this.notice.set('');
    this.loading.set(true);
    this.rawBody.set(true);
    this.moulding.set(this.isClassic());
    this.roundingEditing.set(false);
    this.frontStyle.set(this.isClassic() ? 'plain' : 'shaker');
    this.roofClosed.set(false);
    this.glassRackCount.set(0);
    this.showGlasses.set(false);
    this.glassDiameter.set(80);
    this.topFinish.set(this.isClassic() ? 'plywood' : 'body');
    this.paintFinish.set('matte');
    try { await this.loadRecord(record, version); }
    catch (cause) {
      if (this.alive && version === this.selectionVersion) this.error.set(`Could not open ${record.product_name}: ${this.message(cause)}. Select the model again or reload the page.`);
    } finally {
      if (this.alive && version === this.selectionVersion) this.loading.set(false);
    }
  }

  private async loadRecord(data: ModelRecord, version: number): Promise<void> {
      this.record = data;
      this.modelLabel.set(`${data.product_name} / ${data.material_name}`);
      this.resetDimensions();
      if (!data.model_path) {
        this.notice.set('No model has been uploaded to Hub yet. Choose a GLB file to open it in the editor.');
        return;
      }
      const signed = await this.db.client.storage.from(BUCKET).createSignedUrl(data.model_path, 600);
      if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('Could not retrieve the model link.');
      if (!this.alive || version !== this.selectionVersion) return;
      await this.openModel(signed.data.signedUrl);
      if (this.alive && version === this.selectionVersion) this.fileName.set(data.model_filename || this.modelLabel());
  }

  private async openModel(url: string): Promise<void> {
    const version = ++this.loadVersion;
    const gltf = await this.loader.loadAsync(url);
    if (!this.alive || version !== this.loadVersion) return;
    const bumpIndex = gltf.userData['paintBumpTexture'];
    const paintBump = Number.isInteger(bumpIndex) && bumpIndex >= 0
      ? await gltf.parser.getDependency('texture', bumpIndex) as THREE.Texture : undefined;
    if (!this.alive || version !== this.loadVersion) { paintBump?.dispose(); return; }
    this.disposeModel();
    this.modelPaintBumpTexture = paintBump;
    if (paintBump) {
      paintBump.colorSpace = THREE.NoColorSpace;
      paintBump.wrapS = paintBump.wrapT = THREE.RepeatWrapping;
      paintBump.channel = 1;
    }
    this.model = new THREE.Group();
    this.body = new THREE.Group();
    this.casters.clear();
    if (!this.isClassic()) { fitFurnitureBolts(gltf.scene); shortenCastorBrakes(gltf.scene); }
    const nodes = [...gltf.scene.children];
    for (const node of nodes) {
      const key = casterGroupKey(node.name);
      if (key) {
        let group = this.casters.get(key);
        if (!group) {
          group = new THREE.Group();
          this.casters.set(key, group);
          this.model.add(group);
        }
        group.add(node);
      } else {
        this.sourceParts.push(node);
        this.body.add(node);
      }
    }
    this.model.add(this.body);
    this.model.traverse(node => {
      if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    this.body.traverse(node => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        this.originalPositions.set(node, node.geometry.getAttribute('position').clone());
        this.sourcePositions.set(node.geometry, node.geometry.getAttribute('position').clone());
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial && material.map) {
            if (/pine[ _]trim$/i.test(material.name)) this.modelPineTexture ||= material.map;
            else if (/plywood[ _]edge$/i.test(material.name)) this.modelPlywoodEdgeTexture ||= material.map;
            else this.modelPlywoodTexture ||= material.map;
          }
        }
      }
    });
    this.roundingSupported.set(this.sourceParts.some(part => {
      let profile = false;
      part.traverse(node => { if (node instanceof THREE.Mesh && node.userData['roundingProfile']) profile = true; });
      return profile;
    }));
    this.rounding.set(0);
    this.turntable = new THREE.Group();
    this.turntable.add(this.model);
    this.scene.add(this.turntable);
    this.applyDimensions();
    this.applyFinishes();
    if (this.roundingSupported()) await this.setRounding(1.5);
    this.focusCamera();
  }

  private disposeModel(): void {
    this.assembly?.clear();
    if (!this.model) return;
    if (this.turntable) this.scene.remove(this.turntable);
    this.turntable = undefined;
    this.model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) material.dispose();
    });
    for (const part of this.sourceParts) part.traverse(node => {
      if (node instanceof THREE.Mesh) node.geometry.dispose();
    });
    for (const geometry of this.generatedGeometries) geometry.dispose();
    this.sourceParts = [];
    this.sourcePositions.clear();
    this.generatedGeometries = [];
    this.frontMoulding = undefined;
    this.roofBottom = undefined;
    this.glassRacks = undefined;
    this.model = undefined;
    this.body = undefined;
    this.originalPositions.clear();
    this.modelPlywoodTexture?.dispose();
    this.modelPlywoodTexture = undefined;
    this.modelPlywoodEdgeTexture?.dispose();
    this.modelPlywoodEdgeTexture = undefined;
    this.modelPineTexture?.dispose();
    this.modelPineTexture = undefined;
    this.modelPaintBumpTexture?.dispose();
    this.modelPaintBumpTexture = undefined;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.notice.set('');
    if (!file.name.toLowerCase().endsWith('.glb')) {
      this.error.set(`${file.name}: a GLB (.glb) file is required. Choose a GLB export of this model.`);
      input.value = '';
      return;
    }
    if (file.size > MAX_FILE_BYTES || file.size === 0) {
      this.error.set(`${file.name}: size ${this.fileSize(file.size)}. Allowed size: 1 byte to 20 MB.`);
      input.value = '';
      return;
    }
    const selectionVersion = ++this.selectionVersion;
    this.loading.set(true);
    const url = URL.createObjectURL(file);
    void this.openModel(url).then(() => {
      if (this.alive && selectionVersion === this.selectionVersion) {
        this.selectedFile.set(file);
        this.fileName.set(file.name);
        this.notice.set('Local preview is ready. Use Save to store the model for the team.');
      }
    }).catch(cause => {
      if (this.alive && selectionVersion === this.selectionVersion) this.error.set(`Could not read ${file.name}: ${this.message(cause)}. Check the GLB and choose the file again.`);
    }).finally(() => {
      URL.revokeObjectURL(url);
      if (this.alive && selectionVersion === this.selectionVersion) this.loading.set(false);
    });
    input.value = '';
  }

  async saveModel(): Promise<void> {
    const file = this.selectedFile();
    if (!file || !this.members.manager() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set(`Uploading ${file.name}…`);
    const slug = this.activeSlug();
    const path = `${slug}/${crypto.randomUUID()}.glb`;
    const previousPath = this.record?.model_path;
    let uploaded = false;
    try {
      const storage = this.db.client.storage.from(BUCKET);
      // Storage uploads Blob/File bodies as multipart and uses the File MIME type.
      // Windows commonly labels .glb as application/octet-stream, so give the
      // successfully parsed GLB an explicit MIME type before sending it.
      const typedFile = new File([file], file.name, { type: 'model/gltf-binary' });
      const upload = await storage.upload(path, typedFile, { contentType: 'model/gltf-binary', upsert: false });
      if (upload.error) throw upload.error;
      uploaded = true;
      this.notice.set('File uploaded. Saving the model record…');
      const update = await this.db.client.from('wc_modeling_models').update({
        model_path: path,
        model_filename: file.name,
        model_bytes: file.size,
        updated_at: new Date().toISOString(),
      }).eq('slug', slug).select('model_path').single();
      if (update.error) throw update.error;
      if (!this.alive) return;
      this.record = { ...(this.record || {
        slug, product_name: 'Classic Bar', material_name: 'Plywood',
        base_width_mm: 1200, base_depth_mm: 600, base_body_height_mm: 805, caster_height_mm: 95,
      }), model_path: path, model_filename: file.name };
      this.models.update(models => models.map(model => model.slug === slug ? this.record! : model));
      this.selectedFile.set(null);
      this.notice.set(`${file.name} saved to Hub. The model is available to team members.`);
      if (previousPath && previousPath !== path) {
        try { await storage.remove([previousPath]); } catch { /* Old unreferenced file can be cleaned up later. */ }
      }
    } catch (cause) {
      if (uploaded) await this.db.client.storage.from(BUCKET).remove([path]);
      if (this.alive) {
        this.error.set(`Could not save ${file.name}: ${this.message(cause)}. Your local file and previous saved model are retained; retry the upload.`);
        this.notice.set('');
      }
    } finally {
      if (this.alive) this.saving.set(false);
    }
  }

  setDimension(axis: 'width' | 'height', raw: string): void {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const limits = axis === 'width' ? [1200, 1500] : [850, 1000];
    const step = axis === 'width' ? 100 : 50;
    const next = Math.round(Math.max(limits[0], Math.min(limits[1], value)) / step) * step;
    this[axis].set(next);
    this.applyDimensions();
  }

  async setRounding(raw: number): Promise<void> {
    if (!this.body || !this.roundingSupported() || this.roundingBusy() || ![0, 1, 1.5, 2, 2.5, 3].includes(raw)) return;
    this.roundingBusy.set(true);
    this.error.set('');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const geometries: THREE.BufferGeometry[] = [];
    try {
      // CAD profiles and positions share model coordinates. Read the original
      // positions so rotation, resized previews and assembly offsets do not
      // alter which roof and Shaker faces meet.
      const joints = matingPartJoints(this.sourceParts.filter(part => !/^Front[ _]part[12]$/i.test(part.name)
        || (!this.isClassic() && this.frontStyle() === 'shaker')).map(part => {
        const bounds = new THREE.Box3();
        part.traverse(node => {
          if (node instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromBufferAttribute(this.sourcePositions.get(node.geometry)!));
        });
        return { name: part.name, bounds };
      }));
      const nodes = this.sourceParts.map(part => {
        let supported = false;
        part.traverse(node => { if (node instanceof THREE.Mesh && node.userData['roundingProfile']) supported = true; });
        if (!raw || !supported || /^(Top|Buttom|Bottom)[ _](?:part)?1$/i.test(part.name)) {
          const copy = part.clone(true);
          copy.traverse(node => {
            if (!(node instanceof THREE.Mesh)) return;
            const original = this.sourcePositions.get(node.geometry)!;
            node.geometry = node.geometry.clone();
            node.geometry.setAttribute('position', original.clone());
            geometries.push(node.geometry);
          });
          return copy;
        }
        let profile: RoundingProfile | undefined;
        let name = part.name;
        const materials: THREE.Material[] = [];
        part.traverse(node => {
          if (!(node instanceof THREE.Mesh)) return;
          profile ||= node.userData['roundingProfile'];
          name = node.userData['plywoodPart'] || name;
          materials.push(...(Array.isArray(node.material) ? node.material : [node.material]));
        });
        if (!profile) throw new Error('The GLB is missing a part profile. Upload an updated model.');
        const geometry = createRoundedPart(profile, raw);
        if (/^(Top|Buttom|Bottom)[ _](?:part)?2$/i.test(name)) keepTrimJointSquare(geometry, profile, raw);
        keepPartJointsSquare(geometry, joints.get(name) || [], raw);
        geometries.push(geometry);
        const face = materials.find(material => !/plywood[ _]edge$/i.test(material.name)) || materials[0];
        const edge = materials.find(material => /plywood[ _]edge$/i.test(material.name)) || face;
        const mesh = new THREE.Mesh(geometry, [face, edge]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = name;
        mesh.userData['plywoodPart'] = name;
        return mesh;
      });
      this.body!.clear();
      for (const geometry of this.generatedGeometries) geometry.dispose();
      this.generatedGeometries = geometries;
      this.originalPositions.clear();
      for (const node of nodes) {
        this.body!.add(node);
        node.traverse(child => {
          if (child instanceof THREE.Mesh) this.originalPositions.set(child, child.geometry.getAttribute('position').clone());
        });
      }
      this.rounding.set(raw);
      this.applyDimensions();
      this.applyFinishes();
    } catch (cause) {
      for (const geometry of geometries) geometry.dispose();
      this.error.set(`Could not round the parts: ${this.message(cause)}. Choose a smaller radius or upload an updated model.`);
    } finally { this.roundingBusy.set(false); }
  }

  resetDimensions(): void {
    this.width.set(this.record?.base_width_mm || 1200);
    this.depth.set(this.record?.base_depth_mm || 600);
    this.height.set(this.record ? this.record.base_body_height_mm + this.record.caster_height_mm : 900);
    this.applyDimensions();
  }

  setBodyColor(color: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    this.rawBody.set(false);
    this.bodyColor.set(color);
    this.applyFinishes();
  }

  setRawBody(): void {
    this.rawBody.set(true);
    this.applyFinishes();
  }

  async setTopFinish(finish: TopFinish): Promise<void> {
    const version = ++this.finishVersion;
    this.finishError.set('');
    this.finishLoading.set(true);
    try {
      if (finish === 'oak') await this.loadFinishTexture('tasmanian-oak.png');
      else if (finish === 'plywood' && !this.isClassic()) await Promise.all([
        this.loadFinishTexture('plywood-face.jpg'), this.loadFinishTexture('plywood-edge.jpg'), this.loadFinishTexture('pine.jpg'),
      ]);
      if (!this.alive || version !== this.finishVersion) return;
      this.topFinish.set(finish);
      this.applyFinishes();
    } catch (cause) {
      if (this.alive && version === this.finishVersion) this.finishError.set(`Could not load the table top texture: ${this.message(cause)}. Check your connection and select the finish again.`);
    } finally {
      if (this.alive && version === this.finishVersion) this.finishLoading.set(false);
    }
  }

  private loadFinishTexture(file: string): Promise<THREE.Texture> {
    const cached = this.finishTextures.get(file);
    if (cached) return Promise.resolve(cached);
    const pending = this.finishRequests.get(file);
    if (pending) return pending;
    const request = new THREE.TextureLoader().loadAsync(new URL(`modeling-textures/${file}`, document.baseURI).href).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.channel = file === 'pine.jpg' ? 0 : file === 'plywood-edge.jpg' ? 3 : 2;
      texture.repeat.set(file === 'tasmanian-oak.png' ? 3 / 1.2 : file === 'plywood-face.jpg' ? 1 / 2.439 : 1,
        file === 'tasmanian-oak.png' ? 3 / 1.2 : file === 'plywood-face.jpg' ? 1 / 2.439 : 1);
      if (file === 'plywood-face.jpg' && texture.image?.width && texture.image?.height) texture.repeat.y *= texture.image.width / texture.image.height;
      texture.anisotropy = Math.min(this.renderer?.capabilities.getMaxAnisotropy() || 1, 8);
      if (this.alive) this.finishTextures.set(file, texture); else texture.dispose();
      return texture;
    }).finally(() => this.finishRequests.delete(file));
    this.finishRequests.set(file, request);
    return request;
  }

  setPaintFinish(finish: 'matte' | 'semi-gloss'): void {
    this.paintFinish.set(finish);
    this.applyFinishes();
  }

  private paintRoughness(): number {
    return this.paintFinish() === 'semi-gloss' ? 0.26 : 0.78;
  }

  private paintReflection(forGlass = false): THREE.Texture | null {
    if ((!forGlass && this.paintFinish() !== 'semi-gloss') || !this.renderer) return null;
    if (!this.paintEnvironment) {
      const studio = new THREE.Scene();
      studio.background = new THREE.Color('#181818');
      const geometry = new THREE.BoxGeometry(3, 7, 0.05);
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(4, 4, 4) });
      // Large vertical softboxes below eye level remain visible in reflections
      // on upright panels, even when the preview camera looks down at the cart.
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const softbox = new THREE.Mesh(geometry, material);
        softbox.position.set(Math.sin(angle) * 5, -2, Math.cos(angle) * 5);
        softbox.rotation.y = angle;
        studio.add(softbox);
      }
      const generator = new THREE.PMREMGenerator(this.renderer);
      try { this.paintEnvironment = generator.fromScene(studio, 0.04); }
      finally { geometry.dispose(); material.dispose(); generator.dispose(); }
    }
    return this.paintEnvironment.texture;
  }

  setAssemblyMode(enabled: boolean): void {
    this.assemblyMode.set(enabled);
    this.assembly?.setEnabled(enabled);
  }
  selectPart(key: PartKey): void { this.setAssemblyMode(true); this.assembly?.select(key); }
  selectedPart(): PartKey | null { this.assemblyRevision(); return this.assembly?.state.selected || null; }
  partVisible(key: PartKey): boolean { this.assemblyRevision(); return this.assembly?.state.visible[key] ?? true; }
  partAvailable(key: PartKey): boolean { this.assemblyRevision(); return this.assembly?.has(key) ?? false; }
  partMovable(key: PartKey): boolean { this.assemblyRevision(); return this.assembly?.state.canMove(key) ?? false; }
  partOffset(key: PartKey): number { this.assemblyRevision(); return Math.round(this.assembly?.state.offsets[key] || 0); }
  setPartVisible(key: PartKey, visible: boolean): void { this.assembly?.setVisible(key, visible); }
  movePart(mm: string): void { this.assembly?.move(Number(mm)); }
  restorePart(): void { const key = this.selectedPart(); if (key) this.assembly?.restore(key); }
  restoreAssembly(): void { this.assembly?.restore(); }
  private bindAssembly(): void {
    if (!this.model || !this.body) return;
    if (!this.isClassic()) this.body.traverse(node => {
      if (!/^Front[ _]part2$/i.test(node.userData['plywoodPart'] || node.name)) return;
      node.userData['assemblyHidden'] = this.frontStyle() !== 'shaker';
    });
    if (this.assembly) this.assembly.normals = this.isClassic() ? {} : { front: [0, 0, 1], left: [1, 0, 0], right: [-1, 0, 0] };
    this.assembly?.bind(this.model, [...this.body.children, ...(this.frontMoulding ? [this.frontMoulding] : []),
      ...[...this.casters.values()].flatMap(group => group.children)]);
  }

  private applyDimensions(): void {
    if (!this.body) return;
    for (const [node, original] of this.originalPositions) {
      const positions = node.geometry.getAttribute('position');
      for (let i = 0; i < original.count; i++) {
        const name = node.userData['plywoodPart'] || node.name;
        const [x, y, z] = this.isClassic()
          ? resizePlywoodPosition(name, original.getX(i), original.getY(i), original.getZ(i), this.width(), this.height())
          : resizeRoofCartPosition(name, original.getX(i), original.getY(i), original.getZ(i), this.width(), this.height(), this.frontStyle() !== 'shaker');
        positions.setXYZ(i, x, y, z);
      }
      positions.needsUpdate = true;
      node.geometry.computeBoundingBox();
      node.geometry.computeBoundingSphere();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (this.isClassic()) this.addWoodUvs(node.geometry,
        node.userData['plywoodPart'] || node.name, materials.some(material => /plywood[ _]edge$/i.test(material.name)),
        materials.some(material => /pine[ _]trim$/i.test(material.name)));
    }
    for (const [key, group] of this.casters) {
      const [side, row] = key.split('-');
      group.position.set(
        side === 'R' ? (this.width() - 1200) / 1000 : 0,
        0,
        row === 'rear' ? (this.depth() - 600) / 1000 : 0,
      );
    }
    const span = Math.max(this.width(), this.depth(), this.overallHeight()) / 1000;
    const centerX = this.width() / 2000, centerZ = this.depth() / 2000;
    this.turntable?.position.set(centerX, 0, centerZ);
    this.model?.position.set(-centerX, 0, -centerZ);
    if (this.controls) {
      const nextTarget = new THREE.Vector3(this.width() / 2000, this.overallHeight() / 2000, this.depth() / 2000);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(nextTarget).addScaledVector(offset, span / this.cameraSpan);
      const orbitOffset = this.orbitCamera.position.clone().sub(this.controls.target);
      this.orbitCamera.position.copy(nextTarget).addScaledVector(orbitOffset, span / this.cameraSpan);
      this.controls.target.copy(nextTarget);
      this.controls.update();
    }
    this.cameraSpan = span;
    this.updateRoofBottom();
    if (this.roofClosed()) this.applyFinishes();
    else this.updateMoulding();
  }

  setRoofClosed(closed: boolean): void {
    this.roofClosed.set(closed);
    this.updateRoofBottom();
    this.applyFinishes();
  }

  private updateRoofBottom(): void {
    if (this.glassRacks) {
      this.glassRacks.removeFromParent();
      const materials = new Set<THREE.Material>();
      this.glassRacks.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); materials.add(node.material as THREE.Material); } });
      materials.forEach(material => material.dispose()); this.glassRacks = undefined;
    }
    if (this.roofBottom) {
      this.roofBottom.removeFromParent();
      this.roofBottom.geometry.dispose();
      const materials = Array.isArray(this.roofBottom.material) ? this.roofBottom.material : [this.roofBottom.material];
      materials.forEach(material => material.dispose());
      this.roofBottom = undefined;
    }
    if (!this.body || this.isClassic() || !this.roofClosed()) return;
    const skirts: THREE.Box3[] = [], posts: THREE.Box3[] = [];
    for (const part of this.body.children) {
      const name = part.userData['plywoodPart'] || part.name;
      const bounds = new THREE.Box3();
      part.traverse(node => {
        if (node instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromBufferAttribute(node.geometry.getAttribute('position')));
      });
      if (/^Roof[ _][2-5][ _]*$/i.test(name)) skirts.push(bounds);
      if (/^Dar[ _]?[1-4]$/i.test(name)) posts.push(bounds);
    }
    if (skirts.length !== 4 || posts.length !== 4) {
      this.error.set('Could not close the roof: the model needs four roof skirt panels and four supports. Upload the complete roof model and retry.');
      this.roofClosed.set(false);
      return;
    }
    const envelope = skirts.reduce((box, skirt) => box.union(skirt), new THREE.Box3());
    // Side panels bound X; front and rear panels bound Z. Use their inside faces.
    const byX = [...skirts].sort((a, b) => a.getSize(new THREE.Vector3()).x - b.getSize(new THREE.Vector3()).x).slice(0, 2);
    const byZ = [...skirts].sort((a, b) => a.getSize(new THREE.Vector3()).z - b.getSize(new THREE.Vector3()).z).slice(0, 2);
    byX.sort((a, b) => a.min.x - b.min.x); byZ.sort((a, b) => a.min.z - b.min.z);
    envelope.min.x = byX[0].max.x; envelope.max.x = byX[1].min.x;
    envelope.min.z = byZ[0].max.z; envelope.max.z = byZ[1].min.z;
    this.roofBottom = new THREE.Mesh(createRoofBottom(envelope, posts), new THREE.MeshPhysicalMaterial());
    this.roofBottom.name = 'Roof bottom panel';
    this.roofBottom.castShadow = true; this.roofBottom.receiveShadow = true;
    this.body.add(this.roofBottom);
    const layout = this.rackLayout(); this.glassRackCount.set(layout.centres.length);
    if (layout.centres.length) {
      this.glassRacks = new THREE.Group(); this.glassRacks.name = 'Roof glass racks';
      for (const x of layout.centres) {
        const rack = createGlassRack();
        rack.position.set(x / 1000, envelope.min.y, (envelope.min.z + envelope.max.z) / 2);
        if (this.showGlasses()) for (const z of this.glassLayout().positions) {
          const glass = createHangingGlass(this.glassDiameter(), this.paintReflection(true));
          glass.position.set(0, -.067, z); rack.add(glass);
        }
        this.glassRacks.add(rack);
      }
      this.body.add(this.glassRacks);
    }
  }

  private applyFinishes(): void {
    if (!this.body) return;
    const reflection = this.paintReflection();
    this.rawTexture ||= this.woodTexture('#d5b88d', '#b99466', 0.35);
    this.plywoodTexture ||= this.woodTexture('#d9ba8e', '#b78c60', 0.22);
    const body = new THREE.Color(this.bodyColor());
    this.body.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const partName = node.userData['plywoodPart'] || node.name;
      if (node.userData['fixedMaterial']) return;
      if (!this.isClassic() && isTopPanelName(partName)) {
        groupTopFacesAndEdges(node.geometry);
        const source = Array.isArray(node.material) ? node.material[0] : node.material;
        if (!Array.isArray(node.material) || node.material.length < 2) {
          const edge = source.clone(); edge.name = 'plywood edge';
          node.material = [source, edge];
        }
      }
      if (!this.isClassic() && this.frontStyle() === 'shaker' && /^Front[ _]part1$/i.test(partName)) {
        groupShakerRecess(node.geometry);
        const materials = Array.isArray(node.material) ? [...node.material] : [node.material];
        if (!materials[1]) materials[1] = materials[0];
        if (!materials[2]) { materials[2] = materials[0].clone(); materials[2].name = 'Shaker recessed face'; }
        node.material = materials;
      }
      const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(material => {
        if (!(material instanceof THREE.MeshStandardMaterial) || material instanceof THREE.MeshPhysicalMaterial) return material;
        const paint = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(paint, material);
        return paint;
      });
      node.material = Array.isArray(node.material) ? materials : materials[0];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const finish = isTopPanelName(partName) ? this.topFinish() : 'body';
        const pine = /pine[ _]trim$/i.test(material.name) || (!this.isClassic() && finish === 'plywood' && /^Top[ _]2$/i.test(partName));
        const edge = /plywood[ _]edge$/i.test(material.name);
        const plywood = (pine ? this.modelPineTexture : edge ? this.modelPlywoodEdgeTexture : this.modelPlywoodTexture) || this.modelPlywoodTexture;
        const map = finish === 'oak' ? this.finishTextures.get('tasmanian-oak.png') || null
          : finish === 'mdf' ? null : !this.isClassic() ? finish === 'plywood' ? this.finishTextures.get(pine ? 'pine.jpg' : edge ? 'plywood-edge.jpg' : 'plywood-face.jpg') || null : null
          : finish === 'plywood' ? plywood || this.rawTexture : this.rawBody() ? plywood || this.rawTexture : null;
        const rawMdf = !this.isClassic() && !map && (this.rawBody() || finish === 'mdf');
        const source = rawMdf ? new THREE.Color('#b99b78') : map ? new THREE.Color('#ffffff') : body;
        if (map && !node.geometry.hasAttribute('uv')) this.addWoodUvs(node.geometry, partName, edge, pine);
        if (map && !this.isClassic() && finish === 'plywood' && pine) this.addWoodUvs(node.geometry, partName, false, true);
        if (map && (finish === 'oak' || (finish === 'plywood' && !this.isClassic() && !pine))) addTopFinishUvs(node.geometry, finish === 'oak' && !this.isClassic() && /^Top[ _][3-6]$/i.test(partName));
        if (!map && this.modelPaintBumpTexture && !node.geometry.hasAttribute('uv1')) this.addPaintUvs(node.geometry);
        material.color.copy(source);
        if (!this.isClassic() && this.frontStyle() === 'shaker' && material.name === 'Shaker recessed face') material.color.multiplyScalar(.92);
        if (map && finish !== 'oak' && !pine && !edge) material.color.multiplyScalar(1.05);
        if (edge && map && finish !== 'oak' && !pine) material.color.multiplyScalar(1.30);
        if (pine && map && finish !== 'oak') material.color.multiply(new THREE.Color().setRGB(1.15, 1.5, 2.4)).multiplyScalar(1.05);
        material.map = map;
        material.bumpMap = rawMdf || map || this.paintFinish() === 'semi-gloss' ? null : this.modelPaintBumpTexture || null;
        material.bumpScale = 0.00015;
        material.roughness = rawMdf ? 0.85 : map ? finish === 'oak' ? 0.55 : 0.78 : this.paintRoughness();
        material.metalness = 0;
        material.envMap = rawMdf || map ? null : reflection;
        material.envMapIntensity = 0.128;
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.clearcoat = !rawMdf && !map && reflection ? 0.2 : 0;
          material.clearcoatRoughness = 0.16;
        }
        material.needsUpdate = true;
      }
    });
    this.updateMoulding();
  }

  setMoulding(enabled: boolean): void {
    if (!this.isClassic()) { this.setFrontStyle(enabled ? 'moulding' : 'plain'); return; }
    this.moulding.set(enabled);
    this.updateMoulding();
  }

  async setFrontStyle(style: 'shaker' | 'plain' | 'moulding'): Promise<void> {
    if (this.roundingBusy()) return;
    this.frontStyle.set(style);
    this.moulding.set(style === 'moulding');
    if (this.body && this.roundingSupported()) await this.setRounding(this.rounding());
    else { this.applyDimensions(); this.updateMoulding(); }
  }

  private updateMoulding(): void {
    if (!this.model) return;
    if (this.frontMoulding) {
      this.model.remove(this.frontMoulding);
      this.frontMoulding.geometry.dispose();
      (this.frontMoulding.material as THREE.Material).dispose();
      this.frontMoulding = undefined;
    }
    if (!this.moulding()) { this.bindAssembly(); return; }
    const material = new THREE.MeshPhysicalMaterial({
      map: this.rawBody() ? this.modelPineTexture || this.modelPlywoodTexture || this.rawTexture : null,
      color: this.rawBody() ? '#ffffff' : this.bodyColor(), roughness: this.rawBody() ? 0.78 : this.paintRoughness(), side: THREE.DoubleSide,
      envMap: this.rawBody() ? null : this.paintReflection(), envMapIntensity: 0.128,
      clearcoat: !this.rawBody() && this.paintFinish() === 'semi-gloss' ? 0.2 : 0, clearcoatRoughness: 0.16,
    });
    if (this.rawBody() && this.modelPineTexture) material.color.multiply(new THREE.Color().setRGB(1.15, 1.5, 2.4)).multiplyScalar(1.05);
    this.frontMoulding = new THREE.Mesh(createFrontMoulding(this.width(), this.height(), this.isClassic() ? undefined
      : { panelLeft: 0.016, panelBottom: 0.239, panelTopInset: 0.016, front: 0.5840004, direction: 1 }), material);
    material.bumpMap = this.rawBody() || this.paintFinish() === 'semi-gloss' ? null : this.modelPaintBumpTexture || null;
    material.bumpScale = 0.00015;
    this.addPaintUvs(this.frontMoulding.geometry);
    this.frontMoulding.name = 'Front moulding';
    this.frontMoulding.castShadow = true;
    // The shallow curved mould self-shadows poorly at this scale; it still casts
    // its real outline onto the receiving panel beneath it.
    this.frontMoulding.receiveShadow = false;
    this.model.add(this.frontMoulding);
    this.bindAssembly();
  }

  private addWoodUvs(geometry: THREE.BufferGeometry, partName = '', edge = false, pine = false): void {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uv = new Float32Array(positions.count * 2);
    // The supplied birch texture represents a 2439 mm wide sheet. Preserve its
    // physical grain size as panels grow, rather than stretching the image.
    const width = this.modelPlywoodTexture ? 2.439 : 0.32;
    const textureImage = this.modelPlywoodTexture?.image;
    const height = textureImage?.width && textureImage?.height ? width * textureImage.height / textureImage.width : width;
    const horizontal = /^(Top|Buttom|Bottom)[ _]part|^Shelf/i.test(partName);
    const ring = /^(Top|Buttom|Bottom)[ _]part2/i.test(partName);
    const side = /^(Left|Right)[ _]side/i.test(partName);
    let groupIndex = 0;
    for (let i = 0; i < positions.count; i++) {
      while (groupIndex < geometry.groups.length - 1 && i >= geometry.groups[groupIndex].start + geometry.groups[groupIndex].count) groupIndex++;
      const useEdge = geometry.userData['plywoodFacesAndEdges'] ? geometry.groups[groupIndex]?.materialIndex === 1 : edge;
      const nx = Math.abs(normals.getX(i));
      const ny = Math.abs(normals.getY(i));
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      if (pine && (this.modelPineTexture || this.finishTextures.get('pine.jpg'))) {
        const frontOrRear = z <= 0.01901 || z >= 0.58099;
        // Pine grain runs vertically in the source image: V follows the rail.
        const [u, v] = pineWoodUv(ny > 0.5 ? frontOrRear ? z : x : y,
          ny > 0.5 ? frontOrRear ? x : z : nx > 0.5 ? z : x);
        uv[i * 2] = u;
        uv[i * 2 + 1] = v;
      } else if (useEdge && this.modelPlywoodEdgeTexture) {
        // The edge image has horizontal layers: V crosses the panel thickness.
        // A 120 mm tile keeps the veneers at approximately 2 mm per layer.
        if (ring) {
          const frontOrRear = z <= 0.01901 || z >= 0.58099;
          uv[i * 2] = (frontOrRear ? x : z) / 0.12;
          uv[i * 2 + 1] = (frontOrRear ? z : x) / 0.12;
        } else {
          uv[i * 2] = (horizontal ? nx > 0.5 ? z : x : side ? ny > 0.5 ? z : y : ny > 0.5 ? x : y) / 0.12;
          uv[i * 2 + 1] = (horizontal ? y : side ? x : z) / 0.12;
        }
      } else {
        uv[i * 2] = (nx > 0.5 || ny > 0.5 ? z : x) / width;
        uv[i * 2 + 1] = (ny > 0.5 ? x : y) / height;
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.addPaintUvs(geometry);
  }

  private addPaintUvs(geometry: THREE.BufferGeometry): void {
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i));
      uv[i * 2] = (nx > 0.5 ? positions.getZ(i) : positions.getX(i)) / 0.12;
      uv[i * 2 + 1] = (ny > 0.5 ? positions.getZ(i) : positions.getY(i)) / 0.12;
    }
    geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  }

  private woodTexture(base: string, grain: string, strength: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.fillStyle = base;
    context.fillRect(0, 0, 256, 256);
    context.strokeStyle = grain;
    for (let x = 0; x < 256; x += 3) {
      const wave = Math.sin(x * 0.16) * 3 + Math.sin(x * 0.043) * 5;
      context.globalAlpha = strength * (0.55 + 0.45 * Math.sin(x * 0.37) ** 2);
      context.beginPath();
      for (let y = 0; y <= 256; y += 8) {
        const px = x + wave * Math.sin(y * 0.025 + x * 0.012);
        if (y === 0) context.moveTo(px, y); else context.lineTo(px, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(this.renderer?.capabilities.getMaxAnisotropy() || 1, 8);
    return texture;
  }

  private focusCamera(): void {
    const span = Math.max(this.width(), this.depth(), this.overallHeight()) / 1000;
    this.cameraSpan = span;
    this.camera.position.set(this.width() / 2000 + span * 1.1, this.overallHeight() / 2000 + span * 0.5, this.depth() / 2000 + span * 1.25);
    this.orbitCamera.position.copy(this.camera.position);
    this.camera.lookAt(this.width() / 2000, this.overallHeight() / 2000, this.depth() / 2000);
    this.controls?.update();
  }

  private fileSize(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
  private message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }

  ngOnDestroy(): void {
    this.alive = false;
    this.loadVersion++;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onPreviewResize);
    document.removeEventListener('scroll', this.onPreviewResize, true);
    this.controls?.dispose();
    this.assembly?.dispose();
    this.disposeModel();
    this.rawTexture?.dispose();
    for (const texture of this.finishTextures.values()) texture.dispose();
    this.plywoodTexture?.dispose();
    this.paintEnvironment?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
