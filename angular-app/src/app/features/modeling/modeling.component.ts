import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SupabaseService } from '../../core/services/supabase.service';
import { HubMembersService } from '../../core/services/hub-members.service';
import { resizePlywoodPosition } from './modeling-geometry';
import { createRoundedPart, keepTrimJointSquare, RoundingProfile } from './modeling-rounding';
import { createFrontMoulding } from './modeling-moulding';
import { pineWoodUv } from './modeling-textures';

interface ModelRecord {
  model_path: string | null;
  model_filename: string | null;
  base_width_mm: number;
  base_depth_mm: number;
  base_body_height_mm: number;
  caster_height_mm: number;
}

type TopFinish = 'body' | 'oak' | 'plywood';
const BUCKET = 'hub-modeling-models';
const SLUG = 'classic-bar-plywood';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// GLTFLoader sanitizes spaces in node names to underscores for animation paths.
export function casterGroupKey(name: string): string | null {
  const match = /^Caster[ _](L|R)[ _](front|rear)(?:[ _]|$)/i.exec(name);
  return match ? `${match[1].toUpperCase()}-${match[2].toLowerCase()}` : null;
}

export function isTopPanelName(name: string): boolean {
  return /^Top[ _]part/i.test(name);
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

  readonly width = signal(1200);
  readonly depth = signal(600);
  readonly height = signal(900);
  readonly rounding = signal(0);
  readonly moulding = signal(true);
  private frontMoulding?: THREE.Mesh;
  readonly roundingSupported = signal(false);
  readonly roundingBusy = signal(false);
  private sourceParts: THREE.Object3D[] = [];
  private generatedGeometries: THREE.BufferGeometry[] = [];
  private sourcePositions = new Map<THREE.BufferGeometry, THREE.BufferAttribute>();
  readonly bodyColor = signal('#d4b894');
  readonly rawBody = signal(true);
  readonly topFinish = signal<TopFinish>('plywood');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly fileName = signal('');
  readonly selectedFile = signal<File | null>(null);

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.01, 30);
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
  private oakTexture?: THREE.CanvasTexture;
  private plywoodTexture?: THREE.CanvasTexture;
  private modelPlywoodTexture?: THREE.Texture;
  private modelPlywoodEdgeTexture?: THREE.Texture;
  private modelPineTexture?: THREE.Texture;

  constructor(readonly members: HubMembersService, private readonly db: SupabaseService) {}

  ngAfterViewInit(): void {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;
      this.canvasHost.nativeElement.appendChild(this.renderer.domElement);
      this.scene.background = new THREE.Color('#f8fafc');
      this.scene.add(new THREE.HemisphereLight('#ffffff', '#c7d0d9', 1.2));
      const light = new THREE.DirectionalLight('#ffffff', 1.3);
      light.position.set(2, 4, 3);
      this.scene.add(light);
      const ground = new THREE.GridHelper(4, 20, '#cbd5e1', '#e2e8f0');
      ground.position.y = -0.006;
      this.scene.add(ground);
      this.camera.position.set(1.7, 1.42, 2.1);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.set(0.6, 0.45, 0.3);
      this.controls.enableDamping = true;
      this.controls.maxPolarAngle = Math.PI / 2.05;
      this.controls.update();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvasHost.nativeElement);
      this.resize();
      this.animate();
      void this.loadSavedModel();
    } catch {
      this.loading.set(false);
      this.error.set('3D-просмотр недоступен в этом браузере. Включите WebGL и обновите страницу.');
    }
  }

  private resize(): void {
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
    this.renderer.render(this.scene, this.camera);
  };

  private async loadSavedModel(): Promise<void> {
    const requestVersion = this.loadVersion;
    try {
      const { data, error } = await this.db.client.from('wc_modeling_models')
        .select('model_path,model_filename,base_width_mm,base_depth_mm,base_body_height_mm,caster_height_mm')
        .eq('slug', SLUG).single();
      if (error) throw error;
      if (!this.alive || requestVersion !== this.loadVersion) return;
      this.record = data as ModelRecord;
      this.resetDimensions();
      if (!data.model_path) {
        this.notice.set('Модель ещё не загружена в Hub. Выберите GLB-файл, чтобы открыть её в редакторе.');
        return;
      }
      const signed = await this.db.client.storage.from(BUCKET).createSignedUrl(data.model_path, 600);
      if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('Не удалось получить ссылку на модель.');
      if (!this.alive || requestVersion !== this.loadVersion) return;
      await this.openModel(signed.data.signedUrl);
      if (this.alive) this.fileName.set(data.model_filename || 'Classic Bar / Plywood');
    } catch (cause) {
      if (this.alive) this.error.set(`Не удалось открыть сохранённую 3D-модель: ${this.message(cause)}. Обновите страницу или выберите локальный GLB-файл.`);
    } finally {
      if (this.alive) this.loading.set(false);
    }
  }

  private async openModel(url: string): Promise<void> {
    const version = ++this.loadVersion;
    const gltf = await this.loader.loadAsync(url);
    if (!this.alive || version !== this.loadVersion) return;
    this.disposeModel();
    this.model = new THREE.Group();
    this.body = new THREE.Group();
    this.casters.clear();
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
    this.body.traverse(node => {
      if (node instanceof THREE.Mesh) {
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
    this.roundingSupported.set(this.sourceParts.every(part => {
      let profile = false;
      part.traverse(node => { if (node instanceof THREE.Mesh && node.userData['roundingProfile']) profile = true; });
      return profile;
    }));
    this.rounding.set(0);
    this.scene.add(this.model);
    this.applyDimensions();
    this.applyFinishes();
    this.focusCamera();
  }

  private disposeModel(): void {
    if (!this.model) return;
    this.scene.remove(this.model);
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
    this.model = undefined;
    this.body = undefined;
    this.originalPositions.clear();
    this.modelPlywoodTexture?.dispose();
    this.modelPlywoodTexture = undefined;
    this.modelPlywoodEdgeTexture?.dispose();
    this.modelPlywoodEdgeTexture = undefined;
    this.modelPineTexture?.dispose();
    this.modelPineTexture = undefined;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.notice.set('');
    if (!file.name.toLowerCase().endsWith('.glb')) {
      this.error.set(`${file.name}: требуется файл GLB (.glb). Выберите экспорт этой модели в формате GLB.`);
      input.value = '';
      return;
    }
    if (file.size > MAX_FILE_BYTES || file.size === 0) {
      this.error.set(`${file.name}: размер ${this.fileSize(file.size)}. Допустимый размер: от 1 байта до 20 МБ.`);
      input.value = '';
      return;
    }
    this.loading.set(true);
    const url = URL.createObjectURL(file);
    void this.openModel(url).then(() => {
      if (this.alive) {
        this.selectedFile.set(file);
        this.fileName.set(file.name);
        this.notice.set('Локальный просмотр открыт. Чтобы сохранить модель для команды, нажмите значок сохранения.');
      }
    }).catch(cause => {
      if (this.alive) this.error.set(`Не удалось прочитать ${file.name}: ${this.message(cause)}. Проверьте GLB и выберите файл снова.`);
    }).finally(() => {
      URL.revokeObjectURL(url);
      if (this.alive) this.loading.set(false);
    });
    input.value = '';
  }

  async saveModel(): Promise<void> {
    const file = this.selectedFile();
    if (!file || !this.members.manager() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set(`Загрузка ${file.name}…`);
    const path = `${SLUG}/${crypto.randomUUID()}.glb`;
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
      this.notice.set('Файл загружен. Сохранение записи модели…');
      const update = await this.db.client.from('wc_modeling_models').update({
        model_path: path,
        model_filename: file.name,
        model_bytes: file.size,
        updated_at: new Date().toISOString(),
      }).eq('slug', SLUG).select('model_path').single();
      if (update.error) throw update.error;
      if (!this.alive) return;
      this.record = { ...(this.record || {
        base_width_mm: 1200, base_depth_mm: 600, base_body_height_mm: 805, caster_height_mm: 95,
      }), model_path: path, model_filename: file.name };
      this.selectedFile.set(null);
      this.notice.set(`${file.name} сохранён в Hub. Модель доступна участникам команды.`);
      if (previousPath && previousPath !== path) {
        try { await storage.remove([previousPath]); } catch { /* Old unreferenced file can be cleaned up later. */ }
      }
    } catch (cause) {
      if (uploaded) await this.db.client.storage.from(BUCKET).remove([path]);
      if (this.alive) {
        this.error.set(`Не удалось сохранить ${file.name}: ${this.message(cause)}. Локальный файл и прежняя сохранённая модель сохранены; повторите загрузку.`);
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
      const nodes = this.sourceParts.map(part => {
        if (!raw || /^(Top|Buttom|Bottom)[ _]part1$/i.test(part.name)) {
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
        if (!profile) throw new Error('В GLB отсутствует контур детали. Загрузите обновлённую модель.');
        const geometry = createRoundedPart(profile, raw);
        if (/^(Top|Buttom|Bottom)[ _]part2$/i.test(name)) keepTrimJointSquare(geometry, profile, raw);
        geometries.push(geometry);
        const face = materials.find(material => !/plywood[ _]edge$/i.test(material.name)) || materials[0];
        const edge = materials.find(material => /plywood[ _]edge$/i.test(material.name)) || face;
        const mesh = new THREE.Mesh(geometry, [face, edge]);
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
      this.error.set(`Не удалось скруглить детали: ${this.message(cause)}. Выберите меньший радиус или загрузите обновлённую модель.`);
    } finally { this.roundingBusy.set(false); }
  }

  resetDimensions(): void {
    this.width.set(1200);
    this.depth.set(600);
    this.height.set(900);
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

  setTopFinish(finish: TopFinish): void {
    this.topFinish.set(finish);
    this.applyFinishes();
  }

  private applyDimensions(): void {
    if (!this.body) return;
    for (const [node, original] of this.originalPositions) {
      const positions = node.geometry.getAttribute('position');
      for (let i = 0; i < original.count; i++) {
        const [x, y, z] = resizePlywoodPosition(node.userData['plywoodPart'] || node.name,
          original.getX(i), original.getY(i), original.getZ(i), this.width(), this.height());
        positions.setXYZ(i, x, y, z);
      }
      positions.needsUpdate = true;
      node.geometry.computeBoundingBox();
      node.geometry.computeBoundingSphere();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      this.addWoodUvs(node.geometry,
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
    const span = Math.max(this.width(), this.depth(), this.height()) / 1000;
    if (this.controls) {
      const nextTarget = new THREE.Vector3(this.width() / 2000, this.height() / 2000, this.depth() / 2000);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(nextTarget).addScaledVector(offset, span / this.cameraSpan);
      this.controls.target.copy(nextTarget);
      this.controls.update();
    }
    this.cameraSpan = span;
    this.updateMoulding();
  }

  private applyFinishes(): void {
    if (!this.body) return;
    this.rawTexture ||= this.woodTexture('#d5b88d', '#b99466', 0.35);
    this.oakTexture ||= this.woodTexture('#c6935c', '#a96d3d', 0.26);
    this.plywoodTexture ||= this.woodTexture('#d9ba8e', '#b78c60', 0.22);
    const body = new THREE.Color(this.bodyColor());
    this.body.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const partName = node.userData['plywoodPart'] || node.name;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const pine = /pine[ _]trim$/i.test(material.name);
        const finish = isTopPanelName(partName) && !pine ? this.topFinish() : 'body';
        const edge = /plywood[ _]edge$/i.test(material.name);
        const plywood = (pine ? this.modelPineTexture : edge ? this.modelPlywoodEdgeTexture : this.modelPlywoodTexture) || this.modelPlywoodTexture;
        const map = finish === 'oak' ? this.oakTexture : finish === 'plywood' ? plywood || this.plywoodTexture : this.rawBody() ? plywood || this.rawTexture : null;
        const source = map ? new THREE.Color(finish === 'plywood' && plywood ? '#f5e6c9' : '#ffffff') : body;
        if (map && !node.geometry.hasAttribute('uv')) this.addWoodUvs(node.geometry, partName, edge, pine);
        material.color.copy(source);
        if (edge && map && finish !== 'oak') material.color.multiplyScalar(1.15);
        if (pine && map) material.color.multiply(new THREE.Color().setRGB(1.15, 1.5, 2.4));
        material.map = map;
        material.roughness = finish === 'plywood' ? 0.34 : finish === 'oak' ? 0.55 : 0.78;
        material.metalness = 0;
        material.needsUpdate = true;
      }
    });
    this.updateMoulding();
  }

  setMoulding(enabled: boolean): void {
    this.moulding.set(enabled);
    this.updateMoulding();
  }

  private updateMoulding(): void {
    if (!this.model) return;
    if (this.frontMoulding) {
      this.model.remove(this.frontMoulding);
      this.frontMoulding.geometry.dispose();
      (this.frontMoulding.material as THREE.Material).dispose();
      this.frontMoulding = undefined;
    }
    if (!this.moulding()) return;
    const material = new THREE.MeshStandardMaterial({
      map: this.rawBody() ? this.modelPineTexture || this.modelPlywoodTexture || this.rawTexture : null,
      color: this.rawBody() ? '#ffffff' : this.bodyColor(), roughness: 0.78, side: THREE.DoubleSide,
    });
    if (this.rawBody() && this.modelPineTexture) material.color.multiply(new THREE.Color().setRGB(1.15, 1.5, 2.4));
    this.frontMoulding = new THREE.Mesh(createFrontMoulding(this.width(), this.height()), material);
    this.frontMoulding.name = 'Front moulding';
    this.model.add(this.frontMoulding);
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
      if (pine && this.modelPineTexture) {
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
    const span = Math.max(this.width(), this.depth(), this.height()) / 1000;
    this.cameraSpan = span;
    this.camera.position.set(this.width() / 2000 + span * 1.1, this.height() / 2000 + span * 0.5, this.depth() / 2000 + span * 1.25);
    this.camera.lookAt(this.width() / 2000, this.height() / 2000, this.depth() / 2000);
    this.controls?.update();
  }

  private fileSize(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(2)} МБ`; }
  private message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }

  ngOnDestroy(): void {
    this.alive = false;
    this.loadVersion++;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.disposeModel();
    this.rawTexture?.dispose();
    this.oakTexture?.dispose();
    this.plywoodTexture?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
