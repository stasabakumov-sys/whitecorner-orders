import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncShippingFulfillment } from "./shipping-fulfillment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };
const EXCLUDED_ORDER_NUMBERS = new Set(["10242"]);

function num(v: any): number | null {
  const x = v?.amount ?? v;
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function contact(order: any) {
  const r = order?.recipientInfo?.contactDetails || {};
  const b = order?.billingInfo?.contactDetails || {};
  const c = (r.firstName || r.lastName || r.company || r.phone) ? r : b;
  return {
    name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
    company: c.company || "",
    phone: c.phone || "",
  };
}

function deliveryType(order: any) {
  const info = order?.shippingInfo || {};
  const logistics = info?.logistics || {};
  const title = String(info?.title || "").toLowerCase();
  if (logistics?.pickupDetails || title.includes("pickup") || title.includes("pick-up")) return "Pickup";

  // Wix can keep a zero-value "Delivery" custom item on pickup orders. The
  // label alone is therefore not a reliable shipping signal: when both that
  // line and the order shipping total are zero, treat the order as pickup.
  const deliveryLines = (order?.lineItems || []).filter((item: any) =>
    /^(delivery|shipping)(\s+(fee|charge))?$/i.test(String(item?.productName?.original || "").trim())
  );
  const shippingAmount = num(order?.priceSummary?.shipping) || 0;
  const deliveryAmount = deliveryLines.reduce((sum: number, item: any) => {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    return sum + (num(item?.price) || 0) * quantity;
  }, 0);
  if (deliveryLines.length && Math.abs(shippingAmount) < 0.005 && Math.abs(deliveryAmount) < 0.005) return "Pickup";
  return "Shipping";
}

function deliveryAddress(order: any) {
  return order?.shippingInfo?.logistics?.shippingDestination?.address
    || order?.recipientInfo?.address
    || order?.billingInfo?.address
    || {};
}

function isUnfinished(order: any) {
  const fulfillment = String(order?.fulfillmentStatus || "").toUpperCase();
  const status = String(order?.status || "").toUpperCase();
  if (EXCLUDED_ORDER_NUMBERS.has(String(order?.number ?? ""))) return false;
  if (order?.archived === true) return false;
  if (["CANCELED", "CANCELLED"].includes(status)) return false;
  if (["FULFILLED", "COMPLETED"].includes(fulfillment)) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  try {
    const requestBody = await req.json().catch(() => ({}));
    const wixApiKey = Deno.env.get("WIX_API_KEY");
    const wixSiteId = Deno.env.get("WIX_SITE_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!wixApiKey || !wixSiteId || !supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ error: "Missing required secrets" }), { status: 500, headers: jsonHeaders });
    }

    const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const wixHeaders = {
      "Content-Type": "application/json",
      "Authorization": wixApiKey,
      "wix-site-id": wixSiteId,
    };

    if (requestBody?.action === "fulfillShipping") {
      // Gateway JWT verification remains enabled; also require a user session.
      const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
      const { data: user, error: authError } = await db.auth.getUser(jwt);
      if (authError || !user.user) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: jsonHeaders });
      const orderId = String(requestBody.orderId || '');
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new Response(JSON.stringify({ error: 'Valid orderId is required' }), { status: 400, headers: jsonHeaders });
      try {
        const result = await syncShippingFulfillment(db, orderId, wixHeaders);
        return new Response(JSON.stringify(result), { headers: jsonHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Shipping synchronization failed' }), { status: 409, headers: jsonHeaders });
      }
    }

    if (requestBody?.action === "markFulfilled") {
      const localOrderId = String(requestBody?.orderId || "").trim();
      if (!localOrderId) return new Response(JSON.stringify({ error: "orderId is required" }), { status: 400, headers: jsonHeaders });

      const [{ data: order, error: orderError }, { data: localFulfilment, error: fulfilmentError }] = await Promise.all([
        db.from("wc_orders").select("id,wix_order_id,order_number,raw_order").eq("id", localOrderId).maybeSingle(),
        db.from("wc_fulfilment").select("id,status").eq("order_id", localOrderId).eq("route", "Pickup").eq("status", "Fulfilled").maybeSingle(),
      ]);
      if (orderError) throw orderError;
      if (fulfilmentError) throw fulfilmentError;
      if (!order?.wix_order_id) return new Response(JSON.stringify({ error: "Order or Wix order ID was not found" }), { status: 404, headers: jsonHeaders });
      if (!localFulfilment) return new Response(JSON.stringify({ error: "Order must be collected locally before it can be fulfilled in Wix" }), { status: 409, headers: jsonHeaders });

      const { data: orderItems, error: itemError } = await db.from("wc_order_items").select("wix_line_item_id,product_name,quantity").eq("order_id", localOrderId);
      if (itemError) throw itemError;
      const lineItems = (orderItems || [])
        .filter((item: any) => !/^(delivery|shipping)(\s+(fee|charge))?$/i.test(String(item?.product_name || "").trim()))
        .filter((item: any) => String(item?.wix_line_item_id || "").trim())
        .map((item: any) => ({ id: String(item.wix_line_item_id), quantity: Math.max(1, Number(item.quantity || 1)) }));
      if (!lineItems.length) return new Response(JSON.stringify({ error: "No Wix product line items were found for this order" }), { status: 422, headers: jsonHeaders });

      const wixOrderRes = await fetch(`https://www.wixapis.com/ecom/v1/orders/${encodeURIComponent(order.wix_order_id)}`, { method: "GET", headers: wixHeaders });
      const wixOrderPayload = await wixOrderRes.json().catch(() => ({}));
      if (!wixOrderRes.ok) return new Response(JSON.stringify({ error: "Could not read the Wix order", status: wixOrderRes.status, payload: wixOrderPayload }), { status: wixOrderRes.status, headers: jsonHeaders });
      const currentStatus = String(wixOrderPayload?.order?.fulfillmentStatus || wixOrderPayload?.fulfillmentStatus || "").toUpperCase();
      if (["FULFILLED", "COMPLETED"].includes(currentStatus)) {
        await db.from("wc_orders").update({ fulfillment_status: "FULFILLED", raw_order: { ...(order.raw_order || {}), fulfillmentStatus: "FULFILLED" }, wix_synced_at: new Date().toISOString() }).eq("id", localOrderId);
        return new Response(JSON.stringify({ ok: true, alreadyFulfilled: true, orderNumber: order.order_number, wixOrderId: order.wix_order_id }), { status: 200, headers: jsonHeaders });
      }

      const fulfilRes = await fetch(`https://www.wixapis.com/ecom/v1/fulfillments/orders/${encodeURIComponent(order.wix_order_id)}/create-fulfillment`, { method: "POST", headers: wixHeaders, body: JSON.stringify({ fulfillment: { lineItems } }) });
      const fulfilPayload = await fulfilRes.json().catch(() => ({}));
      if (!fulfilRes.ok) return new Response(JSON.stringify({ error: "Wix fulfillment error", status: fulfilRes.status, payload: fulfilPayload }), { status: fulfilRes.status, headers: jsonHeaders });

      const { error: updateError } = await db.from("wc_orders").update({ fulfillment_status: "FULFILLED", raw_order: { ...(order.raw_order || {}), fulfillmentStatus: "FULFILLED" }, wix_synced_at: new Date().toISOString() }).eq("id", localOrderId);
      if (updateError) throw updateError;
      return new Response(JSON.stringify({ ok: true, alreadyFulfilled: false, orderNumber: order.order_number, wixOrderId: order.wix_order_id, fulfillment: fulfilPayload?.fulfillment || fulfilPayload }), { status: 200, headers: jsonHeaders });
    }

    let allOrders: any[] = [];
    let cursor: string | undefined = undefined;
    let pagesScanned = 0;
    let previousCursor: string | undefined = undefined;

    for (let page = 0; page < 100; page++) {
      const search: Record<string, any> = cursor
        ? { cursorPaging: { cursor } }
        : {
            filter: {
              fulfillmentStatus: "NOT_FULFILLED",
              status: { "$ne": "CANCELED" },
            },
            cursorPaging: { limit: 100 },
            sort: [{ fieldName: "createdDate", order: "DESC" }],
          };

      const wixRes = await fetch("https://www.wixapis.com/ecom/v1/orders/search", {
        method: "POST",
        headers: wixHeaders,
        body: JSON.stringify({ search }),
      });

      const payload = await wixRes.json();
      if (!wixRes.ok) {
        console.error("WIX_API_ERROR", JSON.stringify({ page: page + 1, status: wixRes.status, payload }));
        return new Response(JSON.stringify({ error: "Wix API error", status: wixRes.status, payload }, null, 2), { status: wixRes.status, headers: jsonHeaders });
      }

      const batch = payload?.orders || [];
      allOrders.push(...batch);
      pagesScanned++;

      const cursors = payload?.pagingMetadata?.cursors || payload?.metadata?.cursors || {};
      const next = cursors?.next;
      const hasNext = cursors?.hasNext;

      console.log("WIX_PAGE", JSON.stringify({
        page: page + 1,
        count: batch.length,
        firstOrder: batch[0]?.number || null,
        lastOrder: batch.at(-1)?.number || null,
        sentCursor: cursor ? cursor.slice(0, 18) : null,
        nextCursor: next ? String(next).slice(0, 18) : null,
        hasNext: hasNext ?? null,
      }));

      if (!next || hasNext === false || batch.length === 0) break;
      if (next === cursor || next === previousCursor) {
        console.warn("WIX_CURSOR_STALLED", String(next).slice(0, 40));
        break;
      }
      previousCursor = cursor;
      cursor = next;
    }

    const uniqueOrders = Array.from(new Map(allOrders.map((o: any) => [o.id, o])).values());
    const unfinished = uniqueOrders.filter(isUnfinished);
    let insertedOrUpdated = 0;
    let itemCount = 0;
    let unitCount = 0;

    for (const order of unfinished) {
      const c = contact(order);
      const summary = order?.priceSummary || {};
      const orderRow = {
        wix_order_id: order.id,
        order_number: String(order.number ?? ""),
        wix_created_at: order.createdDate || null,
        wix_updated_at: order.updatedDate || null,
        payment_status: order.paymentStatus || null,
        fulfillment_status: order.fulfillmentStatus || null,
        wix_status: order.status || null,
        archived: !!order.archived,
        currency: order.currency || null,
        buyer_email: order?.buyerInfo?.email || null,
        customer_name: c.name || null,
        company: c.company || null,
        phone: c.phone || null,
        delivery_type: deliveryType(order),
        delivery_title: order?.shippingInfo?.title || null,
        delivery_address: deliveryAddress(order),
        buyer_note: order.buyerNote || null,
        subtotal: num(summary?.subtotal),
        shipping: num(summary?.shipping),
        tax: num(summary?.tax),
        discount: num(summary?.discount),
        total: num(summary?.total),
        additional_fees: num(summary?.totalAdditionalFees),
        balance_summary: order.balanceSummary || {},
        activities: order.activities || [],
        raw_order: order,
        wix_synced_at: new Date().toISOString(),
      };

      const { data: savedOrder, error: orderErr } = await db
        .from("wc_orders")
        .upsert(orderRow, { onConflict: "wix_order_id" })
        .select("id")
        .single();
      if (orderErr) throw orderErr;
      insertedOrUpdated++;

      const orderId = savedOrder.id;
      const { data: completedFulfilment } = await db
        .from("wc_fulfilment")
        .select("status")
        .eq("order_id", orderId)
        .eq("status", "Fulfilled")
        .maybeSingle();
      if (completedFulfilment) {
        const { error: preserveErr } = await db
          .from("wc_orders")
          .update({ fulfillment_status: "FULFILLED" })
          .eq("id", orderId);
        if (preserveErr) throw preserveErr;
      }
      const orderItems = order.lineItems || [];
      const seenIds: string[] = [];

      for (let i = 0; i < orderItems.length; i++) {
        const li = orderItems[i];
        const lineId = String(li.id || `${order.id}-line-${i}`);
        seenIds.push(lineId);
        const opts = li?.catalogReference?.options || {};
        const quantity = Math.max(1, Number(li?.quantity || 1));

        const itemRow = {
          order_id: orderId,
          wix_line_item_id: lineId,
          product_name: li?.productName?.original || null,
          quantity,
          unit_price: num(li?.price),
          custom_line_item: !!li?.customLineItem,
          catalog_reference: li?.catalogReference || {},
          wix_options: opts?.options || {},
          custom_text_fields: opts?.customTextFields || {},
          description_lines: li?.descriptionLines || [],
          image: li?.media || li?.image || {},
          raw_item: li,
        };

        const { data: savedItem, error: itemErr } = await db
          .from("wc_order_items")
          .upsert(itemRow, { onConflict: "order_id,wix_line_item_id" })
          .select("id")
          .single();
        if (itemErr) throw itemErr;
        itemCount++;

        const orderItemId = savedItem.id;
        for (let unitIndex = 1; unitIndex <= quantity; unitIndex++) {
          const { error: unitErr } = await db
            .from("wc_production_units")
            .upsert({ order_item_id: orderItemId, unit_index: unitIndex }, { onConflict: "order_item_id,unit_index", ignoreDuplicates: true });
          if (unitErr) throw unitErr;
          unitCount++;
        }

        const { error: trimErr } = await db.from("wc_production_units").delete().eq("order_item_id", orderItemId).gt("unit_index", quantity);
        if (trimErr) throw trimErr;
      }

      if (seenIds.length) {
        const safeIds = seenIds.map(x => `\"${x.replaceAll('\\"','')}\"`).join(",");
        const { error: delErr } = await db.from("wc_order_items").delete().eq("order_id", orderId).not("wix_line_item_id", "in", `(${safeIds})`);
        if (delErr) console.warn("Could not prune removed line items", delErr);
      }
    }

    const result = {
      ok: true,
      wixPagesScanned: pagesScanned,
      wixOrdersScanned: uniqueOrders.length,
      unfinishedOrders: unfinished.length,
      ordersUpserted: insertedOrUpdated,
      lineItemsUpserted: itemCount,
      productionUnitsEnsured: unitCount,
      excludedOrders: [...EXCLUDED_ORDER_NUMBERS],
      syncedAt: new Date().toISOString(),
    };

    console.log("SYNC_RESULT", JSON.stringify(result));
    return new Response(JSON.stringify(result, null, 2), { status: 200, headers: jsonHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }, null, 2), { status: 500, headers: jsonHeaders });
  }
});
