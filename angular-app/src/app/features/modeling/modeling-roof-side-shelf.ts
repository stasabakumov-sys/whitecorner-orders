import * as THREE from 'three';
import { createRoundedPart, PartJoint, RoundingProfile } from './modeling-rounding';
import { prepareTwoInOneCartSource } from './modeling-two-in-one';

export const ROOF_SIDE_SHELF_CART_SLUG = 'roof-side-shelf-cart-mdf';
export const ROOF_SIDE_SHELF_CART_NAME = 'Mobile Foldable Charcuterie Cart/Bar with roof and side shelves';
export const ROOF_SIDE_SHELF_CUTOUTS = [
  { x: 135.3, z: 54, width: 297.5, depth: 501, type: 'GN 1/1' as const },
  ...[493.5, 703.2, 912.9].flatMap(x => [54, 236.4, 418.8].map(z =>
    ({ x, z, width: 152, depth: 140, type: 'GN 1/6' as const }))),
];

const postCentres = [67.5, 1132.5];
const square = (x:number,z:number,size:number) => {
  const half=size/2000, cx=x/1000, cz=z/1000;
  return [[cx-half,cz-half],[cx+half,cz-half],[cx+half,cz+half],[cx-half,cz+half]];
};
const rectangle = (x0:number,x1:number,z0:number,z1:number) => [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];

export function roofSideShelfHeight(y:number,heightMm:number):number {
  if(heightMm===850)return y;
  const table=heightMm/1000,roofUnderside=heightMm===950?1.85:1.8,roofTop=heightMm===950?1.968:1.93;
  if(y<=.85)return y+table-.85;
  if(y<=1.8)return table+(y-.85)*(roofUnderside-table)/.95;
  return roofUnderside+(y-1.8)*(roofTop-roofUnderside)/.13;
}

export function roofSideShelfIceHeight(name:string,y:number,heightMm:number):number {
  const lift=(heightMm-850)/1000;
  if(/^Ice[ _]shelf[ _][12]$/i.test(name))return y;
  if(/^Ice[ _]shelf[ _]3$/i.test(name))return y+lift*THREE.MathUtils.clamp((y-.111)/(.7-.111),0,1);
  return y+lift;
}

export function roofSideShelfTopProfile(origin:number,thickness:number,cutouts:boolean,widthMm=1200):RoundingProfile {
  const extra=widthMm-1200;
  const holes=postCentres.map((x,index)=>square(x+(index?extra:0),300,42));
  if(cutouts)for(const slot of ROOF_SIDE_SHELF_CUTOUTS)holes.push(rectangle(
    (slot.x+extra/2)/1000,(slot.x+extra/2+slot.width)/1000,slot.z/1000,(slot.z+slot.depth)/1000));
  return {axis:'y',origin,thickness,outline:rectangle(0,widthMm/1000,0,.6),holes};
}

export function roofSideShelfTabletopJoints(name:string,profile:RoundingProfile):PartJoint[] {
  const top=/^Top[ _]part1(?:[ _]cutouts)?$/i.test(name);
  const leaf=/^Side[ _]shelf[ _](left|right)[ _]1$/i.exec(name);
  if(profile.axis!=='y'||(!top&&!leaf))return [];
  const xs=profile.outline.map(p=>p[0]),zs=profile.outline.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  const y0=profile.origin;
  // Raised folding leaves remain separate from the top. Only the glued
  // underside is square; both edges at the folding joint stay rounded.
  const joints:PartJoint[]=[];
  // The perimeter rails are glued beneath the sheet. Only the upper outer
  // edge is free; rounding the bonded underside would reopen the rail joint.
  joints.push({axis:'y',plane:y0,
    bounds:new THREE.Box3(new THREE.Vector3(x0,y0,z0),new THREE.Vector3(x1,y0,z1)),
    squareCapOutline:profile.outline});
  return joints;
}

// The 150 cm cart supplies the folding body, castors and complete side-shelf
// mechanism. Its 13-pan top cannot be resized into this 10-pan, two-post top.
export function prepareRoofSideShelfCartSource(scene:THREE.Group):void {
  prepareTwoInOneCartSource(scene);
  const original=scene.children.find(node=>/^Top[ _]part1$/i.test(node.name));
  if(!original)throw new Error('The 150 cm source cart is missing its plain tabletop.');
  const sourceMesh=original instanceof THREE.Mesh?original:original.children.find(node=>node instanceof THREE.Mesh) as THREE.Mesh|undefined;
  if(!sourceMesh)throw new Error('The 150 cm source cart has no tabletop mesh.');
  const bounds=new THREE.Box3().setFromObject(original);
  const thickness=bounds.max.y-bounds.min.y;
  const material=Array.isArray(sourceMesh.material)?sourceMesh.material: [sourceMesh.material];
  for(const cutouts of [false,true]){
    const profile=roofSideShelfTopProfile(bounds.min.y,thickness,cutouts);
    const face=material[0].clone(),edge=(material[1]||material[0]).clone();
    edge.name='plywood edge';
    const mesh=new THREE.Mesh(createRoundedPart(profile,0),[face,edge]);
    mesh.name=cutouts?'Top part1 cutouts':'Top part1';
    mesh.userData={plywoodPart:mesh.name,roundingProfile:profile};
    mesh.castShadow=mesh.receiveShadow=true;
    scene.add(mesh);
  }
  original.removeFromParent();

  const addBox=(name:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{
    const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);
    const material=new THREE.MeshPhysicalMaterial();material.name='roof MDF';
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.userData['plywoodPart']=name;
    const axis:'x'|'y'|'z'=h<=w&&h<=d?'y':w<=d?'x':'z';
    mesh.userData['roundingProfile']={axis,origin:axis==='x'?x-w/2:axis==='y'?y-h/2:z-d/2,
      thickness:axis==='x'?w:axis==='y'?h:d,
      outline:axis==='x'?rectangle(z-d/2,z+d/2,y-h/2,y+h/2):axis==='y'?rectangle(x-w/2,x+w/2,z-d/2,z+d/2):rectangle(x-w/2,x+w/2,y-h/2,y+h/2),holes:[]};
    mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  };
  // Source Size I: table 850 mm, roof underside 1800 mm, top 1930 mm.
  // Size II maps these vertical joints to 950, 1850 and 1968 mm.
  // The source roof cart uses through-top posts and holders beneath the top.
  // This product's drawing locates two posts, rather than the four on that cart.
  for(const [index,x] of postCentres.entries()){
    const cx=x/1000;
    addBox(`Dar${index+1}`,cx,(.734+1.8)/2,.3,.0418,1.8-.734,.0418);
    const holder=new THREE.Group();holder.name=`Top ${index+3}`;
    // Match the source roof cart's Top_3/Top_4 sockets: 66 mm outside,
    // 42 mm opening, 112 mm overall height and a solid 12 mm floor.
    const profiles:[string,RoundingProfile][]=[
      ['wall',{axis:'y',origin:.734,thickness:.1,outline:square(x,300,66),holes:[square(x,300,42)]}],
      ['bottom',{axis:'y',origin:.722,thickness:.012,outline:square(x,300,66),holes:[]}],
    ];
    for(const [suffix,profile] of profiles){
      const mesh=new THREE.Mesh(createRoundedPart(profile,0),[new THREE.MeshPhysicalMaterial(),new THREE.MeshPhysicalMaterial()]);
      mesh.name=`${holder.name} ${suffix}`;mesh.userData['plywoodPart']=holder.name;
      mesh.castShadow=mesh.receiveShadow=true;holder.add(mesh);
    }
    scene.add(holder);
  }
  // Four separate fascia rails leave the underside open like the reference roof.
  addBox('Roof 1',.6,1.922,.3,1.2,.016,.6);
  addBox('Roof 2',.6,1.861,.008,1.2,.122,.016);
  addBox('Roof 3',.6,1.861,.592,1.2,.122,.016);
  addBox('Roof 4',.008,1.861,.3,.016,.122,.584);
  addBox('Roof 5',1.192,1.861,.3,.016,.122,.584);
}
