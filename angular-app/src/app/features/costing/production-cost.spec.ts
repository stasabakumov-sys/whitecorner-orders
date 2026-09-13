import {describe,it,expect} from 'vitest';
import {productionCostRows} from './production-cost';
const rates:any=['cnc','assembly','sanding','painting'].map(work_type=>({work_type,rate_gst_hour:60}));
const template=(folding:string,cnc:number):any=>({id:folding,product_id:'p',size_key:'2000x1000',folding,parts:[{id:'body',component_product_id:'p'},{id:'addon',component_product_id:'addon'}],estimates:{CNC:cnc,'Assembly:body':0,'Sanding:body':0,'Assembly:addon':999,'Sanding:addon':999,'Painting:First primer':10,'Painting:First sanding':10,'Painting:Finish coat':10}});
const profile=(fold:string,quantity:number):any=>({kind:'main',options:{Size:'200cm x 100cm',Foldable:fold},profile:{materials_confirmed:true,lines:[{material_id:'m',quantity}]}});
const materials=[{id:'m',active:true,price_gst:10}];
const calculate=(templates:any[],profiles:any[])=>productionCostRows(['2000x1000'],templates,profiles,materials,rates,'Arch Backdrop','p');
describe('Production comparison',()=>{
 it('uses separate folding minutes and materials, excludes optional add-ons and raw painting',()=>{const rows=calculate([template('foldable',60),template('nonfoldable',120)],[profile('YES',2),profile('NO',3)]);expect(rows.map(r=>[r.folding,r.painted,r.materials,r.work,r.total])).toEqual([['foldable',false,20,60,80],['foldable',true,20,90,110],['nonfoldable',false,30,120,150],['nonfoldable',true,30,150,180]]);});
 it('does not reuse legacy, wrong-size or other-folding estimates',()=>{const old=template('foldable',60);old.size_key=null;old.folding=null;const rows=calculate([old,template('foldable',60)],[profile('YES',2)]);expect(rows[0].total).toBe(80);expect(rows[2].work).toBeNull();expect(rows[2].total).toBeNull();});
 it('distinguishes explicit zero from missing time and conflicting colour materials',()=>{const t=template('foldable',0);delete t.estimates['Painting:Finish coat'];const p=profile('YES',2);p.shared_parts=[p,{...profile('YES',3)}];const rows=calculate([t],[p]);expect(rows[0].work).toBe(0);expect(rows[1].work).toBeNull();expect(rows[0].materials).toBeNull();expect(rows[0].issues).toContain('Material profiles disagree across colours');});
});
