import {describe,expect,it} from 'vitest';
import {ProductWorkCostComponent} from './product-work-cost.component';

describe('Product card production cost sizes',()=>{
 it('compares a unitless manual backdrop size while leaving imported sizes strict',()=>{
  const component=new ProductWorkCostComponent({} as any);
  component.product={id:'product',product_name:'Plane Backdrop'};
  component.sizes=['190x100'];
  component.manualSizes=true;
  expect(component.comparison()).toHaveLength(4);
  expect(component.comparison().every(row=>row.size==='1900x1000')).toBe(true);
  component.manualSizes=false;
  expect(component.comparison()).toEqual([]);
 });
});
