import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitFurnitureBolts, shortenCastorBrakes } from './modeling-hardware';

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


it('shortens all castor stops 35 percent while preserving the fork attachment', () => {
  const root = new THREE.Group();
  for (const tag of ['L_front', 'R_front', 'L_rear', 'R_rear']) {
    const center = tag.endsWith('front') ? .5 : .1;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.065, .003, .065));
    plate.geometry.translate(0, .0715, center); plate.name = `Caster_${tag}_plate`; root.add(plate);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(.022, .003, .048));
    brake.geometry.translate(0, .0525, center - .018); brake.name = `Caster_${tag}_brake_linkage`; root.add(brake);
    shortenCastorBrakes(root);
    const box = brake.geometry.boundingBox!;
    expect(box.max.z).toBeCloseTo(center + .006);
    expect(box.max.z - box.min.z).toBeCloseTo(.048 * .65);
    expect(box.max.x - box.min.x).toBeCloseTo(.022);
    // Avoid repeatedly transforming nodes while adding the next test castor.
    root.clear();
  }
});
