import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitFurnitureBolts, shortenCastorBrakes, turnCastorWheels } from './modeling-hardware';

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


it('reduces the existing castor brake length a further 20 percent while preserving the fork attachment', () => {
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
    expect(box.max.z - box.min.z).toBeCloseTo(.048 * .65 * .8);
    expect(box.max.x - box.min.x).toBeCloseTo(.022);
    // Avoid repeatedly transforming nodes while adding the next test castor.
    root.clear();
  }
});


it('centres each wheel beneath its mounting plate independently of the brake and turns the assembly 90 degrees', () => {
  const root = new THREE.Group(); root.position.set(.2, .1, -.3); root.rotation.y = .25;
  const tests: { plate: THREE.Mesh; bearing: THREE.Mesh; wheel: THREE.Mesh; fork: THREE.Mesh; brake: THREE.Mesh; pivot: THREE.Vector3; before: THREE.Vector3; plateBefore: THREE.Box3; bearingBefore: THREE.Box3; forkBefore: THREE.Vector3; brakeBefore: THREE.Vector3 }[] = [];
  for (const [i, tag] of ['L_front', 'R_front', 'L_rear', 'R_rear'].entries()) {
    const x = i % 2 ? 1.1 : .1, z = i < 2 ? .55 : .05;
    const make = (suffix: string, size: number[], at: number[]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]));
      mesh.geometry.translate(at[0], at[1], at[2]); mesh.name = `Caster_${tag}_${suffix}`; root.add(mesh); return mesh;
    };
    const plate = make('plate', [.065, .003, .065], [x, .0715, z]);
    const bearing = make('swivel', [.025, .008, .025], [x, .066, z]);
    const wheel = make('nylon_wheel', [.018, .05, .05], [x, .025, z + .012]);
    const fork = make('left_fork', [.003, .03, .03], [x - .012, .045, z + .012]);
    const brake = make('brake_pedal', [.022, .003, .025], [x, .056, z - .018]);
    root.updateWorldMatrix(true, true);
    const plateBefore = new THREE.Box3().setFromObject(plate), bearingBefore = new THREE.Box3().setFromObject(bearing);
    tests.push({ plate, bearing, wheel, fork, brake, pivot: plateBefore.getCenter(new THREE.Vector3()), before: new THREE.Box3().setFromObject(wheel).getCenter(new THREE.Vector3()), plateBefore, bearingBefore, forkBefore: new THREE.Box3().setFromObject(fork).getCenter(new THREE.Vector3()), brakeBefore: new THREE.Box3().setFromObject(brake).getCenter(new THREE.Vector3()) });
  }
  const decorative = new THREE.Mesh(new THREE.BoxGeometry(.35, .35, .03)); decorative.name = 'Decorative_wheel_front'; root.add(decorative);
  const decorativePosition = decorative.geometry.getAttribute('position').clone();
  turnCastorWheels(root);
  for (const test of tests) {
    expect(new THREE.Box3().setFromObject(test.plate).equals(test.plateBefore)).toBe(true);
    expect(new THREE.Box3().setFromObject(test.bearing).equals(test.bearingBefore)).toBe(true);
    const center = new THREE.Box3().setFromObject(test.wheel).getCenter(new THREE.Vector3());
    const expected = new THREE.Vector3(test.pivot.x, test.before.y, test.pivot.z);
    expect(center.distanceTo(expected)).toBeLessThan(1e-6);
    expect(new THREE.Box3().setFromObject(test.wheel).min.y).toBeCloseTo(.1);
    for (const [part, before] of [[test.fork, test.forkBefore], [test.brake, test.brakeBefore]] as const) {
      const relative = before.clone().sub(test.before).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).add(expected);
      expect(new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3()).distanceTo(relative)).toBeLessThan(1e-6);
    }
  }
  expect(Array.from(decorative.geometry.getAttribute('position').array)).toEqual(Array.from(decorativePosition.array));
});
