import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderRow } from '../../core/models/order.models';
import { FulfilmentRow, FulfilmentService } from '../../core/services/fulfilment.service';
import { FastCourierService } from '../../core/services/fast-courier.service';
import { FulfilmentComponent } from './fulfilment.component';

describe('FulfilmentComponent', () => {
  let fixture: ComponentFixture<FulfilmentComponent>;
  const delivery: FulfilmentRow = {
    id: 'fulfilment-1',
    order_id: 'order-1',
    route: 'Shipping',
    status: 'Shipping Preparation',
    ready_at: '2026-09-02T03:00:00Z',
    pickup_email_status: 'Not required',
  };
  const order: OrderRow = {
    id: 'order-1',
    order_number: 'WC-2002',
    customer_name: 'Delivery Customer',
    delivery_title: 'Standard Delivery',
  };
  const rows = signal<FulfilmentRow[]>([]);
  const service = {
    rows,
    bookShipment: vi.fn(async (_row:any,_details:any) => true),
    error: signal(''),
    bookingShipmentId: signal<string | null>(null),
    load: vi.fn(async () => undefined),
    orderFor: vi.fn((row: FulfilmentRow) => row.order_id === order.id ? order : undefined),
    shipmentFor: vi.fn((): any => undefined),
    packagesFor: vi.fn((): any[] => []),
    requestFastCourierQuotes: vi.fn(async (_row: any, _request: any) => undefined),
  };

  beforeEach(async () => {
    rows.set([delivery]);
    service.load.mockClear();
    service.bookShipment.mockReset().mockResolvedValue(true);
    service.error.set('');
    service.bookingShipmentId.set(null);
    service.shipmentFor.mockReset();
    service.packagesFor.mockReset().mockReturnValue([]);
    service.requestFastCourierQuotes.mockClear();
    await TestBed.configureTestingModule({
      imports: [FulfilmentComponent],
      providers: [
        provideNoopAnimations(),
        { provide: FulfilmentService, useValue: service },
      ],
    }).compileComponents();
  });

  it('renders a Delivery row from mocked data without calling integrations', async () => {
    fixture = TestBed.createComponent(FulfilmentComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody .order-row') as HTMLElement | null;
    expect(row?.textContent).toContain('#WC-2002');
    expect(row?.textContent).toContain('Delivery Customer');
    expect(row?.textContent).toContain('Standard Delivery');
    expect(service.load).toHaveBeenCalledOnce();
  });

  it('moves fulfilled deliveries below active orders and uses the persisted status', () => {
    fixture = TestBed.createComponent(FulfilmentComponent);
    const completed = { ...delivery, id: 'completed', status: 'Fulfilled' as const };
    rows.set([completed, delivery]);
    expect(fixture.componentInstance.delivery().map(row => row.id)).toEqual([delivery.id, 'completed']);
    expect(fixture.componentInstance.displayStatus(completed)).toBe('Fulfilled');
  });

  it('refreshes an open drawer when automatic synchronization updates the row', () => {
    fixture = TestBed.createComponent(FulfilmentComponent);
    fixture.componentInstance.selected.set(delivery);
    rows.set([{ ...delivery, status: 'Fulfilled' }]);
    expect(fixture.componentInstance.currentSelected()?.status).toBe('Fulfilled');
  });

  it('sends General/Others for every parcel while preserving Hub package names and converting mm to cm', () => {
    fixture = TestBed.createComponent(FulfilmentComponent);
    const packages = ['Top/Side shelves', 'Roof/Castors', ''].map(package_name => ({
      package_name, weight_kg: 25, length_mm: 1230, width_mm: 630, height_mm: 160,
    }));
    service.shipmentFor.mockReturnValue({ id: 'shipment-1' });
    service.packagesFor.mockReturnValue(packages);
    fixture.componentInstance.getQuotes(delivery, 'Test', 'QLD', '4000', 'commercial', false,
      'Test destination', 'VIC', '3000', 'residential', false);
    expect(service.requestFastCourierQuotes).toHaveBeenCalledOnce();
    expect(service.requestFastCourierQuotes.mock.calls[0][1].items).toEqual(packages.map(() => ({
      type: 'box', weight: 25, length: 123, width: 63, height: 16, quantity: 1, contents: 'General/Others',
    })));
    expect(packages.map(p => p.package_name)).toEqual(['Top/Side shelves', 'Roof/Castors', '']);
  });

  function bookingSetup(){
    fixture=TestBed.createComponent(FulfilmentComponent);
    const c=fixture.componentInstance;
    const shipment:any={id:'shipment',status:'Quote Selected',selected_quote_id:'quote-123',selected_quote:{priceIncludingGst:30},quote_request:{destinationSuburb:'TEST',destinationState:'QLD',destinationPostcode:4000}};
    c.bookingContext.set({row:delivery,shipment,order:{...order,subtotal:110}});
    c.bookingDialogOpen.set(true);
    c.bookingDraft.update(d=>({...d,destinationFirstName:'Test',destinationLastName:'Recipient',destinationEmail:'test@example.invalid',destinationPhone:'0400000000',destinationAddress1:'1 Test St',collectionDate:c.today(),parcelContent:'Cart and shelves',accepted:true}));
    vi.spyOn(c,'insuranceSelection').mockReturnValue({tier:1,required:false,goodsValue:100,extendedLiability:false,insuranceValue:500,insuranceFee:0,label:'Test cover'});
    return c;
  }
  it('submits from the explicit charge consent without a suppressible native dialog, showing progress and blocking duplicates',async()=>{
    const c=bookingSetup(),native=vi.spyOn(window,'confirm').mockReturnValue(false);
    let done!:(value:boolean)=>void;service.bookShipment.mockImplementationOnce(()=>new Promise(resolve=>done=resolve));
    const pending=c.confirmBooking();fixture.detectChanges();
    expect(c.bookingBusy()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Booking…');
    const button=[...fixture.nativeElement.querySelectorAll('button')].find((b:any)=>b.textContent.includes('Booking…')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await c.confirmBooking();expect(service.bookShipment).toHaveBeenCalledOnce();expect(native).not.toHaveBeenCalled();
    const details=service.bookShipment.mock.calls[0][1];
    expect(details).toMatchObject({quoteId:'quote-123',senderType:'sender',collectionDate:c.today(),parcelContent:'Cart and shelves',valueOfContent:110,insuranceValue:'$500',insuranceFee:'$0.00',acceptNoDangerousGoods:true,acceptTermConditions:true});
    // Verify the actual Edge Function transport contract using a mock only.
    const invoke=vi.fn(async()=>({data:{status:true},error:null})),courier=new FastCourierService({client:{functions:{invoke}}} as any);
    await courier.saveOrderDetails('courier-order',details);await courier.bookOrder('courier-order');
    expect(invoke.mock.calls.map((call:any)=>call[1].body)).toEqual([{action:'save-order-details',orderId:'courier-order',payload:details},{action:'booking',orderId:'courier-order'}]);
    done(true);await pending;expect(c.bookingBusy()).toBe(false);expect(c.bookingDialogOpen()).toBe(false);native.mockRestore();
  });
  it('shows service and unexpected errors inside the open confirmation dialog',async()=>{
    const c=bookingSetup();service.error.set('Collection date is unavailable.');service.bookShipment.mockResolvedValueOnce(false);
    await c.confirmBooking();fixture.detectChanges();expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Collection date is unavailable');
    expect(c.bookingDialogOpen()).toBe(true);expect(c.bookingBusy()).toBe(false);
    service.bookShipment.mockRejectedValueOnce(new Error('Network unavailable'));
    await c.confirmBooking();expect(c.bookingError()).toContain('Network unavailable');expect(c.bookingBusy()).toBe(false);
  });
  it('does not submit without charge consent, valid date or sufficient insurance',async()=>{
    const c=bookingSetup();c.bookingDraft.update(d=>({...d,accepted:false}));await c.confirmBooking();expect(c.bookingError()).toContain('accept the account charge');
    c.bookingDraft.update(d=>({...d,accepted:true,collectionDate:'2000-01-01'}));await c.confirmBooking();expect(service.bookShipment).not.toHaveBeenCalled();
    c.bookingDraft.update(d=>({...d,collectionDate:c.today()}));vi.mocked(c.insuranceSelection).mockReturnValue(null);await c.confirmBooking();
    expect(c.bookingError()).toContain('Insurance');expect(c.bookingBusy()).toBe(false);expect(service.bookShipment).not.toHaveBeenCalled();
  });
});
