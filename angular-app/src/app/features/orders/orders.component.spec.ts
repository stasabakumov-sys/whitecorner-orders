import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderRow } from '../../core/models/order.models';
import { OrdersService } from '../../core/services/orders.service';
import { OrdersComponent } from './orders.component';

const order: OrderRow = {
  id: 'order-1',
  order_number: 'WC-1001',
  wix_created_at: '2026-09-01T00:00:00Z',
  customer_name: 'Test Customer',
  payment_status: 'PAID',
  fulfillment_status: 'UNFULFILLED',
  delivery_type: 'Delivery',
  currency: 'AUD',
  total: 120,
};

describe('OrdersComponent', () => {
  let fixture: ComponentFixture<OrdersComponent>;
  const orders = signal<OrderRow[]>([]);
  const service = {
    orders,
    error: signal(''),
    lastSync: signal<string | null>(null),
    load: vi.fn(async () => undefined),
    syncWix: vi.fn(async () => undefined),
  };

  beforeEach(async () => {
    orders.set([]);
    service.load.mockClear();
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        provideNoopAnimations(),
        { provide: OrdersService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } },
        },
      ],
    }).compileComponents();
  });

  it('renders an order row from mocked data', async () => {
    orders.set([order]);
    fixture = TestBed.createComponent(OrdersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody .row') as HTMLElement | null;
    expect(row?.textContent).toContain('#WC-1001');
    expect(row?.textContent).toContain('Test Customer');
    expect(service.load).not.toHaveBeenCalled();
  });

  it('renders the orders empty state for an empty mocked array', async () => {
    fixture = TestBed.createComponent(OrdersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No orders found.');
  });
});
