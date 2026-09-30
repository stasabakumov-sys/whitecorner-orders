import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {HubAccessError, requireHubSession} from '../_shared/hub-auth.ts';
import {billingAction, safeError} from './handler.ts';
import {BillingError} from './wix.ts';

const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS'};
Deno.serve(async (request: Request) => {
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers: {...cors, 'Content-Type': 'application/json'}});
  if (request.method === 'OPTIONS') return new Response('ok', {headers: cors});
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !service) return json({error: 'Hub configuration is missing.'}, 503);
    const db = createClient(url, service, {auth: {persistSession: false}});
    const body = await request.json().catch(() => null);
    const actions = ['checkAccess', 'importPage', 'status', 'list', 'detail', 'copyPdf', 'openPdf'];
    if (!body || !actions.includes(body.action)) return json({error: 'Invalid billing action.'}, 400);
    const user = await requireHubSession(request, db, ['checkAccess', 'importPage', 'copyPdf'].includes(body.action));
    const site = Deno.env.get('WIX_SITE_ID'), key = Deno.env.get('WIX_API_KEY');
    if (!site) return json({error: 'Wix site configuration is missing.'}, 503);
    if (['checkAccess', 'importPage', 'copyPdf'].includes(body.action) && !key) return json({error: 'Wix API key is missing.'}, 503);
    const result = await billingAction(db, {'Authorization': key || '', 'wix-site-id': site, 'Content-Type': 'application/json'}, site, user.id, body);
    return json({ok: true, ...result});
  } catch (error) {
    if (error instanceof HubAccessError) return json({error: error.message}, error.status);
    return json({error: safeError(error)}, error instanceof BillingError ? 400 : 500);
  }
});
