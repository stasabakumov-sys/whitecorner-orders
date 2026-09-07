import {TestBed} from '@angular/core/testing';
import {describe,it,expect,vi} from 'vitest';
import {DeliveryReviewComponent} from './delivery-review.component';
import {DeliveryReviewService} from '../../core/services/delivery-review.service';
import {evaluateQuotes,insuranceFor,reviewInputKey} from '../../../../../supabase/functions/_shared/delivery-review-domain';

describe('Delivery review UI',()=>{
 it('shows excluded carriers in the persisted quote, displays the shortfall and requires an exception reason',async()=>{
  const service=new DeliveryReviewService({} as any);vi.spyOn(service,'load').mockResolvedValue();
  const order={id:'order',order_number:'TEST',customer_name:'Test customer',currency:'AUD',shipping:100,subtotal:110,wc_order_items:[{id:'item',product_name:'Cart',quantity:1,unit_price:110}],delivery_address:{city:'TEST',state:'VIC',postalCode:'3000'}};
  const row={order_id:'order',state:'quoted',wc_orders:order,input_key:reviewInputKey(order),quote_attempted_at:new Date().toISOString(),packages:[],evaluated_quotes:evaluateQuotes([{courierName:'TNT',priceIncludingGst:1},{courierName:'Aramex',priceIncludingGst:95}],insuranceFor(['Free up to $500'],11000))};
  service.rows.set([row]);
  await TestBed.configureTestingModule({imports:[DeliveryReviewComponent],providers:[{provide:DeliveryReviewService,useValue:service}]}).compileComponents();
  const f=TestBed.createComponent(DeliveryReviewComponent);f.detectChanges();f.componentInstance.open(row);f.detectChanges();
  const body=f.nativeElement.textContent;expect(body).toContain('TNT');expect(body).toContain('Carrier excluded by policy');expect(body).toContain('$5.56');expect(body).toContain('Price review required');
  const button=[...f.nativeElement.querySelectorAll('button')].find((b:any)=>b.textContent.includes('Approve current')) as HTMLButtonElement;
  expect(button.disabled).toBe(true);expect(service.load).toHaveBeenCalledOnce();
 });
});
