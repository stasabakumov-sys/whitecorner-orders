import {describe,expect,it} from 'vitest';
import {backdropCostProfiles,cartCostProfileLabel,cartCostProfiles,currentProductCostProfiles} from './shipping-data.component';

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
  it('shows one Cart base plus both independent option editors',()=>{
    const product='cart-product';
    const base={variant_key:'["catalog-v4-cart-base", "cart-product", "size i", "complete"]',kind:'main',item_id:'item',main_item_id:'item',options:{Size:'Size I',Colour:'White'}};
    const legacy={variant_key:'["catalog-v2", "old"]',kind:'main',options:{Colour:'White','Internal Shelf':'Yes'}};
    const internal={...base,variant_key:'["catalog-v4-cart-option", "cart-product", "size i", "internal shelf", "yes"]',kind:'option:Internal Shelf',options:{'Internal Shelf':'Yes'},profile:{materials_confirmed:true}};
    const rows=cartCostProfiles(product,[legacy,base,internal],'size i');
    expect(rows.map(row=>[row.kind,row.variant_key])).toEqual([
      ['main',base.variant_key],
      ['option:Internal Shelf',internal.variant_key],
      ['option:Side shelves','["catalog-v4-cart-option", "cart-product", "size i", "side shelves", "yes"]']
    ]);
    expect(rows[1].profile).toEqual(internal.profile);
    expect(rows[2]).toEqual(expect.objectContaining({item_id:'item',main_item_id:'item',options:{'Side shelves':'Yes'},profile:null}));
    expect(rows.map(cartCostProfileLabel)).toEqual(['Main','Shelf','Side shelves']);
  });
  it('does not reuse one Cart size profile as another size',()=>{
    const source={variant_key:'["catalog-v4-cart-base", "cart-product", "size i", "complete"]',kind:'main',item_id:'item',main_item_id:'item',options:{Size:'Size I'},profile:{lines:[{material_id:'old'}]},legacy_lines:[{material_id:'old'}]};
    const rows=cartCostProfiles('cart-product',[source],'size ii');
    expect(rows).toHaveLength(3);expect(rows[0]).toEqual(expect.objectContaining({options:{Size:'size ii'},profile:null,legacy_lines:null}));
  });
});
