import {describe,it,expect} from 'vitest';
import {WixProductSnapshotComponent} from './wix-product-snapshot.component';

describe('Wix product variant display',()=>{
 it('shows only the chosen backdrop size and construction, retaining colours',()=>{
  const component=new WixProductSnapshotComponent({} as any);
  component.backdrop=true;component.selectedSize='200cm x 120cm';component.selectedFolding='nonfoldable';
  component.product.set({variants:[
   {id:'blue',choices:{Size:{original:'200cm x 120cm'},Foldable:{value:'NO'},Colour:'Blue'}},
   {id:'red',choices:{Size:'200cm x 120cm',Foldable:'NO',Colour:'Red'}},
   {id:'folded',choices:{Size:'200cm x 120cm',Foldable:'YES',Colour:'Blue'}},
   {id:'small',choices:{Size:'200cm x 100cm',Foldable:'NO',Colour:'Blue'}}
  ]});
  expect(component.visibleVariants().map((variant:any)=>variant.id)).toEqual(['blue','red']);
 });
});
