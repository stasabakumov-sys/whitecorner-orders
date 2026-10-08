import * as THREE from 'three';
import { createRoundedPart, keepPartJointsSquare, matingPartJoints, PartJoint, RoundingProfile } from './modeling-rounding';

export const SIDE_SHELF_REFERENCE_SCENE = 'MDF side shelf reference';
export function preparePlywoodSideThickness(scene:THREE.Group):void {
  for(const part of scene.children){
    const match=/^(Left|Right)[ _]side[ _]?(?:part)?([12])$/i.exec(part.name);
    if(!match)continue;
    const left=match[1].toLowerCase()==='left';
    part.traverse(node=>{if(node instanceof THREE.Mesh){
      const positions=node.geometry.getAttribute('position') as THREE.BufferAttribute;
      const box=new THREE.Box3().setFromBufferAttribute(positions),outer=left?box.min.x:box.max.x;
      const thickness=box.max.x-box.min.x;
      for(let i=0;i<positions.count;i++)positions.setX(i,match[2]==='1'
        ?outer+(positions.getX(i)-outer)*.015/thickness:positions.getX(i)+(left?.003:-.003));
      positions.needsUpdate=true;node.geometry.computeBoundingBox();node.geometry.computeBoundingSphere();
      if(match[2]==='1')node.userData['roundingProfile']={axis:'x',origin:left?outer:outer-.015,thickness:.015,
        outline:[[box.min.z,box.min.y],[box.max.z,box.min.y],[box.max.z,box.max.y],[box.min.z,box.max.y]],holes:[]};
    }});
  }
}
export interface CartTopStructure {
  panelBottom:number; panelTop:number; trimBottom:number; trimTop:number; trimWidth:number; pineTrim:boolean;
  sides:THREE.Box3[];
}
function localBounds(part:THREE.Object3D,body:THREE.Group):THREE.Box3 {
  body.updateWorldMatrix(true,true);
  const inverse=body.matrixWorld.clone().invert(),bounds=new THREE.Box3();
  part.traverse(node=>{if(node instanceof THREE.Mesh){
    node.geometry.computeBoundingBox();bounds.union(node.geometry.boundingBox!.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld)));
  }});
  return bounds;
}
export function cartTopStructure(body:THREE.Group,classic:boolean,heightMm:number,pineTrim=classic):CartTopStructure {
  const panel=body.children.find(part=>/^Top[ _](?:part)?1$/i.test(part.name));
  const trim=body.children.find(part=>/^Top[ _](?:part)?2$/i.test(part.name));
  if(!panel||!trim)throw new Error('The cart top is incomplete. Upload its panel and trim before adding side shelves.');
  const panelBounds=localBounds(panel,body),trimBounds=localBounds(trim,body),dy=heightMm/1000-panelBounds.max.y;
  const sides=body.children.filter(part=>/^(Left|Right)[ _]side[ _]?(?:part)?1$/i.test(part.name))
    .map(part=>localBounds(part,body)).sort((a,b)=>a.min.x-b.min.x);
  if(sides.length!==2)throw new Error('Both cart sides are required to fit the side shelf holders.');
  return {panelBottom:panelBounds.min.y+dy,panelTop:panelBounds.max.y+dy,
    trimBottom:trimBounds.min.y+dy,trimTop:trimBounds.max.y+dy,trimWidth:pineTrim?.019:.016,pineTrim,sides};
}

// This secondary scene is stored in the private roof-cart GLB. Its geometry is
// the owner's 8 October STEP revision; the default source scene stays intact.
export function extractCartSideShelves(scene:THREE.Group):THREE.Group {
  const source=scene.clone(true);
  for(const side of ['left','right'])for(const index of [1,2,3,4,5,6]){
    const part=source.children.find(node=>new RegExp(`^Side[ _]shelf[ _]${side}[ _]${index}$`,'i').test(node.name));
    if(!part)throw new Error(`The owner side shelf reference is missing ${side} part ${index}.`);
  }
  if(!source.children.some(node=>/^Side[ _]panel[ _]right[ _]cutouts$/i.test(node.name)))throw new Error('The owner reference is missing the side panel cutouts.');
  source.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry=node.geometry.clone();node.material=new THREE.MeshPhysicalMaterial();}});
  return source;
}
export function extractCartUmbrellaHolderBounds(scene:THREE.Group):THREE.Box3 {
  scene.updateMatrixWorld(true);
  const holder=scene.children.find(part=>/^Body5$/i.test(part.name));
  if(!holder)throw new Error('The 150 cm cart is missing its bottom umbrella holder. Upload the complete source model.');
  return new THREE.Box3().setFromObject(holder);
}
function sourceProfile(part:THREE.Object3D):RoundingProfile {
  let profile:RoundingProfile|undefined;part.traverse(node=>{profile ||= node.userData['roundingProfile'];});
  if(!profile)throw new Error(`The owner reference is missing the ${part.name} profile.`);
  return profile;
}
export function sideShelfSideProfile(profile:RoundingProfile,source:THREE.Group):RoundingProfile {
  if(profile.axis!=='x')throw new Error('The cart side profile must be vertical.');
  const reference=source.children.find(node=>/^Side[ _]panel[ _]right[ _]cutouts$/i.test(node.name))!;
  const outline=sourceProfile(reference).outline,refTop=Math.max(...outline.map(p=>p[1]));
  const inner=outline.filter(p=>p[1]<refTop-.001&&p[1]>refTop-.15);
  if(!inner.length)throw new Error('The owner side panel has no holder slots.');
  const depth=refTop-Math.min(...inner.map(p=>p[1]));
  const zs=profile.outline.map(p=>p[0]),top=Math.max(...profile.outline.map(p=>p[1]));
  const slots=[Math.min(...zs)+.08,Math.max(...zs)-.08-.012].map(start=>[start,start+.012]);
  const next:number[][]=[];
  for(let i=0;i<profile.outline.length;i++){
    const a=profile.outline[i],b=profile.outline[(i+1)%profile.outline.length];next.push([...a]);
    if(Math.abs(a[1]-top)>1e-6||Math.abs(b[1]-top)>1e-6)continue;
    const forward=b[0]>a[0];
    const cuts=slots.filter(([start,end])=>start>Math.min(a[0],b[0])+1e-6&&end<Math.max(a[0],b[0])-1e-6).sort((l,r)=>forward?l[0]-r[0]:r[0]-l[0]);
    for(const [start,end] of cuts){const near=forward?start:end,far=forward?end:start;next.push([near,top],[near,top-depth],[far,top-depth],[far,top]);}
  }
  return {...profile,outline:next};
}
export function sideShelfSlotJoints(profile:RoundingProfile):PartJoint[] {
  const top=Math.max(...profile.outline.map(p=>p[1])),joints:PartJoint[]=[];
  for(let i=0;i<profile.outline.length;i++){
    const a=profile.outline[i],b=profile.outline[(i+1)%profile.outline.length];
    if(Math.abs(a[1]-b[1])>1e-6||a[1]>=top-.001||a[1]<top-.15)continue;
    const z0=Math.min(a[0],b[0]),z1=Math.max(a[0],b[0]);if(Math.abs(z1-z0-.012)>1e-6)continue;
    const bounds=new THREE.Box3(new THREE.Vector3(profile.origin,a[1],z0),new THREE.Vector3(profile.origin+profile.thickness,top,z1));
    joints.push({axis:'y',plane:a[1],bounds},...([z0,z1].map(plane=>({axis:'z' as const,plane,bounds}))));
  }
  return joints;
}
export function createCartSideShelves(source:THREE.Group,widthMm:number,heightMm:number,top:CartTopStructure,radiusMm:number):THREE.Group {
  const group=new THREE.Group();group.name='Side shelf extensions';
  const profiles:{name:string;profile:RoundingProfile}[]=[];
  const width=widthMm/1000,lift=heightMm/1000-.9;
  for(const side of ['left','right'] as const){
    const left=side==='left',rail=top.trimWidth;
    const add=(index:number,profile:RoundingProfile)=>profiles.push({name:`Side shelf ${side} ${index}`,profile});
    // Transform the actual source board and three border profiles. Preserve
    // their outlines and joints, changing only the specified stock sizes.
    const interpolate=(value:number,anchors:number[][])=>{
      for(let i=1;i<anchors.length;i++)if(value<=anchors[i][0]+1e-6){const [a,b]=anchors[i-1],[c,d]=anchors[i];return b+(value-a)*(d-b)/(c-a);}
      return anchors[anchors.length-1][1];
    };
    const leafX=(x:number)=>interpolate(x,left?[[-.2,-.2],[-.184,-.2+rail],[0,0]]:[[1.2,width],[1.384,width+.2-rail],[1.4,width+.2]]);
    const leafZ=(z:number)=>interpolate(z,[[0,0],[.016,rail],[.584,.6-rail],[.6,.6]]);
    for(const index of [1,2,3,4]){
      const part=source.children.find(node=>new RegExp(`^Side[ _]shelf[ _]${side}[ _]${index}$`,'i').test(node.name))!;
      const original=sourceProfile(part),axis=original.axis;
      const world=([a,b]:number[],depth:number)=>axis==='x'?[depth,b,a]:axis==='y'?[a,depth,b]:[a,b,depth];
      const points=original.outline.flatMap(p=>[world(p,original.origin),world(p,original.origin+original.thickness)]);
      const ymin=Math.min(...points.map(p=>p[1])),ymax=Math.max(...points.map(p=>p[1]));
      const low=index===1?top.panelBottom:top.trimBottom,high=index===1?top.panelTop:top.trimTop;
      const move=([x,y,z]:number[])=>[leafX(x),low+(y-ymin)*(high-low)/(ymax-ymin),leafZ(z)];
      const plane=axis==='x'?0:axis==='y'?1:2;
      const origin=move(world(original.outline[0],original.origin))[plane];
      const thickness=move(world(original.outline[0],original.origin+original.thickness))[plane]-origin;
      const outline=(p:number[])=>{const [x,y,z]=move(world(p,original.origin));return axis==='x'?[z,y]:axis==='y'?[x,z]:[x,y];};
      add(index,{...original,origin,thickness,outline:original.outline.map(outline),holes:original.holes.map(hole=>hole.map(outline))});
    }
    const sideBounds=top.sides[left?0:1],sourceMin=left?.016:1.172,sourceMax=left?.028:1.184;
    const xAt=(x:number)=>x<=sourceMin?x+sideBounds.min.x-sourceMin:x>=sourceMax?x+sideBounds.max.x-sourceMax
      :sideBounds.min.x+(x-sourceMin)*(sideBounds.max.x-sideBounds.min.x)/(sourceMax-sourceMin);
    for(const index of [5,6]){
      const part=source.children.find(node=>new RegExp(`^Side[ _]shelf[ _]${side}[ _]${index}$`,'i').test(node.name))!;
      const original=sourceProfile(part),near=original.origin<.3;
      const z=near?sideBounds.min.z+.08:sideBounds.max.z-.08-.012;
      add(index,{...original,origin:z,thickness:.012,
        outline:original.outline.map(([x,y])=>[xAt(x),y+lift]),holes:original.holes.map(hole=>hole.map(([x,y])=>[xAt(x),y+lift]))});
    }
  }
  const bounds=(profile:RoundingProfile)=>{const g=createRoundedPart(profile,0);g.computeBoundingBox();const box=g.boundingBox!.clone();g.dispose();return box;};
  const joints=matingPartJoints(profiles.map(part=>({...part,bounds:bounds(part.profile)})));
  for(const {name,profile} of profiles){
    const support=/[ _][56]$/.test(name),geometry=createRoundedPart(profile,support?0:radiusMm);
    const partJoints=joints.get(name)||[];
    keepPartJointsSquare(geometry,partJoints,radiusMm);
    const face=new THREE.MeshPhysicalMaterial(),edge=new THREE.MeshPhysicalMaterial();
    face.name=top.pineTrim&&!/[ _][156]$/.test(name)?'pine trim':'side shelf face';edge.name=face.name==='pine trim'?'pine trim':'plywood edge';
    const mesh=new THREE.Mesh(geometry,[face,edge]);mesh.name=name;mesh.userData['plywoodPart']=name;
    mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}
