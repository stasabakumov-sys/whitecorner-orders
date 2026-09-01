import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };
const REDIRECT_URI = "https://zgvnrpspwluapaxnycrg.supabase.co/functions/v1/gmail-oauth";
const HUB_RETURN_URL = "https://stasabakumov-sys.github.io/whitecorner-orders/angular2/?gmail=connected";
const ALLOWED_MAILBOXES: Record<string, string> = {
  info: "info@whitecorner.com.au",
  support: "support@whitecorner.com.au",
};
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function encodeText(value: string) { return base64url(new TextEncoder().encode(value)); }
function decodeText(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}
async function signState(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return base64url(sig);
}
async function buildState(data: Record<string, unknown>, secret: string) {
  const payload = encodeText(JSON.stringify(data));
  return `${payload}.${await signState(payload, secret)}`;
}
async function verifyState(state: string, secret: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state");
  const expected = await signState(payload, secret);
  if (signature !== expected) throw new Error("Invalid OAuth state signature");
  const data = JSON.parse(decodeText(payload));
  if (!data?.t || Date.now() - Number(data.t) > 15 * 60 * 1000) throw new Error("OAuth state expired");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!supabaseUrl || !serviceRole || !anonKey || !clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "Missing Gmail OAuth configuration" }), { status: 500, headers: jsonHeaders });
  }
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (req.method === "GET" && (code || oauthError)) {
      if (!state) throw new Error("Missing OAuth state");
      const decoded = await verifyState(state, serviceRole);
      const mailboxKey = String(decoded.m || "");
      const expectedEmail = ALLOWED_MAILBOXES[mailboxKey];
      if (!expectedEmail) throw new Error("Unknown mailbox");
      if (oauthError) return Response.redirect(`${HUB_RETURN_URL}&mailbox=${encodeURIComponent(mailboxKey)}&error=${encodeURIComponent(oauthError)}`, 302);
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: code!, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }),
      });
      const token = await tokenRes.json();
      if (!tokenRes.ok || !token.access_token) throw new Error(`Google token exchange failed: ${JSON.stringify(token)}`);

      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileRes.json();
      if (!profileRes.ok || !profile.email) throw new Error("Could not read Google account email");
      if (String(profile.email).toLowerCase() !== expectedEmail.toLowerCase()) {
        return Response.redirect(`${HUB_RETURN_URL}&mailbox=${encodeURIComponent(mailboxKey)}&error=${encodeURIComponent(`Please authorize ${expectedEmail}, not ${profile.email}`)}`, 302);
      }

      const { data: existing } = await admin.from("wc_mailboxes").select("refresh_token").eq("mailbox_key", mailboxKey).maybeSingle();
      const refreshToken = token.refresh_token || existing?.refresh_token;
      if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect with consent prompt.");
      const scopes = String(token.scope || "").split(/\s+/).filter(Boolean);
      const { error: upsertError } = await admin.from("wc_mailboxes").upsert({
        mailbox_key: mailboxKey,
        email: expectedEmail,
        provider: "gmail",
        refresh_token: refreshToken,
        granted_scopes: scopes,
        connected_by: decoded.u || null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "mailbox_key" });
      if (upsertError) throw upsertError;
      return Response.redirect(`${HUB_RETURN_URL}&mailbox=${encodeURIComponent(mailboxKey)}`, 302);
    }

    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    const body = await req.json().catch(() => ({}));
    const mailboxKey = String(body.mailbox || "");
    const expectedEmail = ALLOWED_MAILBOXES[mailboxKey];
    if (!expectedEmail) return new Response(JSON.stringify({ error: "Unknown mailbox" }), { status: 400, headers: jsonHeaders });

    const stateValue = await buildState({ m: mailboxKey, u: user.id, t: Date.now() }, serviceRole);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: SCOPES.join(" "),
      state: stateValue,
      login_hint: expectedEmail,
    });
    return new Response(JSON.stringify({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, mailbox: mailboxKey, email: expectedEmail }), { headers: jsonHeaders });
  } catch (e) {
    console.error(e);
    const message = String((e as Error)?.message || e);
    if (req.method === "GET") return Response.redirect(`${HUB_RETURN_URL}&error=${encodeURIComponent(message)}`, 302);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
