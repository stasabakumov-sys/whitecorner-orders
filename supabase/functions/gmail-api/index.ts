import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };
const ALLOWED_MAILBOXES: Record<string, string> = {
  info: "info@whitecorner.com.au",
  support: "support@whitecorner.com.au",
};

function headerValue(headers: any[], name: string) {
  return String((headers || []).find(h => String(h?.name || "").toLowerCase() === name.toLowerCase())?.value || "");
}
function decodeBase64Url(value: string) {
  if (!value) return "";
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function stripHtml(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  const parts = payload.parts || [];
  for (const part of parts) {
    const text = extractBody(part);
    if (text) return text;
  }
  if (payload.mimeType === "text/html" && payload.body?.data) return stripHtml(decodeBase64Url(payload.body.data));
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}
function displayName(address: string) {
  const match = address.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  return (match?.[1] || address.split("@")[0] || address).trim();
}
function displayEmail(address: string) {
  const match = address.match(/<([^>]+)>/);
  return (match?.[1] || address).trim();
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase() || "").join("") || "?";
}
function encodeRawMail(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!supabaseUrl || !serviceRole || !anonKey || !clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "Missing Gmail API configuration" }), { status: 500, headers: jsonHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");
    const mailboxKey = String(body.mailbox || "");

    if (action === "status" && !mailboxKey) {
      const { data, error } = await admin.from("wc_mailboxes").select("mailbox_key,email,connected_at,last_sync_at,granted_scopes").order("mailbox_key");
      if (error) throw error;
      return new Response(JSON.stringify({ mailboxes: data || [] }), { headers: jsonHeaders });
    }

    const expectedEmail = ALLOWED_MAILBOXES[mailboxKey];
    if (!expectedEmail) return new Response(JSON.stringify({ error: "Unknown mailbox" }), { status: 400, headers: jsonHeaders });
    const { data: mailbox, error: mailboxError } = await admin.from("wc_mailboxes").select("mailbox_key,email,refresh_token,connected_at,last_sync_at,granted_scopes").eq("mailbox_key", mailboxKey).maybeSingle();
    if (mailboxError) throw mailboxError;
    if (!mailbox?.refresh_token) return new Response(JSON.stringify({ connected: false, mailbox: mailboxKey, email: expectedEmail }), { status: action === "status" ? 200 : 409, headers: jsonHeaders });
    if (action === "status") return new Response(JSON.stringify({ connected: true, mailbox: mailboxKey, email: mailbox.email, connectedAt: mailbox.connected_at, lastSyncAt: mailbox.last_sync_at, scopes: mailbox.granted_scopes || [] }), { headers: jsonHeaders });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: mailbox.refresh_token, grant_type: "refresh_token" }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) throw new Error(`Google refresh failed: ${JSON.stringify(token)}`);
    const gmailHeaders = { Authorization: `Bearer ${token.access_token}` };

    if (action === "list") {
      const view = String(body.view || "Inbox");
      const query = view === "Sent" ? "in:sent" : "in:inbox";
      const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=${encodeURIComponent(query)}`, { headers: gmailHeaders });
      const list = await listRes.json();
      if (!listRes.ok) throw new Error(`Gmail list failed: ${JSON.stringify(list)}`);
      const ids = (list.messages || []).slice(0, 30);
      const rows = await Promise.all(ids.map(async (m: any) => {
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, { headers: gmailHeaders });
        const msg = await res.json();
        if (!res.ok) return null;
        const headers = msg.payload?.headers || [];
        const from = headerValue(headers, "From");
        const to = headerValue(headers, "To");
        const subject = headerValue(headers, "Subject") || "(no subject)";
        const date = headerValue(headers, "Date");
        const outgoing = view === "Sent";
        const personRaw = outgoing ? to : from;
        const name = displayName(personRaw);
        const labels = Array.isArray(msg.labelIds) ? msg.labelIds : [];
        return {
          id: msg.id,
          threadId: msg.threadId,
          mailbox: mailboxKey,
          correspondent: name,
          email: displayEmail(personRaw),
          initials: initials(name),
          subject,
          preview: String(msg.snippet || ""),
          received_at: date,
          time: date,
          direction: outgoing ? "Outgoing" : "Incoming",
          status: outgoing ? "Sent" : "Inbox",
          unread: labels.includes("UNREAD"),
          starred: labels.includes("STARRED"),
          needs_reply: false,
        };
      }));
      await admin.from("wc_mailboxes").update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("mailbox_key", mailboxKey);
      return new Response(JSON.stringify({ connected: true, mailbox: mailboxKey, email: expectedEmail, messages: rows.filter(Boolean) }), { headers: jsonHeaders });
    }

    if (action === "get") {
      const messageId = String(body.messageId || "");
      if (!messageId) return new Response(JSON.stringify({ error: "messageId required" }), { status: 400, headers: jsonHeaders });
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`, { headers: gmailHeaders });
      const msg = await res.json();
      if (!res.ok) throw new Error(`Gmail get failed: ${JSON.stringify(msg)}`);
      const headers = msg.payload?.headers || [];
      return new Response(JSON.stringify({
        id: msg.id,
        threadId: msg.threadId,
        from: headerValue(headers, "From"),
        to: headerValue(headers, "To"),
        subject: headerValue(headers, "Subject") || "(no subject)",
        date: headerValue(headers, "Date"),
        body: extractBody(msg.payload),
        snippet: msg.snippet || "",
        unread: Array.isArray(msg.labelIds) && msg.labelIds.includes("UNREAD"),
        starred: Array.isArray(msg.labelIds) && msg.labelIds.includes("STARRED"),
      }), { headers: jsonHeaders });
    }

    if (["markRead", "markUnread", "archive", "star", "unstar"].includes(action)) {
      const messageId = String(body.messageId || "");
      if (!messageId) return new Response(JSON.stringify({ error: "messageId required" }), { status: 400, headers: jsonHeaders });
      const addLabelIds: string[] = [];
      const removeLabelIds: string[] = [];
      if (action === "markRead") removeLabelIds.push("UNREAD");
      if (action === "markUnread") addLabelIds.push("UNREAD");
      if (action === "archive") removeLabelIds.push("INBOX");
      if (action === "star") addLabelIds.push("STARRED");
      if (action === "unstar") removeLabelIds.push("STARRED");
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`, {
        method: "POST",
        headers: { ...gmailHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(`Gmail ${action} failed: ${JSON.stringify(result)}`);
      return new Response(JSON.stringify({ ok: true, message: result }), { headers: jsonHeaders });
    }

    if (action === "trash") {
      const messageId = String(body.messageId || "");
      if (!messageId) return new Response(JSON.stringify({ error: "messageId required" }), { status: 400, headers: jsonHeaders });
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`, {
        method: "POST",
        headers: gmailHeaders,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(`Gmail trash failed: ${JSON.stringify(result)}`);
      return new Response(JSON.stringify({ ok: true, message: result }), { headers: jsonHeaders });
    }

    if (action === "send") {
      const to = String(body.to || "").trim();
      const subject = String(body.subject || "").trim();
      const text = String(body.text || "");
      if (!to || !subject || !text) return new Response(JSON.stringify({ error: "to, subject and text are required" }), { status: 400, headers: jsonHeaders });
      const raw = [`From: ${expectedEmail}`, `To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", text].join("\r\n");
      const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { ...gmailHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: encodeRawMail(raw) }),
      });
      const sent = await sendRes.json();
      if (!sendRes.ok) throw new Error(`Gmail send failed: ${JSON.stringify(sent)}`);
      return new Response(JSON.stringify({ ok: true, message: sent }), { headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: jsonHeaders });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: jsonHeaders });
  }
});
