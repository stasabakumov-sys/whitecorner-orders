import { describe, expect, it } from 'vitest';
import { withGeneralContents } from '../../../../../supabase/functions/fast-courier-api/quote-payload';

describe('Fast Courier fixed contents category at the server boundary', () => {
  it('replaces every legacy package description without changing dimensions, quantities or other request fields', () => {
    const payload = {
      pickupSuburb: 'TEST', isPickupTailLift: true,
      items: ['Top/Side shelves', 'Roof/Castors', '', 'Alcohol', 'General/Others'].map((contents, i) => ({
        type: 'box', weight: 10 + i, length: 120, width: 60, height: 15, quantity: i + 1, contents,
      })),
    };
    const original = structuredClone(payload);
    const result = withGeneralContents(payload);
    expect(result).toEqual({
      ...original, items: original.items.map(item => ({ ...item, contents: 'General/Others' })),
    });
    expect(payload).toEqual(original);
    expect(withGeneralContents(result)).toEqual(result);
  });

  it('also supplies the category when an older caller omits contents', () => {
    const item = { type: 'box', weight: 10, length: 100, width: 50, height: 10, quantity: 1 };
    expect(withGeneralContents({ items: [item] }).items).toEqual([{ ...item, contents: 'General/Others' }]);
  });
});
