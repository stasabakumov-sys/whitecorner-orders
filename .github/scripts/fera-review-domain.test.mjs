import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllFera, mediaFields, reviewFields } from './fera-review-domain.mjs';

test('Fera pagination requires the full stable set and unique source IDs', async () => {
  const pages = [
    { data: [{ id: 'one' }, { id: 'two' }], meta: { total_count: 3 } },
    { data: [{ id: 'three' }], meta: { total_count: 3 } },
  ];
  assert.deepEqual((await fetchAllFera(page => pages[page - 1], 'reviews')).map(row => row.id), ['one', 'two', 'three']);
  await assert.rejects(fetchAllFera(page => page === 1 ? pages[0] :
    { data: [{ id: 'two' }], meta: { total_count: 3 } }, 'reviews'), /repeated ID/);
  await assert.rejects(fetchAllFera(page => page === 1 ? pages[0] :
    { data: [], meta: { total_count: 3 } }, 'reviews'), /changed during pagination/);
});

test('product reviews link only by exact Wix external ID and keep the raw source', () => {
  const raw = { id: 'frev_1', rating: 5, heading: 'Great', body: 'Text', created_at: '2026-09-01T00:00:00Z',
    product: { id: 'fpro_1', external_id: 'wix-1', name: 'Changed name' }, customer: { display_name: 'A' },
    media: [{ id: 'fm_1' }], state: 'approved', verified: true };
  const mapped = reviewFields(raw, new Map([['wix-1', 'hub-uuid']]));
  assert.equal(mapped.shipping_product_id, 'hub-uuid');
  assert.equal(mapped.wix_product_id, 'wix-1');
  assert.equal(mapped.source_data, raw);
  assert.deepEqual(mapped.media, [{ id: 'fm_1' }]);
  assert.equal(reviewFields({ ...raw, product: { id: 'fpro_1', name: 'Changed name' } }, new Map()).shipping_product_id, null);
});

test('photos and videos require an HTTPS source and retain review identity', () => {
  assert.deepEqual(mediaFields({ id: 'fm_1', review_id: 'frev_1', type: 'photo', url: 'https://uploads.fera.ai/pic.jpg' }),
    { id: 'fm_1', reviewId: 'frev_1', type: 'photo', sourceUrl: 'https://uploads.fera.ai/pic.jpg' });
  assert.throws(() => mediaFields({ id: 'fm_2', type: 'video', url: 'http://localhost/video' }), /HTTPS URL/);
});
