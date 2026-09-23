import {describe,expect,it} from 'vitest';
import {ProductWorkCostComponent} from './product-work-cost.component';

describe('Product card Backdrop production cost',()=>{
 it('does not duplicate production cost by product size',()=>{
  const component=new ProductWorkCostComponent({} as any);
  component.product={id:'product',product_name:'Plane Backdrop'};
  component.sizes=['190x100','180cm x 90cm'];
  expect(component.comparison()).toHaveLength(2);expect(component.comparison().every(row=>!row.painted)).toBe(true);
 });
 it('shows only the selected construction in the product card',()=>{
  const component=new ProductWorkCostComponent({} as any);component.product={id:'product',product_name:'Plane Backdrop'};component.selectedFolding='nonfoldable';
  expect(component.visibleComparison().map(row=>row.folding)).toEqual(['nonfoldable']);
 });
 it('shows Painted only when the Backdrop is explicitly labelled Painted',()=>{
  const component=new ProductWorkCostComponent({} as any);component.product={id:'product',product_name:'Event Arch painted',product_type:'Backdrop'};
  expect(component.comparison()).toHaveLength(2);expect(component.comparison().every(row=>row.painted)).toBe(true);
 });
 it('adds painting when a Paint option appears and keeps Paint No on the Raw path',()=>{
  const component=new ProductWorkCostComponent({} as any);component.product={id:'product',product_name:'Event Arch',product_type:'Backdrop'};
  component.materialProfiles=[{options:{Paint:'Yes'}}];expect(component.comparison()).toHaveLength(2);expect(component.comparison().every(row=>row.painted)).toBe(true);
  component.materialProfiles=[{options:{Paint:'No'}}];expect(component.comparison()).toHaveLength(2);expect(component.comparison().every(row=>!row.painted)).toBe(true);
 });
});

describe('Shared Painting cost for every product',()=>{
 it('keeps legacy Painting out of RAW and uses only the shared profile for Painted',()=>{const component=new ProductWorkCostComponent({} as any);component.product={id:'product',product_name:'Portable Table',backdrop_paint_profile:{estimates:{'Painting:First primer':20,'Painting:First sanding':10,'Painting:Second primer':5,'Painting:Second sanding':5,'Painting:Finish coat':15}}};component.rates=['cnc','assembly','sanding','painting'].map((work_type,i)=>({work_type,label:work_type,rate_gst_hour:60,sort_order:i,updated_at:''})) as any;const template:any={parts:[{id:'body'}],estimates:{CNC:10,'Assembly:body':10,'Sanding:body':10,'Painting:First primer':999}};expect(component.rows(template,false).map(row=>row.key)).toEqual(['CNC','Assembly','Sanding']);expect(component.total(template,false)).toBe(30);expect(component.total(template,true)).toBe(85);});
});
