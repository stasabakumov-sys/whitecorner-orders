import {describe,it,expect} from 'vitest';
import {shippingProfileCatalog,savedProfileOptions} from '../utils/shipping-profile-catalog';
const profile=(signature='s')=>({signature,packages:[{package_name:'Box',length_mm:1000,contents:[{component_key:'main',product_name:'Roof cart',wix_product_id:'catalog',profile_item_key:'["catalog",["size ii","colour white"]]:0'}]}]});
describe('Unified persisted packaging catalogue',()=>{
 it('shows unlinked order profiles without creating duplicate storage or losing measurements',()=>{
  const p=profile(),rows=shippingProfileCatalog([{id:'other',product_name:'Other cart'}],[p]);expect(rows).toHaveLength(2);expect(rows[1].product_name).toBe('Roof cart');expect(rows[1].saved_profiles[0]).toBe(p);expect(rows[1].saved_profiles[0].packages[0].length_mm).toBe(1000);expect(rows[1].saved_only).toBe(true);
 });
 it('groups variants under the matching product rather than duplicating products',()=>{
  const rows=shippingProfileCatalog([{id:'correct',wix_product_id:'catalog',product_name:'Renamed cart'}],[profile('size1'),profile('size2')]);expect(rows).toHaveLength(1);expect(rows[0].saved_profiles).toHaveLength(2);
 });
 it('retains whole shared-box profiles instead of splitting them into unsafe product templates',()=>{
  const p=profile();p.packages[0].contents.push({component_key:'main',product_name:'Other',wix_product_id:'other',profile_item_key:'["other",[]]:0'});const rows=shippingProfileCatalog([],[p]);expect(rows).toHaveLength(2);for(const row of rows)expect(row.saved_profiles[0].packages[0].contents).toHaveLength(2);
 });
 it('displays saved variant options',()=>expect(savedProfileOptions(profile())).toBe('size ii · colour white'));
});
