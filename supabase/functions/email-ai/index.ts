import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ANALYSIS_SCHEMA, AnalysisError, candidateOrderNumbers, HISTORICAL_GUIDANCE,
  INSTRUCTIONS, KNOWLEDGE_VERSION, orderSources, prepareConversation, responseText,
  validateAnalysis,
} from "./domain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: jsonHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_EMAIL_MODEL") || "gpt-5.6-luna";
  if (!supabaseUrl || !anonKey) return json({ error: "Missing Supabase runtime configuration" }, 500);

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);
    const raw = await req.text();
    if (raw.length > 350_000) throw new AnalysisError("Analysis request is too large.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new AnalysisError("Invalid JSON request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AnalysisError("Invalid request.");
    if (body.action === "status") return json({
      connected: Boolean(openaiKey), mode: "draft_review", knowledge_version: KNOWLEDGE_VERSION,
      model: openaiKey ? model : undefined,
      reason: openaiKey ? undefined : "OPENAI_API_KEY is not configured in Supabase.",
    });
    if (body.action && body.action !== "analyse") throw new AnalysisError("Unsupported action.");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY is not configured in Supabase" }, 503);
    const conversation = prepareConversation(body.message);
    const numbers = candidateOrderNumbers(body.orders);
    // Only order identifiers from the browser are used. Refresh facts under the caller's RLS.
    let rows: unknown[] = [];
    if (numbers.length) {
      const { data, error } = await userClient.from("wc_orders").select(
        "order_number,wix_synced_at,buyer_email,payment_status,fulfillment_status,delivery_type,currency,total,wc_order_items(product_name,quantity,wix_options,wc_production_units(production_status))",
      ).in("order_number", numbers).eq("is_hidden", false);
      if (error) throw new AnalysisError("Current Hub order data could not be read. Please retry.", 503);
      rows = data || [];
    }
    const orders = orderSources(rows, new Date().toISOString());
    const history = HISTORICAL_GUIDANCE.map(({ id, ...rule }) => ({ source_id: id, ...rule }));
    const input = [{
      role: "user",
      content: JSON.stringify({
        conversation: conversation.messages, conversation_complete: conversation.complete,
        candidate_orders: orders, historical_guidance: history,
        coverage: {
          attachments_reviewed: false, current_catalogue: false, current_terms: false,
          pickup_calendar: false, tracking_and_parcels: false, separate_payment_ledger: false,
        },
      }),
    }];
    const aiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model, store: false, reasoning: { effort: "low" },
        instructions: INSTRUCTIONS, input,
        text: { verbosity: "low", format: {
          type: "json_schema", name: "white_corner_email_analysis_v2",
          strict: true, schema: ANALYSIS_SCHEMA,
        } },
      }),
    });
    // Provider errors can contain customer inputs. Do not log or return their bodies.
    if (!aiRes.ok) throw new AnalysisError("AI provider is unavailable. Please retry or review manually.", 502);
    const ai = await aiRes.json();
    let parsed;
    try { parsed = JSON.parse(responseText(ai)); }
    catch (e) {
      if (e instanceof AnalysisError) throw e;
      throw new AnalysisError("AI returned unreadable output. Please retry.", 502);
    }
    const analysis = validateAnalysis(parsed, [...conversation.messages, ...orders, ...history], conversation.complete);
    return json({
      ok: true, model, knowledge_version: KNOWLEDGE_VERSION, analysis,
      context: { message_count: conversation.messages.length, complete: conversation.complete, order_count: orders.length },
    });
  } catch (e) {
    if (e instanceof AnalysisError) return json({ error: e.message }, e.status);
    return json({ error: "Email analysis could not be completed. Please retry or review manually." }, 500);
  }
});
