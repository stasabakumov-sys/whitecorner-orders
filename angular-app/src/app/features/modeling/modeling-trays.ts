import * as THREE from 'three';

// Coordinates transcribed from Top with cutouts.ai (PostScript points → mm).
export const CHARCUTERIE_CUTOUTS = [
  {x:180.2,z:53.85,width:297.5,depth:501,type:'GN 1/1' as const},
  ...[557.47,789.33,1021.19,1253.05].flatMap(x=>[53.85,234.35,414.85].map(z=>({x,z,width:152,depth:140,type:'GN 1/6' as const}))),
];

// Open hollow stainless-steel pan: rolled flat lip, tapered walls, 1 mm floor.
// Only the supplied outside dimensions and 65 mm depth are confirmed. The
// flange, corner radii and taper are visual approximations, not a tooling drawing.
export function gastronormTrayGeometry(widthMm:number,depthMm:number):THREE.BufferGeometry {
  const positions:number[]=[], indices:number[]=[];
  const ring=(width:number,depth:number,y:number)=>{
    const radius=Math.min(10,width/4,depth/4), start=positions.length/3;
    for(let corner=0;corner<4;corner++){
      const cx=(corner===0||corner===3?1:-1)*(width/2-radius);
      const cz=(corner<2?1:-1)*(depth/2-radius);
      for(let step=0;step<=8;step++){
        const angle=(corner*90+step*90/8)*Math.PI/180;
        positions.push((cx+radius*Math.cos(angle))/1000,y/1000,(cz+radius*Math.sin(angle))/1000);
      }
    }
    return start;
  };
  // Walk from the outer rim into the basin, then back up the outside.
  const rings=[ring(widthMm,depthMm,1),ring(widthMm-32,depthMm-32,1),ring(widthMm-50,depthMm-50,-64),
    ring(widthMm-48,depthMm-48,-65),ring(widthMm-30,depthMm-30,0),ring(widthMm,depthMm,0)];
  const count=36;
  const join=(a:number,b:number)=>{for(let i=0;i<count;i++){const j=(i+1)%count;indices.push(a+i,b+i,a+j,a+j,b+i,b+j);}};
  join(rings[0],rings[1]);join(rings[1],rings[2]);join(rings[3],rings[4]);join(rings[4],rings[5]);join(rings[5],rings[0]);
  const cap=(start:number,y:number,up:boolean)=>{const center=positions.length/3;positions.push(0,y/1000,0);for(let i=0;i<count;i++){const j=(i+1)%count;indices.push(center,start+(up?j:i),start+(up?i:j));}};
  cap(rings[2],-64,true);cap(rings[3],-65,false);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);const surface=geometry.toNonIndexed();geometry.dispose();surface.computeVertexNormals();surface.computeBoundingBox();surface.computeBoundingSphere();return surface;
}

export function createGastronormTrays(heightMm:number,environment:THREE.Texture|null,selected:readonly number[]=CHARCUTERIE_CUTOUTS.map((_,i)=>i)):THREE.Group {
  const group=new THREE.Group();group.name='Top trays';
  const material=new THREE.MeshPhysicalMaterial({color:'#dce1e5',metalness:.92,roughness:.24,envMap:environment,envMapIntensity:.8,side:THREE.DoubleSide});
  for(const index of selected){
    const cutout=CHARCUTERIE_CUTOUTS[index];if(!cutout)continue;
    const tray=new THREE.Mesh(gastronormTrayGeometry(cutout.type==='GN 1/1'?325:176,cutout.type==='GN 1/1'?530:162),material);
    tray.name=cutout.type;tray.position.set((cutout.x+cutout.width/2)/1000,heightMm/1000,(cutout.z+cutout.depth/2)/1000);tray.castShadow=true;tray.receiveShadow=true;group.add(tray);
  }
  return group;
}
