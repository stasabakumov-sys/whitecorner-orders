import * as THREE from 'three';

export const TWO_IN_ONE_CART_SLUG = 'two-in-one-cart-mdf';
export const TWO_IN_ONE_CART_NAME = '2-in-1 Mobile Bar - Event Bar - Mobile Food Service - Charcuterie Cart';
export const SIDE_SHELF_CART_SLUG = 'side-shelf-cart-mdf';

// The 1500 mm cart is the private construction source. Its 13-pan tabletop
// belongs to that product and cannot be shortened into the 1200 mm layout.
// Keep the plain tabletop and all folding body, ice shelf and side shelf parts.
export function prepareTwoInOneCartSource(scene: THREE.Group): void {
  for (const node of [...scene.children]) {
    if (/^Top[ _]part1[ _]cutouts?(?:[ _].*)?$/i.test(node.name)) node.removeFromParent();
  }
}
