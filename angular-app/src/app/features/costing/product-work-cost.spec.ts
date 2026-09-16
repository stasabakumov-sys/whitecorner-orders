import {describe,expect,it} from 'vitest';
import {ProductWorkCostComponent} from './product-work-cost.component';

describe('Product card Backdrop production cost',()=>{
 it('does not duplicate production cost by product size',()=>{
  const component=new ProductWorkCostComponent({} as any);
  component.product={id:'product',product_name:'Plane Backdrop'};
  component.sizes=['190x100','180cm x 90cm'];
  expect(component.comparison()).toHaveLength(2);expect(component.comparison().every(row=>!row.painted)).toBe(true);
 });
 it('shows Painted only when the Backdrop is explicitly labelled Painted',()=>{
  const component=new ProductWorkCostComponent({} as any);component.product={id:'product',product_name:'Event Arch painted',product_type:'Backdrop'};
  expect(component.comparison()).toHaveLength(2);expect(component.comparison().every(row=>row.painted)).toBe(true);
 });
});
