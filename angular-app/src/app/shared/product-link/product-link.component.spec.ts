import {TestBed} from '@angular/core/testing';
import {ProductLinkComponent,productLink} from './product-link.component';
import {productNavigationMatches} from '../../core/utils/product-navigation';

describe('Product navigation',()=>{
 it('links by Wix catalogue identity and safely encodes product names',()=>{
  const href=productLink({id:'order-line',product_name:'Arch & shelf #1',catalog_reference:{catalogItemId:'wix-product'}});
  const params=new URLSearchParams(href.split('?')[1]);
  expect(params.get('wixProductId')).toBe('wix-product');expect(params.get('product')).toBe('Arch & shelf #1');expect(params.has('productId')).toBe(false);
  expect(new URLSearchParams(productLink({shipping_product_id:'local',product_name:'Arch'}).split('?')[1]).get('productId')).toBe('local');
 });
 it('resolves Wix IDs before names, supports unbound legacy products and does not select an ambiguous match',()=>{
  const rows=[{id:'a',wix_product_id:'one',product_name:'Arch'},{id:'b',wix_product_id:'two',product_name:'Arch'}];
  expect(productNavigationMatches(rows,new URLSearchParams({wixProductId:'two',product:'Arch'})).map(p=>p.id)).toEqual(['b']);
  expect(productNavigationMatches(rows,new URLSearchParams({wixProductId:'missing',product:'Arch'}))).toEqual([]);
  expect(productNavigationMatches(rows,new URLSearchParams({product:'Arch'}))).toHaveLength(2);
  expect(productNavigationMatches([{id:'legacy',product_name:'Arch'}],new URLSearchParams({wixProductId:'one',product:'Arch'}))).toHaveLength(1);
 });
 it('keeps keyboard navigation and prevents card click or drag handlers from firing',()=>{
  const fixture=TestBed.createComponent(ProductLinkComponent);fixture.componentInstance.item={product_name:'Backdrop'};fixture.detectChanges();
  const host=fixture.nativeElement as HTMLElement,link=host.querySelector('a')!;
  let bubbled=0;for(const event of ['click','keydown','dragstart'])host.addEventListener(event,()=>bubbled++);
  const click=new MouseEvent('click',{bubbles:true,cancelable:true});
  // Prevent actual navigation in the fixture without changing production behavior.
  link.addEventListener('click',event=>event.preventDefault());link.dispatchEvent(click);
  const key=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});link.dispatchEvent(key);
  const drag=new Event('dragstart',{bubbles:true,cancelable:true});link.dispatchEvent(drag);
  expect(bubbled).toBe(0);expect(key.defaultPrevented).toBe(false);expect(drag.defaultPrevented).toBe(true);
  expect(link.getAttribute('href')).toContain('#/shipping-data?');
 });
});
