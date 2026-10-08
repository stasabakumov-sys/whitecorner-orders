export function feraListPage(payload, label) {
  if (!payload || !Array.isArray(payload.data) || !Number.isInteger(payload.meta?.total_count) || payload.meta.total_count < 0) {
    throw Error(`Fera ${label} response has no complete data/total_count`);
  }
  return { rows: payload.data, total: payload.meta.total_count };
}

export async function fetchAllFera(fetchPage, label) {
  const rows = [];
  const seen = new Set();
  let total;
  for (let page = 1; ; page += 1) {
    const result = feraListPage(await fetchPage(page), label);
    if (total === undefined) total = result.total;
    if (total !== result.total || (result.rows.length === 0 && rows.length < total)) {
      throw Error(`Fera ${label} changed during pagination; restart the scan`);
    }
    for (const row of result.rows) {
      const id = String(row?.id ?? '').trim();
      if (!id || seen.has(id)) throw Error(`Fera ${label} has a missing or repeated ID`);
      seen.add(id);
      rows.push(row);
    }
    if (rows.length >= total) {
      if (rows.length !== total) throw Error(`Fera ${label} returned more than its stated total`);
      return rows;
    }
  }
}

export function reviewFields(review, productIds) {
  const id = String(review?.id ?? '').trim();
  if (!id) throw Error('Fera review has no ID');
  const product = review.product && typeof review.product === 'object' ? review.product : null;
  const subject = product ? 'product' : 'store';
  const wixId = product?.external_id == null ? null : String(product.external_id).trim() || null;
  const rawRating = review.rating;
  const rating = rawRating == null || rawRating === '' ? null : Number(rawRating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw Error(`Fera review ${id} has an invalid rating`);
  }
  const date = review.created_at ?? review.submitted_at ?? null;
  if (date !== null && Number.isNaN(Date.parse(String(date)))) throw Error(`Fera review ${id} has an invalid date`);
  const customer = review.customer && typeof review.customer === 'object' ? review.customer : {};
  return {
    fera_review_id: id,
    subject,
    fera_product_id: product?.id == null ? null : String(product.id),
    wix_product_id: wixId,
    shipping_product_id: wixId ? productIds.get(wixId) ?? null : null,
    rating,
    title: review.heading ?? review.title ?? null,
    body: review.body ?? null,
    author_display_name: customer.display_name ?? customer.name ?? null,
    reviewed_at: date,
    source_state: review.state ?? null,
    verified: typeof review.verified === 'boolean' ? review.verified : null,
    media: Array.isArray(review.media) ? review.media : [],
    source_data: review,
    updated_at: new Date().toISOString(),
  };
}

export function mediaFields(media) {
  const id = String(media?.id ?? '').trim();
  if (!id) throw Error('Fera media has no ID');
  const reviewId = media.review_id ?? media.review?.id ?? null;
  const sourceUrl = media.url ?? media.original_url ?? null;
  if (!sourceUrl || !/^https:\/\//i.test(String(sourceUrl))) throw Error(`Fera media ${id} has no HTTPS URL`);
  const sourceType = String(media.type ?? '').toLowerCase();
  const type = sourceType === 'photo' || sourceType.endsWith('_photo') ? 'photo'
    : sourceType === 'video' || sourceType.endsWith('_video') ? 'video' : null;
  if (!type) throw Error(`Fera media ${id} has an unsupported type`);
  return { id, reviewId: reviewId == null ? null : String(reviewId), sourceUrl: String(sourceUrl), type };
}
