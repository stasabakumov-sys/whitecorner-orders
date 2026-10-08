import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareRoofSideShelfCartSource, roofSideShelfHeight, roofSideShelfTopProfile, ROOF_SIDE_SHELF_CUTOUTS } from './modeling-roof-side-shelf';

const topRay=(mesh:THREE.Mesh,x:number,z:number)=>new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length;

describe('1200 mm roof cart top from the supplied drawing',()=>{
  it('places two 42 mm square post openings on both plain and ten-pan tops',()=>{
    for(const cutouts of [false,true]){
      const profile=roofSideShelfTopProfile(.834,.016,cutouts);
      expect(profile.outline).toEqual([[0,0],[1.2,0],[1.2,.6],[0,.6]]);
      expect(profile.holes).toHaveLength(cutouts?12:2);
      for(const [index,x] of [67.5,1132.5].entries()){
        const hole=profile.holes[index];
        expect(Math.max(...hole.map(point=>point[0]))-Math.min(...hole.map(point=>point[0]))).toBeCloseTo(.042,6);
        expect(Math.max(...hole.map(point=>point[1]))-Math.min(...hole.map(point=>point[1]))).toBeCloseTo(.042,6);
        expect((Math.max(...hole.map(point=>point[0]))+Math.min(...hole.map(point=>point[0])))/2).toBeCloseTo(x/1000,6);
        expect((Math.max(...hole.map(point=>point[1]))+Math.min(...hole.map(point=>point[1])))/2).toBeCloseTo(.3,6);
      }
    }
    expect(ROOF_SIDE_SHELF_CUTOUTS).toHaveLength(10);
  });

  it('keeps the 150 cm source body but replaces its top and adds two through posts with lower holders',()=>{
    const scene=new THREE.Group();
    const top=new THREE.Mesh(new THREE.BoxGeometry(1.5,.016,.6).translate(.75,.842,.3),new THREE.MeshPhysicalMaterial());
    top.name='Top_part1';scene.add(top);
    const oldCutouts=new THREE.Mesh(new THREE.BoxGeometry(1.5,.016,.6),new THREE.MeshPhysicalMaterial());
    oldCutouts.name='Top_part1_cutouts';scene.add(oldCutouts);
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.5,.6,.016),new THREE.MeshPhysicalMaterial());body.name='Front_part1';scene.add(body);
    prepareRoofSideShelfCartSource(scene);
    expect(scene.children).toContain(body);
    expect(scene.children).not.toContain(top);
    expect(scene.children).not.toContain(oldCutouts);
    const plain=scene.getObjectByName('Top part1') as THREE.Mesh;
    const cutouts=scene.getObjectByName('Top part1 cutouts') as THREE.Mesh;
    expect(topRay(plain,.0675,.3)).toBe(0);
    expect(topRay(plain,.15,.1)).toBeGreaterThan(0);
    expect(topRay(cutouts,.25,.2)).toBe(0);
    expect(topRay(cutouts,.15,.01)).toBeGreaterThan(0);
    expect(scene.children.filter(part=>/^Dar\d+$/.test(part.name))).toHaveLength(2);
    expect(scene.children.filter(part=>/^Top [34]$/.test(part.name))).toHaveLength(2);
    const roof=new THREE.Box3();for(const part of scene.children.filter(part=>/^Roof \d+$/.test(part.name)))roof.union(new THREE.Box3().setFromObject(part));
    expect(roof.max.y).toBeCloseTo(1.93,6);
    expect(roof.min.y).toBeCloseTo(1.8,6);
    expect(roofSideShelfHeight(.85,850)).toBeCloseTo(.85,6);
    expect(roofSideShelfHeight(1.93,850)).toBeCloseTo(1.93,6);
    expect(roofSideShelfHeight(.85,950)).toBeCloseTo(.95,6);
    expect(roofSideShelfHeight(1.8,950)).toBeCloseTo(1.85,6);
    expect(roofSideShelfHeight(1.93,950)).toBeCloseTo(1.968,6);
  });
});
