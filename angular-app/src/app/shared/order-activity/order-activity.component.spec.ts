import { describe, expect, it, vi } from 'vitest';
import { OrderActivityComponent } from './order-activity.component';

const order = {
  id: 'order',
  order_number: '10836',
  wc_order_items: [
    { id: 'first-item', product_name: 'Wavy Arch', wc_production_units: [{ id: 'first-unit', unit_index: 1 }] },
    { id: 'second-item', product_name: 'Ripple Arch', wc_production_units: [{ id: 'second-unit', unit_index: 1 }] },
  ],
} as any;

describe('Production Board activity', () => {
  it('shows only the opened product while the order retains every product event', () => {
    const rows = [
      { id: 'first-status', order_id: 'order', activity_type: 'status_change', production_unit_id: 'first-unit', created_at: '2026-09-23T08:00:00Z' },
      { id: 'second-status', order_id: 'order', activity_type: 'status_change', production_unit_id: 'second-unit', created_at: '2026-09-23T07:00:00Z' },
      { id: 'second-note', order_id: 'order', activity_type: 'note', production_unit_id: 'second-unit', created_at: '2026-09-23T06:00:00Z' },
      { id: 'item-note', order_id: 'order', activity_type: 'note', order_item_id: 'second-item', created_at: '2026-09-23T05:00:00Z' },
      { id: 'order-note', order_id: 'order', activity_type: 'note', created_at: '2026-09-23T04:00:00Z' },
    ];
    const activity = { eventsFor: () => rows } as any;
    const component = new OrderActivityComponent(activity);
    component.order = order;
    component.unitId = 'second-unit';
    component.orderItemId = 'second-item';

    expect(component.events().map((event) => event.id)).toEqual(['second-status', 'second-note', 'item-note']);
    expect(component.unitLabel('first-unit')).toContain('Wavy Arch');
    component.unitId = undefined;
    expect(component.events()).toEqual(rows);
  });

  it('saves a product note against its physical unit', async () => {
    const addNote = vi.fn().mockResolvedValue(undefined);
    const component = new OrderActivityComponent({ addNote } as any);
    component.order = order;
    component.unitId = 'second-unit';
    component.orderItemId = 'second-item';
    const note = { value: 'Cut this part twice' } as HTMLTextAreaElement;

    await component.addNote(note);

    expect(addNote).toHaveBeenCalledWith('order', 'Cut this part twice', 'second-item', 'second-unit');
    expect(note.value).toBe('');
  });

  it('keeps the note visible for retry when saving fails', async () => {
    const component = new OrderActivityComponent({ addNote: vi.fn().mockRejectedValue(new Error('Offline')) } as any);
    component.order = order;
    const note = { value: 'Check packing' } as HTMLTextAreaElement;

    await component.addNote(note);

    expect(note.value).toBe('Check packing');
    expect(component.error()).toContain('Offline');
  });
});
