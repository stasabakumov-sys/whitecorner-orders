import {it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {ModelingFourViews,frontFacingRotation} from './modeling-four-views';

it('renders three fixed elevations and an interactive perspective, restoring the main viewport and model rotation',()=>{
 const renderer={setViewport:vi.fn(),setScissor:vi.fn(),setScissorTest:vi.fn(),render:vi.fn()},scene=new THREE.Scene(),turntable=new THREE.Group();scene.add(turntable);turntable.rotation.y=1.2;
 const camera=new THREE.PerspectiveCamera(42,2,.01,30);camera.position.set(2,2,3);camera.setViewOffset(1000,600,130,0,1000,600);
 const rotations:number[]=[];renderer.render.mockImplementation(()=>rotations.push(turntable.rotation.y));
 new ModelingFourViews().render(renderer as unknown as THREE.WebGLRenderer,scene,camera,turntable,1000,600,740,new THREE.Vector3(.6,.45,.3),1.6,true);
 expect(renderer.render).toHaveBeenCalledTimes(4);expect(rotations).toEqual([Math.PI,1.2,Math.PI,Math.PI]);expect(turntable.rotation.y).toBe(1.2);
 expect(renderer.setViewport).toHaveBeenLastCalledWith(0,0,1000,600);expect(renderer.setScissorTest).toHaveBeenLastCalledWith(false);
 const cameras=renderer.render.mock.calls.map(call=>call[1] as THREE.Camera);
 expect(cameras.map(c=>(c as THREE.OrthographicCamera).isOrthographicCamera===true)).toEqual([true,false,true,true]);
 expect(cameras[2].position.z).toBeGreaterThan(0);expect(camera.view?.enabled).toBe(true);
});
it('restores the renderer even if one projection fails',()=>{
 const renderer={setViewport:vi.fn(),setScissor:vi.fn(),setScissorTest:vi.fn(),render:vi.fn(()=>{throw Error('render failed');})},group=new THREE.Group();group.rotation.y=.7;
 expect(()=>new ModelingFourViews().render(renderer as unknown as THREE.WebGLRenderer,new THREE.Scene(),new THREE.PerspectiveCamera(),group,600,500,600,new THREE.Vector3(),1.2,false)).toThrow('render failed');
 expect(group.rotation.y).toBe(.7);expect(renderer.setScissorTest).toHaveBeenLastCalledWith(false);
});

it('normalizes both asset conventions to the same front-facing world normal',()=>{
 for(const classic of [true,false]){
  const outward=new THREE.Vector3(0,0,classic?-1:1).applyAxisAngle(new THREE.Vector3(0,1,0),frontFacingRotation(classic));
  expect(outward.x).toBeCloseTo(0,6);expect(outward.z).toBeCloseTo(1,6);
 }
});
