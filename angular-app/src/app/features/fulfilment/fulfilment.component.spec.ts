import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderRow } from '../../core/models/order.models';
import { FulfilmentRow, FulfilmentService, ShipmentRow } from '../../core/services/fulfilment.service';
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
    getGeneralContents: vi.fn(async()=> 'other'),
    bookShipment: vi.fn(async (_row:any,_details:any) => true),
    error: signal(''),
    bookingShipmentId: signal<string | null>(null),
    load: vi.fn(async () => undefined),
    orderFor: vi.fn((row: FulfilmentRow) => row.order_id === order.id ? order : undefined),
    shipmentFor: vi.fn<() => ShipmentRow | undefined>(() => undefined),
    packagesFor: vi.fn(() => [{id:'package-1',package_no:1,package_name:'Saved box',length_mm:500,width_mm:400,height_mm:300,weight_kg:12,contents:[]}]),
    packageContents: vi.fn(() => []),
    unassignedOrderItems: vi.fn(() => []),
    noPackageItems: vi.fn(() => []),
    bookingStatus: vi.fn((shipment:ShipmentRow) => (shipment.selected_quote as any)?.booking?.status ?? null),
    checkingBookingShipmentId: signal<string|null>(null),
    syncingOrderIds: signal<string[]>([]),
    syncFor: vi.fn(() => undefined),
    canSyncShipping: vi.fn(() => false),
    openStoredDocument: vi.fn(async (_path:string) => undefined),
    refreshBookingStatus: vi.fn(async (_id:string) => undefined),
  };

  beforeEach(async () => {
    rows.set([delivery]);
    service.load.mockClear();
    service.bookShipment.mockReset().mockResolvedValue(true);
    service.error.set('');
    service.bookingShipmentId.set(null);
    service.shipmentFor.mockReset().mockReturnValue(undefined);
    service.openStoredDocument.mockClear();
    service.refreshBookingStatus.mockClear();
    await TestBed.configureTestingModule({
      imports: [FulfilmentComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
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

  it('counts fulfilled orders in their Pickup and Delivery tabs, below active orders', () => {
    fixture = TestBed.createComponent(FulfilmentComponent);
    const completed = { ...delivery, id: 'completed', status: 'Fulfilled' as const };
    const completedPickup = { ...completed, id: 'completed-pickup', route: 'Pickup' as const };
    rows.set([completed, completedPickup, delivery]);
    expect(fixture.componentInstance.delivery().map(row => row.id)).toEqual([delivery.id, 'completed']);
    expect(fixture.componentInstance.pickup().map(row => row.id)).toEqual(['completed-pickup']);
    expect(fixture.componentInstance.visible().map(row => row.id)).toEqual([delivery.id, 'completed']);
    fixture.componentInstance.tab.set('Pickup');
    expect(fixture.componentInstance.visible().map(row => row.id)).toEqual(['completed-pickup']);
    expect(fixture.componentInstance.displayStatus(completed)).toBe('Fulfilled');
  });

  it('refreshes an open drawer when automatic synchronization updates the row', () => {
    fixture = TestBed.createComponent(FulfilmentComponent);
    fixture.componentInstance.selected.set(delivery);
    rows.set([{ ...delivery, status: 'Fulfilled' }]);
    expect(fixture.componentInstance.currentSelected()?.status).toBe('Fulfilled');
  });

  function bookedShipment():ShipmentRow {
    return {id:'shipment-1',fulfilment_id:delivery.id,order_id:order.id,status:'Shipping Booked',courier_order_id:'courier-1',selected_quote:{booking:{status:{orderStatus:'booked',consignmentNumber:'TEST-123',storedDocuments:{label:{path:'test/label.pdf'},invoice:{path:'test/invoice.pdf'},manifest:{path:'test/manifest.pdf'}}}}} as any};
  }

  it('keeps saved packages and working document buttons visible as shipping becomes fulfilled and on reopening', async () => {
    const booked = {...delivery,status:'Shipping Booked' as const};
    rows.set([booked]);
    service.shipmentFor.mockReturnValue(bookedShipment());
    fixture = TestBed.createComponent(FulfilmentComponent);
    fixture.componentInstance.selected.set(booked);
    fixture.detectChanges();
    await fixture.whenStable();
    const docsBefore = fixture.nativeElement.querySelector('[aria-label="Shipping documents"]');
    expect(docsBefore.textContent).toContain('Open label');
    rows.set([{...booked,status:'Fulfilled'}]);
    fixture.detectChanges();
    const docsAfter = fixture.nativeElement.querySelector('[aria-label="Shipping documents"]');
    expect(docsAfter).toBe(docsBefore);
    expect(docsAfter.textContent).toContain('TEST-123');
    expect(docsAfter.textContent).toContain('Open invoice');
    expect(docsAfter.textContent).toContain('Open manifest');
    expect(fixture.nativeElement.querySelector('.package-fields input').value).toBe('Saved box');
    expect([...fixture.nativeElement.querySelectorAll('.package-fields input')].every((input:any)=>input.readOnly)).toBe(true);
    expect(fixture.nativeElement.querySelector('.package-actions')).toBeNull();
    expect(fixture.nativeElement.querySelector('.quote-section')).toBeNull();
    const button = (text:string) => [...fixture.nativeElement.querySelectorAll('button')].find((b:any)=>b.textContent.includes(text)) as HTMLButtonElement;
    button('Open label').click();
    button('Refresh documents').click();
    expect(service.openStoredDocument).toHaveBeenCalledWith('test/label.pdf');
    expect(service.refreshBookingStatus).toHaveBeenCalledWith('shipment-1');
    fixture.componentInstance.selected.set(null);fixture.detectChanges();
    fixture.componentInstance.selected.set(rows()[0]);fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Shipping documents"]').textContent).toContain('Open label');
    expect(service.bookShipment).not.toHaveBeenCalled();
  });

  it('allows document recovery without status and shows errors beside the documents without removing saved packages', () => {
    const completed = {...delivery,status:'Fulfilled' as const};
    rows.set([completed]);
    service.shipmentFor.mockReturnValue({...bookedShipment(),selected_quote:null});
    fixture = TestBed.createComponent(FulfilmentComponent);
    fixture.componentInstance.selected.set(completed);fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Shipping documents"]').textContent).toContain('Refresh documents');
    service.error.set('Could not refresh Fast Courier documents. Please retry.');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer-body [role="alert"]').textContent).toContain('Please retry');
    expect(fixture.nativeElement.querySelector('.package-fields input').value).toBe('Saved box');
    expect(service.bookShipment).not.toHaveBeenCalled();
  });

  function bookingSetup(){
    fixture=TestBed.createComponent(FulfilmentComponent);
    const c=fixture.componentInstance;
    const shipment:any={id:'shipment',status:'Quote Selected',selected_quote_id:'quote-123',selected_quote:{priceIncludingGst:30},quote_request:{destinationSuburb:'TEST',destinationState:'QLD',destinationPostcode:4000}};
    c.bookingContext.set({row:delivery,shipment,order:{...order,subtotal:110}});
    c.bookingDialogOpen.set(true);
    c.bookingDraft.update(d=>({...d,destinationFirstName:'Test',destinationLastName:'Recipient',destinationEmail:'test@example.invalid',destinationPhone:'0400000000',destinationAddress1:'1 Test St',collectionDate:c.today(),parcelContent:'other',accepted:true}));
    vi.spyOn(c,'insuranceSelection').mockReturnValue({tier:1,required:false,goodsValue:100,extendedLiability:false,insuranceValue:500,insuranceFee:0,label:'Test cover'});
    return c;
  }
  it('loads the API category for booking and keeps booking unavailable after reference failure',async()=>{
    const c=bookingSetup(),context=c.bookingContext()!;
    service.getGeneralContents.mockResolvedValueOnce('other');
    await c.openBooking(context.row,context.shipment,context.order);
    expect(c.bookingDraft().parcelContent).toBe('other');expect(c.bookingDraft().accepted).toBe(false);
    service.getGeneralContents.mockRejectedValueOnce(new Error('Reference unavailable. Reopen to retry.'));
    await c.openBooking(context.row,context.shipment,context.order);
    expect(c.bookingDraft().parcelContent).toBe('');expect(c.bookingFormValid()).toBe(false);expect(c.bookingError()).toContain('Reference unavailable');
    expect(service.bookShipment).not.toHaveBeenCalled();
  });
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
    expect(details).toMatchObject({quoteId:'quote-123',senderType:'sender',collectionDate:c.today(),parcelContent:'other',valueOfContent:110,acceptNoDangerousGoods:true,acceptTermConditions:true});
    expect(details).not.toHaveProperty('extendedLiability');
    expect(details).not.toHaveProperty('insuranceValue');
    expect(details).not.toHaveProperty('insuranceFee');
    // Verify the actual Edge Function transport contract using a mock only.
    const invoke=vi.fn(async()=>({data:{status:true},error:null})),courier=new FastCourierService({client:{functions:{invoke}}} as any);
    await courier.saveOrderDetails('courier-order',details,11000);await courier.bookOrder('courier-order',11000);
    expect(invoke.mock.calls.map((call:any)=>call[1].body)).toEqual([{action:'save-order-details',orderId:'courier-order',payload:details,confirmedTotalCents:11000},{action:'booking',orderId:'courier-order',confirmedTotalCents:11000}]);
    done(true);await pending;expect(c.bookingBusy()).toBe(false);expect(c.bookingDialogOpen()).toBe(false);native.mockRestore();
  });
  it('sends the exact paid insurance tier only when extended cover is required',async()=>{
    const c=bookingSetup();
    vi.mocked(c.insuranceSelection).mockReturnValue({tier:2,required:true,goodsValue:1200,extendedLiability:true,insuranceValue:1500,insuranceFee:17.57,label:'+$17.57 for upto $1500 extended liability'});
    await c.confirmBooking();
    expect(service.bookShipment.mock.calls[0][1]).toMatchObject({extendedLiability:'2',insuranceValue:'$1500',insuranceFee:'$17.57'});
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
