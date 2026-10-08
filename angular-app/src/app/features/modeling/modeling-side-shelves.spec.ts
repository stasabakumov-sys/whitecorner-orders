import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cartTopStructure, createCartSideShelves, extractCartSideShelves, extractCartUmbrellaHolderBounds, preparePlywoodSideThickness, sideShelfSideProfile } from './modeling-side-shelves';
import { createRoundedPart, RoundingProfile } from './modeling-rounding';

export function ownerShelfFixture():THREE.Group {
 const scene=new THREE.Group();
 for(const side of ['left','right'])for(const index of [1,2,3,4,5,6]){
  const min=side==='left'?.016:1.172,max=min+.012;
  // Synthetic fork: its slot fits the 12 mm source side. The two legs and
  // curved/free portions must survive adjustment to a 15 mm plywood side.
  let profile:RoundingProfile={axis:'z',origin:index===5?.468:.096,thickness:.012,
   outline:[[min-.02,.71],[min,.71],[min,.8],[max,.8],[max,.71],[max+.17,.88],[min-.02,.88]],holes:[]};
  if(index<=4){
   const x0=side==='left'?-.2:1.2,x1=x0+.2;
   const a=index===4?(side==='left'?x0:x1-.016):(side==='left'?x0+.016:x0);
   const b=index===4?a+.016:(side==='left'?x1:x1-.016);
   const z0=index===3?.584:index===1?.016:0,z1=index===2?.016:index===1?.584:.6;
   profile={axis:'y',origin:index===1?.884:.855,thickness:index===1?.016:.045,outline:[[a,z0],[b,z0],[b,z1],[a,z1]],holes:[]};
  }
  const mesh=new THREE.Mesh(createRoundedPart(profile,0),new THREE.MeshPhysicalMaterial());
  mesh.name=`Side shelf ${side} ${index}`;mesh.userData['roundingProfile']=profile;scene.add(mesh);
 }
 const profile:RoundingProfile={axis:'x',origin:1.172,thickness:.012,
  outline:[[.016,.239],[.56,.239],[.56,.884],[.48,.884],[.48,.801],[.468,.801],[.468,.884],[.108,.884],[.108,.801],[.096,.801],[.096,.884],[.016,.884]],holes:[]};
 const panel=new THREE.Mesh(createRoundedPart(profile,0),new THREE.MeshPhysicalMaterial());panel.name='Side panel right cutouts';panel.userData['roundingProfile']=profile;scene.add(panel);
 return scene;
}
function topBody(ply:boolean):THREE.Group {
 const body=new THREE.Group();
 const add=(name:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshPhysicalMaterial());mesh.name=name;mesh.position.set(x,y,z);body.add(mesh);return mesh;
 };
 add('Top part1',.6,ply?.8925:.892,.3,1.2,ply?.015:.016,.6);
 add('Top part2',.6,ply?.879:.8775,.3,1.2,ply?.042:.045,.6);
 for(const x of [ply?.0265:.022,ply?1.1735:1.178])add(x<.6?'Left side part1':'Right side part1',x,.5,.3,ply?.015:.012,.7,ply?.562:.544);
 return body;
}
const bounds=(group:THREE.Group,name:string)=>new THREE.Box3().setFromObject(group.getObjectByName(name)!);

describe('Owner side shelf construction',()=>{
 it.each([false,true])('keeps a flush 200 × 600 mm shelf, with the board inside the %s pine border',ply=>{
  const top=cartTopStructure(topBody(ply),true,900,ply),source=extractCartSideShelves(ownerShelfFixture());
  const shelves=createCartSideShelves(source,1200,900,top,1.5);
  for(const side of ['left','right']){
   const panel=bounds(shelves,`Side shelf ${side} 1`),outer=bounds(shelves,`Side shelf ${side} 4`);
   expect(panel.max.x-panel.min.x).toBeCloseTo(ply?.181:.184,6);
   expect(panel.max.z-panel.min.z).toBeCloseTo(ply?.562:.568,6);
   expect(panel.max.y-panel.min.y).toBeCloseTo(ply?.015:.016,6);
   expect(outer.max.x-outer.min.x).toBeCloseTo(ply?.019:.016,6);
   expect(outer.max.y-outer.min.y).toBeCloseTo(ply?.042:.045,6);
   for(const index of [1,2,3,4])expect(bounds(shelves,`Side shelf ${side} ${index}`).max.y).toBeCloseTo(.9,6);
   const leaf=shelves.getObjectByName(`Side shelf ${side} 1`)!;
   const seamX=side==='left'?-.0001:1.2001;
   expect(new THREE.Raycaster(new THREE.Vector3(seamX,1,.3),new THREE.Vector3(0,-1,0)).intersectObject(leaf)[0]?.point.y).toBeLessThan(.8999);
   // The front and rear rails also end at the folding joint, independently
   // of the square glued board-to-rail interfaces within this leaf.
   for(const [index,z] of [[2,.008],[3,.592]]){
    const rail=shelves.getObjectByName(`Side shelf ${side} ${index}`)!;
    expect(new THREE.Raycaster(new THREE.Vector3(seamX,1,z),new THREE.Vector3(0,-1,0)).intersectObject(rail)[0]?.point.y).toBeLessThan(.8999);
   }
   const outerRail=shelves.getObjectByName(`Side shelf ${side} 4`)!;
   const outerX=side==='left'?-.1999:1.3999;
   expect(new THREE.Raycaster(new THREE.Vector3(outerX,1,.3),new THREE.Vector3(0,-1,0)).intersectObject(outerRail)[0]?.point.y).toBeLessThan(.8999);
   const overall=new THREE.Box3();for(const index of [1,2,3,4])overall.union(bounds(shelves,`Side shelf ${side} ${index}`));
   expect(overall.max.x-overall.min.x).toBeCloseTo(.2,6);expect(overall.max.z-overall.min.z).toBeCloseTo(.6,6);
  }
 });
 it('retains 12 mm holders while widening their insertion slots to 15 mm plywood sides',()=>{
  const top=cartTopStructure(topBody(true),true,900),shelves=createCartSideShelves(extractCartSideShelves(ownerShelfFixture()),1200,900,top,0);
  for(const [side,index] of [['left',0],['right',1]] as const)for(const part of [5,6]){
   const mesh=shelves.getObjectByName(`Side shelf ${side} ${part}`) as THREE.Mesh,box=new THREE.Box3().setFromObject(mesh),wall=top.sides[index];
   expect(box.max.z-box.min.z).toBeCloseTo(.012,6);
   const centreZ=(box.min.z+box.max.z)/2;
   const hit=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,.6,centreZ),new THREE.Vector3(0,1,0)).intersectObject(mesh).length;
   mesh.material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
   // Below the slot bridge, both side planes fit between the holder's legs.
   const horizontal=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,.75,centreZ),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length;
   expect(horizontal(wall.min.x+.0001)).toBe(0);expect(horizontal(wall.max.x-.0001)).toBe(0);
   expect(hit(wall.min.x-.005)).toBeGreaterThan(0);expect(hit(wall.max.x+.005)).toBeGreaterThan(0);
  }
 });
 it('cuts matching 12 mm slots 80 mm from both side edges and preserves the source depth',()=>{
  const original:RoundingProfile={axis:'x',origin:.019,thickness:.015,outline:[[.034,.11],[.581,.11],[.581,.885],[.034,.885]],holes:[]};
  const next=sideShelfSideProfile(original,ownerShelfFixture());
  const mesh=new THREE.Mesh(createRoundedPart(next,0),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const hits=(z:number)=>new THREE.Raycaster(new THREE.Vector3(0,.84,z),new THREE.Vector3(1,0,0)).intersectObject(mesh).length;
  expect(hits(.12)).toBe(0);expect(hits(.495)).toBe(0);expect(hits(.13)).toBeGreaterThan(0);expect(hits(.48)).toBeGreaterThan(0);
  expect(next.outline.filter(p=>p[1]<.885&&p[1]>.7).every(p=>Math.abs(p[1]-.802)<1e-6)).toBe(true);
  expect(original.outline).toHaveLength(4);
 });
 it('keeps measured top and side joints independent of camera rotation and pan',()=>{
  const body=topBody(true),root=new THREE.Group();root.add(body);root.rotation.y=1;root.position.set(2,0,-1);
  const top=cartTopStructure(body,true,900);expect(top.panelTop).toBeCloseTo(.9,6);expect(top.sides[0].min.x).toBeCloseTo(.019,6);
 });
 it('corrects source plywood sides to 15 mm and moves their inner reinforcement rails',()=>{
  const scene=new THREE.Group();for(const [name,x] of [['Left side part1',.025],['Left side part2',.037],['Right side part1',1.175],['Right side part2',1.163]] as const){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.012,.7,.55).translate(x,.5,.3));mesh.name=name;scene.add(mesh);}
  preparePlywoodSideThickness(scene);
  expect(bounds(scene,'Left side part1').min.x).toBeCloseTo(.019,6);expect(bounds(scene,'Left side part1').max.x).toBeCloseTo(.034,6);
  expect(bounds(scene,'Right side part1').min.x).toBeCloseTo(1.166,6);expect(bounds(scene,'Right side part1').max.x).toBeCloseTo(1.181,6);
  expect(bounds(scene,'Left side part2').min.x).toBeCloseTo(.034,6);expect(bounds(scene,'Right side part2').max.x).toBeCloseTo(1.166,6);
 });
 it('retains the original umbrella holder bounds and rejects incomplete shelf references',()=>{
  const source=ownerShelfFixture();source.remove(source.getObjectByName('Side shelf right 5')!);expect(()=>extractCartSideShelves(source)).toThrow(/missing right part 5/);
  const scene=new THREE.Group(),holder=new THREE.Mesh(new THREE.BoxGeometry(.075,.016,.075));holder.name='Body5';scene.add(holder);expect(extractCartUmbrellaHolderBounds(scene).getSize(new THREE.Vector3()).x).toBeCloseTo(.075,6);
 });
});
