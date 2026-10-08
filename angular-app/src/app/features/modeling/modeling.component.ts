import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SupabaseService } from '../../core/services/supabase.service';
import { HubMembersService } from '../../core/services/hub-members.service';
import { createGastronormTrays, CHARCUTERIE_CUTOUTS } from './modeling-trays';
import { fitFurnitureBolts, shortenCastorBrakes, turnCastorWheels } from './modeling-hardware';
import { resizePlywoodPosition, resizeRoofCartPosition, resizeSideShelfCartPosition } from './modeling-geometry';
import { createRoundedPart, keepTrimJointSquare, keepPartJointsSquare, matingPartJoints, RoundingProfile } from './modeling-rounding';
import { umbrellaDiameterLimit, withUmbrellaHole, createUmbrellaPreview, createBottomUmbrellaHolder, UMBRELLA_PREVIEW_HEIGHT } from './modeling-umbrella';
import { ModelingFourViews, frontFacingRotation } from './modeling-four-views';
import { cartTopStructure, createCartSideShelves, extractCartSideShelves, extractCartUmbrellaHolderBounds } from './modeling-side-shelves';
import { prepareRooflessCartSource, ROOFLESS_CART_NAME, ROOFLESS_CART_SLUG, ROOF_CART_SLUG } from './modeling-roofless';
import { prepareTwoInOneCartSource, TWO_IN_ONE_CART_NAME, TWO_IN_ONE_CART_SLUG, SIDE_SHELF_CART_SLUG } from './modeling-two-in-one';
import { shelfProfilesForIceShelf } from './modeling-ice-shelf';
import { createFrontMoulding } from './modeling-moulding';
import { pineWoodUv, addTopFinishUvs, groupTopFacesAndEdges, groupShakerRecess } from './modeling-textures';
import { readModelingCatalog, linkedModelProduct, shortModelName, catalogPricing, formatModelingPrice, ModelingCatalog, ConfigurationPricing, PricingSelection } from './modeling-pricing';
import { ModelingSectionComponent } from './modeling-section.component';
import { ModelingLogoComponent } from './modeling-logo.component';
import { ModelingCacheService } from './modeling-cache.service';
import { LogoPlacement,fitLogo,logoHeight } from './modeling-logo';
import type { ConfigurationDocument } from './modeling-configuration-pdf';
import { shelfDrawingSvg, ShelfSupport } from './modeling-shelf-drawing';
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
  derived_from_roof?: boolean;
  derived_from_side_shelf?: boolean;
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

export function isSideShelfTopName(name: string): boolean {
  return /^Side[ _]shelf[ _](?:left|right)[ _][1-4]$/i.test(name);
}

export function isTopPanelName(name: string): boolean {
  return /^Top[ _](?:part)?\d/i.test(name);
}

@Component({
  selector: 'app-modeling',
  standalone: true,
  imports: [ModelingSectionComponent,ModelingLogoComponent],
  templateUrl: './modeling.component.html',
  styleUrl: './modeling.component.css',
})
export class ModelingComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost') canvasHost!: ElementRef<HTMLDivElement>;

  readonly activeSlug = signal(CLASSIC_SLUG);
  readonly models = signal<ModelRecord[]>([]);
  private readonly legacyModelLabel = signal('Classic Bar / Plywood');
  readonly catalog = signal<ModelingCatalog|null>(null);
  readonly catalogBusy = signal(false);
  readonly catalogError = signal('');
  readonly pdfWithPrices = signal(false);
  readonly modelLabel = computed(()=>shortModelName(linkedModelProduct(this.catalog(),this.activeSlug())?.name||this.legacyModelLabel()));
  readonly modelImageUrl = computed(()=>linkedModelProduct(this.catalog(),this.activeSlug())?.imageUrl||'');
  productLabel(slug:string,fallback:string):string { return shortModelName(linkedModelProduct(this.catalog(),slug)?.name||fallback); }
  productImageUrl(slug:string):string { return linkedModelProduct(this.catalog(),slug)?.imageUrl||''; }
  readonly modelMenuOpen = signal(false);
  async chooseModel(slug:string):Promise<void> { this.modelMenuOpen.set(false); await this.selectModel(slug); }
  @HostListener('document:click', ['$event'])
  closeModelMenuOutside(event:MouseEvent):void {
    if(this.modelMenuOpen()&&event.target instanceof Element&&!event.target.closest('.model-choice-card'))this.modelMenuOpen.set(false);
  }
  private pricingSelection():PricingSelection {return {slug:this.activeSlug(),width:this.width(),depth:this.depth(),height:this.height(),raw:this.rawBody(),colour:this.bodyColor(),shelf:this.shelfIncluded(),topFinish:this.topFinish(),sideShelves:this.sideShelvesIncluded(),sideFinish:this.effectiveSideShelfFinish(),umbrella:this.umbrellaHole(),umbrellaDiameter:this.umbrellaDiameter(),iceShelf:this.iceShelfIncluded(),cutouts:this.selectedCutouts().length,trays:this.selectedTrays().length,roofClosed:this.hasRoof()&&this.roofClosed(),glassRacks:this.hasRoof()?this.glassRackCount():0,frontStyle:this.frontStyle(),frontLogo:!!this.frontLogo(),moulding:this.isClassic()&&this.moulding()};}
  readonly pricing = computed<ConfigurationPricing|null>(()=>{
    const catalog=this.catalog();if(!catalog)return null;
    return catalogPricing(catalog,this.pricingSelection());
  });
  priceText = formatModelingPrice;
  optionSurcharge(label:string):string {
    const catalog=this.catalog();
    if(!catalog)return '';
    const selection=this.pricingSelection();
    const enabled=label==='Finish / colour'?{...selection,raw:false,colour:selection.colour==='#d4b894'?'#f6f6f3':selection.colour}:label==='Internal shelf'?{...selection,shelf:true}:label==='Side shelves'?{...selection,sideShelves:true}:label==='Umbrella hole'?{...selection,umbrella:true}:selection;
    const disabled=label==='Finish / colour'?{...selection,raw:true}:label==='Internal shelf'?{...selection,shelf:false}:label==='Side shelves'?{...selection,sideShelves:false}:label==='Umbrella hole'?{...selection,umbrella:false}:selection;
    const enabledPrice=catalogPricing(catalog,enabled),a=enabledPrice.subtotal,b=catalogPricing(catalog,disabled).subtotal;
    if(label!=='Finish / colour'&&enabledPrice.lines.some(line=>line.label.startsWith(label)&&line.amount===null))return '';
    const amount=a==null||b==null?null:Math.round((a-b)*100)/100;
    return amount===undefined||amount===null?'':amount===0?'Included':(amount>0?'+':'')+formatModelingPrice(amount);
  }
  async loadCatalog():Promise<void> {
    if(this.catalogBusy())return;this.catalogBusy.set(true);this.catalogError.set('');
    try {
      const {data,error}=await this.db.client.from('wc_storefront_catalog').select('payload,published_at').eq('id','live').maybeSingle();
      if(error)throw error;
      const catalog=readModelingCatalog(data?.payload,data?.published_at);
      if(this.alive)this.catalog.set(catalog);
    }catch(cause){if(this.alive){this.catalog.set(null);this.catalogError.set('Hub product names and prices could not be loaded. '+this.message(cause)+' Retry the catalogue.');}}
    finally {if(this.alive)this.catalogBusy.set(false);}
  }
  bodyColourLabel():string {
    const names:Record<string,string>={'#f6f6f3':'White','#f3b0c8':'Pink','#aecde5':'Dulux Featherbed','#33383e':'Charcoal','#708471':'Sage','#aa6553':'Terracotta'};
    return names[this.bodyColor()]||this.bodyColor().toUpperCase();
  }
  sectionSummary(section:string):string {
    switch(section){
      case 'parts':return this.assemblyMode()?(this.parts.find(part=>part.key===this.selectedPart())?.label||'Select parts'):'Rotate';
      case 'dimensions':return `${this.width()} × ${this.depth()} × ${this.height()} mm`;
      case 'shelf':return this.shelfIncluded()?'Middle':'None';
      case 'front':return this.isClassic()?(this.moulding()?'With moulding':'None'):this.frontStyle()==='shaker'?'Shaker':this.frontStyle()==='moulding'?'With moulding':'Plain';
      case 'roof':return this.roofClosed()?'Closed'+(this.glassRackCount()?` · ${this.glassRackCount()} racks`:''):'Open';
      case 'finish': {
        if(this.rawBody())return 'RAW '+this.materialLabel();
        const colours:Record<string,string>={'#f6f6f3':'White','#f3b0c8':'Pink','#aecde5':'Dulux Featherbed','#33383e':'Charcoal','#708471':'Sage','#aa6553':'Terracotta'};
        return `2-pack painted · ${colours[this.bodyColor()]||this.bodyColor()} · ${this.paintFinish()==='matte'?'Matte':'Semi-gloss'}`;
      }
      case 'top':return this.topFinish()==='body'?'In cart finish / colour':this.topFinish()==='oak'?'Tasmanian oak':this.topFinish()==='mdf'?'RAW MDF':this.isClassic()?'Varnished plywood':'Plywood';
      case 'scene':return {studio:'Studio',event:'Event',office:'Office'}[this.previewScene()];
      case 'file':return this.saving()?'Saving…':this.error()?'Unavailable':this.selectedFile()?.name||this.fileName()||'None';
      case 'pricing':return this.catalogBusy()?'Loading…':this.catalogError()?'Unavailable':this.pricing()?.subtotal==null?'Quote required':this.priceText(this.pricing()!.subtotal)+' · Catalog subtotal';
      case 'settings':return this.rounding()?'Edge rounding · '+this.rounding()+' mm':'None';
      case 'building':return this.shelfIncluded()?'Middle · '+(this.shelfSupport()==='plastic'?'Plastic support':'Support rail'):'None';
      default:return 'None';
    }
  }
  private selectionVersion = 0;
  isClassic(): boolean { return this.activeSlug() === CLASSIC_SLUG; }
  isSideShelfCart(): boolean { return this.activeSlug() === SIDE_SHELF_CART_SLUG; }
  isTwoInOneCart(): boolean { return this.activeSlug() === TWO_IN_ONE_CART_SLUG; }
  isCharcuterieCart(): boolean { return this.isSideShelfCart() || this.isTwoInOneCart(); }
  isRooflessCart(): boolean { return this.activeSlug() === ROOFLESS_CART_SLUG; }
  isRoofFamily(): boolean { return this.hasRoof() || this.isRooflessCart(); }
  hasRoof(): boolean { return this.activeSlug() === ROOF_CART_SLUG; }
  castorHeight(): number { return this.record?.caster_height_mm || (this.isClassic() ? 95 : 73); }
  materialLabel(): string { return this.record?.material_name || 'Plywood'; }
  overallHeight(): number { return this.height() + (this.hasRoof() ? 1030 : 0); }

  @ViewChild('configurationDialog') configurationDialog?: ElementRef<HTMLDialogElement>;
  readonly configurationBusy = signal(false);
  readonly configurationError = signal('');
  readonly savedConfiguration = signal<{url:string;filename:string;document:ConfigurationDocument}|null>(null);
  async saveConfiguration(): Promise<void> {
    if (this.configurationBusy()) return;
    this.configurationBusy.set(true);this.configurationError.set('');
    try {
      if (!this.model || !this.renderer || this.loading()) throw new Error('Wait for the model to load, then retry.');
      const includePrices=this.pdfWithPrices();
      if(includePrices&&!this.pricing())throw new Error('Load the Hub catalogue before exporting with prices. Retry the catalogue or choose Without prices.');
      const {createConfigurationPdf}=await import('./modeling-configuration-pdf');
      const response=await fetch(new URL('branding/white-corner-logo.png',document.baseURI));
      if(!response.ok)throw new Error('The White Corner logo could not be loaded. Retry the export.');
      const logo=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The White Corner logo could not be read. Retry the export.'));response.blob().then(blob=>reader.readAsDataURL(blob)).catch(reject);});
      if (!this.model || !this.renderer || this.loading()) throw new Error('Wait for the model to load, then retry.');
      const prices=includePrices?this.pricing():null;
      if(includePrices&&!prices)throw new Error('Load the Hub catalogue before exporting with prices. Retry the catalogue or choose Without prices.');
      const views=this.configurationViews();
      const colourNames:Record<string,string>={'#f6f6f3':'White','#aecde5':'Dulux Featherbed','#33383e':'Charcoal','#708471':'Sage','#aa6553':'Terracotta'};
      const body=this.rawBody()?'RAW '+this.materialLabel():`2-pack painted - ${colourNames[this.bodyColor()]||this.bodyColor()} - ${this.paintFinish()==='matte'?'Matte':'Semi-gloss'}`;
      const top=this.topFinish()==='body'?'In cart finish / colour':this.topFinish()==='oak'?'Tasmanian oak':this.topFinish()==='mdf'?'RAW MDF':this.isClassic()?'Varnished plywood':'Plywood';
      const fields=[{label:'Dimensions',value:`${this.width()} x ${this.depth()} x ${this.height()} mm`},{label:'Cart body',value:body},{label:'Table top',value:top},
        {label:'Front panel',value:this.isClassic()?(this.moulding()?'With moulding':'Plain'):this.frontStyle()==='shaker'?'Shaker':this.frontStyle()==='moulding'?'With moulding':'Plain'},
        {label:'Castors',value:'Ø'+(this.isRoofFamily()?'50':'75')+' mm'},
        {label:'Shelf',value:this.shelfIncluded()?'Middle':'None'}];
      if(this.frontLogo()){const logo=fitLogo(this.logoPanel(),this.frontLogo()!);fields.push({label:'Front logo',value:`${logo.width.toFixed(1)} x ${logoHeight(logo).toFixed(1)} mm · left ${logo.x.toFixed(1)} · top ${logo.y.toFixed(1)} mm`});}
      if(this.isClassic()||this.isCharcuterieCart()||this.isRooflessCart())fields.push({label:'Umbrella hole',value:this.umbrellaHole()?'Ø'+this.umbrellaDiameter()+' mm · '+(this.isClassic()||this.isRooflessCart()||this.isTwoInOneCart()?this.umbrellaPosition()+' · ':'')+(this.isCharcuterieCart()?'top, shelves & bottom holder':'top, shelf & bottom holder'):'None'});
      if(this.isCharcuterieCart())fields.push({label:'Ice shelf',value:this.iceShelfIncluded()?'Included':'None'},{label:'Side shelves',value:this.sideShelvesIncluded()?'2 × 200 × 600 mm':'None'},{label:'Overall width',value:(this.width()+(this.sideShelvesIncluded()?400:0))+' mm'},{label:'Castor assembly height',value:'95 mm'});
      if(this.isSideShelfCart())fields.push({label:'Cutouts',value:this.cutoutSummary()+(this.cutoutsIncluded()&&this.reverseCutoutLayout()?' · mirrored left/right':'')},{label:'Trays',value:this.traysIncluded()?this.traySummary()+' · 65 mm deep':'None'});
      if(!this.isCharcuterieCart())fields.push({label:'Side shelves',value:this.sideShelvesIncluded()?'2 × 200 × 600 mm':'None'},{label:'Overall width',value:(this.width()+(this.sideShelvesIncluded()?400:0))+' mm'});
      if(this.sideShelvesIncluded())fields.push({label:'Side shelves finish',value:this.sideShelfFinishSummary()});
      if(this.shelfIncluded())fields.push({label:'Shelf support',value:this.shelfSupport()==='plastic'?'Plastic support - diameter 5 mm':`Support rail - 20 x ${this.isClassic()?15:16} mm`});
      if(this.hasRoof())fields.push({label:'Roof',value:(this.roofClosed()?'Closed - 12 mm MDF bottom':'Open')+' - '+this.overallHeight()+' mm overall height'},
        {label:'Glass racks',value:this.roofClosed()&&this.glassRackCount()?`${this.glassRackCount()} x Wine Glass Rack Chrome 405mm`:'None'});
      const snapshot:ConfigurationDocument={product:linkedModelProduct(this.catalog(),this.activeSlug())?.name||this.record?.product_name||this.modelLabel(),material:this.materialLabel(),code:this.activeSlug(),produced:new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'Australia/Brisbane'}).format(new Date()),logo,...views,fields,...(prices?{pricing:prices}:{})};
      const blob=createConfigurationPdf(snapshot).output('blob');
      const previous=this.savedConfiguration();if(previous)URL.revokeObjectURL(previous.url);
      this.savedConfiguration.set({url:URL.createObjectURL(blob),filename:this.activeSlug()+'-configuration.pdf',document:snapshot});
      this.configurationDialog?.nativeElement.showModal();
    }catch(cause){this.configurationError.set('Could not save configuration: '+this.message(cause));}
    finally{this.configurationBusy.set(false);}
  }
  private configurationViews():{front:string;rear:string} {
    const renderer=this.renderer!,turntable=this.turntable!,rotation=turntable.rotation.y,size=renderer.getSize(new THREE.Vector2());
    const original=this.scene.background,parts:{node:THREE.Object3D;position:THREE.Vector3;visible:boolean}[]=[];
    this.assembly?.setEnabled(false);
    this.model!.traverse(node=>{if(Array.isArray(node.userData['assemblyBasePosition'])){parts.push({node,position:node.position.clone(),visible:node.visible});node.position.fromArray(node.userData['assemblyBasePosition']);node.visible=!node.userData['assemblyHidden'];}});
    try {
      const span=Math.max(this.previewWidth(),this.depth(),this.previewHeight())/1000;
      const target=new THREE.Vector3(this.width()/2000,this.previewHeight()/2000,this.depth()/2000);
      const camera=new THREE.PerspectiveCamera(42,4/3,.01,30);
      camera.zoom=1.25;camera.updateProjectionMatrix();
      camera.position.copy(target).add(new THREE.Vector3(span*1.05,span*.4,span*1.65));camera.lookAt(target);
      this.scene.background=new THREE.Color('#eceae8');renderer.setSize(960,720,false);
      const capture=(angle:number)=>{turntable.rotation.y=angle;this.scene.updateMatrixWorld(true);renderer.render(this.scene,camera);return renderer.domElement.toDataURL('image/png');};
      const front=frontFacingRotation(this.isClassic());return {front:capture(front),rear:capture(front+Math.PI)};
    }finally{
      for(const part of parts){part.node.position.copy(part.position);part.node.visible=part.visible;}
      turntable.rotation.y=rotation;this.scene.background=original;renderer.setSize(size.x,size.y,false);
      this.assembly?.setEnabled(this.assemblyMode());this.scene.updateMatrixWorld(true);renderer.render(this.scene,this.camera);
    }
  }
  closeConfiguration():void{this.configurationDialog?.nativeElement.close();}
  setPaintedBody():void{this.setBodyColor(this.bodyColor()==='#d4b894'?'#f6f6f3':this.bodyColor());}

  @ViewChild('shelfDrawingDialog') shelfDrawingDialog?: ElementRef<HTMLDialogElement>;
  readonly traySlots = CHARCUTERIE_CUTOUTS;
  readonly selectedTrays = signal<number[]>([]);
  readonly selectedCutouts = signal<number[]>([]);
  readonly fourViews = signal(false);
  private readonly multiView=new ModelingFourViews();
  private stageWidth=0;
  setFourViews(value:boolean):void {this.fourViews.set(value);this.setAssemblyMode(false);this.resize();}
  readonly navigationMode = signal<'rotate'|'move'>('rotate');
  setNavigationMode(mode:'rotate'|'move'):void {
    this.navigationMode.set(mode);
    if(this.controls)this.controls.mouseButtons.LEFT=mode==='move'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
    this.setAssemblyMode(false);
  }
  resetView():void {
    this.setNavigationMode('rotate');
    if(this.controls){
      const damping=this.controls.enableDamping;
      this.controls.enableDamping=false;this.controls.reset();
      this.controls.target.set(this.width()/2000,this.previewHeight()/2000,this.depth()/2000);
      this.camera.zoom=this.orbitCamera.zoom=1;
      this.camera.updateProjectionMatrix();this.orbitCamera.updateProjectionMatrix();
      this.focusCamera();this.controls.enableDamping=damping;
    }else this.focusCamera();
    if(this.turntable)this.turntable.rotation.y=frontFacingRotation(this.isClassic());
  }
  readonly showUmbrella = signal(false);
  private umbrellaPreview?:THREE.Group;
  private umbrellaPreviewKey='';
  optionsSummary():string {
    const selected:string[]=[];
    if(this.shelfIncluded())selected.push('Shelf: Middle');
    if(this.sideShelvesIncluded())selected.push('Side shelves');
    if(this.isCharcuterieCart()){
      if(this.iceShelfIncluded())selected.push('Ice shelf');
      if(this.umbrellaHole())selected.push('Hole: '+(this.isTwoInOneCart()?this.umbrellaPosition()+' ':'')+'Ø'+this.umbrellaDiameter()+' mm');
    }
    if(!this.isCharcuterieCart() && this.moulding())selected.push('Moulding');
    if((this.isClassic()||this.isRooflessCart())&&this.umbrellaHole())selected.push('Hole: '+this.umbrellaPosition()+' Ø'+this.umbrellaDiameter()+' mm');
    return selected.join(' · ') || 'None';
  }
  previewWidth():number {return this.width()+(this.sideShelvesIncluded()?400:0);}
  previewHeight():number {return this.showUmbrella()&&this.umbrellaHole()?UMBRELLA_PREVIEW_HEIGHT*1000:this.overallHeight();}
  setShowUmbrella(value:boolean):void {this.showUmbrella.set(value);this.applyDimensions();}
  readonly umbrellaHole = signal(false);
  readonly umbrellaDiameter = signal(40);
  umbrellaDiameterMax():number {return this.isClassic()||this.isRooflessCart()||this.isTwoInOneCart()?80:umbrellaDiameterLimit(this.width(),this.depth());}
  setUmbrellaHole(value:boolean):void {this.umbrellaHole.set(value);if(!value)this.showUmbrella.set(false);if(value&&(this.isClassic()||this.isRooflessCart()))void this.loadSideShelfReference();void this.setRounding(this.rounding());}
  setUmbrellaDiameter(value:number):void {if(!Number.isFinite(value))return;this.umbrellaDiameter.set(Math.max(32,Math.min(this.umbrellaDiameterMax(),Math.round(value))));void this.setRounding(this.rounding());}
  readonly umbrellaPosition = signal<'left'|'centre'|'right'>('centre');
  umbrellaX():number {return this.isClassic()||this.isRooflessCart()||this.isTwoInOneCart()?this.umbrellaPosition()==='left'?200:this.umbrellaPosition()==='right'?this.width()-200:this.width()/2:this.width()/2;}
  setUmbrellaPosition(value:'left'|'centre'|'right'):void {this.umbrellaPosition.set(value);void this.setRounding(this.rounding());}
  readonly reverseCutoutLayout = signal(true);
  trayLayoutIndices():number[] {const indices=this.traySlots.map((_,i)=>i);return this.reverseCutoutLayout()?[10,11,12,7,8,9,4,5,6,1,2,3,0]:indices;}
  setReverseCutoutLayout(value:boolean):void {this.reverseCutoutLayout.set(value);this.applyDimensions();this.applyFinishes();}
  readonly traysIncluded = signal(false);
  private trays?:THREE.Group;
  private trayEnvironment?:THREE.WebGLRenderTarget;
  setTraysIncluded(value:boolean):void { const selected=value?[...this.selectedCutouts()]:[];this.selectedTrays.set(selected);this.traysIncluded.set(selected.length>0);this.bindAssembly(); }
  setTrayIncluded(index:number,value:boolean):void {
    if(!Number.isInteger(index)||index<0||index>=this.traySlots.length||!this.selectedCutouts().includes(index))return;
    const next=this.selectedTrays().filter(i=>i!==index);if(value)next.push(index);next.sort((a,b)=>a-b);
    this.selectedTrays.set(next);this.traysIncluded.set(next.length>0);if(next.length)this.cutoutsIncluded.set(true);this.bindAssembly();
  }
  traySummary():string {const selected=this.selectedTrays();if(!selected.length)return 'None';return (selected.includes(0)?'1 × GN 1/1':'')+(selected.includes(0)&&selected.length>1?' · ':'')+(selected.filter(i=>i>0).length?selected.filter(i=>i>0).length+' × GN 1/6':'');}
  readonly cutoutsIncluded = signal(false);
  setCutoutsIncluded(value:boolean):void {this.selectedCutouts.set(value?this.traySlots.map((_,i)=>i):[]);this.cutoutsIncluded.set(value);if(!value){this.traysIncluded.set(false);this.selectedTrays.set([]);}this.bindAssembly();}
  setCutoutIncluded(index:number,value:boolean):void {
    if(!Number.isInteger(index)||index<0||index>=this.traySlots.length)return;
    const next=this.selectedCutouts().filter(i=>i!==index);if(value)next.push(index);next.sort((a,b)=>a-b);this.selectedCutouts.set(next);this.cutoutsIncluded.set(next.length>0);
    this.selectedTrays.update(trays=>trays.filter(i=>next.includes(i)));this.traysIncluded.set(this.selectedTrays().length>0);this.bindAssembly();
  }
  cutoutSummary():string {const selected=this.selectedCutouts();return selected.length?(selected.includes(0)?'1 × GN 1/1':'')+(selected.includes(0)&&selected.length>1?' · ':'')+(selected.filter(i=>i>0).length?selected.filter(i=>i>0).length+' × GN 1/6':''):'None';}
  cutoutTraySummary():string {return this.selectedCutouts().length?this.selectedCutouts().length+' cutouts · '+this.selectedTrays().length+' trays':'None';}
  readonly iceShelfIncluded = signal(true);
  readonly sideShelvesIncluded = signal(false);
  setIceShelfIncluded(value:boolean):void {
    this.iceShelfIncluded.set(value);
    if(this.body&&this.roundingSupported()&&!this.roundingBusy())void this.setRounding(this.rounding());
    else this.bindAssembly();
  }
  setSideShelvesIncluded(value:boolean):void {
    this.sideShelvesIncluded.set(value);
    if(this.isCharcuterieCart()){if(this.body&&this.roundingSupported()&&!this.roundingBusy())void this.setRounding(this.rounding());else this.bindAssembly();}
    else {if(value)void this.loadSideShelfReference();this.applyDimensions();this.bindAssembly();}
  }
  private sideShelfExtensions?:THREE.Group;
  private sideShelfExtensionKey='';
  private sideShelfReference?:THREE.Group;
  private umbrellaHolderBounds?:THREE.Box3;
  private umbrellaHolder?:THREE.Mesh;
  private umbrellaHolderKey='';
  private sideShelfReferencePromise?:Promise<void>;
  readonly sideShelfReferenceLoading=signal(false);
  private loadSideShelfReference():Promise<void> {
    if(this.sideShelfReference&&this.umbrellaHolderBounds)return Promise.resolve();
    if(this.sideShelfReferencePromise)return this.sideShelfReferencePromise;
    const record=this.models().find(model=>model.slug===SIDE_SHELF_CART_SLUG);
    if(!record?.model_path){this.error.set('The 150 cm source cart is unavailable. Add its GLB in Hub and retry.');return Promise.resolve();}
    this.sideShelfReferenceLoading.set(true);
    this.sideShelfReferencePromise=(async()=>{
      const signed=await this.db.client.storage.from(BUCKET).createSignedUrl(record.model_path!,600);
      if(signed.error||!signed.data?.signedUrl)throw signed.error||new Error('Could not retrieve the 150 cm source cart.');
      const bytes=await this.modelCache.readFile(record.model_path!,signed.data.signedUrl);
      const gltf=await this.loader.parseAsync(bytes,new URL('.',signed.data.signedUrl).href);
      const shelves=extractCartSideShelves(gltf.scene);
      const holder=extractCartUmbrellaHolderBounds(gltf.scene);
      this.sideShelfReference=shelves;this.umbrellaHolderBounds=holder;
      if(this.alive&&this.body&&!this.isCharcuterieCart()&&(this.sideShelvesIncluded()||this.umbrellaHole())){this.applyDimensions();this.bindAssembly();}
    })().catch(cause=>this.error.set(`Could not load the original side shelves and umbrella holder: ${this.message(cause)}. Retry the option after checking the 150 cm model.`))
      .finally(()=>{this.sideShelfReferenceLoading.set(false);this.sideShelfReferencePromise=undefined;});
    return this.sideShelfReferencePromise;
  }
  private updateSideShelfExtensions():boolean {
    const enabled=!this.isCharcuterieCart()&&this.sideShelvesIncluded(),key=JSON.stringify([this.activeSlug(),enabled,this.width(),this.height(),this.rounding()]);
    if(key===this.sideShelfExtensionKey&&(!enabled||this.sideShelfExtensions?.parent===this.body))return false;
    this.sideShelfExtensions?.removeFromParent();this.sideShelfExtensions?.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});
    this.sideShelfExtensions=undefined;this.sideShelfExtensionKey=key;
    if(!enabled||!this.body||!this.sideShelfReference)return false;
    const top=cartTopStructure(this.body,this.isClassic(),this.height());
    this.sideShelfExtensions=createCartSideShelves(this.sideShelfReference,this.width(),this.height(),1500,850,top,this.rounding());this.body.add(this.sideShelfExtensions);
    if(this.isClassic())this.sideShelfExtensions.traverse(node=>{if(node instanceof THREE.Mesh&&!node.userData['fixedMaterial'])this.addWoodUvs(node.geometry,node.name,/ 1$/.test(node.name),/ 2$/.test(node.name));});
    return true;
  }
  private updateUmbrellaHolder():boolean {
    const enabled=(this.isClassic()||this.isRooflessCart())&&this.umbrellaHole();
    const key=JSON.stringify([this.activeSlug(),enabled,this.umbrellaX(),this.umbrellaDiameter(),this.width()]);
    if(key===this.umbrellaHolderKey&&(!enabled||this.umbrellaHolder?.parent===this.body))return false;
    if(this.umbrellaHolder){this.umbrellaHolder.removeFromParent();this.umbrellaHolder.geometry.dispose();for(const material of this.umbrellaHolder.material as THREE.Material[])material.dispose();this.umbrellaHolder=undefined;}
    this.umbrellaHolderKey=key;
    if(!enabled||!this.body||!this.umbrellaHolderBounds)return false;
    const bottom=this.body.children.find(part=>/^(?:Buttom|Bottom)[ _](?:part)?1$/i.test(part.name));
    if(!bottom)return false;
    const bounds=new THREE.Box3().setFromObject(bottom);
    this.umbrellaHolder=createBottomUmbrellaHolder(this.umbrellaHolderBounds,this.umbrellaX(),this.umbrellaDiameter(),bounds.max.y);
    this.body.add(this.umbrellaHolder);
    return true;
  }
  readonly shelfIncluded = signal(true);
  setShelfIncluded(included:boolean):void {
    this.shelfIncluded.set(included);
    if(included)this.assembly?.setVisible('shelf',true);
    this.bindAssembly();
  }
  readonly shelfSupport = signal<ShelfSupport>('rail');
  readonly buildingError = signal('');
  readonly drawingZoomed = signal(false);
  readonly shelfDrawing = signal<{url:string;filename:string} | null>(null);
  generateShelfDrawing(): void {
    this.buildingError.set('');
    try {
      if(!this.shelfIncluded())throw new Error('Turn the shelf on to generate its positioning drawing.');
      if (!this.body || this.loading()) throw new Error('Wait for the complete model to load, then retry.');
      const boundsFor = (pattern: RegExp): THREE.Box3[] => this.body!.children.filter(part => pattern.test(part.userData['plywoodPart'] || part.name)).map(part => {
        const bounds = new THREE.Box3();
        part.traverse(node => { if (node instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromBufferAttribute(node.geometry.getAttribute('position'))); });
        return bounds;
      }).filter(b => !b.isEmpty());
      const sides = boundsFor(/^Left[ _]side/i).sort((a,b) => b.getSize(new THREE.Vector3()).y*b.getSize(new THREE.Vector3()).z - a.getSize(new THREE.Vector3()).y*a.getSize(new THREE.Vector3()).z);
      const shelf = boundsFor(/^Shelf/i)[0];
      if (!sides.length || !shelf) throw new Error('Side panel or shelf geometry is missing. Load the complete model and retry.');
      const size = sides[0].getSize(new THREE.Vector3());
      const dimension = (n:number) => Math.round(n*10000)/10;
      const svg = shelfDrawingSvg({width:dimension(size.z),height:dimension(size.y),panelThickness:dimension(size.x),shelfThickness:this.isClassic()?15:16,support:this.shelfSupport(),material:this.isClassic()?'Plywood':'MDF',product:`${this.modelLabel()} - ${this.width()} x ${this.depth()} x ${this.height()} mm`});
      const previous = this.shelfDrawing(); if (previous) URL.revokeObjectURL(previous.url);
      this.shelfDrawing.set({url:URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),filename:`${this.activeSlug()}-side-middle-${this.shelfSupport()}.svg`});
      this.drawingZoomed.set(false);
      this.shelfDrawingDialog?.nativeElement.showModal();
    } catch(cause) { this.buildingError.set(this.message(cause)); }
  }
  closeShelfDrawing(): void { this.shelfDrawingDialog?.nativeElement.close(); }

  readonly width = signal(1200);
  readonly depth = signal(600);
  readonly height = signal(900);
  readonly rounding = signal(1.5);
  readonly roundingEditing = signal(false);
  readonly moulding = signal(true);
  readonly frontStyle = signal<'shaker' | 'plain' | 'moulding'>('plain');
  private frontMoulding?: THREE.Mesh;
  readonly frontLogo=signal<LogoPlacement|null>(null);
  readonly logoError=signal('');
  readonly logoBusy=signal(false);
  readonly logoPanel=computed(()=>this.isCharcuterieCart()?{width:this.width()-40,height:this.height()-127,inset:73}:({width:this.width()-(this.isClassic()?38:32),height:this.height()-(this.isClassic()?125:255),inset:this.moulding()?121:!this.isClassic()&&this.frontStyle()==='shaker'?Math.max(73,70*(this.height()-255)/645+3):0}));
  private logoMesh?:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>;
  private logoTexture?:THREE.Texture;
  private logoVersion=0;
  async placeFrontLogo(logo:LogoPlacement|null):Promise<void>{
    const version=++this.logoVersion;this.logoError.set('');
    if(!logo){this.frontLogo.set(null);this.logoBusy.set(false);this.logoMesh?.removeFromParent();this.logoMesh?.geometry.dispose();this.logoMesh?.material.dispose();this.logoMesh=undefined;this.logoTexture?.dispose();this.logoTexture=undefined;this.bindAssembly();return;}
    this.logoBusy.set(true);
    try {
      const texture=await new THREE.TextureLoader().loadAsync(logo.png);
      if(version!==this.logoVersion||!this.alive){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(this.renderer?.capabilities.getMaxAnisotropy()||1,8);
      this.logoTexture?.dispose();this.logoTexture=texture;this.frontLogo.set(logo);this.bindAssembly();
    }catch(cause){if(version===this.logoVersion)this.logoError.set('Could not display the logo: '+this.message(cause)+'. Retry placing the PNG.');}
    finally{if(version===this.logoVersion)this.logoBusy.set(false);}
  }
  private updateFrontLogo():void{
    this.logoMesh?.removeFromParent();this.logoMesh?.geometry.dispose();this.logoMesh?.material.dispose();this.logoMesh=undefined;
    const saved=this.frontLogo();if(!saved||!this.logoTexture||!this.model)return;
    const panel=this.logoPanel(),logo=fitLogo(panel,saved),h=logoHeight(logo);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(logo.width/1000,h/1000),new THREE.MeshStandardMaterial({map:this.logoTexture,transparent:true,alphaTest:.01,depthWrite:false,roughness:.8,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    mesh.name='Front logo';
    mesh.position.set(this.isClassic()?(this.width()-19-logo.x-logo.width/2)/1000:((this.isCharcuterieCart()?20:16)+logo.x+logo.width/2)/1000,(this.height()-(this.isClassic()?15:16)-logo.y-h/2)/1000,this.isClassic()?.0185:this.isCharcuterieCart()?.5685:this.frontStyle()==='shaker'?.5725004:.5845004);
    if(this.isClassic())mesh.rotation.y=Math.PI;
    mesh.receiveShadow=true;this.logoMesh=mesh;this.model.add(mesh);
  }

  readonly roofClosed = signal(false);
  private roofBottom?: THREE.Mesh;
  // Temporarily hide photographic scenes while their scale is calibrated.
  readonly photographicScenesEnabled = false;
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
  readonly sideShelfFinish = signal<TopFinish|'top'>('top');
  readonly effectiveSideShelfFinish = computed(()=>this.sideShelfFinish()==='top'?this.topFinish():this.sideShelfFinish() as TopFinish);
  finishLabel(finish:TopFinish):string {return finish==='body'?'In cart finish / colour':finish==='oak'?'Tasmanian oak':finish==='mdf'?'RAW MDF':'Plywood';}
  sideShelfFinishSummary():string {return (this.sideShelfFinish()==='top'?'Same as table top · ':'')+this.finishLabel(this.effectiveSideShelfFinish());}
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly fileName = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly assemblyMode = signal(false);
  readonly assemblyRevision = signal(0);
  get parts() { return ASSEMBLY_PARTS.filter(part => this.isCharcuterieCart() ? !['roof','posts','legs','decorative-wheels'].includes(part.key) : this.isRooflessCart()
    ? !['roof','posts','ice-shelf'].includes(part.key) : this.isClassic()
    ? !['roof', 'posts', 'legs', 'decorative-wheels','ice-shelf'].includes(part.key)
    : !['ice-shelf'].includes(part.key)); }
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

  constructor(readonly members: HubMembersService, private readonly db: SupabaseService, private readonly modelCache: ModelingCacheService) {}

  ngAfterViewInit(): void {
    void this.loadCatalog();
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
      light.shadow.radius = 4;
      light.shadow.bias = -0.00001;
      light.shadow.normalBias = 0.00035;
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
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      this.controls.screenSpacePanning = true;
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
    if (window.matchMedia('(min-width: 981px)').matches) {
      const settings = this.canvasHost.nativeElement.parentElement?.parentElement?.querySelector('.settings');
      const panelWidth = settings?.getBoundingClientRect().width || 0;
      this.stageWidth=width-panelWidth-28;
      // Keep the product centred in the exposed stage while rendering behind the panel.
      this.camera.setViewOffset(width, height, (panelWidth + 28) / 2, 0, width, height);
    } else {
      this.camera.clearViewOffset();
      this.stageWidth=width;
    }
    this.canvasHost.nativeElement.style.setProperty('--stage-width',this.stageWidth+'px');
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
      const centre = new THREE.Vector3(this.width()/2000,this.previewHeight()/2000,this.depth()/2000);
      const target = this.controls.target.clone().sub(centre).applyAxisAngle(new THREE.Vector3(0,1,0),this.viewAzimuth-spherical.theta).add(centre);
      this.camera.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(spherical.radius, spherical.phi, this.viewAzimuth));
      this.camera.lookAt(target);
      if (this.turntable) this.turntable.rotation.y = frontFacingRotation(this.isClassic()) + this.viewAzimuth - spherical.theta;
    }
    this.assembly?.update();
    if (!this.loading()) {
      if(this.fourViews()){
        const size=this.renderer.getSize(new THREE.Vector2());
        this.multiView.render(this.renderer,this.scene,this.camera,this.turntable,size.x,size.y,this.stageWidth,
          new THREE.Vector3(this.width()/2000,this.previewHeight()/2000,this.depth()/2000),Math.max(this.previewWidth(),this.depth(),this.previewHeight())/1000,this.isClassic());
      }else this.renderer.render(this.scene, this.camera);
    }
  };

  private async loadSavedModel(): Promise<void> {
    const requestVersion = ++this.selectionVersion;
    try {
      const { data, error } = await this.db.client.from('wc_modeling_models')
        .select('slug,product_name,material_name,model_path,model_filename,base_width_mm,base_depth_mm,base_body_height_mm,caster_height_mm')
        .order('product_name');
      if (error) throw error;
      if (!this.alive || requestVersion !== this.selectionVersion) return;
      const records = data as ModelRecord[];
      const roof = records.find(model => model.slug === ROOF_CART_SLUG);
      if (roof && !records.some(model => model.slug === ROOFLESS_CART_SLUG)) records.splice(records.indexOf(roof),0,{
        ...roof, slug: ROOFLESS_CART_SLUG, product_name: ROOFLESS_CART_NAME,
        derived_from_roof: true,
      });
      const sideShelfCart = records.find(model => model.slug === SIDE_SHELF_CART_SLUG);
      if (sideShelfCart && !records.some(model => model.slug === TWO_IN_ONE_CART_SLUG)) records.splice(records.indexOf(sideShelfCart),0,{
        ...sideShelfCart, slug: TWO_IN_ONE_CART_SLUG, product_name: TWO_IN_ONE_CART_NAME,
        base_width_mm: 1200, derived_from_side_shelf: true,
      });
      this.models.set(records);
      const record = this.models().find(model => model.slug === this.activeSlug());
      if (!record) throw new Error('The selected model is not available to your account');
      await this.loadRecord(record, requestVersion);
    } catch (cause) {
      if (this.alive && requestVersion === this.selectionVersion) this.error.set(`Could not open the saved 3D model: ${this.message(cause)}. Reload the page.`);
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
    this.shelfIncluded.set(!this.isTwoInOneCart());
    this.iceShelfIncluded.set(this.isSideShelfCart());this.sideShelvesIncluded.set(this.isCharcuterieCart());this.cutoutsIncluded.set(false);this.traysIncluded.set(false);this.selectedTrays.set([]);this.selectedCutouts.set([]);this.reverseCutoutLayout.set(true);this.umbrellaHole.set(false);this.umbrellaPosition.set('centre');this.umbrellaDiameter.set(40);this.showUmbrella.set(false);
    this.roofClosed.set(false);
    this.glassRackCount.set(0);
    this.showGlasses.set(false);
    this.glassDiameter.set(80);
    this.topFinish.set(this.isClassic() ? 'plywood' : 'body');
    this.sideShelfFinish.set('top');
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
      this.legacyModelLabel.set(`${data.product_name} / ${data.material_name}`);
      this.resetDimensions();
      if (!data.model_path) {
        this.notice.set('This model is not configured in Hub yet.');
        return;
      }
      const signed = await this.db.client.storage.from(BUCKET).createSignedUrl(data.model_path, 600);
      if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('Could not retrieve the model link.');
      if (!this.alive || version !== this.selectionVersion) return;
      const bytes = await this.modelCache.readFile(data.model_path, signed.data.signedUrl);
      if (!this.alive || version !== this.selectionVersion) return;
      try { await this.openModel(signed.data.signedUrl, bytes); }
      catch (cause) { this.modelCache.invalidateFile(data.model_path); throw cause; }
      if (this.alive && version === this.selectionVersion) this.fileName.set(data.model_filename || this.modelLabel());
  }

  private async openModel(url: string, bytes?: ArrayBuffer): Promise<void> {
    const version = ++this.loadVersion;
    const gltf = bytes ? await this.loader.parseAsync(bytes, new URL('.', url).href) : await this.loader.loadAsync(url);
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
    if (this.isRoofFamily()) { fitFurnitureBolts(gltf.scene); shortenCastorBrakes(gltf.scene); turnCastorWheels(gltf.scene); }
    if (this.record?.derived_from_roof) prepareRooflessCartSource(gltf.scene);
    if (this.record?.derived_from_side_shelf) prepareTwoInOneCartSource(gltf.scene);
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
    // Render only the finished geometry: the temporary source scene otherwise
    // uploads textures and compiles materials that are immediately replaced.
    this.turntable.visible = false;
    this.scene.add(this.turntable);
    if (this.roundingSupported()) await this.setRounding(1.5);
    if (!this.rounding()) { this.applyDimensions(); this.applyFinishes(); }
    if (!this.alive || version !== this.loadVersion || !this.turntable) return;
    this.focusCamera();
    this.turntable.visible = true;
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
    this.logoMesh = undefined;
    this.roofBottom = undefined;
    this.glassRacks = undefined;
    this.trays = undefined;
    this.sideShelfExtensions=undefined;this.sideShelfExtensionKey='';
    this.umbrellaHolder=undefined;this.umbrellaHolderKey='';
    this.umbrellaPreview=undefined;this.umbrellaPreviewKey='';
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
    if (this.record?.derived_from_roof || this.record?.derived_from_side_shelf) { this.error.set('This cart uses another saved model as its private source. Upload a new model through its own Hub record.'); return; }
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
    if (this.record?.derived_from_roof || this.record?.derived_from_side_shelf) { this.error.set('This derived cart cannot overwrite its saved source model.'); return; }
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
    if((this.isSideShelfCart() && axis==='width') || this.isTwoInOneCart())return;
    const limits = axis === 'width' ? [1200, 1500] : [850, 1000];
    const step = axis === 'width' ? 100 : 50;
    const next = Math.round(Math.max(limits[0], Math.min(limits[1], value)) / step) * step;
    this[axis].set(next);
    if((this.isCharcuterieCart()||this.isClassic()||this.isRooflessCart())&&this.umbrellaHole()){const max=this.umbrellaDiameterMax();if(max<32)this.umbrellaHole.set(false);else this.umbrellaDiameter.update(value=>Math.min(value,max));void this.setRounding(this.rounding());return;}
    this.applyDimensions();
  }

  async setRounding(raw: number): Promise<void> {
    if (!this.body || !this.roundingSupported() || this.roundingBusy() || ![0, 1, 1.5, 2, 2.5, 3].includes(raw)) return;
    this.roundingBusy.set(true);
    this.error.set('');
    const body = this.body, version = this.loadVersion;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (!this.alive || this.body !== body || version !== this.loadVersion) { this.roundingBusy.set(false); return; }
    const geometries: THREE.BufferGeometry[] = [];
    try {
      // CAD profiles and positions share model coordinates. Read the original
      // positions so rotation, resized previews and assembly offsets do not
      // alter which roof and Shaker faces meet.
      const joints = matingPartJoints(this.sourceParts.filter(part => !/cutout/i.test(part.name)).filter(part => !/^Front[ _]part2$/i.test(part.name)
        || (!this.isClassic() && this.frontStyle() === 'shaker')).map(part => {
        const bounds = new THREE.Box3();
        part.traverse(node => {
          if (node instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromBufferAttribute(this.sourcePositions.get(node.geometry)!));
        });
        let profile:RoundingProfile|undefined;part.traverse(node=>{profile ||= node.userData['roundingProfile'];});
        return { name: part.name, bounds, profile };
      }));
      const nodes = this.sourceParts.map(part => {
        if(/^Shelf$/i.test(part.name)){
          const shelfBounds=new THREE.Box3();
          part.traverse(node=>{if(node instanceof THREE.Mesh)shelfBounds.union(new THREE.Box3().setFromBufferAttribute(this.sourcePositions.get(node.geometry)!));});
          const dividers=this.sourceParts.filter(candidate=>/^Ice[ _]shelf/i.test(candidate.name)).map(candidate=>{
            const bounds=new THREE.Box3();candidate.traverse(node=>{if(node instanceof THREE.Mesh)bounds.union(new THREE.Box3().setFromBufferAttribute(this.sourcePositions.get(node.geometry)!));});return bounds;
          });
          const profiles=shelfProfilesForIceShelf(shelfBounds,dividers,this.iceShelfIncluded());
          if(dividers.length&&profiles.length){
            const materials:THREE.Material[]=[];
            part.traverse(node=>{if(node instanceof THREE.Mesh)materials.push(...(Array.isArray(node.material)?node.material:[node.material]));});
            const face=materials.find(material=>!/plywood[ _]edge$/i.test(material.name))||materials[0];
            const edge=materials.find(material=>/plywood[ _]edge$/i.test(material.name))||face;
            const full=shelfProfilesForIceShelf(shelfBounds,[],false)[0];
            const hole=this.umbrellaHole()?withUmbrellaHole(full,this.umbrellaDiameter(),this.width(),this.umbrellaX(),this.isCharcuterieCart()?1500:1200,this.isRooflessCart()?200:150).holes[0]:undefined;
            const centreX=hole?hole.reduce((sum,point)=>sum+point[0],0)/hole.length:undefined;
            const group=new THREE.Group();group.name=part.name;
            for(const [index,base] of profiles.entries()){
              const left=base.outline[0][0],right=base.outline[1][0];
              const profile=hole&&centreX!==undefined&&centreX>=left&&centreX<=right?{...base,holes:[hole]}:base;
              const geometry=createRoundedPart(profile,0);geometries.push(geometry);
              const mesh=new THREE.Mesh(geometry,[face,edge]);mesh.name=`Shelf panel ${index+1}`;mesh.userData['plywoodPart']='Shelf';mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
            }
            return group;
          }
        }
        let supported = false;
        part.traverse(node => { if (node instanceof THREE.Mesh && node.userData['roundingProfile']) supported = true; });
        const solidSide=this.isCharcuterieCart()&&!this.sideShelvesIncluded()&&/^(Left|Right)[ _]side[ _]?1$/i.test(part.name);
        const umbrellaPanel=(this.isCharcuterieCart()||this.isClassic()||this.isRooflessCart())&&this.umbrellaHole()&&/^(Top[ _](?:part)?1(?:[ _]cutouts)?|Shelf|Ice[ _]shelf[ _]4|Body5)$/i.test(part.name);
        if (!umbrellaPanel&&((!raw&&!solidSide) || !supported || /^(Top|Buttom|Bottom)[ _](?:part)?1(?:[ _]cutouts|[ _]cutout[ _]plug[ _]\d+)?$/i.test(part.name))) {
          const copy = part.clone(true);
          copy.traverse(node => {
            if (!(node instanceof THREE.Mesh)) return;
            const original = this.sourcePositions.get(node.geometry)!;
            node.geometry = node.geometry.clone();
            node.geometry.userData = { ...node.geometry.userData };
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
        if(!profile&&umbrellaPanel){const bounds=new THREE.Box3();part.traverse(node=>{if(node instanceof THREE.Mesh)bounds.union(new THREE.Box3().setFromBufferAttribute(this.sourcePositions.get(node.geometry)!));});
          // Centre the existing bottom holder on the pole; retain at least its original 7.5 mm wall.
          if(/^Body5$/i.test(name)){const w=Math.max(bounds.max.x-bounds.min.x,(this.umbrellaDiameter()+15)/1000),d=Math.max(bounds.max.z-bounds.min.z,(this.umbrellaDiameter()+15)/1000);
            const sourceX=this.isTwoInOneCart()?.15+(this.umbrellaX()/1000-.15)*1.2/(this.width()/1000-.3):.75;
            bounds.min.x=sourceX-w/2;bounds.max.x=sourceX+w/2;bounds.min.z=.3-d/2;bounds.max.z=.3+d/2;}
          profile={axis:'y',origin:bounds.min.y,thickness:bounds.max.y-bounds.min.y,outline:[[bounds.min.x,bounds.min.z],[bounds.max.x,bounds.min.z],[bounds.max.x,bounds.max.z],[bounds.min.x,bounds.max.z]],holes:[]};}
        if (!profile) throw new Error('The GLB is missing a part profile. Upload an updated model.');
        if(umbrellaPanel)profile=withUmbrellaHole(profile,this.umbrellaDiameter(),this.width(),this.umbrellaX(),this.isCharcuterieCart()?1500:1200,this.isRooflessCart()?200:150);
        if(solidSide){const us=profile.outline.map(p=>p[0]),vs=profile.outline.map(p=>p[1]),u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs);profile={...profile,outline:[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],holes:[]};}
        const partJoints = joints.get(name) || [];
        const key = JSON.stringify([profile, raw, /^(Top|Buttom|Bottom)[ _](?:part)?2$/i.test(name), partJoints]);
        const geometry = this.modelCache.roundedPart(key, () => {
          const rounded = createRoundedPart(profile!, umbrellaPanel&&/^Top/i.test(name)?0:raw);
          if (/^(Top|Buttom|Bottom)[ _](?:part)?2$/i.test(name)) keepTrimJointSquare(rounded, profile!, raw);
          keepPartJointsSquare(rounded, partJoints, raw);
          return rounded;
        });
        geometries.push(geometry);
        const face = materials.find(material => !/plywood[ _]edge$/i.test(material.name)) || materials[0];
        let edge = materials.find(material => /plywood[ _]edge$/i.test(material.name)) || face;
        if(umbrellaPanel&&/^Top/i.test(name)&&edge===face){edge=face.clone();edge.name='plywood edge';}
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

  async setSideShelfFinish(finish:TopFinish|'top'):Promise<void> {await this.setSurfaceFinish(finish,'side');}
  async setTopFinish(finish: TopFinish): Promise<void> {await this.setSurfaceFinish(finish,'top');}
  private async setSurfaceFinish(choice:TopFinish|'top',surface:'top'|'side'):Promise<void> {
    const finish=choice==='top'?this.topFinish():choice;
    const version = ++this.finishVersion;
    this.finishError.set('');
    this.finishLoading.set(true);
    try {
      if (finish === 'oak') await this.loadFinishTexture('tasmanian-oak.png');
      else if (finish === 'plywood' && !this.isClassic()) await Promise.all([
        this.loadFinishTexture('plywood-face.jpg'), this.loadFinishTexture('plywood-edge.jpg'), this.loadFinishTexture('pine.jpg'),
      ]);
      if (!this.alive || version !== this.finishVersion) return;
      if(surface==='side')this.sideShelfFinish.set(choice);else this.topFinish.set(finish);
      this.applyFinishes();
    } catch (cause) {
      if (this.alive && version === this.finishVersion) this.finishError.set(`Could not load the surface texture: ${this.message(cause)}. Check your connection and select the finish again.`);
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
    if(enabled){this.fourViews.set(false);this.navigationMode.set('rotate');if(this.controls)this.controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;}
    this.assemblyMode.set(enabled);
    this.assembly?.setEnabled(enabled);
  }
  selectPart(key: PartKey): void { this.setAssemblyMode(true); this.assembly?.select(key); }
  selectedPart(): PartKey | null { this.assemblyRevision(); return this.assembly?.state.selected || null; }
  partVisible(key: PartKey): boolean { if(key==='shelf'&&!this.shelfIncluded())return false; this.assemblyRevision(); return this.assembly?.state.visible[key] ?? true; }
  partAvailable(key: PartKey): boolean { if(key==='shelf'&&!this.shelfIncluded())return false; this.assemblyRevision(); return this.assembly?.has(key) ?? false; }
  partMovable(key: PartKey): boolean { this.assemblyRevision(); return this.assembly?.state.canMove(key) ?? false; }
  partOffset(key: PartKey): number { this.assemblyRevision(); return Math.round(this.assembly?.state.offsets[key] || 0); }
  setPartVisible(key: PartKey, visible: boolean): void { this.assembly?.setVisible(key, visible); }
  movePart(mm: string): void { this.assembly?.move(Number(mm)); }
  restorePart(): void { const key = this.selectedPart(); if (key) this.assembly?.restore(key); }
  restoreAssembly(): void { this.assembly?.restore(); }
  private stainlessReflection():THREE.Texture|null {
    if(!this.renderer)return null;
    if(!this.trayEnvironment){const room=new RoomEnvironment();const generator=new THREE.PMREMGenerator(this.renderer);try{this.trayEnvironment=generator.fromScene(room,.04);}finally{room.dispose();generator.dispose();}}
    return this.trayEnvironment.texture;
  }
  private updateTrays():void {
    if(this.trays){this.trays.removeFromParent();this.trays.traverse(node=>{if(node instanceof THREE.Mesh)node.geometry.dispose();});const mesh=this.trays.children[0] as THREE.Mesh|undefined;if(mesh)(mesh.material as THREE.Material).dispose();this.trays=undefined;}
    if(!this.model||!this.isSideShelfCart()||!this.cutoutsIncluded()||!this.traysIncluded())return;
    this.trays=createGastronormTrays(this.height(),this.stainlessReflection(),this.selectedTrays(),this.reverseCutoutLayout(),this.width(),this.depth());this.model.add(this.trays);
  }
  private updateUmbrella():void {
    const visible=(this.isCharcuterieCart()||this.isClassic()||this.isRooflessCart())&&this.umbrellaHole()&&this.showUmbrella(),key=JSON.stringify([visible,this.umbrellaDiameter(),this.umbrellaX(),this.width(),this.depth()]);if(key===this.umbrellaPreviewKey)return;this.umbrellaPreviewKey=key;
    if(this.umbrellaPreview){this.umbrellaPreview.removeFromParent();const materials=new Set<THREE.Material>();this.umbrellaPreview.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();materials.add(node.material as THREE.Material);}});materials.forEach(material=>material.dispose());this.umbrellaPreview=undefined;}
    if(!visible||!this.model)return;this.umbrellaPreview=createUmbrellaPreview(this.umbrellaDiameter()-2);this.umbrellaPreview.position.set(this.umbrellaX()/1000,0,this.depth()/2000);this.model.add(this.umbrellaPreview);
  }
  private bindAssembly(): void {
    this.updateUmbrella();
    this.updateTrays();
    this.updateFrontLogo();
    if (!this.model || !this.body) return;
    if(this.isCharcuterieCart())this.body.traverse(node=>{
      const name=node.userData['plywoodPart']||node.name;
      if(/^Body5$/i.test(name)){node.userData['assemblyHidden']=!this.umbrellaHole();node.visible=this.umbrellaHole()&&(this.assembly?.state.visible.bottom??true);}
      const plug=/^Top[ _]part1[ _]cutout[ _]plug[ _](\d+)$/i.exec(name);
      if(plug){const visible=this.cutoutsIncluded()&&!this.selectedCutouts().includes(+plug[1]);node.userData['assemblyHidden']=!visible;node.visible=visible&&(this.assembly?.state.visible.top??true);}
      const key=/^Ice[ _]shelf/i.test(name)?'ice-shelf':/^Side[ _]shelf/i.test(name)?'side-shelves':null;
      if(/^Top[ _]part1(?:[ _]cutouts)?$/i.test(name)){
        const visible=/cutouts/i.test(name)===this.cutoutsIncluded();node.userData['assemblyHidden']=!visible;node.visible=visible&&(this.assembly?.state.visible.top??true);
      }
      if(!key)return;
      const included=key==='ice-shelf'?this.iceShelfIncluded():this.sideShelvesIncluded();
      node.userData['assemblyHidden']=!included;node.visible=included&&(this.assembly?.state.visible[key]??true);
    });
    if(this.sideShelfExtensions){const visible=this.sideShelvesIncluded();this.sideShelfExtensions.userData['assemblyHidden']=!visible;this.sideShelfExtensions.visible=visible&&(this.assembly?.state.visible['side-shelves']??true);}
    this.body.traverse(node=>{
      if(!/^Shelf/i.test(node.userData['plywoodPart']||node.name))return;
      node.userData['assemblyHidden']=!this.shelfIncluded();
      node.visible=this.shelfIncluded()&&(this.assembly?.state.visible.shelf??true);
    });
    if (!this.isClassic()) this.body.traverse(node => {
      if (!/^Front[ _]part2$/i.test(node.userData['plywoodPart'] || node.name)) return;
      node.userData['assemblyHidden'] = this.frontStyle() !== 'shaker';
    });
    if (this.assembly) this.assembly.normals = this.isClassic() ? {} : { front: [0, 0, 1], left: [1, 0, 0], right: [-1, 0, 0] };
    this.assembly?.bind(this.model, [...this.body.children, ...(this.frontMoulding ? [this.frontMoulding] : []), ...(this.logoMesh ? [this.logoMesh] : []), ...(this.trays ? [this.trays] : []),
      ...[...this.casters.values()].flatMap(group => group.children)]);
  }

  private applyDimensions(): void {
    if (!this.body) return;
    for (const [node, original] of this.originalPositions) {
      const positions = node.geometry.getAttribute('position');
      const name = node.userData['plywoodPart'] || node.name;
      const cutout = this.isSideShelfCart() && /^Top[ _]part1[ _]cutout/i.test(name);
      const reverse = cutout && this.reverseCutoutLayout();
      for (let i = 0; i < original.count; i++) {
        const [x, y, z] = this.isCharcuterieCart()
          ? resizeSideShelfCartPosition(name, original.getX(i), original.getY(i), original.getZ(i), this.width(), this.height()) : this.isClassic()
          ? resizePlywoodPosition(name, original.getX(i), original.getY(i), original.getZ(i), this.width(), this.height())
          : resizeRoofCartPosition(name, original.getX(i), original.getY(i), original.getZ(i), this.width(), this.height(), this.frontStyle() !== 'shaker');
        positions.setXYZ(i, reverse?this.width()/1000-x:x, y, z);
      }
      positions.needsUpdate = true;
      if(cutout){
        // Reflection reverses triangle winding. Restore it so the visible faces,
        // normals and shadows remain outward-facing in either layout.
        if(reverse!==(node.geometry.userData['mirroredWinding']===true)){
          if(!node.geometry.index)node.geometry.setIndex(Array.from({length:positions.count},(_,i)=>i));
          const index=node.geometry.index!;
          for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
          index.needsUpdate=true;node.geometry.userData['mirroredWinding']=reverse;
        }
        node.geometry.computeVertexNormals();
      }
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
        side === 'R' ? (this.width() - (this.isTwoInOneCart()?1500:(this.record?.base_width_mm || 1200))) / 1000 : 0,
        0,
        row === 'rear' ? (this.depth() - 600) / 1000 : 0,
      );
    }
    const span = Math.max(this.previewWidth(), this.depth(), this.previewHeight()) / 1000;
    const centerX = this.width() / 2000, centerZ = this.depth() / 2000;
    this.turntable?.position.set(centerX, 0, centerZ);
    this.model?.position.set(-centerX, 0, -centerZ);
    if (this.controls) {
      const nextTarget = new THREE.Vector3(this.width() / 2000, this.previewHeight() / 2000, this.depth() / 2000);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(nextTarget).addScaledVector(offset, span / this.cameraSpan);
      const orbitOffset = this.orbitCamera.position.clone().sub(this.controls.target);
      this.orbitCamera.position.copy(nextTarget).addScaledVector(orbitOffset, span / this.cameraSpan);
      this.controls.target.copy(nextTarget);
      this.controls.update();
    }
    this.cameraSpan = span;
    if(!this.isCharcuterieCart()&&this.sideShelvesIncluded()){
      const top=this.height()/1000,thickness=this.isClassic()?.042:.045;
      for(const node of this.originalPositions.keys())if(/^Top[ _](?:part)?2$/i.test(node.userData['plywoodPart']||node.name)){
        keepPartJointsSquare(node.geometry,[0,this.width()/1000].map(x=>({axis:'x' as const,plane:x,
          bounds:new THREE.Box3(new THREE.Vector3(x,top-thickness,0),new THREE.Vector3(x,top,.6)),
          cap:{axis:'y' as const,min:top-thickness,max:top},outlineEnds:[new THREE.Vector3(x,top,0),new THREE.Vector3(x,top,.6)]})),this.rounding());
      }
    }
    const shelvesChanged=this.updateSideShelfExtensions();
    const holderChanged=this.updateUmbrellaHolder();
    this.updateRoofBottom();
    if (this.roofClosed()||shelvesChanged||holderChanged) this.applyFinishes();
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
    if (!this.body || !this.hasRoof() || !this.roofClosed()) return;
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
      const sideShelfTop=isSideShelfTopName(partName);
      if (!this.isClassic() && (isTopPanelName(partName)||sideShelfTop)) {
        groupTopFacesAndEdges(node.geometry);
        const source = Array.isArray(node.material) ? node.material[0] : node.material;
        const existingEdge=Array.isArray(node.material)?node.material[1]:undefined;
        if(!existingEdge||existingEdge===source||!/plywood[ _]edge$/i.test(existingEdge.name)){
          const edge=(existingEdge||source).clone();edge.name='plywood edge';
          node.material=[source,edge];
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
        const finish = sideShelfTop?this.effectiveSideShelfFinish():isTopPanelName(partName)?this.topFinish():'body';
        const pine = /pine[ _]trim$/i.test(material.name);
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
    if (this.roundingBusy() || this.isCharcuterieCart()) return;
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
    const horizontal = /^(Top|Buttom|Bottom)[ _]part|^Shelf|^Side[ _]shelf[ _](?:left|right)[ _][12]$/i.test(partName);
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
    const span = Math.max(this.previewWidth(), this.depth(), this.previewHeight()) / 1000;
    this.cameraSpan = span;
    this.camera.position.set(this.width() / 2000 + span * 1.1, this.overallHeight() / 2000 + span * 0.5, this.depth() / 2000 + span * 1.25);
    this.orbitCamera.position.copy(this.camera.position);
    if(this.turntable)this.turntable.rotation.y=frontFacingRotation(this.isClassic());
    this.camera.lookAt(this.width() / 2000, this.previewHeight() / 2000, this.depth() / 2000);
    this.controls?.update();
  }

  private fileSize(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
  private message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }

  ngOnDestroy(): void {
    this.trayEnvironment?.dispose();
    this.alive = false;
    this.logoVersion++;this.logoTexture?.dispose();
    const configuration=this.savedConfiguration();if(configuration)URL.revokeObjectURL(configuration.url);
    const drawing = this.shelfDrawing(); if (drawing) URL.revokeObjectURL(drawing.url);
    this.loadVersion++;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onPreviewResize);
    document.removeEventListener('scroll', this.onPreviewResize, true);
    this.controls?.dispose();
    this.assembly?.dispose();
    this.disposeModel();
    this.sideShelfReference?.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();for(const material of node.material as THREE.Material[])material.dispose();}});
    this.rawTexture?.dispose();
    for (const texture of this.finishTextures.values()) texture.dispose();
    this.plywoodTexture?.dispose();
    this.paintEnvironment?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
