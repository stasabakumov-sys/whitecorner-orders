import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareClassicMdfSource } from './modeling-classic-mdf';
import { RoundingProfile } from './modeling-rounding';

const rectangle = (x0:number,x1:number,z0:number,z1:number) => [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
function part(name:string,x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,profile?:RoundingProfile):THREE.Mesh {
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0).translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),new THREE.MeshStandardMaterial());
 mesh.name=name;if(profile)mesh.userData['roundingProfile']=profile;return mesh;
}

describe('Classic MDF conversion from the private plywood construction',()=>{
 it('cuts both 45 × 16 mm borders and the specified MDF panel thicknesses',()=>{
  const scene=new THREE.Group();
  const trimProfile=(origin:number):RoundingProfile=>({axis:'y',origin,thickness:.042,outline:rectangle(0,1.2,0,.6),holes:[rectangle(.019,1.181,.019,.581)]});
  scene.add(part('Top_part2',0,1.2,.858,.9,0,.6,trimProfile(.858)));
  scene.add(part('Buttom_part2',0,1.2,.095,.137,0,.6,trimProfile(.095)));
  scene.add(part('Top_part1',.019,1.181,.885,.9,.019,.581));
  scene.add(part('Buttom_part1',.019,1.181,.095,.11,.019,.581));
  scene.add(part('Front_part1',.019,1.181,.11,.885,.019,.034));
  scene.add(part('Left_side_part1',.019,.031,.11,.885,.034,.581));
  scene.add(part('Caster_L_front_plate',.057,.125,.09,.095,.06,.142));
  prepareClassicMdfSource(scene);
  const bounds=(name:string)=>new THREE.Box3().setFromObject(scene.getObjectByName(name)!);
  for(const name of ['Top_part2','Buttom_part2']){
   const b=bounds(name);expect(b.max.y-b.min.y).toBeCloseTo(.045,5);
   const profile=(scene.getObjectByName(name) as THREE.Mesh).userData['roundingProfile'] as RoundingProfile;
   expect(profile.holes[0][0][0]).toBeCloseTo(.016,6);
   expect(profile.holes[0][0][1]).toBeCloseTo(.016,6);
  }
  for(const name of ['Top_part1','Buttom_part1'])expect(bounds(name).getSize(new THREE.Vector3()).y).toBeCloseTo(.016,5);
  expect(bounds('Front_part1').getSize(new THREE.Vector3()).z).toBeCloseTo(.016,5);
  expect(bounds('Left_side_part1').getSize(new THREE.Vector3()).x).toBeCloseTo(.012,5);
  expect(bounds('Caster_L_front_plate').min.x).toBeCloseTo(.057,5);
 });
});
