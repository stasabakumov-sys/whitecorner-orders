import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AssemblyController, AssemblyState, assemblyPartKey } from './modeling-assembly';

describe('Assembly preview', () => {
  it('releases the walls only after both caps are clear and keeps the shelf fixed', () => {
    const state = new AssemblyState();
    state.move('front', 200); expect(state.offsets.front).toBe(0);
    state.move('top', 80); expect(state.canMove('front')).toBe(false);
    state.move('bottom', 80); state.move('front', 200); state.move('left', 180);
    expect(state.offsets.front).toBe(200);
    state.move('shelf', 200); expect(state.offsets.shelf).toBe(0);
    state.restore('top');
    expect(state.offsets.front).toBe(0); expect(state.offsets.left).toBe(0);
    expect(state.offsets.bottom).toBe(80);
    state.restore(); expect(Object.values(state.offsets).every(value => value === 0)).toBe(true);
  });
  it('treats hidden caps as removed and safely closes walls when a cap reappears', () => {
    const state = new AssemblyState();
    state.selected = 'top'; state.setVisible('top', false); state.setVisible('bottom', false);
    expect(state.selected).toBeNull(); state.move('right', 900);
    expect(state.offsets.right).toBe(500);
    state.setVisible('top', true); expect(state.offsets.right).toBe(0);
    state.move('top', -10); expect(state.offsets.top).toBe(0);
  });
  it('groups both panel and trim, and reapplies displacement once after a geometry rebuild', () => {
    expect(assemblyPartKey('Top_part2')).toBe('top');
    expect(assemblyPartKey('Buttom part1')).toBe('bottom');
    expect(assemblyPartKey('Front moulding')).toBe('front');
    expect(assemblyPartKey('Front_part3')).toBe('front');
    const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
    const canvas = document.createElement('canvas');
    const controller = new AssemblyController(scene, new THREE.PerspectiveCamera(), canvas, { enabled: true }, () => {});
    const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.6), new THREE.MeshStandardMaterial());
    top.name = 'Top_part1'; root.add(top); controller.bind(root, [top]);
    controller.select('top'); controller.move(150);
    expect(top.position.y).toBeCloseTo(0.15);
    const replacement = top.clone(); top.removeFromParent(); root.add(replacement);
    controller.bind(root, [replacement]); expect(replacement.position.y).toBeCloseTo(0.15);
    controller.setVisible('top', false); expect(replacement.visible).toBe(false);
    controller.setVisible('top', true); controller.restore('top');
    expect(replacement.visible).toBe(true); expect(replacement.position.y).toBe(0);
    controller.dispose(); top.geometry.dispose(); (top.material as THREE.Material).dispose();
  });
});
