import {TestBed} from '@angular/core/testing';
import {describe,it,expect,vi} from 'vitest';
import {DeliveryReviewComponent} from './delivery-review.component';
import {DeliveryReviewService} from '../../core/services/delivery-review.service';
import {buildReviewRequest,evaluateQuotes,insuranceFor,reviewComponents,reviewInputKey} from '../../../../../supabase/functions/_shared/delivery-review-domain';

describe('Delivery review UI',()=>{
 it('colors margin at exact 10 and 20 percent thresholds without changing the outcome',()=>{
  const service=new DeliveryReviewService({} as any),outcome=vi.spyOn(service,'outcome');
  const component=new DeliveryReviewComponent(service),row={wc_orders:{shipping:100}};
  for(const [cost,tone] of [[11000,'red'],[10000,'red'],[9001,'red'],[9000,'yellow'],[8001,'yellow'],[8000,'green'],[0,'green']] as const){
   outcome.mockReturnValue({best:{total_cents:cost}} as any);expect(component.marginTone(row)).toBe(tone);
  }
  outcome.mockReturnValue({best:null} as any);expect(component.marginTone(row)).toBeNull();
  outcome.mockReturnValue({best:{total_cents:0}} as any);expect(component.marginTone({wc_orders:{shipping:0}})).toBeNull();
 });
 it('groups packages by product but submits every physical box once in one order request',async()=>{
  const service=new DeliveryReviewService({} as any);vi.spyOn(service,'load').mockResolvedValue();const save=vi.spyOn(service,'savePackages').mockResolvedValue(true);
  const order={id:'grouped',currency:'AUD',shipping:100,total:540,delivery_address:{addressLine:'1 Test St',city:'TEST',state:'VIC',postalCode:'3000',country:'AU'},wc_order_items:[{id:'cart',product_name:'Cart',quantity:2,unit_price:110,wix_options:{Shelf:'Yes'}},{id:'stand',product_name:'Stand',quantity:1,unit_price:220}]};
  const components=reviewComponents(order),box=(contents:any[])=>({package_name:'Box',length_mm:500,width_mm:400,height_mm:300,weight_kg:5,contents});
  const packages=[box(components.filter(c=>c.order_item_id==='cart')),box(components.filter(c=>c.order_item_id==='stand')),box([components[0],components.at(-1)!])];
  const row={order_id:'grouped',wc_orders:order,state:'packaging_required',packages};service.rows.set([row]);
  await TestBed.configureTestingModule({imports:[DeliveryReviewComponent],providers:[{provide:DeliveryReviewService,useValue:service}]}).compileComponents();
  const f=TestBed.createComponent(DeliveryReviewComponent);f.detectChanges();const c=f.componentInstance;c.open(row);f.detectChanges();
  expect(f.nativeElement.querySelectorAll('.product-group')).toHaveLength(2);expect(f.nativeElement.querySelectorAll('.package-card')).toHaveLength(3);
  expect(f.nativeElement.querySelector('[data-product-id="cart"]').textContent).toContain('Shelf: Yes');expect(f.nativeElement.querySelector('[data-product-id="stand"]').textContent).toContain('Also in shared package');
  expect(c.productGroups(row).flatMap(g=>g.boxes)).toHaveLength(3);expect(c.packagingIssue(row)).toBe('');c.confirmed=true;await c.save(row);
  expect(save).toHaveBeenCalledExactlyOnceWith('grouped',c.draft,true);
  const request=buildReviewRequest(order,save.mock.calls[0][1]);expect(request.items).toHaveLength(3);expect(request.items.reduce((sum,i)=>sum+i.weight*i.quantity,0)).toBe(15);
  c.addBox('stand');expect(c.productGroups(row).find(g=>g.id==='stand')!.boxes).toHaveLength(2);expect(c.confirmed).toBe(false);expect(c.packagingIssue(row)).not.toBe('');
 });
 it('shows excluded carriers in the persisted quote, displays the shortfall and requires an exception reason',async()=>{
  const service=new DeliveryReviewService({} as any);vi.spyOn(service,'load').mockResolvedValue();
  const order={id:'order',order_number:'TEST',customer_name:'Test customer',currency:'AUD',total:210,shipping:90.91,raw_order:{shippingInfo:{cost:{totalPriceAfterTax:{amount:'100.00'}}}},subtotal:110,wc_order_items:[{id:'item',product_name:'Cart',quantity:1,unit_price:110}],delivery_address:{city:'TEST',state:'VIC',postalCode:'3000'}};
  const row={order_id:'order',state:'quoted',wc_orders:order,input_key:reviewInputKey(order),quote_attempted_at:new Date().toISOString(),packages:[],evaluated_quotes:evaluateQuotes([{courierName:'TNT',priceIncludingGst:1},{courierName:'Aramex',priceIncludingGst:95}],insuranceFor(['Free up to $500'],11000))};
  service.rows.set([row]);
  await TestBed.configureTestingModule({imports:[DeliveryReviewComponent],providers:[{provide:DeliveryReviewService,useValue:service}]}).compileComponents();
  const f=TestBed.createComponent(DeliveryReviewComponent);f.detectChanges();f.componentInstance.open(row);f.detectChanges();
  const body=f.nativeElement.textContent;expect(body).toContain('TNT');expect(body).toContain('Carrier excluded by policy');expect(body).toContain('$5.56');expect(body).toContain('Price review required');
  expect(body).toContain('Order total incl. GST');expect(body).toContain('$210.00');expect(body).toContain('Invoice delivery incl. GST');expect(body).toContain('$100.00');expect(body).not.toContain('$90.91');
  const button=[...f.nativeElement.querySelectorAll('button')].find((b:any)=>b.textContent.includes('Approve current')) as HTMLButtonElement;
  expect(button.disabled).toBe(true);expect(service.load).toHaveBeenCalledOnce();
 });
});
