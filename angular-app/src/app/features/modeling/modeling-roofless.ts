import * as THREE from 'three';
import { createRoundedPart, RoundingProfile } from './modeling-rounding';

export const ROOFLESS_CART_SLUG = 'decorative-wheel-cart-mdf';
export const ROOF_CART_SLUG = 'decorative-wheel-roof-cart-mdf';
export const ROOFLESS_CART_NAME = 'MDF Mobile Bar Cart with Decorative Wheels – Foldable Serving Cart';

export function rooflessCartPartIncluded(name: string): boolean {
  return !/^(?:Roof[ _]\d+|Dar[ _]?\d+|Legs[ _]?\d+|Top[ _][3-6])\s*$/i.test(name);
}

// The roof GLB is a private construction source. The roofless model retains its
// own identity and derives only the cart body; the four post mortises are closed.
export function prepareRooflessCartSource(scene: THREE.Group): void {
  for (const node of [...scene.children]) {
    if (!rooflessCartPartIncluded(node.name)) {
      node.removeFromParent();
      continue;
    }
    if (!/^Top[ _]1$/i.test(node.name)) continue;
    node.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const source = child.userData['roundingProfile'] as RoundingProfile | undefined;
      if (!source) throw new Error('The tabletop profile is missing. Upload a complete roof cart model.');
      const profile = { ...source, holes: [] };
      const geometry = createRoundedPart(profile, 0);
      child.geometry.dispose();
      child.geometry = geometry;
      child.userData['roundingProfile'] = profile;
      const face = Array.isArray(child.material) ? child.material[0] : child.material;
      child.material = [face, face];
    });
  }
}
