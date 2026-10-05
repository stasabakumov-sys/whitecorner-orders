import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createRoofBottom, glassRackLayout} from './modeling-roof';
describe('Closed MDF roof',()=>{
 it.each([0,.3])('fits a 12 mm panel with four real post cutouts at length delta %s',dx=>{
 const skirt=new THREE.Box3(new THREE.Vector3(.012,1.81,.012),new THREE.Vector3(1.188+dx,1.918,.588));
 const posts=[.0615,1.0965+dx].flatMap(x=>[.0735,.4845].map(z=>new THREE.Box3(new THREE.Vector3(x,.784,z),new THREE.Vector3(x+.042,1.918,z+.042))));
 const g=createRoofBottom(skirt,posts);expect(g.boundingBox!.min.y).toBeCloseTo(1.81);expect(g.boundingBox!.max.y).toBeCloseTo(1.822);expect(g.boundingBox!.max.x).toBeCloseTo(1.188+dx);
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),ray=new THREE.Raycaster();
 for(const post of posts){const c=post.getCenter(new THREE.Vector3());ray.set(new THREE.Vector3(c.x,1.7,c.z),new THREE.Vector3(0,1,0));expect(ray.intersectObject(mesh)).toHaveLength(0);}
 ray.set(new THREE.Vector3(.6,1.7,.3),new THREE.Vector3(0,1,0));expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
 });
});

it('keeps rack edge insets, updates clearance and limits count on resizing',()=>{
 const layout=glassRackLayout(1200,6);expect(layout.centres[0]-52.5).toBe(120);expect(1200-layout.centres.at(-1)!-52.5).toBe(120);expect(layout.gap).toBe(66);expect(layout.bowlDiameter).toBe(167);
 expect(glassRackLayout(1500,6).bowlDiameter).toBeGreaterThan(layout.bowlDiameter!);expect(glassRackLayout(1200,20).centres).toHaveLength(9);expect(glassRackLayout(1200,1).centres).toEqual([600]);
});
