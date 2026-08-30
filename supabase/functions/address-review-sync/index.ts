import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function norm(v: unknown) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stateCode(v: unknown) {
  return clean(v).toUpperCase().replace(/^AU[-\s]?/, "");
}

function addressParts(a: any) {
  return {
    line: clean(a?.addressLine || a?.addressLine1 || a?.streetAddress || a?.formattedAddress),
    suburb: clean(a?.city || a?.suburb || a?.locality),
    state: stateCode(a?.subdivision || a?.state || a?.administrativeArea),
    postcode: clean(a?.postalCode || a?.postcode),
  };
}

function addressText(a: any) {
  const p = addressParts(a);
  return [p.line, p.suburb, p.state, p.postcode, "Australia"].filter(Boolean).join(", ");
}

async function validateAddress(apiKey: string, raw: any) {
  const input = addressParts(raw);
  const issues: string[] = [];

  if (!input.line || !input.suburb || !input.state || !input.postcode) {
    issues.push("Incomplete address");
  }

  const params = new URLSearchParams();
  if (input.line) params.append("address.addressLines", input.line);
  if (input.suburb) params.set("address.locality", input.suburb);
  if (input.state) params.set("address.administrativeArea", input.state);
  if (input.postcode) params.set("address.postalCode", input.postcode);
  params.set("address.regionCode", "AU");
  params.set("key", apiKey);

  const res = await fetch(`https://geocode.googleapis.com/v4/geocode/address?${params.toString()}`, {
    headers: { "X-Goog-FieldMask": "results.formattedAddress,results.placeId,results.postalAddress,results.types,results.granularity" },
  });

  if (!res.ok) {
    throw new Error(`Google Geocoding ${res.status}: ${await res.text()}`);
  }

  const payload = await res.json();
  const result = payload?.results?.[0];
  if (!result) {
    if (!issues.includes("Address not found")) issues.push("Address not found");
    return { issues, suggested: null };
  }

  const pa = result.postalAddress || {};
  const suggested = {
    address: clean(result.formattedAddress),
    postcode: clean(pa.postalCode),
    suburb: clean(pa.locality),
    state: stateCode(pa.administrativeArea),
    placeId: clean(result.placeId),
  };

  if (input.postcode && suggested.postcode && norm(input.postcode) !== norm(suggested.postcode)) issues.push("Postcode mismatch");
  if (input.suburb && suggested.suburb && norm(input.suburb) !== norm(suggested.suburb)) issues.push("Suburb mismatch");
  if (input.state && suggested.state && norm(input.state) !== norm(suggested.state)) issues.push("State mismatch");

  const preciseTypes = new Set(["street_address", "premise", "subpremise"]);
  const isPrecise = (result.types || []).some((t: string) => preciseTypes.has(t)) || ["ROOFTOP", "PREMISE"].includes(String(result.granularity || "").toUpperCase());
  if (!isPrecise && !issues.length) issues.push("Address not precise");

  return { issues: [...new Set(issues)], suggested };
}

Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!supabaseUrl || !serviceRole || !googleKey) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or GOOGLE_MAPS_API_KEY" }), { status: 500, headers: jsonHeaders });
    }

    const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const { data: orders, error } = await db
      .from("wc_orders")
      .select("id,order_number,customer_name,delivery_type,delivery_address,wix_updated_at")
      .eq("is_hidden", false)
      .eq("delivery_type", "Shipping")
      .order("wix_created_at", { ascending: false });
    if (error) throw error;

    let checked = 0, issuesFound = 0, cleared = 0;
    for (const order of orders || []) {
      const raw = order.delivery_address || {};
      const text = addressText(raw);
      try {
        const result = await validateAddress(googleKey, raw);
        checked++;
        if (!result.issues.length) {
          const { error: delErr } = await db.from("wc_address_issues").delete().eq("order_id", order.id);
          if (delErr) throw delErr;
          cleared++;
          continue;
        }

        issuesFound++;
        const row: any = {
          order_id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          address_input: raw,
          address_text: text,
          issue_types: result.issues,
          issue_summary: result.issues.join(" · "),
          suggested_address: result.suggested?.address || null,
          suggested_postcode: result.suggested?.postcode || null,
          suggested_suburb: result.suggested?.suburb || null,
          suggested_state: result.suggested?.state || null,
          google_place_id: result.suggested?.placeId || null,
          checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await db.from("wc_address_issues").select("address_text,issue_summary,validation_status").eq("order_id", order.id).maybeSingle();
        if (existing && (existing.address_text !== text || existing.issue_summary !== row.issue_summary)) row.validation_status = "New";

        const { error: upErr } = await db.from("wc_address_issues").upsert(row, { onConflict: "order_id" });
        if (upErr) throw upErr;
      } catch (e) {
        console.warn("ADDRESS_CHECK_FAILED", order.order_number, String((e as any)?.message || e));
      }
    }

    return new Response(JSON.stringify({ ok: true, checked, issuesFound, cleared, checkedAt: new Date().toISOString() }, null, 2), { status: 200, headers: jsonHeaders });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }, null, 2), { status: 500, headers: jsonHeaders });
  }
});
