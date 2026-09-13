import {describe,expect,it} from 'vitest';
import {currentProductCostProfiles} from './shipping-data.component';

describe('Product card cost profiles',()=>{
  it('hides an optionless legacy-order candidate once a current product variant is known',()=>{
    const rows=[{variant_key:'legacy',kind:'main',options:{}},{variant_key:'current',kind:'main',options:{Size:'200cm x 100cm',Foldable:'YES'}}];
    expect(currentProductCostProfiles(rows).map(row=>row.variant_key)).toEqual(['current']);
  });
  it('keeps a genuine optionless product when it has no optioned replacement',()=>{
    const rows=[{variant_key:'current',kind:'main',options:{}}];
    expect(currentProductCostProfiles(rows)).toEqual(rows);
  });
});
