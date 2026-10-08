import * as THREE from 'three';
import { createRoundedPart, keepPartJointsSquare, keepTrimJointSquare, RoundingProfile } from './modeling-rounding';

export interface CartTopStructure {
  panelBottom:number;
  panelTop:number;
  trimBottom:number;
  trimTop:number;
  trimWidth:number;
  insetPanel:boolean;
  pineTrim:boolean;
}

export function cartTopStructure(body:THREE.Group,classic:boolean,heightMm:number):CartTopStructure {
  const panel=body.children.find(part=>/^Top[ _](?:part)?1$/i.test(part.name));
  const trim=body.children.find(part=>/^Top[ _](?:part)?2$/i.test(part.name));
  if(!panel||!trim)throw new Error('The cart top is incomplete. Upload its panel and trim before adding side shelves.');
  const panelBounds=new THREE.Box3().setFromObject(panel),trimBounds=new THREE.Box3().setFromObject(trim);
  const top=heightMm/1000,dy=top-panelBounds.max.y;
  const panelBottom=panelBounds.min.y+dy,panelTop=panelBounds.max.y+dy;
  const trimBottom=trimBounds.min.y+dy,trimTop=trimBounds.max.y+dy;
  const profile=trim.userData['roundingProfile'] as RoundingProfile|undefined;
  const outer=profile?.outline.map(p=>p[0])||[],inner=profile?.holes[0]?.map(p=>p[0])||[];
  const profileRail=outer.length&&inner.length?Math.min(...inner)-Math.min(...outer):0;
  const trimSize=trimBounds.getSize(new THREE.Vector3());
  const dimensionRail=Math.min(trimSize.x,trimSize.z);
  const trimWidth=profileRail>.005&&profileRail<.08?profileRail:dimensionRail>.005&&dimensionRail<.08?dimensionRail:classic?.02:.016;
  return {panelBottom,panelTop,trimBottom,trimTop,trimWidth,insetPanel:trimTop>panelBottom+.002,pineTrim:classic};
}

// Reuse only the actual folding brackets from the 150 cm cart. Shelf panels
// follow the structure of each destination cart's own tabletop.
export function extractCartSideShelves(scene: THREE.Group): THREE.Group {
  scene.updateMatrixWorld(true);
  const source = new THREE.Group();
  source.name = 'Side shelf source';
  for (const part of scene.children) {
    if (!/^Side[ _]shelf[ _](?:left|right)[ _](?:[5-9]|\d{2,})$/i.test(part.name)) continue;
    part.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      const originals = Array.isArray(node.material) ? node.material : [node.material];
      const materials = originals.map(material => {
        const copy = new THREE.MeshPhysicalMaterial();
        copy.name = material.name;
        return copy;
      });
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.name = part.name;
      mesh.userData['plywoodPart'] = part.name;
      mesh.castShadow = mesh.receiveShadow = true;
      source.add(mesh);
    });
  }
  for (const side of ['left', 'right']) {
    if (!source.children.some(part => new RegExp(`^Side[ _]shelf[ _]${side}[ _]5$`, 'i').test(part.name))) {
      source.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); for (const material of node.material as THREE.Material[]) material.dispose(); } });
      throw new Error(`The 150 cm cart is missing its ${side} folding support. Upload the complete source model.`);
    }
  }
  return source;
}

export function extractCartUmbrellaHolderBounds(scene: THREE.Group): THREE.Box3 {
  scene.updateMatrixWorld(true);
  const holder = scene.children.find(part => /^Body5$/i.test(part.name));
  if (!holder) throw new Error('The 150 cm cart is missing its bottom umbrella holder. Upload the complete source model.');
  return new THREE.Box3().setFromObject(holder);
}

export function createCartSideShelves(source: THREE.Group, widthMm: number, heightMm: number, sourceWidthMm: number, sourceHeightMm: number, top:CartTopStructure, radiusMm:number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Side shelf extensions';
  const rectangle=(x0:number,x1:number,z0:number,z1:number)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  const panelMaterial=()=>{const face=new THREE.MeshPhysicalMaterial();face.name='side shelf face';const edge=new THREE.MeshPhysicalMaterial();edge.name='plywood edge';return [face,edge];};
  const trimMaterial=()=>{const face=new THREE.MeshPhysicalMaterial();face.name=top.pineTrim?'pine trim':'side shelf face';const edge=new THREE.MeshPhysicalMaterial();edge.name=top.pineTrim?'pine trim':'plywood edge';return [face,edge];};
  const add=(name:string,profile:RoundingProfile,trim=false,round=radiusMm)=>{
    const geometry=createRoundedPart(profile,round);
    if(profile.holes.length)keepTrimJointSquare(geometry,profile,round);
    const mesh=new THREE.Mesh(geometry,trim?trimMaterial():panelMaterial());mesh.name=name;mesh.userData['plywoodPart']=name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const width=widthMm/1000;
  for(const side of ['left','right'] as const){
    const left=side==='left',x0=left?-.2:width,x1=x0+.2,join=left?0:width,rail=top.trimWidth;
    const base=(origin:number,thickness:number,outline:number[][],holes:number[][][]=[])=>({axis:'y' as const,origin,thickness,outline,holes});
    if(top.insetPanel){
      add(`Side shelf ${side} 1`,base(top.panelBottom,top.panelTop-top.panelBottom,rectangle(x0+rail,x1-rail,rail,.6-rail)),false,0);
      const rim=add(`Side shelf ${side} 2`,base(top.trimBottom,top.trimTop-top.trimBottom,rectangle(x0,x1,0,.6),[rectangle(x0+rail,x1-rail,rail,.6-rail)]),true);
      keepPartJointsSquare(rim.geometry,[{axis:'x',plane:join,bounds:new THREE.Box3(new THREE.Vector3(join,top.trimBottom,0),new THREE.Vector3(join,top.trimTop,.6)),cap:{axis:'y',min:top.trimBottom,max:top.trimTop}}],radiusMm);
    }else{
      add(`Side shelf ${side} 1`,base(top.panelBottom,top.panelTop-top.panelBottom,rectangle(x0,x1,0,.6)),false,0);
      const outer=left?rectangle(x0,x0+rail,0,.6):rectangle(x1-rail,x1,0,.6);
      add(`Side shelf ${side} 2`,base(top.trimBottom,top.trimTop-top.trimBottom,outer),true);
      add(`Side shelf ${side} 3`,base(top.trimBottom,top.trimTop-top.trimBottom,rectangle(x0+rail,x1-rail,0,rail)),true);
      add(`Side shelf ${side} 4`,base(top.trimBottom,top.trimTop-top.trimBottom,rectangle(x0+rail,x1-rail,.6-rail,.6)),true);
    }
  }
  for (const part of source.children) {
    if (!(part instanceof THREE.Mesh)) continue;
    if (!/^Side[ _]shelf[ _](?:left|right)[ _](?:[5-9]|\d{2,})$/i.test(part.name)) continue;
    const materials = (part.material as THREE.Material[]).map(material => material.clone());
    const mesh = new THREE.Mesh(part.geometry.clone(), materials);
    mesh.name = part.name;
    mesh.userData = { ...part.userData };
    mesh.position.set(/Side[ _]shelf[ _]right/i.test(part.name) ? (widthMm - sourceWidthMm) / 1000 : 0, (heightMm - sourceHeightMm) / 1000, 0);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
