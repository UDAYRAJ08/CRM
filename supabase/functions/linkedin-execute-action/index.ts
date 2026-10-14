// Supabase Edge Function: linkedin-execute-action
// Processes ONE pending LinkedIn action from the queue per invocation.
// Designed for Supabase free tier (2s timeout) — called every minute by pg_cron.
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// LinkedIn unofficial API endpoints (mobile API — less aggressive throttling)
const LI_API_BASE = "https://www.linkedin.com/voyager/api";

// Build LinkedIn request headers from li_at cookie
function buildLinkedInHeaders(liAt: string, jsessionId: string): Headers {
  const headers = new Headers();
  headers.set("cookie", `li_at=${liAt}; JSESSIONID="${jsessionId}"`);
  headers.set("csrf-token", jsessionId);
  headers.set("x-restli-protocol-version", "2.0.0");
  headers.set("x-li-lang", "en_US");
  headers.set("x-li-track", JSON.stringify({
    clientVersion: "1.13.5765",
    mpVersion: "1.13.5765",
    osName: "web",
    timezoneOffset: 5.5,
    timezone: "Asia/Kolkata",
    deviceFormFactor: "DESKTOP",
    mpName: "voyager-web",
    displayDensity: 2,
    displayWidth: 1440,
    displayHeight: 900,
  }));
  headers.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  headers.set("accept", "application/vnd.linkedin.normalized+json+2.1");
  headers.set("accept-language", "en-US,en;q=0.9");
  headers.set("x-requested-with", "XMLHttpRequest");
  headers.set("origin", "https://www.linkedin.com");
  headers.set("referer", "https://www.linkedin.com/");
  return headers;
}

// View a LinkedIn profile (low-risk action)
async function viewProfile(
  linkedinProfileId: string,
  liAt: string,
  jsessionId: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const encodedId = encodeURIComponent(linkedinProfileId);
    const url = `${LI_API_BASE}/identity/profiles/${encodedId}/profileView`;
    const res = await fetch(url, {
      method: "GET",
      headers: buildLinkedInHeaders(liAt, jsessionId),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Send a connection request
async function sendConnectionRequest(
  linkedinProfileId: string,
  note: string | null,
  liAt: string,
  jsessionId: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const body: Record<string, unknown> = {
      trackingId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
      invitations: [],
      excludeInvitations: [],
      invitee: {
        "com.linkedin.voyager.growth.invitation.InviteeProfile": {
          profileId: linkedinProfileId,
        },
      },
    };
    if (note && note.trim().length > 0) {
      body.message = note.slice(0, 300); // LinkedIn limit
    }

    const res = await fetch(`${LI_API_BASE}/growth/normInvitations`, {
      method: "POST",
      headers: buildLinkedInHeaders(liAt, jsessionId),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Send a LinkedIn message (must be connected first)
async function sendMessage(
  linkedinProfileId: string,
  messageBody: string,
  liAt: string,
  jsessionId: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // First get conversation thread ID for this connection
    const conversationRes = await fetch(
      `${LI_API_BASE}/messaging/conversations?keyVersion=LEGACY_INBOX&q=participants&recipients=List(${linkedinProfileId})`,
      {
        method: "GET",
        headers: buildLinkedInHeaders(liAt, jsessionId),
      }
    );

    let conversationId: string | null = null;
    if (conversationRes.ok) {
      const convData = await conversationRes.json();
      const elements = convData?.elements;
      if (elements && elements.length > 0) {
        conversationId = elements[0]?.entityUrn?.replace("urn:li:fs_conversation:", "") || null;
      }
    }

    const messagePayload = {
      keyVersion: "LEGACY_INBOX",
      conversationCreate: {
        eventCreate: {
          value: {
            "com.linkedin.voyager.messaging.create.MessageCreate": {
              attributedBody: {
                text: messageBody,
                attributes: [],
              },
              attachments: [],
            },
          },
        },
        recipients: [`urn:li:fs_miniProfile:${linkedinProfileId}`],
        subtype: "MEMBER_TO_MEMBER",
      },
    };

    const endpoint = conversationId
      ? `${LI_API_BASE}/messaging/conversations/${conversationId}/events`
      : `${LI_API_BASE}/messaging/conversations`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: buildLinkedInHeaders(liAt, jsessionId),
      body: JSON.stringify(messagePayload),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

const CRYPTO_VERSION_PREFIX = "aes_v1:";

async function deriveAesKey(baseKey: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey("raw", enc.encode(baseKey), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("nexus_crm_li_cookie_v1"), iterations: 100_000, hash: "SHA-256" },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function decryptCookie(encrypted: string, fallbackKey: string): Promise<string> {
  if (!encrypted) return "";
  if (encrypted.startsWith(CRYPTO_VERSION_PREFIX)) {
    try {
      const rawB64 = encrypted.slice(CRYPTO_VERSION_PREFIX.length);
      const combined = base64ToBytes(rawB64);
      const iv = combined.slice(0, 12);
      const cipherData = combined.slice(12);

      const secret = Deno.env.get("SUPABASE_ANON_KEY") || fallbackKey || "sb_publishable_Nzhdt9HpGSX8u7p-MY_TBw_8XJ6Z5Sq";
      const key = await deriveAesKey(secret);
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherData);
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error("AES-GCM decrypt failed in Edge function:", e);
      return encrypted;
    }
  }
  try {
    return atob(encrypted);
  } catch {
    return encrypted;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const encryptionKey = Deno.env.get("LINKEDIN_ENCRYPTION_KEY") ?? "dev-key-change-in-production";

  // ── Authentication Guard ────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const callerToken = authHeader.slice(7);
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { error: authErr } = await callerClient.auth.getUser();
  if (authErr && callerToken !== supabaseKey) {
    return new Response(JSON.stringify({ error: "Unauthorized: invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ────────────────────────────────────────────────────────────────────────────

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Pick ONE pending action that is due now
    const now = new Date().toISOString();
    const { data: actions, error: fetchError } = await supabase
      .from("linkedin_action_queue")
      .select(`
        *,
        linkedin_accounts (
          id,
          li_at_encrypted,
          jsessionid_encrypted,
          status,
          connections_sent_today,
          messages_sent_today,
          profile_views_today,
          daily_connection_limit,
          daily_message_limit,
          daily_view_limit
        ),
        contacts (
          id,
          name,
          custom_fields
        )
      `)
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(1);

    if (fetchError) throw fetchError;
    if (!actions || actions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending actions due", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const action = actions[0];
    const account = action.linkedin_accounts;
    const contact = action.contacts;

    // Guard: account must be active
    if (!account || account.status !== "active") {
      await supabase
        .from("linkedin_action_queue")
        .update({ status: "skipped", error_message: "LinkedIn account inactive or missing", updated_at: new Date().toISOString() })
        .eq("id", action.id);
      return new Response(
        JSON.stringify({ message: "Account inactive, action skipped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: daily limits
    const limitChecks: Record<string, { current: number; limit: number }> = {
      view_profile: { current: account.profile_views_today, limit: account.daily_view_limit },
      send_connection: { current: account.connections_sent_today, limit: account.daily_connection_limit },
      send_message: { current: account.messages_sent_today, limit: account.daily_message_limit },
    };
    const check = limitChecks[action.action_type];
    if (check && check.current >= check.limit) {
      // Reschedule to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, Math.floor(Math.random() * 60), 0, 0);
      await supabase
        .from("linkedin_action_queue")
        .update({ scheduled_at: tomorrow.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", action.id);
      return new Response(
        JSON.stringify({ message: "Daily limit reached, action rescheduled to tomorrow" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt cookies
    const liAt = await decryptCookie(account.li_at_encrypted ?? "", encryptionKey);
    const jsessionId = await decryptCookie(account.jsessionid_encrypted ?? "", encryptionKey);

    // Get LinkedIn profile ID from contact
    const linkedinUrl = contact?.linkedin_url || contact?.custom_fields?.linkedin_url || "";
    const profileId = linkedinUrl.match(/in\/([^/?]+)/)?.[1] || "";

    if (!profileId) {
      await supabase
        .from("linkedin_action_queue")
        .update({ status: "skipped", error_message: "No LinkedIn profile URL on contact", updated_at: new Date().toISOString() })
        .eq("id", action.id);
      return new Response(
        JSON.stringify({ message: "No LinkedIn profile ID, action skipped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as processing
    await supabase
      .from("linkedin_action_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", action.id);

    // Execute the action
    let result: { success: boolean; data?: unknown; error?: string };

    switch (action.action_type) {
      case "view_profile":
        result = await viewProfile(profileId, liAt, jsessionId);
        break;
      case "send_connection":
        result = await sendConnectionRequest(profileId, action.message_content, liAt, jsessionId);
        break;
      case "send_message":
        result = await sendMessage(profileId, action.message_content ?? "", liAt, jsessionId);
        break;
      default:
        result = { success: false, error: `Unknown action type: ${action.action_type}` };
    }

    // Update queue record
    await supabase
      .from("linkedin_action_queue")
      .update({
        status: result.success ? "completed" : "failed",
        executed_at: new Date().toISOString(),
        error_message: result.error ?? null,
        linkedin_response: result.data ?? null,
        retry_count: result.success ? action.retry_count : action.retry_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", action.id);

    // Update daily counters
    if (result.success) {
      const counterField: Record<string, string> = {
        view_profile: "profile_views_today",
        send_connection: "connections_sent_today",
        send_message: "messages_sent_today",
      };
      const field = counterField[action.action_type];
      if (field) {
        await supabase
          .from("linkedin_accounts")
          .update({
            [field]: (check?.current ?? 0) + 1,
            last_action_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);
      }

      // Update campaign stats
      await supabase.rpc("increment_campaign_stat", {
        p_campaign_id: action.campaign_id,
        p_field: "actions_completed",
      }).catch(() => {}); // non-critical
    } else {
      await supabase.rpc("increment_campaign_stat", {
        p_campaign_id: action.campaign_id,
        p_field: "actions_failed",
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        processed: 1,
        action_id: action.id,
        action_type: action.action_type,
        contact_name: contact?.name,
        success: result.success,
        error: result.error,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
      ? String((err as any).message)
      : JSON.stringify(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
