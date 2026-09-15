import {describe,expect,it} from 'vitest';
import {cartSizeFromOptions,cartSizeKey,cartSizeRows} from './cart-size';

describe('Cart size identity',()=>{
 it('keeps each exact Wix size separate while ignoring case and repeated whitespace',()=>{
  expect(cartSizeKey(' Size I  W1200mm x D600mm x H900mm ')).toBe('size i w1200mm x d600mm x h900mm');
  expect(cartSizeRows(['Size I',' size i ','Size II']).map(row=>row.label)).toEqual(['Size I','Size II']);
 });
 it('reads one size from order options',()=>{
  expect(cartSizeFromOptions({Size:'Size III (W1400 x D600 x H1000 mm)',Colour:'White'})).toBe('size iii w1400 x d600 x h1000 mm');
  expect(cartSizeFromOptions({Colour:'White'})).toBe('');
 });
});
