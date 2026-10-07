import { expect,it } from 'vitest';
import * as THREE from 'three';
import {umbrellaDiameterLimit,withUmbrellaHole,createUmbrellaPreview} from './modeling-umbrella';
import {createRoundedPart,RoundingProfile} from './modeling-rounding';
it('limits the centred hole to clear tray flanges',()=>{expect(umbrellaDiameterLimit()).toBe(50);});
it('creates an open through hole with the requested diameter and preserves existing cutouts',()=>{
 const source:RoundingProfile={axis:'y',origin:.834,thickness:.016,outline:[[0,0],[1.5,0],[1.5,.6],[0,.6]],holes:[]};
 const profile=withUmbrellaHole(source,40),geometry=createRoundedPart(profile,0),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
 const ray=new THREE.Raycaster(new THREE.Vector3(.75,1,.3),new THREE.Vector3(0,-1,0));expect(ray.intersectObject(mesh)).toHaveLength(0);ray.ray.origin.x=.78;expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);expect(profile.holes[0][0][0]).toBeCloseTo(.77);expect(source.holes).toHaveLength(0);
});

it('builds a proportional octagonal umbrella with a pole that fits the chosen hole',()=>{const umbrella=createUmbrellaPreview(38),bounds=new THREE.Box3().setFromObject(umbrella);expect(bounds.max.x-bounds.min.x).toBeCloseTo(2.3);expect(bounds.max.y).toBeCloseTo(2.54);expect((umbrella.children[0] as THREE.Mesh).geometry.boundingBox).toBeDefined();});
