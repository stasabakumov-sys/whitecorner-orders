import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCartSideShelves } from './modeling-side-shelves';

const bounds=(group:THREE.Group,name:string)=>new THREE.Box3().setFromObject(group.getObjectByName(name)!);
describe('Classic and roof cart side shelves',()=>{
 for(const classic of [true,false])for(const radius of [0,3]){
  it(`matches the ${classic?'Classic':'roof'} inset tabletop at radius ${radius}`,()=>{
   const shelves=createCartSideShelves(classic,1200,900,radius);
   for(const side of ['left','right']){
    const rim=bounds(shelves,`Side shelf ${side} 2`),sheet=bounds(shelves,`Side shelf ${side} 1`);
    expect(rim.max.x-rim.min.x).toBeCloseTo(.2,6);
    expect(rim.max.z-rim.min.z).toBeCloseTo(.6,6);
    expect(rim.max.y).toBeCloseTo(.9,6);expect(sheet.max.y).toBeCloseTo(.9,6);
    expect(rim.max.y-rim.min.y).toBeCloseTo(classic?.042:.045,6);
    expect(sheet.max.y-sheet.min.y).toBeCloseTo(classic?.015:.016,6);
    // The hidden panel perimeter remains square: rounding must not open its glued seam.
    expect(sheet.min.x-rim.min.x).toBeCloseTo(classic?.019:.016,6);
    const x=(sheet.min.x+sheet.max.x)/2,z=.3;
    shelves.updateMatrixWorld(true);
    const hits=new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0)).intersectObject(shelves,true);
    expect(hits[0].point.y).toBeCloseTo(.9,6);
    expect(bounds(shelves,`Side shelf ${side} 5`).min.y).toBeGreaterThan(.498);
   }
  });
 }
 it('keeps extensions fixed at 200 mm as the cart gets wider and taller',()=>{
  const shelves=createCartSideShelves(false,1500,1000,0);
  const left=bounds(shelves,'Side shelf left 2'),right=bounds(shelves,'Side shelf right 2');
  expect(left.min.x).toBeCloseTo(-.2,6);expect(left.max.x).toBeCloseTo(0,6);
  expect(right.min.x).toBeCloseTo(1.5,6);expect(right.max.x).toBeCloseTo(1.7,6);
  expect(right.max.y).toBeCloseTo(1,6);
 });
});
