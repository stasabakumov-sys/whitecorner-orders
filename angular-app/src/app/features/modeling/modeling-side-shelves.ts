import * as THREE from 'three';
import { createRoundedPart, keepTrimJointSquare, keepPartJointsSquare, RoundingProfile } from './modeling-rounding';

// Match the existing inset tabletop: a 15/16 mm panel sits flush inside a
// 42/45 mm border. These extensions are not the slab-and-trim STEP shelves.
export function createCartSideShelves(classic:boolean,widthMm:number,heightMm:number,radiusMm:number):THREE.Group {
 const group=new THREE.Group();group.name='Side shelf extensions';
 const width=widthMm/1000,top=heightMm/1000,panel=classic?.015:.016,rail=classic?.019:.016,thickness=classic?.042:.045;
 const rectangle=(x0:number,x1:number,z0:number,z1:number)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
 const wood=(name:string,profile:RoundingProfile,pine=false,rounding=radiusMm)=>{
  const geometry=createRoundedPart(profile,rounding);
  if(profile.holes.length)keepTrimJointSquare(geometry,profile,radiusMm);
  const face=new THREE.MeshPhysicalMaterial();face.name=pine?'pine trim':'side shelf face';
  const edge=new THREE.MeshPhysicalMaterial();edge.name=pine?'pine trim':'plywood edge';
  const mesh=new THREE.Mesh(geometry,[face,edge]);mesh.name=name;mesh.userData['plywoodPart']=name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
 };
 for(const side of ['left','right'] as const){
  const left=side==='left',x0=left?-.2:width,x1=x0+.2,join=left?0:width;
  const rim:RoundingProfile={axis:'y',origin:top-thickness,thickness,outline:rectangle(x0,x1,0,.6),holes:[rectangle(x0+rail,x1-rail,rail,.6-rail)]};
  const sheet:RoundingProfile={axis:'y',origin:top-panel,thickness:panel,outline:rectangle(x0+rail,x1-rail,rail,.6-rail),holes:[]};
  wood('Side shelf '+side+' 1',sheet,false,0);
  const border=wood('Side shelf '+side+' 2',rim,classic);
  keepPartJointsSquare(border.geometry,[{axis:'x',plane:join,bounds:new THREE.Box3(new THREE.Vector3(join,top-thickness,0),new THREE.Vector3(join,top,.6)),cap:{axis:'y',min:top-thickness,max:top}}],radiusMm);
  // Two brackets meet the actual side wall, outside the roof post sockets.
  // Their lower edge remains above the decorative wheel envelope.
  const wall=left?rail:width-rail,outer=left?-.18:width+.18;
  for(const [i,z] of [.13,.47].entries()){
   const support=wood('Side shelf '+side+' '+(i+5),{axis:'z',origin:z-.006,thickness:.012,outline:[[wall,top-thickness],[outer,top-thickness],[wall,top-thickness-.16]],holes:[]});
   keepPartJointsSquare(support.geometry,[{axis:'y',plane:top-thickness,bounds:new THREE.Box3(new THREE.Vector3(Math.min(wall,outer),top-thickness,z-.006),new THREE.Vector3(Math.max(wall,outer),top-thickness,z+.006))}],radiusMm);
   const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.003,.003,.045,12),new THREE.MeshStandardMaterial({color:'#999c9e',metalness:.65,roughness:.45}));
   hinge.name='Side shelf '+side+' hinge '+i;hinge.rotation.x=Math.PI/2;hinge.position.set(join,top-thickness,z);hinge.userData['fixedMaterial']=true;hinge.castShadow=true;group.add(hinge);
  }
 }
 return group;
}
