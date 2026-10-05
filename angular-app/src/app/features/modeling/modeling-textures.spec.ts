import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addTopFinishUvs, groupTopFacesAndEdges, groupShakerRecess } from './modeling-textures';

describe('Image finishes on horizontal tops', () => {
  it('runs oak grain along the tabletop length without stretching its scale', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, .9, 0, 1.2, .9, 0, 1.5, .9, .6], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    addTopFinishUvs(geometry);
    const uv = geometry.getAttribute('uv2');
    expect(uv.getX(0)).toBe(uv.getX(1));
    expect(uv.getY(1) - uv.getY(0)).toBeCloseTo(1.2);
    expect(uv.getY(2) - uv.getY(1)).toBeCloseTo(.3);
    expect(uv.getX(2)).toBeCloseTo(.6);
    geometry.dispose();
  });
  it('turns socket grain vertically without altering the tabletop or plywood edge UVs', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([.05, .772, .06, .05, .884, .06, .05, .884, .126], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
    addTopFinishUvs(geometry);
    const oldUv = geometry.getAttribute('uv2').clone(), edges = Array.from(geometry.getAttribute('uv3').array);
    addTopFinishUvs(geometry, true);
    const uv = geometry.getAttribute('uv2');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(oldUv.getY(i));
      expect(uv.getY(i)).toBeCloseTo(-oldUv.getX(i));
    }
    expect(uv.getX(1)).toBeCloseTo(uv.getX(0));
    expect(uv.getY(1) - uv.getY(0)).toBeCloseTo(-.112);
    expect(Array.from(geometry.getAttribute('uv3').array)).toEqual(edges);
    geometry.dispose();
  });
  it('uses the layered texture only across panel edges without changing geometry', () => {
    const geometry = new THREE.BoxGeometry(1.2, .015, .6);
    const before = Array.from(geometry.getAttribute('position').array);
    groupTopFacesAndEdges(geometry); addTopFinishUvs(geometry);
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(before);
    const normal = geometry.getAttribute('normal'), index = geometry.getIndex()!;
    for (const group of geometry.groups) for (let i = group.start; i < group.start + group.count; i++) {
      expect(group.materialIndex).toBe(Math.abs(normal.getY(index.getX(i))) > .5 ? 0 : 1);
    }
    expect(geometry.groups.reduce((sum, group) => sum + group.count, 0)).toBe(index.count);
    expect(geometry.getAttribute('uv3').count).toBe(normal.count);
    geometry.dispose();
  });
});

it('Shaker contrast selects only the outward plane without changing geometry', () => {
 const g = new THREE.BoxGeometry(1.168, .645, .012), positions = Array.from(g.attributes['position'].array);
 groupShakerRecess(g);
 for (const group of g.groups) for (let i=group.start;i<group.start+group.count;i++) expect(group.materialIndex===2).toBe(g.attributes['normal'].getZ(g.index!.getX(i))>.99);
 expect(Array.from(g.attributes['position'].array)).toEqual(positions);
 expect(g.groups.reduce((sum,group)=>sum+group.count,0)).toBe(g.index!.count);
 const groups=JSON.stringify(g.groups);groupShakerRecess(g);expect(JSON.stringify(g.groups)).toBe(groups);
});
