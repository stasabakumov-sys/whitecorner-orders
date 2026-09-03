import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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
    if (!['quotes', 'insurance-list'].includes(body?.action)) return json({ status: false, message: 'Unsupported Fast Courier action.' }, 400);
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
