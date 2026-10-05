import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitFurnitureBolts } from './modeling-hardware';

describe('Furniture wheel bolts', () => {
  it('places smooth heads outside both wheels and nuts inside the rails', () => {
    const root = new THREE.Group();
    for (const side of ['front', 'rear']) for (const suffix of ['bolt_head', 'M10_axle_bolt', 'nut']) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .008), new THREE.MeshStandardMaterial());
      if (suffix === 'nut') mesh.geometry.translate(1.047, .2530002, side === 'front' ? .632 : -.032);
      mesh.name = `Decorative_wheel_${side}_${suffix}`; root.add(mesh);
    }
    fitFurnitureBolts(root);
    for (const side of ['front', 'rear']) {
      const head = root.getObjectByName(`Decorative_wheel_${side}_bolt_head`) as THREE.Mesh;
      head.geometry.computeBoundingBox(); const box = head.geometry.boundingBox!;
      expect(box.max.x - box.min.x).toBeCloseTo(.024);
      expect(side === 'front' ? box.min.z : box.max.z).toBeCloseTo(side === 'front' ? .626 : -.028);
      const nut = root.getObjectByName(`Decorative_wheel_${side}_nut`) as THREE.Mesh;
      nut.geometry.computeBoundingBox();
      expect(nut.geometry.boundingBox!.getCenter(new THREE.Vector3()).z).toBeCloseTo(side === 'front' ? .578 : .022);
      expect(root.getObjectByName(`Decorative_wheel_${side}_square_neck`)).toBeDefined();
    }
  });
});
