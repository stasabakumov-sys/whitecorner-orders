import {describe,it,expect} from 'vitest';
import {productionCostRows} from './production-cost';
const rates:any=['cnc','assembly','sanding','painting'].map(work_type=>({work_type,rate_gst_hour:60}));
const template=(folding:string,cnc:number,size_key:any=null):any=>({id:folding,product_id:'p',size_key,folding,parts:[{id:'body',component_product_id:'p'},{id:'addon',component_product_id:'addon'}],estimates:{CNC:cnc,'Assembly:body':0,'Sanding:body':0,'Assembly:addon':999,'Sanding:addon':999}});
const profile=(fold:string,quantity:number):any=>({kind:'main',options:{Foldable:fold},profile:{materials_confirmed:true,lines:[{material_id:'m',quantity}]}});
const materials=[{id:'m',active:true,price_gst:10},{id:'paint',active:true,price_gst:5}];
const paint={materials_confirmed:true,lines:[{material_id:'paint',quantity:2}],estimates:{'Painting:First primer':10,'Painting:First sanding':10,'Painting:Finish coat':10}};
const calculate=(templates:any[],profiles:any[],finishes=[false,true])=>productionCostRows(templates,profiles,paint,materials,rates,'Arch Backdrop','p',finishes);
describe('Production comparison',()=>{
 it('reuses one structural cost across sizes and one painting add-on across constructions',()=>{const rows=calculate([template('foldable',60),template('nonfoldable',120)],[profile('YES',2),profile('NO',3)]);expect(rows.map(r=>[r.folding,r.painted,r.materials,r.work,r.total])).toEqual([['foldable',false,20,60,80],['foldable',true,30,90,120],['nonfoldable',false,30,120,150],['nonfoldable',true,40,150,190]]);});
 it('uses one legacy size template only as fallback and never mixes folding options',()=>{const old=template('foldable',60);old.folding=null;const rows=calculate([old,template('foldable',60,'2000x1000')],[profile('YES',2)],[false]);expect(rows[0].total).toBe(80);expect(rows[1].work).toBeNull();expect(rows[1].total).toBeNull();});
 it('treats multiple structural material candidates as incomplete',()=>{const rows=calculate([template('foldable',0)],[profile('YES',2),profile('YES',3)],[false]);expect(rows[0].work).toBe(0);expect(rows[0].materials).toBeNull();expect(rows[0].issues).toContain('Multiple material compositions: review profiles');});
});
