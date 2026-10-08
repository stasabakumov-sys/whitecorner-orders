import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cartTopStructure, createCartSideShelves, extractCartSideShelves, extractCartUmbrellaHolderBounds } from './modeling-side-shelves';

function sourceScene():THREE.Group {
 const scene=new THREE.Group();
 for(const side of ['left','right'])for(const index of [1,5,6]){
  const part=new THREE.Group();part.name=`Side shelf ${side} ${index}`;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.012,.16,.012),new THREE.MeshPhysicalMaterial());
  mesh.position.set(side==='left'?-.1:1.6,.7,index===5?.13:.47);
  part.add(mesh);scene.add(part);
 }
 const holder=new THREE.Mesh(new THREE.BoxGeometry(.075,.016,.075),new THREE.MeshPhysicalMaterial());
 holder.name='Body5';holder.position.set(.75,.127,.3);scene.add(holder);
 return scene;
}
function topBody(classic:boolean):THREE.Group {
 const body=new THREE.Group(),top=classic?.85:.9;
 const panel=new THREE.Mesh(new THREE.BoxGeometry(1.2,.016,.6),new THREE.MeshPhysicalMaterial());
 panel.name=classic?'Top_part1':'Top_1';panel.position.set(.6,top-.008,.3);body.add(panel);
 const trim=new THREE.Mesh(new THREE.BoxGeometry(1.2,classic?.02:.045,classic?.02:.016),new THREE.MeshPhysicalMaterial());
 trim.name=classic?'Top_part2':'Top_2';trim.position.set(.6,classic?top-.026:top-.0225,.01);body.add(trim);
 return body;
}
const bounds=(group:THREE.Group,name:string)=>new THREE.Box3().setFromObject(group.getObjectByName(name)!);

describe('Side shelves follow each cart top while reusing folding supports',()=>{
 it('keeps a solid Classic leaf above its deep tabletop edging and retains both folding brackets',()=>{
  const body=topBody(true);
  const trim=body.getObjectByName('Top_part2') as THREE.Mesh;
  trim.geometry.dispose();trim.geometry=new THREE.BoxGeometry(1.2,.042,.019);
  trim.position.y=.879;
  const top=cartTopStructure(body,true,900,false);
  expect(top.pineTrim).toBe(false);
  const shelves=createCartSideShelves(extractCartSideShelves(sourceScene()),1200,900,1500,850,top,1.5);
  for(const side of ['left','right']){
   const panel=bounds(shelves,`Side shelf ${side} 1`);
   expect(panel.max.x-panel.min.x).toBeCloseTo(.2,6);
   expect(panel.min.z).toBeCloseTo(0,6);
   expect(panel.max.z).toBeCloseTo(.6,6);
   expect(bounds(shelves,`Side shelf ${side} 5`).max.y).toBeCloseTo(.83,3);
   expect(bounds(shelves,`Side shelf ${side} 6`).max.y).toBeCloseTo(.83,3);
   const join=side==='left'?0:1.2;
   for(const number of [3,4]){
    const member=shelves.getObjectByName(`Side shelf ${side} ${number}`) as THREE.Mesh;
    const positions=member.geometry.getAttribute('position');let capVertices=0;
    for(let i=0;i<positions.count;i++)if(Math.abs(positions.getX(i)-join)<.003001){
      expect(positions.getX(i)).toBeCloseTo(join,6);capVertices++;
    }
    expect(capVertices).toBeGreaterThan(0);
   }
  }
 });
 for(const classic of [true,false])it(`matches the ${classic?'Classic':'decorative-wheel'} top`,()=>{
  const source=extractCartSideShelves(sourceScene());
  expect(source.getObjectByName('Side shelf left 1')).toBeUndefined();
  const top=cartTopStructure(topBody(classic),classic,classic?850:900);
  const shelves=createCartSideShelves(source,1200,classic?850:900,1500,850,top,1.5);
  for(const side of ['left','right']){
   const panel=bounds(shelves,`Side shelf ${side} 1`),rim=bounds(shelves,`Side shelf ${side} 2`);
   expect(panel.max.y).toBeCloseTo(classic?.85:.9,6);
   expect(rim.min.y).toBeCloseTo(classic?.814:.855,6);
   expect(panel.max.x-panel.min.x).toBeCloseTo(.2,6);
   const copied=shelves.getObjectByName(`Side shelf ${side} 5`) as THREE.Mesh;
   const original=source.getObjectByName(copied.name) as THREE.Mesh;
   expect(copied.geometry.getAttribute('position').array).toEqual(original.geometry.getAttribute('position').array);
   expect(copied.geometry).not.toBe(original.geometry);
  }
  expect(bounds(shelves,'Side shelf right 5').min.x).toBeCloseTo(1.2+1.6-.006-1.5,6);
 });
 it('retains the dimensions of the source bottom umbrella holder',()=>{
  expect(extractCartUmbrellaHolderBounds(sourceScene()).getSize(new THREE.Vector3()).x).toBeCloseTo(.075,6);
 });
 it('rejects a source without either folding support',()=>{
  const scene=sourceScene();scene.remove(scene.getObjectByName('Side shelf right 5')!);
  expect(()=>extractCartSideShelves(scene)).toThrow(/missing its right folding support/);
 });
});
