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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ status: false, message: 'Method not allowed.' }, 405);

  try {
    const apiKey = Deno.env.get('FAST_COURIER_API_KEY');
    if (!apiKey) return json({ status: false, message: 'Fast Courier is not configured.' }, 503);

    const body = await req.json();
    if (body?.action !== 'quotes') return json({ status: false, message: 'Unsupported Fast Courier action.' }, 400);
    const validationError = validateQuote(body.payload);
    if (validationError) return json({ status: false, message: validationError }, 422);

    // Keep the host configurable because Fast Courier can issue account-specific API hosts.
    const baseUrl = (Deno.env.get('FAST_COURIER_API_BASE_URL') || 'https://enterprise.fastcourier.com.au').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/quotes`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
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
      ? 'Fast Courier did not respond within 30 seconds.'
      : error instanceof Error ? error.message : 'Fast Courier request failed.';
    return json({ status: false, message }, 500);
  }
});
