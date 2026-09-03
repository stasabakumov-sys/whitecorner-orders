import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const text = (value: unknown) => String(value ?? '').trim();
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
const documentBucket = 'shipping-documents';

async function courierJson(url: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Secret-Key': apiKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let result: any;
  try { result = raw ? JSON.parse(raw) : {}; }
  catch { result = { status: false, message: raw || 'Invalid response from Fast Courier.' }; }
  return { response, result };
}

async function storeCourierDocuments(orderId: string, documents: Record<string, unknown> | null | undefined) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey || !documents) return {};
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error: bucketError } = await supabase.storage.createBucket(documentBucket, { public: false });
  if (bucketError && !/already exists/i.test(bucketError.message)) throw bucketError;
  const stored: Record<string, { path: string }> = {};
  for (const kind of ['label', 'invoice', 'manifest']) {
    const source = text(documents[kind]);
    if (!source) continue;
    const response = await fetch(source);
    if (!response.ok) continue;
    const contentType = response.headers.get('content-type') || 'application/pdf';
    const extension = contentType.includes('pdf') ? 'pdf' : 'bin';
    const path = `fast-courier/${orderId}/${kind}.${extension}`;
    const { error } = await supabase.storage.from(documentBucket).upload(path, await response.arrayBuffer(), { contentType, upsert: true });
    if (!error) stored[kind] = { path };
  }
  return stored;
}

async function signedDocumentUrl(path: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Document storage is not configured.');
  if (!path.startsWith('fast-courier/') || path.includes('..')) throw new Error('Invalid document path.');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.storage.from(documentBucket).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

function validateQuote(payload: any) {
  const required = ['pickupSuburb', 'pickupState', 'pickupPostcode', 'destinationSuburb', 'destinationState', 'destinationPostcode'];
  for (const key of required) if (!text(payload?.[key])) return `${key} is required.`;
  if (!['commercial', 'residential'].includes(payload?.pickupBuildingType)) return 'Select a pickup building type.';
  if (!['commercial', 'residential'].includes(payload?.destinationBuildingType)) return 'Select a destination building type.';
  if (!Array.isArray(payload?.items) || !payload.items.length) return 'At least one package is required.';
  for (const [index, item] of payload.items.entries()) {
    for (const key of ['weight', 'length', 'width', 'height', 'quantity']) {
      if (!positive(item?.[key])) return `Package ${index + 1}: ${key} must be greater than zero.`;
    }
  }
  return '';
}

function addressLines(raw: any) {
  const line = text(raw?.addressLine || raw?.addressLine1 || raw?.streetAddress || raw?.formattedAddress);
  const suburb = text(raw?.city || raw?.suburb || raw?.locality);
  const state = text(raw?.subdivision || raw?.state || raw?.administrativeArea).toUpperCase().replace(/^AU[-\s]?/, '');
  const postcode = text(raw?.postalCode || raw?.postcode || raw?.zipCode);
  return [line, [suburb, state, postcode].filter(Boolean).join(' '), 'Australia'].filter(Boolean);
}

async function detectAddressType(payload: any) {
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!googleKey) return json({ status: false, message: 'Google address validation is not configured.' }, 503);
  const lines = addressLines(payload);
  if (lines.length < 2) return json({ status: false, message: 'A complete delivery address is required.' }, 422);

  const response = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(googleKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: { regionCode: 'AU', addressLines: lines } }),
  });
  const raw = await response.text();
  let result: any;
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
  if (!response.ok) {
    console.warn('GOOGLE_ADDRESS_VALIDATION_FAILED', response.status, raw);
    return json({ status: false, message: 'Google could not validate this address.', upstreamStatus: response.status }, 502);
  }

  const metadata = result?.result?.metadata || {};
  const business = typeof metadata.business === 'boolean' ? metadata.business : null;
  const residential = typeof metadata.residential === 'boolean' ? metadata.residential : null;
  const type = business === true && residential !== true
    ? 'commercial'
    : residential === true ? 'residential' : 'unknown';
  return json({
    status: true,
    type,
    business,
    residential,
    formattedAddress: text(result?.result?.address?.formattedAddress),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ status: false, message: 'Method not allowed.' }, 405);

  try {
    const body = await req.json();
    if (body?.action === 'address-type') return await detectAddressType(body.payload);
    if (!['quotes', 'insurance-list', 'save-order-details', 'booking', 'order-status', 'document-url'].includes(body?.action)) return json({ status: false, message: 'Unsupported Fast Courier action.' }, 400);
    if (body.action === 'document-url') return json({ status: true, url: await signedDocumentUrl(text(body.path)) });
    // Fast Courier credentials are loaded from Supabase runtime secrets.
    const apiKey = Deno.env.get('FAST_COURIER_API_KEY');
    if (!apiKey) return json({ status: false, message: 'Fast Courier is not configured.' }, 503);

    // Keep the host configurable because Fast Courier can issue account-specific API hosts.
    const baseUrl = (Deno.env.get('FAST_COURIER_API_BASE_URL') || 'https://enterprise-api.fastcourier.com.au').replace(/\/$/, '');
    if (body.action === 'insurance-list') {
      const response = await fetch(`${baseUrl}/api/insurance-list`, {
        headers: { Accept: 'application/json', 'Secret-Key': apiKey },
      });
      const raw = await response.text();
      let result: any;
      try { result = raw ? JSON.parse(raw) : {}; } catch { result = { status: false, message: raw || 'Invalid response from Fast Courier.' }; }
      if (!response.ok) return json({ ...result, status: false, upstreamStatus: response.status }, response.status);
      return json(result);
    }

    if (['save-order-details', 'booking', 'order-status'].includes(body.action)) {
      const orderId = text(body.orderId);
      if (!/^[A-Za-z0-9_-]+$/.test(orderId)) return json({ status: false, message: 'A valid Fast Courier orderId is required.' }, 422);
      const route = body.action === 'save-order-details'
        ? `/api/save-order-details/${encodeURIComponent(orderId)}`
        : body.action === 'booking'
          ? `/api/order-booking/${encodeURIComponent(orderId)}`
          : `/api/order-status/${encodeURIComponent(orderId)}`;
      const init: RequestInit = body.action === 'order-status'
        ? { method: 'GET' }
        : { method: 'POST', ...(body.action === 'save-order-details' ? { body: JSON.stringify(body.payload || {}) } : {}) };
      const { response, result } = await courierJson(`${baseUrl}${route}`, apiKey, init);
      if (!response.ok) return json({ ...result, status: false, upstreamStatus: response.status }, response.status);
      if (body.action === 'order-status' && result?.documents) {
        try { result.storedDocuments = await storeCourierDocuments(orderId, result.documents); }
        catch (storageError) { result.documentStorageError = storageError instanceof Error ? storageError.message : 'Documents could not be stored.'; }
      }
      return json(result);
    }

    const validationError = validateQuote(body.payload);
    if (validationError) return json({ status: false, message: validationError }, 422);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/quotes`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Secret-Key': apiKey,
        },
        body: JSON.stringify(body.payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    let result: any;
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { status: false, message: raw || 'Invalid response from Fast Courier.' }; }
    if (!response.ok) return json({ ...result, status: false, upstreamStatus: response.status }, response.status);
    return json(result);
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? 'Fast Courier did not respond within 90 seconds.'
      : error instanceof Error ? error.message : 'Fast Courier request failed.';
    return json({ status: false, message }, 500);
  }
});
