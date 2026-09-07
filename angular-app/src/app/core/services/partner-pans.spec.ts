import {describe,it,expect,vi} from 'vitest';
import {orderItemOptionLabels,packageComponents,partnerPans,restoreReviewPackages} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {PartnerPansService} from './partner-pans.service';
import {PartnerPansComponent} from '../../features/partner-pans/partner-pans.component';

describe('Partner supplied Pans',()=>{
 it('keeps Pans in composition but never in packaging, including without-pans variants',()=>{
  for(const Pans of ['Cart without pans','6 metal pans','Yes']){
   const item={id:'i',product_name:'Cart',quantity:2,wix_options:{Pans,'Internal Shelf':'Yes'}};
   expect(orderItemOptionLabels(item)).toContain('Pans: '+Pans);
   expect(packageComponents([item]).map(c=>c.component_key)).toEqual(['main','main','option:internal shelf','option:internal shelf']);
  }
 });
 it('uses Wix raw/catalog/description fields, deduplicates and excludes negative selections',()=>{
  const item={id:'i',quantity:3,wix_options:{Pans:'6 pans'},description_lines:[{name:{original:'Pans'},plainText:{original:'6 pans'}}],raw_item:{catalogReference:{options:{options:{Pans:'6 pans'}}}}};
  expect(partnerPans(item).choices).toEqual(['6 pans']);expect(partnerPans(item).quantity).toBe(3);
  for(const Pans of ['Cart without pans','Without pans','No','None','0','No pans'])expect(partnerPans({id:'i',wix_options:{Pans}}).choices).toEqual([]);
  expect(partnerPans({id:'i',wix_options:{'Side panels':'Yes'}}).choices).toEqual([]);
  expect(partnerPans({...item,quantity:4}).key).not.toBe(partnerPans(item).key);
 });
 it('restores cart and addons without historical Pans components',()=>{
  const item={id:'i',wix_options:{Pans:'Yes',Shelf:'Yes'}};const c=packageComponents([item]);
  const old={...c[0],component_key:'option:pans',component_name:'Pans'};
  expect(restoreReviewPackages([{contents:[...c,old]}],packageComponents([{...item,id:'next'}]))[0].contents.map(c=>c.component_key)).toEqual(['main','option:shelf']);
 });
 it('leaves ordinary products untouched',()=>expect(packageComponents([{id:'i',product_name:'Stand'}])).toHaveLength(1));
 it('preserves state on error and suppresses repeated writes; no external functions',async()=>{
  let resolve:any;const rpc=vi.fn(()=>new Promise(r=>resolve=r)),s=new PartnerPansService({client:{rpc}} as any);
  const row={item:{id:'i'},pans:{key:'k'},status:'pending'};s.rows.set([row]);
  const saving=s.setStatus(row,'ordered_and_sent');expect(await s.setStatus(row,'ordered_and_sent')).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);
  resolve({error:{message:'Stale item'}});expect(await saving).toBe(false);expect(s.rows()[0].status).toBe('pending');expect(s.error()).toBe('Stale item');
  rpc.mockImplementation(async()=>({data:{status:'ordered_and_sent',selection_key:'k'}}));expect(await s.setStatus(row,'ordered_and_sent')).toBe(true);expect(s.rows()[0].status).toBe('ordered_and_sent');
 });
 it('loads persisted status and resets changed selections, with no writes on report open',async()=>{
  const item={id:'i',quantity:2,wix_options:{Pans:'Yes'}};
  const data=[{...item,wc_orders:{order_number:'10817'},wc_partner_pans:{selection_key:partnerPans(item).key,status:'ordered_and_sent'}},{...item,id:'j',quantity:3,wc_orders:{order_number:'10818'},wc_partner_pans:{selection_key:partnerPans(item).key,status:'ordered_and_sent'}},{id:'k',wix_options:{Pans:'Cart without pans'},wc_orders:{order_number:'10819'}}];
  const query:any={};for(const name of ['select','eq','neq','order'])query[name]=vi.fn(()=>query);query.range=vi.fn(async()=>({data}));
  const rpc=vi.fn(),s=new PartnerPansService({client:{from:()=>query,rpc}} as any);await s.load();
  expect(s.rows().map(r=>r.status)).toEqual(['ordered_and_sent','pending']);expect(s.rows()[1].changed).toBe(true);expect(rpc).not.toHaveBeenCalled();
  const c=new PartnerPansComponent(s);expect(c.visible()).toHaveLength(1);c.filter='all';c.search='#10817';expect(c.visible()).toHaveLength(1);
 });
});
