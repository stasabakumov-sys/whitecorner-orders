import { describe, expect, it, vi } from 'vitest';
import { FulfilmentRow, FulfilmentService, ShipmentRow } from './fulfilment.service';
import { OrdersService } from './orders.service';

function setup() {
  const row: FulfilmentRow = { id: 'fulfilment', order_id: 'order', route: 'Shipping', status: 'Shipping Preparation', ready_at: '', pickup_email_status: 'Not required' };
  const shipment: ShipmentRow = { id: 'shipment', fulfilment_id: row.id, order_id: row.order_id, status: 'Quote Selected', courier_order_id: 'courier-order', selected_quote: { id: 'quote', courierName: 'Test Carrier', name: 'Road', booking: { status: { consignmentNumber:'TEST' } } } as any };
  const saved = { row: { ...row }, order: { id: 'order', order_number: 'TEST-1', fulfillment_status: 'NOT_FULFILLED' }, sync: [] as any[], shipment: { ...shipment } };
  const query = (table: string) => {
    let update: any;
    const q: any = {
      select: () => q, eq: () => q, order: () => q, in: () => q,
      update: (value: any) => { update = value; return q; },
      single: async () => ({ data: saved.row }),
      maybeSingle: async () => {
        if (table === 'wc_fulfilment' && update) Object.assign(saved.row, update);
        if (table === 'wc_orders' && update) Object.assign(saved.order, update);
        return { data: { id: 'saved' } };
      },
      then: (resolve: any) => {
        if(update&&table==='wc_fulfilment')Object.assign(saved.row,update);
        if(update&&table==='wc_orders')Object.assign(saved.order,update);
        return resolve({ data: table === 'wc_fulfilment' ? [saved.row] : table === 'wc_orders' ? [saved.order] : table === 'wc_shipments' ? [saved.shipment] : table === 'wc_shipping_fulfillment_sync' ? saved.sync : [] });
      },
    }; return q;
  };
  const supabase = { client: { from: vi.fn(query), rpc: vi.fn(async () => {
    saved.row.status = 'Shipping Booked'; saved.row.shipping_booked_at = new Date().toISOString();
    saved.shipment.status = 'Shipping Booked';
    saved.sync = [{ order_id: 'order', status: 'pending', error: null }];
    return { error: null };
  }), functions: { invoke: vi.fn(async () => {
    saved.row.status = 'Fulfilled'; saved.order.fulfillment_status = 'FULFILLED';
    saved.sync[0].status = 'completed'; return { data: { ok: true } };
  }) } } };
  const orders = new OrdersService(supabase as any);
  orders.orders.set([saved.order, { id: 'unrelated', order_number: 'TEST-2', fulfillment_status: 'NOT_FULFILLED' }]);
  const activity = { load: vi.fn(async () => {}), addFulfilledNote: vi.fn(async () => {}) };
  const courier = { saveOrderDetails: vi.fn(async () => {}), bookOrder: vi.fn(async () => {}) };
  const service = new FulfilmentService(supabase as any, orders, activity as any, { unitsForOrder: () => [] } as any, courier as any);
  service.rows.set([row]); service.shipments.set([shipment]);
  vi.spyOn(service, 'refreshBookingStatus').mockImplementation(async () => { service.shipments.update(rows=>rows.map(row=>({...row,selected_quote:{...(row.selected_quote as any),booking:{status:{consignmentNumber:'TEST'}}}}))); });
  return { row, saved, supabase, orders, activity, courier, service };
}

describe('FulfilmentService shipping completion', () => {
  function packagingSetup(){
    const s=setup();
    s.service.shipments.update(rows=>rows.map(row=>({...row,updated_at:'2026-10-06T00:00:00Z'})));
    s.orders.orders.update(rows=>rows.map(row=>row.id==='order'?{...row,wc_order_items:[{id:'item',wix_line_item_id:'line',product_name:'Cart',quantity:1}]}:row));
    const oldBox:any={id:'old',shipment_id:'shipment',package_no:1,package_name:'Old box',source_type:'Manual',contents:[]};
    s.service.shipmentPackages.set([oldBox]);
    const tables:Record<string,any[]>={wc_shipping_products:[{id:'product',product_name:'Cart',active:true}],wc_shipping_rules:[],wc_delivery_packaging_profiles:[],wc_shipping_packages:[{shipping_product_id:'product',active:true,source_type:'Base',package_no:1,package_name:'Product box',length_mm:500,width_mm:400,height_mm:100,weight_kg:10}]};
    s.supabase.client.from.mockImplementation((table:string)=>{
      const q:any={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:async()=>({data:null,error:null}),range:async()=>({data:[],error:null}),then:(resolve:any)=>resolve({data:tables[table]||[],error:null})};return q;
    });
    return {...s,oldBox};
  }
  it('replaces shipment packages from Products and uses the transaction response to reset approval and quotes',async()=>{
    const s=packagingSetup();
    const updated={...s.service.shipments()[0],status:'Packaging Review',packages_approved_at:null,courier_order_id:null,selected_quote:null};
    s.supabase.client.rpc.mockResolvedValueOnce({data:{shipment:updated,packages:[{...s.oldBox,id:'new',package_name:'Product box'}]},error:null} as any);
    expect(await s.service.recalculateFromProducts(s.service.shipments()[0])).toBe(true);
    expect(s.supabase.client.rpc).toHaveBeenCalledWith('wc_replace_shipment_packages',expect.objectContaining({p_shipment_id:'shipment',p_expected_version:'2026-10-06T00:00:00Z',p_packages:[expect.objectContaining({package_name:'Product box',contents:[expect.objectContaining({order_item_id:'item'})]})]}));
    expect(s.service.shipmentPackages()[0].id).toBe('new');
    expect(s.service.shipments()[0]).toMatchObject({status:'Packaging Review',courier_order_id:null});
    expect(s.service.recalculatingShipmentId()).toBeNull();
    expect(s.courier.bookOrder).not.toHaveBeenCalled();
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
  });
  it('preserves saved packages on a failed replacement and blocks booked shipments or duplicate clicks',async()=>{
    const s=packagingSetup(),shipment=s.service.shipments()[0];
    s.supabase.client.rpc.mockResolvedValueOnce({error:{message:'Shipment changed. Reload the card before recalculating'}} as any);
    expect(await s.service.recalculateFromProducts(shipment)).toBe(false);
    expect(s.service.shipmentPackages()).toEqual([s.oldBox]);
    expect(s.service.error()).toContain('Shipment changed');
    s.service.recalculatingShipmentId.set(shipment.id);
    expect(await s.service.recalculateFromProducts(shipment)).toBe(false);
    s.service.recalculatingShipmentId.set(null);
    s.service.shipments.set([{...shipment,status:'Shipping Booked'}]);
    expect(await s.service.recalculateFromProducts(shipment)).toBe(false);
    expect(s.supabase.client.rpc).toHaveBeenCalledOnce();
  });
  it('completes a website-booked delivery only through the local RPC', async () => {
    const s=setup();
    const completed={...s.row,status:'Fulfilled' as const,completion_source:'manual_fast_courier' as const};
    s.supabase.client.rpc.mockResolvedValueOnce({data:completed,error:null} as any);
    expect(await s.service.completeManualFastCourier(s.row)).toBe(true);
    expect(s.supabase.client.rpc).toHaveBeenCalledWith('wc_complete_manual_fast_courier',{p_order_id:'order'});
    expect(s.service.rows()[0].completion_source).toBe('manual_fast_courier');
    expect(s.orders.orders()[0].fulfillment_status).toBe('FULFILLED');
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
    expect(s.courier.bookOrder).not.toHaveBeenCalled();
  });
  it('keeps the delivery open when local manual completion fails', async () => {
    const s=setup();
    s.supabase.client.rpc.mockResolvedValueOnce({data:null,error:{message:'Database unavailable'}} as any);
    expect(await s.service.completeManualFastCourier(s.row)).toBe(false);
    expect(s.service.rows()[0].status).toBe('Shipping Preparation');
    expect(s.service.error()).toContain('Database unavailable');
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
  });
  it('does not create fulfilment or shipping records for completed orders', async () => {
    const s=setup();
    s.service.rows.set([]);
    s.service.shipments.set([]);
    s.orders.orders.set([{...s.saved.order,fulfillment_status:'FULFILLED'}]);
    (s.service as any).production={unitsForOrder:()=>[{status:'Ready'}]};
    await s.service.ensureReadyOrders();
    expect(s.service.rows()).toHaveLength(0);
    s.service.rows.set([{...s.row,status:'Fulfilled'}]);
    await s.service.ensureShipments();
    expect(s.service.rows()).toHaveLength(1);
    expect(s.service.shipments()).toHaveLength(0);
    expect(s.supabase.client.from).not.toHaveBeenCalledWith('wc_shipments');
  });
  it('blocks booking without a delivery-cost decision before courier calls, even when production is Ready', async () => {
    const s=setup(),original=s.supabase.client.from.getMockImplementation()!;
    (s.orders.orders()[0] as any).wc_order_items=[{id:'item',product_name:'Cart',quantity:1,unit_price:110,wc_production_units:[{production_status:'Ready'}]}];
    s.supabase.client.from.mockImplementation((table:string)=>{
      if(table==='wc_delivery_booking_exemptions'||table==='wc_delivery_reviews'){
        const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='wc_delivery_reviews'?{state:'pending'}:null,error:null})};return q;
      }
      return original(table);
    });
    expect(await s.service.bookShipment(s.row, {} as any, 11000)).toBe(false);
    expect(s.service.error()).toContain('Booking blocked');expect(s.courier.saveOrderDetails).not.toHaveBeenCalled();expect(s.courier.bookOrder).not.toHaveBeenCalled();
  });
  it('permits a previously captured Ready exemption through the usual booking checks', async () => {
    const s=setup(),original=s.supabase.client.from.getMockImplementation()!;
    s.supabase.client.from.mockImplementation((table:string)=>{
      if(table==='wc_delivery_booking_exemptions'){const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{order_id:'order'},error:null})};return q;}
      return original(table);
    });
    expect(await s.service.bookShipment(s.row, {} as any, 11000)).toBe(true);expect(s.courier.bookOrder).toHaveBeenCalledOnce();
  });
  it('blocks Retry without tracking and blocks concurrent clicks without courier calls', async () => {
    const s=setup(),row={...s.row,status:'Shipping Booked' as const};
    s.service.shipments.set([{...s.service.shipments()[0],selected_quote:{} as any}]);
    expect(await s.service.syncShippingFulfillment(row)).toBe(false);
    s.service.shipments.set([s.saved.shipment]);
    s.service.syncingOrderIds.set([row.order_id]);
    expect(await s.service.syncShippingFulfillment(row)).toBe(false);
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
    expect(s.service.refreshBookingStatus).not.toHaveBeenCalled();
    expect(s.courier.bookOrder).not.toHaveBeenCalled();
  });
  it('automatically uses the same action when delayed tracking is saved by the booking poll', async () => {
    const s=setup();
    s.service.rows.set([{...s.row,status:'Shipping Booked'}]);
    s.saved.sync=[{order_id:'order',status:'pending'}];
    vi.mocked(s.service.refreshBookingStatus).mockRestore();
    (s.courier as any).getOrderStatus=vi.fn(async()=>({status:true,consignmentNumber:'DELAYED',storedDocuments:{label:{path:'mock'}}}));
    await s.service.refreshBookingStatus('shipment',true,0);
    expect(s.supabase.client.functions.invoke).toHaveBeenCalledWith(expect.anything(),{body:{action:'fulfillShipping',orderId:'order'}});
    expect((s.service.shipments()[0].selected_quote as any).booking.status.consignmentNumber).toBe('DELAYED');
    expect(s.courier.bookOrder).not.toHaveBeenCalled();
  });
  it('automatically calls Wix after the booking is saved and updates Hub', async () => {
    const s = setup(); await expect(s.service.bookShipment(s.row, {} as any, 11000)).resolves.toBe(true);
    expect(s.supabase.client.rpc).toHaveBeenCalledWith('wc_save_shipping_booking', expect.anything());
    expect(s.supabase.client.functions.invoke).toHaveBeenCalledWith(expect.anything(), { body: { action: 'fulfillShipping', orderId: 'order' } });
    expect(s.supabase.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(s.supabase.client.functions.invoke.mock.invocationCallOrder[0]);
    expect(s.service.rows()[0].status).toBe('Fulfilled');
    expect(s.orders.orders()[0].fulfillment_status).toBe('FULFILLED');
    expect(s.orders.orders()[1].fulfillment_status).toBe('NOT_FULFILLED');
    expect(s.activity.load).toHaveBeenCalledWith(true);
  });
  it('retains fulfilled status when data is reloaded from storage', async () => {
    const s = setup(); await s.service.bookShipment(s.row, {} as any, 11000);
    s.service.rows.set([]); s.orders.orders.set([]);
    await s.orders.load(); await s.service.load();
    expect(s.service.rows()[0].status).toBe('Fulfilled');
    expect(s.orders.orders()[0].fulfillment_status).toBe('FULFILLED');
  });
  it('keeps booking when Wix fails and retries only Wix', async () => {
    const s = setup();
    s.supabase.client.functions.invoke.mockRejectedValueOnce(new Error('temporary failure'));
    expect(await s.service.bookShipment(s.row, {} as any, 11000)).toBe(true);
    expect(s.service.error()).toContain('temporary failure');
    expect(s.service.rows()[0].status).toBe('Shipping Booked');
    expect(s.orders.orders()[0].fulfillment_status).toBe('NOT_FULFILLED');
    await s.service.syncShippingFulfillment(s.service.rows()[0]);
    expect(s.service.rows()[0].status).toBe('Fulfilled');
    expect(s.courier.bookOrder).toHaveBeenCalledOnce();
  });
  it('does not fulfill when courier booking fails', async () => {
    const s = setup(); s.courier.bookOrder.mockRejectedValueOnce(new Error('booking rejected'));
    expect(await s.service.bookShipment(s.row, {} as any, 11000)).toBe(false);
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
    expect(s.service.rows()[0].status).toBe('Shipping Preparation');
  });
  it('blocks another booking after persistence failure', async () => {
    const s = setup(); s.supabase.client.rpc.mockResolvedValueOnce({ error: { message: 'database unavailable' } } as any);
    expect(await s.service.bookShipment(s.row, {} as any, 11000)).toBe(false);
    expect(await s.service.bookShipment(s.row, {} as any, 11000)).toBe(false);
    expect(s.courier.bookOrder).toHaveBeenCalledOnce();
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
  });
  it('keeps the pickup collection trigger separate from shipping', async () => {
    const s = setup(); const pickup = { ...s.row, route: 'Pickup' as const, status: 'Awaiting Pickup' as const };
    expect(await s.service.bookShipment(pickup, {} as any, 11000)).toBe(false);
    expect(await s.service.syncShippingFulfillment(pickup)).toBe(false);
    expect(await s.service.markCollected(s.row)).toBe(false);
    savedPickup(s, pickup);
    const mark = vi.spyOn(s.orders, 'markFulfilledInWix').mockResolvedValue({ ok: true });
    expect(await s.service.markCollected(pickup)).toBe(true);
    expect(mark).toHaveBeenCalledWith('order'); expect(s.courier.bookOrder).not.toHaveBeenCalled();
  });
  it('retains pickup rollback when Wix fails', async () => {
    const s = setup(); const pickup = { ...s.row, route: 'Pickup' as const, status: 'Awaiting Pickup' as const };
    savedPickup(s, pickup);
    vi.spyOn(s.orders, 'markFulfilledInWix').mockRejectedValue(new Error('Wix unavailable'));
    expect(await s.service.markCollected(pickup)).toBe(false);
    expect(s.saved.row.status).toBe('Awaiting Pickup');
    expect(s.saved.order.fulfillment_status).toBe('NOT_FULFILLED');
    expect(s.activity.addFulfilledNote).not.toHaveBeenCalled();
    expect(s.service.error()).toContain('Wix unavailable');
  });
  it('does not skip another order while one sync is running', async () => {
    const s = setup();
    s.service.syncingOrderIds.set(['different-order']);
    s.saved.sync = [{order_id:'order',status:'pending'}];
    await s.service.syncShippingFulfillment({...s.row,status:'Shipping Booked'});
    expect(s.supabase.client.functions.invoke).toHaveBeenCalledOnce();
    expect(s.service.syncingOrderIds()).toEqual(['different-order']);
  });
});

function savedPickup(s: ReturnType<typeof setup>, row: FulfilmentRow) {
  s.saved.row = row; s.service.rows.set([row]);
}
