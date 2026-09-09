import {TestBed} from '@angular/core/testing';
import {OrderDrawerComponent} from './order-drawer.component';

describe('Order editing preview',()=>{
  it('shows order data with all editing controls disabled and does not mutate the input',()=>{
    TestBed.configureTestingModule({imports:[OrderDrawerComponent]});
    const fixture=TestBed.createComponent(OrderDrawerComponent);
    const order:any={id:'test',order_number:'TEST',currency:'AUD',total:390,payment_status:'PAID',customer_name:'Test Customer',wc_order_items:[{id:'item',product_name:'Test Backdrop',quantity:1,unit_price:390}]};
    const snapshot=JSON.stringify(order);
    fixture.componentInstance.order=order;fixture.componentInstance.editing=true;fixture.detectChanges();
    const root=document.body;
    expect(root.textContent).toContain('Edit Order #TEST');
    expect(root.textContent).toContain('No changes are saved or sent to Wix');
    const update=Array.from(root.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Update Order');
    expect(update?.disabled).toBe(true);
    expect(Array.from(root.querySelectorAll('.edit-grid input')).every((input:any)=>input.disabled)).toBe(true);
    expect(JSON.stringify(order)).toBe(snapshot);
    fixture.destroy();
  });
});
