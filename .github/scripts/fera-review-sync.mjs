// Private, resumable Fera -> Hub archive. Never print review or customer payloads.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fetchAllFera, mediaFields, reviewFields } from './fera-review-domain.mjs';

const mode = process.argv[2];
if (!['--audit', '--apply'].includes(mode)) throw Error('Use --audit or --apply');
const feraKey = process.env.FERA_SECRET_KEY;
if (!feraKey) throw Error('FERA_SECRET_KEY is required');

async function feraPage(resource, page) {
  const url = new URL(`https://api.fera.ai/v3/private/${resource}`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', '100');
  url.searchParams.set('subject', 'both');
  const response = await fetch(url, {
    headers: { 'Secret-Key': feraKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`Fera ${resource} page ${page}: HTTP ${response.status}`);
  return response.json();
}

const reviews = await fetchAllFera(page => feraPage('reviews', page), 'reviews');
const media = await fetchAllFera(page => feraPage('media', page), 'media');
const reviewIds = new Set(reviews.map(row => String(row.id)));
const expected = new Map();
const expectedUrls = new Map();
const embeddedMedia = new Map();
for (const review of reviews) {
  for (const item of Array.isArray(review.media) ? review.media : []) {
    if (item?.id) {
      expected.set(String(item.id), String(review.id));
      embeddedMedia.set(String(item.id), item);
    }
    else if (item?.url) expectedUrls.set(String(item.url), String(review.id));
  }
}
const normalizedMedia = media.map(raw => {
  const item = mediaFields(raw);
  const embedded = embeddedMedia.get(item.id);
  item.downloadUrls = [...new Set([raw.url, raw.original_url, embedded?.url, embedded?.original_url]
    .filter(value => typeof value === 'string' && /^https:\/\//i.test(value)))];
  const expectedReview = expected.get(item.id) ?? expectedUrls.get(item.sourceUrl);
  if (expectedReview && item.reviewId && expectedReview !== item.reviewId) {
    throw Error('Fera media/review relationship disagrees between endpoints');
  }
  item.reviewId ||= expectedReview ?? null;
  return item;
});
const mediaIds = new Set(normalizedMedia.map(item => item.id));
const mediaUrls = new Set(normalizedMedia.map(item => item.sourceUrl));
const missing = [...expected.keys()].filter(id => !mediaIds.has(id));
missing.push(...[...expectedUrls.keys()].filter(url => !mediaUrls.has(url)));
if (missing.length) throw Error(`${missing.length} review attachments were omitted by the Fera media endpoint`);
const linkedMedia = normalizedMedia.filter(item => item.reviewId && reviewIds.has(item.reviewId));
const standaloneMedia = normalizedMedia.length - linkedMedia.length;
const auditedReviews = reviews.map(review => reviewFields(review, new Map()));
const subjects = { product: auditedReviews.filter(row => row.subject === 'product').length,
  store: auditedReviews.filter(row => row.subject === 'store').length };
const fieldCoverage = {
  rating: auditedReviews.filter(row => row.rating !== null).length,
  body: auditedReviews.filter(row => row.body !== null).length,
  productWixId: auditedReviews.filter(row => row.subject === 'product' && row.wix_product_id).length,
  state: auditedReviews.filter(row => row.source_state !== null).length,
};
const hosts = new Map();
for (const item of linkedMedia) {
  for (const candidate of item.downloadUrls) {
    const host = new URL(candidate).hostname.toLowerCase();
    hosts.set(host, (hosts.get(host) ?? 0) + 1);
  }
}
console.log(JSON.stringify({ mode, reviews: reviews.length, subjects, media: media.length,
  linkedMedia: linkedMedia.length, standaloneMedia, fieldCoverage, mediaHosts: Object.fromEntries(hosts) }));
if (mode === '--audit') process.exit(0);

const allowedHosts = new Set(String(process.env.FERA_MEDIA_HOSTS ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
if (!allowedHosts.size || [...hosts.keys()].some(host => !allowedHosts.has(host))) {
  throw Error('Set FERA_MEDIA_HOSTS to the reviewed exact media hosts from --audit');
}
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const require = createRequire(path.resolve('angular-app/package.json'));
const { createClient } = require('@supabase/supabase-js');
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw Error(`${label} failed (${error.code ?? 'database error'})`);
  return data ?? [];
}
const productIds = new Map();
for (let offset = 0; ; offset += 500) {
  const page = await rows(db.from('wc_shipping_products').select('id,wix_product_id').not('wix_product_id', 'is', null).range(offset, offset + 499), 'Hub products');
  for (const item of page) productIds.set(item.wix_product_id, item.id);
  if (page.length < 500) break;
}
const normalizedReviews = reviews.map(review => reviewFields(review, productIds));
const unresolved = normalizedReviews.filter(row => row.subject === 'product' && !row.shipping_product_id).length;
console.log(JSON.stringify({ productLinksResolved: subjects.product - unresolved, productLinksUnresolved: unresolved }));

for (let offset = 0; offset < normalizedReviews.length; offset += 100) {
  await rows(db.from('wc_fera_reviews').upsert(normalizedReviews.slice(offset, offset + 100), { onConflict: 'fera_review_id' }).select('fera_review_id'), 'Hub review upsert');
}
const savedReviews = new Map();
for (let offset = 0; offset < reviews.length; offset += 100) {
  const ids = reviews.slice(offset, offset + 100).map(review => String(review.id));
  const page = await rows(db.from('wc_fera_reviews').select('id,fera_review_id').in('fera_review_id', ids), 'Hub review verification');
  for (const item of page) savedReviews.set(item.fera_review_id, item.id);
}
if (savedReviews.size !== reviews.length) throw Error('Hub did not confirm every review');

const priorMedia = new Map();
for (let offset = 0; ; offset += 500) {
  const page = await rows(db.from('wc_fera_review_media').select('fera_media_id,review_id,source_url,storage_path,storage_parts,bytes').range(offset, offset + 499), 'Hub media');
  for (const item of page) priorMedia.set(item.fera_media_id, item);
  if (page.length < 500) break;
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw Error(`Fera media download host is not allowlisted: ${url.hostname}`);
  }
  return url;
}
async function downloadOne(urlString, type) {
  let url = checkedUrl(urlString);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw Error('Fera media redirect had no location');
      url = checkedUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) throw Error(`Fera media download failed: HTTP ${response.status}`);
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
    if (!(type === 'photo' ? mime.startsWith('image/') : mime.startsWith('video/'))) {
      throw Error(`Fera media has unexpected content type ${mime || 'missing'}`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 250 * 1024 * 1024) throw Error('Fera media exceeds the 250 MB import limit; manual review required');
      chunks.push(Buffer.from(chunk));
    }
    if (!size) throw Error('Fera media download was empty');
    return { bytes: Buffer.concat(chunks), mime };
  }
  throw Error('Fera media redirected too many times');
}
async function download(urls, type) {
  for (const url of urls) {
    try { return await downloadOne(url, type); }
    catch (error) {
      if (error?.message === 'Fera media download failed: HTTP 404') continue;
      throw error;
    }
  }
  throw Error('Fera media download failed: HTTP 404 on every source URL');
}
const extension = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ['image/gif', 'gif'], ['video/mp4', 'mp4'], ['video/webm', 'webm'], ['video/quicktime', 'mov']]);
async function previouslyCopied(prior, reviewId, sourceUrl) {
  if (!prior?.storage_path || prior.review_id !== reviewId || prior.source_url !== sourceUrl) return false;
  const parts = Array.isArray(prior.storage_parts) ? prior.storage_parts : [];
  if (parts.length) {
    let total = 0;
    for (const part of parts) {
      if (!part?.path || !Number.isInteger(part.bytes) || part.bytes <= 0) return false;
      const { data: stored } = await db.storage.from('fera-review-media').info(part.path);
      if (!stored || Number(stored.size) !== part.bytes) return false;
      total += part.bytes;
    }
    return parts[0].path === prior.storage_path && total === Number(prior.bytes);
  }
  const { data: stored } = await db.storage.from('fera-review-media').info(prior.storage_path);
  return !!stored && Number(stored.size) === Number(prior.bytes);
}
let copied = 0;
let retained = 0;
const unavailable = [];
for (const item of linkedMedia) {
  const reviewId = savedReviews.get(item.reviewId);
  if (!reviewId) throw Error('Fera media refers to a review not confirmed in Hub');
  const prior = priorMedia.get(item.id);
  if (await previouslyCopied(prior, reviewId, item.sourceUrl)) { retained += 1; continue; }
  let downloaded;
  try { downloaded = await download(item.downloadUrls, item.type); }
  catch (error) {
    if (error?.message === 'Fera media download failed: HTTP 404 on every source URL') {
      unavailable.push(item.id);
      continue;
    }
    throw error;
  }
  const { bytes, mime } = downloaded;
  const suffix = extension.get(mime);
  if (!suffix) throw Error(`Fera media format ${mime} needs review`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const stem = `${reviewId}/${createHash('sha256').update(item.id).digest('hex')}`;
  let storagePath = `${stem}.${suffix}`;
  const storageParts = [];
  const { error: uploadError } = await db.storage.from('fera-review-media').upload(storagePath, bytes, { contentType: mime, upsert: true });
  if (String(uploadError?.statusCode) === '413') {
    // The project-wide Storage limit can be smaller than a source video. Keep
    // the original byte-for-byte as small, ordered objects in the private bucket.
    const partSize = 4 * 1024 * 1024;
    for (let offset = 0, index = 0; offset < bytes.length; offset += partSize, index += 1) {
      const partBytes = bytes.subarray(offset, Math.min(offset + partSize, bytes.length));
      const partPath = `${stem}.part${String(index).padStart(4, '0')}`;
      const { error } = await db.storage.from('fera-review-media').upload(partPath, partBytes,
        { contentType: 'application/octet-stream', upsert: true });
      if (error) throw Error(`Hub ${item.type} part upload failed (${error.statusCode ?? 'storage error'}; ${partBytes.length} bytes)`);
      storageParts.push({ path: partPath, bytes: partBytes.length,
        sha256: createHash('sha256').update(partBytes).digest('hex') });
    }
    storagePath = storageParts[0].path;
  } else if (uploadError) {
    throw Error(`Hub ${item.type} upload failed (${uploadError.statusCode ?? 'storage error'}; ${bytes.length} bytes)`);
  }
  const saved = await rows(db.from('wc_fera_review_media').upsert({ review_id: reviewId, fera_media_id: item.id,
    source_url: item.sourceUrl, media_type: item.type, storage_path: storagePath, storage_parts: storageParts, content_type: mime,
    bytes: bytes.length, sha256, copied_at: new Date().toISOString() }, { onConflict: 'fera_media_id' }).select('id'), 'Hub media save');
  if (saved.length !== 1) throw Error('Hub did not confirm a media record');
  copied += 1;
}
const confirmedMedia = linkedMedia.length === copied + retained;
if (unavailable.length) throw Error(`${unavailable.length} Fera review media returned HTTP 404; media IDs: ${unavailable.join(', ')}`);
if (!confirmedMedia) throw Error('Hub did not confirm every linked photo/video');
console.log(JSON.stringify({ result: 'confirmed', reviews: savedReviews.size, linkedMedia: linkedMedia.length,
  copied, previouslyCopied: retained, productLinksUnresolved: unresolved }));
