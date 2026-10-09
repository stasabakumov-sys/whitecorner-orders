import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,range',
  'Access-Control-Expose-Headers': 'Content-Range,Accept-Ranges,Content-Length',
  'Cache-Control': 'public, max-age=60',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {...cors, 'Content-Type': 'application/json; charset=utf-8'},
});
const fail = (status: number, message: string) => json({error: message}, status);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Part = {path: string; bytes: number};

async function mediaResponse(request: Request, id: string, db: any) {
  if (!uuid.test(id)) return fail(404, 'Media not found');
  const {data: media, error} = await db.from('wc_fera_review_media')
    .select('id,review_id,storage_path,storage_parts,content_type,bytes')
    .eq('id', id).maybeSingle();
  if (error) return fail(503, 'Media is temporarily unavailable');
  if (!media?.storage_path) return fail(404, 'Media not found');
  const {data: review, error: reviewError} = await db.from('wc_fera_reviews')
    .select('id').eq('id', media.review_id).eq('is_published', true).maybeSingle();
  if (reviewError) return fail(503, 'Media is temporarily unavailable');
  if (!review) return fail(404, 'Media not found');

  const parts: Part[] = Array.isArray(media.storage_parts) && media.storage_parts.length
    ? media.storage_parts : [{path: media.storage_path, bytes: Number(media.bytes)}];
  const size = Number(media.bytes);
  if (!Number.isSafeInteger(size) || size <= 0 || parts.some(part =>
    typeof part.path !== 'string' || !Number.isSafeInteger(part.bytes) || part.bytes <= 0)
    || parts.reduce((sum, part) => sum + part.bytes, 0) !== size) return fail(503, 'Media is incomplete');

  const range = request.headers.get('range');
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, {status: 416, headers: {...cors, 'Content-Range': `bytes */${size}`}});
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start)
      return new Response(null, {status: 416, headers: {...cors, 'Content-Range': `bytes */${size}`}});
    end = Math.min(end, size - 1);
  }
  const headers = {...cors, 'Content-Type': media.content_type || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
    ...(range ? {'Content-Range': `bytes ${start}-${end}/${size}`} : {})};
  if (request.method === 'HEAD') return new Response(null, {status: range ? 206 : 200, headers});

  let index = 0, offset = 0;
  while (index < parts.length && offset + parts[index].bytes <= start) offset += parts[index++].bytes;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= parts.length || offset > end) {controller.close(); return;}
      const part = parts[index++];
      const partStart = offset;
      offset += part.bytes;
      if (partStart > end) {controller.close(); return;}
      const {data, error: downloadError} = await db.storage.from('fera-review-media').download(part.path);
      if (downloadError || !data) {controller.error(new Error('Media part unavailable')); return;}
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.length !== part.bytes) {controller.error(new Error('Media part has wrong size')); return;}
      controller.enqueue(bytes.subarray(Math.max(0, start - partStart), Math.min(bytes.length, end - partStart + 1)));
    },
  });
  return new Response(stream, {status: range ? 206 : 200, headers});
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
  if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Method not allowed');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return fail(503, 'Reviews are temporarily unavailable');
  const db = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
  const path = new URL(request.url).pathname;
  const mediaId = /\/media\/([^/]+)$/.exec(path)?.[1];
  if (mediaId) return await mediaResponse(request, mediaId, db);
  if (!path.endsWith('/hub-reviews-public')) return fail(404, 'Not found');
  if (request.method === 'HEAD') return new Response(null, {headers: cors});
  try {
    const {data: reviews, error} = await db.from('wc_fera_reviews')
      .select('id,subject,wix_product_id,shipping_product_id,rating,title,body,reviewed_at,verified,public_author_name')
      .eq('is_published', true).order('reviewed_at', {ascending: false}).limit(500);
    if (error) return fail(503, 'Reviews could not be loaded');
    const reviewIds = (reviews || []).map((review: any) => review.id);
    const {data: media, error: mediaError} = reviewIds.length
      ? await db.from('wc_fera_review_media').select('id,review_id,media_type,storage_path')
        .in('review_id', reviewIds).not('storage_path', 'is', null).limit(1000)
      : {data: [], error: null};
    if (mediaError) return fail(503, 'Review media could not be loaded');
    const productIds = [...new Set((reviews || []).map((row: any) => row.shipping_product_id).filter(Boolean))];
    const {data: products, error: productError} = productIds.length
      ? await db.from('wc_shipping_products').select('id,product_name').in('id', productIds)
      : {data: [], error: null};
    if (productError) return fail(503, 'Review products could not be loaded');
    const productNames = new Map((products || []).map((row: any) => [row.id, row.product_name]));
    const mediaByReview = new Map<string, any[]>();
    for (const item of media || []) {
      const list = mediaByReview.get(item.review_id) || [];
      list.push({id: item.id, type: item.media_type, url: `${url}/functions/v1/hub-reviews-public/media/${item.id}`});
      mediaByReview.set(item.review_id, list);
    }
    return json({reviews: (reviews || []).map((row: any) => ({
      id: row.id, subject: row.subject, wixProductId: row.wix_product_id,
      productName: productNames.get(row.shipping_product_id) || null,
      rating: row.rating, title: row.title, body: row.body, reviewedAt: row.reviewed_at,
      verified: row.verified === true, author: row.public_author_name || 'Customer',
      media: mediaByReview.get(row.id) || [],
    }))});
  } catch {return fail(503, 'Reviews are temporarily unavailable');}
});
