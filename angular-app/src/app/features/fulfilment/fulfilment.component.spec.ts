import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderRow } from '../../core/models/order.models';
import { FulfilmentRow, FulfilmentService } from '../../core/services/fulfilment.service';
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
    error: signal(''),
    bookingShipmentId: signal<string | null>(null),
    load: vi.fn(async () => undefined),
    orderFor: vi.fn((row: FulfilmentRow) => row.order_id === order.id ? order : undefined),
    shipmentFor: vi.fn(() => undefined),
  };

  beforeEach(async () => {
    rows.set([delivery]);
    service.load.mockClear();
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
});
