import {describe,expect,it} from 'vitest';
import {backdropCostProfiles,currentProductCostProfiles} from './shipping-data.component';

describe('Product card cost profiles',()=>{
  it('hides an optionless legacy-order candidate once a current product variant is known',()=>{
    const rows=[{variant_key:'legacy',kind:'main',options:{}},{variant_key:'current',kind:'main',options:{Size:'200cm x 100cm',Foldable:'YES'}}];
    expect(currentProductCostProfiles(rows).map(row=>row.variant_key)).toEqual(['current']);
  });
  it('keeps a genuine optionless product when it has no optioned replacement',()=>{
    const rows=[{variant_key:'current',kind:'main',options:{}}];
    expect(currentProductCostProfiles(rows)).toEqual(rows);
  });
  it('adds an editable Non-foldable material profile when only Foldable exists',()=>{
    const foldable={variant_key:'fold',kind:'main',options:{Size:'200cm x 100cm',Foldable:'YES'},profile:{lines:[{material_id:'mdf',quantity:1}],materials_confirmed:true}};
    const rows=backdropCostProfiles('product','Plane Arch',['200cm x 100cm'],[foldable]);
    expect(rows).toHaveLength(2);expect(rows[0]).toEqual(expect.objectContaining({variant_key:'fold',size_key:'2000x1000',folding:'foldable'}));expect(rows[1]).toEqual(expect.objectContaining({backdrop_material_scope:true,size_key:'2000x1000',folding:'nonfoldable',shipping_product_id:'product'}));
  });
  it('creates material editors from a unitless manual size without relaxing Wix parsing',()=>{
    expect(backdropCostProfiles('product','Plane Arch',['190x100'],[],true).map(row=>[row.size_key,row.folding])).toEqual([['1900x1000','foldable'],['1900x1000','nonfoldable']]);
    expect(backdropCostProfiles('product','Plane Arch',['190x100'],[])).toEqual([]);
  });
  it('uses the saved structural material profile instead of a generated editor row',()=>{
    const saved={variant_key:'saved',kind:'main',options:{Size:'200cm x 100cm',Foldable:'NO'},backdrop_material_scope:true,profile:{materials_confirmed:true}};
    const orderVariant={variant_key:'order',kind:'main',options:{Size:'200cm x 100cm',Foldable:'NO',Colour:'Raw'},profile:{materials_confirmed:true}};
    const rows=backdropCostProfiles('product','Plane Arch',['200cm x 100cm'],[orderVariant,saved]);expect(rows.find(row=>row.folding==='nonfoldable')).toEqual(expect.objectContaining({variant_key:'saved',backdrop_material_scope:true}));
  });
});
