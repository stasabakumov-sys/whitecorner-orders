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
function allParts(payload: any): any[] {
  if (!payload) return [];
  return [payload, ...(payload.parts || []).flatMap((part: any) => allParts(part))];
}
function sanitizeEmailHtml(value: string, allowExternalImages: boolean) {
  let imagesBlocked = false;
  let html = value
    .replace(/<(script|iframe|object|embed|form|input|button|meta|link|base|svg)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|input|button|meta|link|base|svg)[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"')
    .replace(/@import\s+(url\s*\()?\s*(["']?)https?:[\s\S]*?;?/gi, "")
    .replace(/url\s*\(\s*(["']?)https?:[\s\S]*?\1\s*\)/gi, "none");
  if (!allowExternalImages) {
    html = html.replace(/\s+(srcset|background)\s*=\s*(["'])[^"']*\2/gi, "");
    html = html.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])https?:\/\/[^"']+\1[^>]*>/gi, tag => {
      imagesBlocked = true;
      const alt = tag.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2] || "Remote image";
      return `<span class="wc-blocked-image">[${alt.replace(/[<>]/g, "")}]</span>`;
    });
  }
  return { html, imagesBlocked };
}
async function partData(part: any, messageId: string, gmailHeaders: Record<string, string>) {
  if (part?.body?.data) return String(part.body.data);
  const attachmentId = String(part?.body?.attachmentId || "");
  if (!attachmentId) return "";
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, { headers: gmailHeaders });
  const result = await res.json();
  if (!res.ok) throw new Error(`Gmail attachment failed: ${JSON.stringify(result)}`);
  return String(result.data || "");
}
async function extractMessageContent(payload: any, messageId: string, gmailHeaders: Record<string, string>, allowExternalImages: boolean) {
  const parts = allParts(payload);
  const plainParts = parts.filter(part => part.mimeType === "text/plain" && (part.body?.data || part.body?.attachmentId));
  const htmlParts = parts.filter(part => part.mimeType === "text/html" && (part.body?.data || part.body?.attachmentId));
  const plainCandidates = await Promise.all(plainParts.map(async part => decodeBase64Url(await partData(part, messageId, gmailHeaders))));
  const htmlCandidates = await Promise.all(htmlParts.map(async part => decodeBase64Url(await partData(part, messageId, gmailHeaders))));
  const plain = plainCandidates.sort((a, b) => b.length - a.length)[0] || "";
  let html = htmlCandidates.sort((a, b) => b.length - a.length)[0] || "";
  const attachments: Array<{ attachmentId: string; filename: string; mimeType: string; size: number; inline: boolean }> = [];
  for (const part of parts) {
    const attachmentId = String(part?.body?.attachmentId || "");
    const filename = String(part?.filename || "");
    const mimeType = String(part?.mimeType || "application/octet-stream");
    const contentId = headerValue(part?.headers || [], "Content-ID").replace(/[<>]/g, "");
    const inline = Boolean(contentId) && mimeType.startsWith("image/");
    if (inline && html) {
      const data = await partData(part, messageId, gmailHeaders);
      if (data) html = html.replace(new RegExp(`cid:${contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), `data:${mimeType};base64,${data.replaceAll("-", "+").replaceAll("_", "/")}`);
    }
    if (attachmentId && (filename || !inline)) attachments.push({ attachmentId, filename: filename || "attachment", mimeType, size: Number(part?.body?.size || 0), inline });
  }
  const sanitized = html ? sanitizeEmailHtml(html, allowExternalImages) : { html: "", imagesBlocked: false };
  return { body: plain || stripHtml(html), html: sanitized.html, imagesBlocked: sanitized.imagesBlocked, attachments };
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
function wrapBase64(value: string) { return value.match(/.{1,76}/g)?.join("\r\n") || ""; }
function quotedHeader(value: string) { return value.replace(/[\r\n"]/g, "_"); }

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
      const content = await extractMessageContent(msg.payload, messageId, gmailHeaders, body.loadExternalImages === true);
      return new Response(JSON.stringify({
        id: msg.id,
        threadId: msg.threadId,
        from: headerValue(headers, "From"),
        to: headerValue(headers, "To"),
        subject: headerValue(headers, "Subject") || "(no subject)",
        date: headerValue(headers, "Date"),
        body: content.body,
        html: content.html,
        imagesBlocked: content.imagesBlocked,
        attachments: content.attachments,
        snippet: msg.snippet || "",
        unread: Array.isArray(msg.labelIds) && msg.labelIds.includes("UNREAD"),
        starred: Array.isArray(msg.labelIds) && msg.labelIds.includes("STARRED"),
      }), { headers: jsonHeaders });
    }

    if (action === "attachment") {
      const messageId = String(body.messageId || "");
      const attachmentId = String(body.attachmentId || "");
      if (!messageId || !attachmentId) return new Response(JSON.stringify({ error: "messageId and attachmentId required" }), { status: 400, headers: jsonHeaders });
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, { headers: gmailHeaders });
      const result = await res.json();
      if (!res.ok) throw new Error(`Gmail attachment failed: ${JSON.stringify(result)}`);
      return new Response(JSON.stringify({ data: result.data || "", size: result.size || 0 }), { headers: jsonHeaders });
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
      const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
      if (!to || !subject || !text) return new Response(JSON.stringify({ error: "to, subject and text are required" }), { status: 400, headers: jsonHeaders });
      let raw = "";
      if (attachments.length) {
        const boundary = `wc_${crypto.randomUUID().replaceAll("-", "")}`;
        const chunks = [`From: ${expectedEmail}`, `To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", text];
        for (const attachment of attachments) {
          const filename = quotedHeader(String(attachment?.filename || "attachment"));
          const mimeType = String(attachment?.mimeType || "application/octet-stream").replace(/[^a-z0-9.+\-\/]/gi, "") || "application/octet-stream";
          const data = String(attachment?.data || "").replace(/[^a-zA-Z0-9+/=]/g, "");
          if (!data) continue;
          chunks.push(`--${boundary}`, `Content-Type: ${mimeType}; name="${filename}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${filename}"`, "", wrapBase64(data));
        }
        chunks.push(`--${boundary}--`, "");raw = chunks.join("\r\n");
      } else {
        raw = [`From: ${expectedEmail}`, `To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", text].join("\r\n");
      }
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
