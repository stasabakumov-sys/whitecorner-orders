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
function stripQuotedHtml(value: string) {
  const markers = [
    /<(?:div|blockquote)\b[^>]*(?:class\s*=\s*["'][^"']*(?:gmail_quote|yahoo_quoted|protonmail_quote)[^"']*["']|id\s*=\s*["']?divRplyFwdMsg)/i,
    /<div\b[^>]*class\s*=\s*["'][^"']*gmail_attr[^"']*["']/i,
    /(?:<br\s*\/?>\s*)*-{5,}\s*(?:Original|Forwarded) message\s*-{5,}/i,
  ];
  let cut = value.length;
  for (const marker of markers) {
    const index = value.search(marker);
    if (index >= 0) cut = Math.min(cut, index);
  }
  return value.slice(0, cut).replace(/(?:<br\s*\/?>|&nbsp;|\s)+$/gi, "").trim();
}
function stripQuotedPlain(value: string) {
  const lines = value.replace(/\r/g, "").split("\n");
  let cut = lines.length;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (/^On .{3,} wrote:$/i.test(line) || /^-{3,}\s*(?:Original|Forwarded) message\s*-{3,}$/i.test(line)) { cut = index; break; }
    if (/^From:\s*.+/i.test(line) && /^Sent:\s*.+/i.test((lines[index + 1] || "").trim())) { cut = index; break; }
  }
  return lines.slice(0, cut).filter(line => !/^\s*>/.test(line)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
    .replace(/@import\s+(url\s*\()?\s*(["']?)https?:[\s\S]*?;?/gi, "");
  if (!allowExternalImages) {
    html = html.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])cid:[^"']+\1[^>]*>/gi, tag => {
      imagesBlocked = true;
      const alt = tag.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2] || "Inline image";
      return `<span class="wc-blocked-image">[${alt.replace(/[<>]/g, "")}]</span>`;
    });
    html = html.replace(/url\s*\(\s*(["']?)https?:[\s\S]*?\1\s*\)/gi, "none");
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
  const plain = stripQuotedPlain(plainCandidates.sort((a, b) => b.length - a.length)[0] || "");
  let html = stripQuotedHtml(htmlCandidates.sort((a, b) => b.length - a.length)[0] || "");
  const attachments: Array<{ attachmentId: string; filename: string; mimeType: string; size: number; inline: boolean }> = [];
  const inlineParts: Array<{ part: any; contentId: string; mimeType: string }> = [];
  for (const part of parts) {
    const attachmentId = String(part?.body?.attachmentId || "");
    const filename = String(part?.filename || "");
    const mimeType = String(part?.mimeType || "application/octet-stream");
    const contentId = headerValue(part?.headers || [], "Content-ID").replace(/[<>]/g, "");
    const inline = Boolean(contentId) && mimeType.startsWith("image/");
    if (inline && html && allowExternalImages) inlineParts.push({ part, contentId, mimeType });
    if (attachmentId && (filename || !inline)) attachments.push({ attachmentId, filename: filename || "attachment", mimeType, size: Number(part?.body?.size || 0), inline });
  }
  const inlineData = await Promise.all(inlineParts.map(async item => ({ ...item, data: await partData(item.part, messageId, gmailHeaders) })));
  for (const item of inlineData) if (item.data) html = html.replace(new RegExp(`cid:${item.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), `data:${item.mimeType};base64,${item.data.replaceAll("-", "+").replaceAll("_", "/")}`);
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
function emailAddresses(value: string) {
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(match => match[0].toLowerCase());
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
function headerText(value: string) { return value.replace(/[\r\n]+/g, " ").trim(); }
function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function textAsHtml(value: string) { return escapeHtml(value).replace(/\r?\n/g, "<br>"); }
function quotedPlain(value: string) { return value.split(/\r?\n/).map(line => `> ${line}`).join("\r\n"); }

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
    if (action === "capabilities") return new Response(JSON.stringify({ version: 5, html: true, stagedMedia: true, inlineImages: true, attachments: true, pagination: true, archiveAndTrash: true, threadedReplies: true, threadView: true, quoteDeduplication: true, replyAll: true, forwardedAttachments: true }), { headers: jsonHeaders });

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
      const query = view === "Sent" ? "in:sent" : view === "Archive" ? "-in:inbox -in:sent -in:drafts -in:spam -in:trash" : view === "Trash" ? "in:trash" : "in:inbox";
      const pageToken = String(body.pageToken || "");
      const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      listUrl.searchParams.set("maxResults", "30");listUrl.searchParams.set("q", query);if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
      const listRes = await fetch(listUrl, { headers: gmailHeaders });
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
        const outgoing = view === "Sent" || displayEmail(from).toLowerCase() === expectedEmail.toLowerCase();
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
          status: view === "Trash" ? "Trash" : view === "Archive" ? "Archive" : outgoing ? "Sent" : "Inbox",
          unread: labels.includes("UNREAD"),
          starred: labels.includes("STARRED"),
          needs_reply: false,
        };
      }));
      await admin.from("wc_mailboxes").update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("mailbox_key", mailboxKey);
      return new Response(JSON.stringify({ connected: true, mailbox: mailboxKey, email: expectedEmail, messages: rows.filter(Boolean), nextPageToken: list.nextPageToken || "" }), { headers: jsonHeaders });
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
        cc: headerValue(headers, "Cc"),
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

    if (action === "thread") {
      const threadId = String(body.threadId || "");
      if (!threadId) return new Response(JSON.stringify({ error: "threadId required" }), { status: 400, headers: jsonHeaders });
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`, { headers: gmailHeaders });
      const thread = await res.json();
      if (!res.ok) throw new Error(`Gmail thread failed: ${JSON.stringify(thread)}`);
      const messages = await Promise.all((thread.messages || []).map(async (msg: any) => {
        const headers = msg.payload?.headers || [];
        const content = await extractMessageContent(msg.payload, msg.id, gmailHeaders, false);
        const from = headerValue(headers, "From");
        return {
          id: msg.id,
          threadId: msg.threadId,
          from,
          to: headerValue(headers, "To"),
          cc: headerValue(headers, "Cc"),
          subject: headerValue(headers, "Subject") || "(no subject)",
          date: headerValue(headers, "Date"),
          body: content.body,
          html: content.html,
          imagesBlocked: content.imagesBlocked,
          attachments: content.attachments,
          snippet: msg.snippet || "",
          unread: Array.isArray(msg.labelIds) && msg.labelIds.includes("UNREAD"),
          starred: Array.isArray(msg.labelIds) && msg.labelIds.includes("STARRED"),
          outgoing: emailAddresses(from).includes(expectedEmail.toLowerCase()),
        };
      }));
      messages.sort((a: any, b: any) => Date.parse(a.date) - Date.parse(b.date));
      return new Response(JSON.stringify({ id: thread.id, historyId: thread.historyId, messages }), { headers: jsonHeaders });
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

    if (["markRead", "markUnread", "archive", "moveToInbox", "star", "unstar"].includes(action)) {
      const messageId = String(body.messageId || "");
      if (!messageId) return new Response(JSON.stringify({ error: "messageId required" }), { status: 400, headers: jsonHeaders });
      const addLabelIds: string[] = [];
      const removeLabelIds: string[] = [];
      if (action === "markRead") removeLabelIds.push("UNREAD");
      if (action === "markUnread") addLabelIds.push("UNREAD");
      if (action === "archive") removeLabelIds.push("INBOX");
      if (action === "moveToInbox") addLabelIds.push("INBOX");
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

    if (action === "trash" || action === "untrash") {
      const messageId = String(body.messageId || "");
      if (!messageId) return new Response(JSON.stringify({ error: "messageId required" }), { status: 400, headers: jsonHeaders });
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/${action}`, {
        method: "POST",
        headers: gmailHeaders,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(`Gmail ${action} failed: ${JSON.stringify(result)}`);
      return new Response(JSON.stringify({ ok: true, message: result }), { headers: jsonHeaders });
    }

    if (action === "send") {
      const to = String(body.to || "").trim();
      const subject = String(body.subject || "").trim();
      const text = String(body.text || "");
      const mode = String(body.mode || "compose");
      const sourceMessageId = String(body.sourceMessageId || "");
      let recipient = to;
      let attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
      if (!to || !subject || (mode !== "forward" && !text)) return new Response(JSON.stringify({ error: "recipient, subject and message text are required" }), { status: 400, headers: jsonHeaders });
      if (!["compose", "reply", "replyAll", "forward"].includes(mode)) return new Response(JSON.stringify({ error: "Unknown send mode" }), { status: 400, headers: jsonHeaders });

      let outgoingText = text;
      let outgoingHtml = `<div>${textAsHtml(text)}</div>`;
      let targetThreadId = "";
      const replyHeaders: string[] = [];
      let ccRecipients: string[] = [];
      if (mode === "reply" || mode === "replyAll" || mode === "forward") {
        if (!sourceMessageId) return new Response(JSON.stringify({ error: "sourceMessageId required for reply, reply all or forward" }), { status: 400, headers: jsonHeaders });
        const sourceRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(sourceMessageId)}?format=full`, { headers: gmailHeaders });
        const source = await sourceRes.json();
        if (!sourceRes.ok) throw new Error(`Gmail source message failed: ${JSON.stringify(source)}`);
        const sourceHeaders = source.payload?.headers || [];
        const sourceFrom = headerValue(sourceHeaders, "From");
        const sourceReplyTo = headerValue(sourceHeaders, "Reply-To");
        const sourceTo = headerValue(sourceHeaders, "To");
        const sourceCc = headerValue(sourceHeaders, "Cc");
        const sourceDate = headerValue(sourceHeaders, "Date");
        const sourceSubject = headerValue(sourceHeaders, "Subject") || subject;
        const sourceInternetId = headerValue(sourceHeaders, "Message-ID") || headerValue(sourceHeaders, "Message-Id");
        const sourceReferences = headerValue(sourceHeaders, "References");
        const sourceContent = await extractMessageContent(source.payload, sourceMessageId, gmailHeaders, true);
        const sourcePlain = sourceContent.body || stripHtml(sourceContent.html || "");
        const sourceHtml = sourceContent.html || `<div>${textAsHtml(sourcePlain)}</div>`;

        if (mode === "reply" || mode === "replyAll") {
          const sourceWasSent = emailAddresses(sourceFrom).includes(expectedEmail.toLowerCase());
          const primarySource = sourceWasSent ? sourceTo : (sourceReplyTo || sourceFrom);
          const primary = emailAddresses(primarySource)[0] || displayEmail(primarySource);
          if (primary) recipient = primary;
          if (mode === "replyAll") {
            const excluded = new Set([expectedEmail.toLowerCase(), recipient.toLowerCase()]);
            ccRecipients = [...new Set([...emailAddresses(sourceTo), ...emailAddresses(sourceCc)].filter(address => !excluded.has(address)))];
          }
          const attribution = `On ${sourceDate || "the previous message"}, ${sourceFrom || "the sender"} wrote:`;
          outgoingText = `${text.trim()}\r\n\r\n${attribution}\r\n${quotedPlain(sourcePlain)}`;
          outgoingHtml = `<div>${textAsHtml(text.trim())}</div><br><div class="gmail_quote"><div>${escapeHtml(attribution)}</div><blockquote style="margin:8px 0 0 10px;padding-left:10px;border-left:1px solid #ccc">${sourceHtml}</blockquote></div>`;
          targetThreadId = String(source.threadId || body.threadId || "");
          if (sourceInternetId) {
            replyHeaders.push(`In-Reply-To: ${headerText(sourceInternetId)}`);
            replyHeaders.push(`References: ${headerText(`${sourceReferences} ${sourceInternetId}`)}`);
          }
        } else {
          const forwardHeader = `---------- Forwarded message ----------\r\nFrom: ${sourceFrom}\r\nDate: ${sourceDate}\r\nSubject: ${sourceSubject}\r\nTo: ${sourceTo}`;
          outgoingText = `${text.trim()}${text.trim() ? "\r\n\r\n" : ""}${forwardHeader}\r\n\r\n${sourcePlain}`;
          outgoingHtml = `${text.trim() ? `<div>${textAsHtml(text.trim())}</div><br>` : ""}<div class="gmail_quote"><div>---------- Forwarded message ----------</div><div><b>From:</b> ${escapeHtml(sourceFrom)}</div><div><b>Date:</b> ${escapeHtml(sourceDate)}</div><div><b>Subject:</b> ${escapeHtml(sourceSubject)}</div><div><b>To:</b> ${escapeHtml(sourceTo)}</div><br>${sourceHtml}</div>`;
          const forwarded = [];
          for (const part of allParts(source.payload)) {
            const filename = String(part?.filename || "");
            if (!filename || !(part?.body?.data || part?.body?.attachmentId) || forwarded.length >= 10) continue;
            const data = await partData(part, sourceMessageId, gmailHeaders);
            if (!data) continue;
            const contentId = headerValue(part?.headers || [], "Content-ID").replace(/[<>\r\n]/g, "");
            forwarded.push({ filename, mimeType: String(part?.mimeType || "application/octet-stream"), data: data.replaceAll("-", "+").replaceAll("_", "/"), inline: Boolean(contentId), contentId });
          }
          attachments = [...forwarded, ...attachments].slice(0, 10);
        }
      }

      const safeTo = headerText(recipient);
      const safeSubject = headerText(subject);
      const alternativeBoundary = `wc_alt_${crypto.randomUUID().replaceAll("-", "")}`;
      const baseHeaders = [`From: ${expectedEmail}`, `To: ${safeTo}`, ...(ccRecipients.length ? [`Cc: ${ccRecipients.join(", ")}`] : []), `Subject: ${safeSubject}`, ...replyHeaders, "MIME-Version: 1.0"];
      const alternativeParts = [`--${alternativeBoundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", outgoingText, `--${alternativeBoundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", outgoingHtml, `--${alternativeBoundary}--`, ""];
      let raw = "";
      if (attachments.length) {
        const mixedBoundary = `wc_mixed_${crypto.randomUUID().replaceAll("-", "")}`;
        const chunks = [...baseHeaders, `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, "", `--${mixedBoundary}`, `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "", ...alternativeParts];
        for (const attachment of attachments) {
          const filename = quotedHeader(String(attachment?.filename || "attachment"));
          const mimeType = String(attachment?.mimeType || "application/octet-stream").replace(/[^a-z0-9.+\-\/]/gi, "") || "application/octet-stream";
          const data = String(attachment?.data || "").replace(/[^a-zA-Z0-9+/=]/g, "");
          if (!data) continue;
          const inline = attachment?.inline === true;
          const contentId = String(attachment?.contentId || "").replace(/[<>\r\n]/g, "");
          chunks.push(`--${mixedBoundary}`, `Content-Type: ${mimeType}; name="${filename}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: ${inline ? "inline" : "attachment"}; filename="${filename}"`);
          if (inline && contentId) chunks.push(`Content-ID: <${contentId}>`);
          chunks.push("", wrapBase64(data));
        }
        chunks.push(`--${mixedBoundary}--`, "");raw = chunks.join("\r\n");
      } else {
        raw = [...baseHeaders, `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "", ...alternativeParts].join("\r\n");
      }
      const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { ...gmailHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: encodeRawMail(raw), ...(targetThreadId ? { threadId: targetThreadId } : {}) }),
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
