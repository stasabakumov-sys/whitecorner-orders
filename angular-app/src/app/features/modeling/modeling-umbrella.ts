import * as THREE from 'three';
import { CHARCUTERIE_CUTOUTS } from './modeling-trays';
import { RoundingProfile } from './modeling-rounding';

// Keep the centred pole clear of every possible tray flange, with 2 mm clearance.
export function umbrellaDiameterLimit(widthMm=1500,depthMm=600):number {
 const cx=widthMm/2,cz=depthMm/2;
 const distance=Math.min(...CHARCUTERIE_CUTOUTS.map(c=>{
  const w=c.type==='GN 1/1'?325:176,d=c.type==='GN 1/1'?530:162,x=c.x+c.width/2,z=c.z+c.depth/2;
  return Math.hypot(Math.max(Math.abs(cx-x)-w/2,0),Math.max(Math.abs(cz-z)-d/2,0));
 }));
 return Math.max(0,Math.floor(2*(Math.min(cx,cz,distance)-2)));
}

export function withUmbrellaHole(profile:RoundingProfile,diameterMm:number,widthMm=1500,centreXmm=widthMm/2,baseWidthMm=1500,endZoneMm=150):RoundingProfile {
 const radius=diameterMm/2000,end=endZoneMm/1000,scale=(widthMm-2*endZoneMm)/(baseWidthMm-2*endZoneMm),cx=end+(centreXmm/1000-end)/scale;
 const circle=Array.from({length:128},(_,i)=>{const a=2*Math.PI*i/128;return [cx+radius*Math.cos(a)/scale,.3+radius*Math.sin(a)];});
 return {...profile,holes:[...profile.holes,circle]};
}


export const UMBRELLA_PREVIEW_HEIGHT=2.1;
export function createUmbrellaPreview(poleDiameterMm:number):THREE.Group {
 const umbrella=new THREE.Group();umbrella.name='Umbrella preview';
 const wood=new THREE.MeshStandardMaterial({color:'#a57b4c',roughness:.58});
 const fabric=new THREE.MeshStandardMaterial({color:'#e9dfca',roughness:.93,side:THREE.DoubleSide});
 const rod=(a:THREE.Vector3,b:THREE.Vector3,r:number)=>{const delta=b.clone().sub(a);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),12),wood);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());umbrella.add(mesh);};
 rod(new THREE.Vector3(0,.127,0),new THREE.Vector3(0,2.1,0),poleDiameterMm/2000);
 const positions:number[]=[];const point=(panel:number,t:number,u:number)=>{const a=panel*Math.PI/4,b=(panel+1)*Math.PI/4;return [0.9*t*((1-u)*Math.cos(a)+u*Math.cos(b)),2.06-.27*Math.pow(t,.75)-.025*Math.sin(u*Math.PI)*t,0.9*t*((1-u)*Math.sin(a)+u*Math.sin(b))];};
 for(let panel=0;panel<8;panel++){
  for(let radial=0;radial<5;radial++)for(let section=0;section<4;section++){const t=radial/5,t1=(radial+1)/5,u=section/4,u1=(section+1)/4;const a=point(panel,t,u),b=point(panel,t1,u),c=point(panel,t1,u1),d=point(panel,t,u1);positions.push(...a,...b,...c,...a,...c,...d);}
  const angle=panel*Math.PI/4;for(let step=0;step<5;step++){const a=point(panel,step/5,0),b=point(panel,(step+1)/5,0);rod(new THREE.Vector3(a[0],a[1]-.015,a[2]),new THREE.Vector3(b[0],b[1]-.015,b[2]),.009);}rod(new THREE.Vector3(0,1.65,0),new THREE.Vector3(.5*Math.cos(angle),1.85,.5*Math.sin(angle)),.007);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();umbrella.add(new THREE.Mesh(geometry,fabric));
 const hub=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.065,16),wood);hub.position.y=1.65;umbrella.add(hub);
 umbrella.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=true;node.receiveShadow=true;}});return umbrella;
}

