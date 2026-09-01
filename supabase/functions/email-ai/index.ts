import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

const INTENTS = [
  "Order question",
  "Customisation",
  "Product question",
  "Production / lead time",
  "Pickup",
  "Delivery / shipping",
  "Payment / invoice",
  "Order change",
  "Claim / damage",
  "Cancellation / refund",
  "General enquiry",
] as const;

const MANUAL_ONLY = new Set(["Customisation", "Order change", "Claim / damage", "Cancellation / refund"]);

function responseText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_EMAIL_MODEL") || "gpt-5.6-luna";
  if (!supabaseUrl || !anonKey || !openaiKey) {
    return new Response(JSON.stringify({ error: "Missing email AI configuration" }), { status: 500, headers: jsonHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const body = await req.json().catch(() => ({}));
    const message = body?.message || {};
    const orders = Array.isArray(body?.orders) ? body.orders.slice(0, 8) : [];
    if (!message?.subject || !(message?.body || message?.preview)) {
      return new Response(JSON.stringify({ error: "message subject/body required" }), { status: 400, headers: jsonHeaders });
    }

    const instructions = `You are the White Corner email operations assistant for a small Australian event furniture manufacturer.\n\nYour task is to analyse ONE incoming customer email and prepare a safe draft reply for human review.\n\nRules:\n- Use ONLY facts present in the supplied email and supplied Hub order context.\n- Never invent order status, dates, prices, availability, shipping status, production timing, policy exceptions, refunds, or promises.\n- If facts are missing or conflicting, explicitly say review is required and make the draft cautious.\n- Claims/damage, cancellations/refunds, paid-order changes, custom pricing/feasibility are high-risk: manual review is mandatory.\n- Do not auto-send anything.\n- Keep replies concise, warm, professional, and natural for White Corner.\n- If this is clearly an automated notification or no customer reply is needed, set needs_reply=false and draft_reply="".\n- linked_order must be one of the supplied order numbers or null.\n- Confidence is 0 to 1 based on certainty of classification and order match.\n- Output JSON only through the required schema.`;

    const input = [{
      role: "user",
      content: JSON.stringify({
        email: {
          from_name: message.correspondent || "",
          from_email: message.email || "",
          subject: message.subject || "",
          body: message.body || message.preview || "",
          mailbox: message.mailbox || "",
        },
        candidate_orders: orders,
      }),
    }];

    const aiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        instructions,
        input,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "white_corner_email_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                needs_reply: { type: "boolean" },
                intent: { type: "string", enum: [...INTENTS] },
                linked_order: { type: ["string", "null"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                summary: { type: "string" },
                draft_reply: { type: "string" },
                review_required: { type: "boolean" },
                review_reason: { type: "string" },
              },
              required: ["needs_reply", "intent", "linked_order", "confidence", "summary", "draft_reply", "review_required", "review_reason"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const ai = await aiRes.json();
    if (!aiRes.ok) throw new Error(`OpenAI response failed: ${JSON.stringify(ai)}`);
    const text = responseText(ai);
    if (!text) throw new Error("OpenAI returned no structured output");
    const result = JSON.parse(text);

    if (MANUAL_ONLY.has(String(result.intent))) {
      result.review_required = true;
      if (!result.review_reason) result.review_reason = "High-risk category requires manual review.";
    }
    if (!result.needs_reply) result.draft_reply = "";

    return new Response(JSON.stringify({ ok: true, model, analysis: result }), { headers: jsonHeaders });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: jsonHeaders });
  }
});
