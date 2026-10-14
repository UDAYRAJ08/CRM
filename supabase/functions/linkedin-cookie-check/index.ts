// Supabase Edge Function: linkedin-cookie-check
// Validates li_at cookies for LinkedIn accounts and fetches live profile info & avatar pictures.
// Called every hour by pg_cron, or on-demand with { account_id } on connection.
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function extractAvatarUrl(profile: any): string | undefined {
  if (!profile) return undefined;

  // LinkedIn Voyager format: picture['com.linkedin.common.VectorImage']
  const vector = profile?.picture?.["com.linkedin.common.VectorImage"] || profile?.picture;
  if (vector?.rootUrl && Array.isArray(vector?.artifacts) && vector.artifacts.length > 0) {
    const artifacts = [...vector.artifacts].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
    const chosen = artifacts.find((a: any) => (a.width || 0) <= 400 && (a.width || 0) >= 200) || artifacts[0];
    if (chosen?.fileIdentifyingUrlPath) {
      return `${vector.rootUrl}${chosen.fileIdentifyingUrlPath}`;
    }
  }

  // Direct string or fallback fields
  if (typeof profile?.picture === "string" && profile.picture.startsWith("http")) {
    return profile.picture;
  }
  if (typeof profile?.displayPictureUrl === "string") {
    return profile.displayPictureUrl;
  }
  if (typeof profile?.imgUrl === "string") {
    return profile.imgUrl;
  }

  return undefined;
}

// Fetch public profile picture via OpenGraph metadata (reliable fallback)
async function fetchPublicLinkedInAvatar(profileUrlOrId: string): Promise<string | undefined> {
  try {
    const targetUrl = profileUrlOrId.startsWith("http")
      ? profileUrlOrId
      : `https://www.linkedin.com/in/${profileUrlOrId}`;

    const res = await fetch(targetUrl, {
      headers: {
        "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "accept": "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return undefined;

    const html = await res.text();
    const match = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                  html.match(/content="([^"]+)"\s+property="og:image"/i);

    if (match && match[1] && !match[1].includes("ghost-person") && !match[1].includes("static.licdn.com")) {
      return match[1].replace(/&amp;/g, "&");
    }
  } catch (err) {
    console.warn("fetchPublicLinkedInAvatar error:", err);
  }
  return undefined;
}

async function validateLinkedInCookie(liAt: string, jsessionId: string): Promise<{
  valid: boolean;
  profileId?: string;
  name?: string;
  headline?: string;
  profileUrl?: string;
  avatarUrl?: string;
}> {
  try {
    const cleanJsessionId = jsessionId.replace(/^"|"$/g, "").trim();
    const cleanLiAt = liAt.replace(/^"|"$/g, "").trim();

    const headers = new Headers();
    headers.set("cookie", `li_at=${cleanLiAt}; JSESSIONID="${cleanJsessionId}"`);
    headers.set("csrf-token", cleanJsessionId);
    headers.set("x-restli-protocol-version", "2.0.0");
    headers.set("x-li-lang", "en_US");
    headers.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    headers.set("accept", "application/vnd.linkedin.normalized+json+2.1");
    headers.set("x-requested-with", "XMLHttpRequest");
    headers.set("referer", "https://www.linkedin.com/");

    const res = await fetch("https://www.linkedin.com/voyager/api/me", {
      method: "GET",
      headers,
      redirect: "manual",
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false };
    }

    if (res.status === 302 || res.status === 301) {
      // Redirected (session expired or login checkpoint)
      return { valid: false };
    }

    if (!res.ok) {
      // 429 or other - treat as unknown
      return { valid: true };
    }

    const data = await res.json();
    let miniProfile: any = null;

    if (Array.isArray(data?.included)) {
      miniProfile = data.included.find(
        (item: any) =>
          item?.$type === "com.linkedin.voyager.identity.shared.MiniProfile" ||
          (item?.publicIdentifier && (item?.firstName || item?.picture))
      );
    }
    if (!miniProfile && data?.miniProfile) {
      miniProfile = data.miniProfile;
    }
    if (!miniProfile && (data?.firstName || data?.publicIdentifier)) {
      miniProfile = data;
    }

    const profileId = miniProfile?.publicIdentifier || data?.data?.plainId?.toString();
    const firstName = miniProfile?.firstName || "";
    const lastName = miniProfile?.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim() || undefined;
    const headline = miniProfile?.occupation || undefined;
    let avatarUrl = extractAvatarUrl(miniProfile);
    const profileUrl = profileId ? `https://www.linkedin.com/in/${profileId}` : undefined;

    // If Voyager API didn't include the avatar picture, fetch from OpenGraph
    if (!avatarUrl && profileUrl) {
      avatarUrl = await fetchPublicLinkedInAvatar(profileUrl);
    }

    return {
      valid: true,
      profileId,
      name: fullName,
      headline,
      profileUrl,
      avatarUrl,
    };
  } catch (err) {
    console.error("validateLinkedInCookie error:", err);
    return { valid: true };
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
  // Validate the caller's Supabase JWT before executing any logic.
  // pg_cron invocations also include the service-role key as Authorization so
  // they are transparently accepted.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const callerToken = authHeader.slice(7);
  // Use anon key client to validate the token (service-role key bypasses RLS)
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { error: authErr } = await callerClient.auth.getUser();
  // Allow service-role bearer (used by cron) — it won't resolve a user but the
  // token itself proves it originated from the Supabase control plane.
  if (authErr && callerToken !== supabaseKey) {
    return new Response(JSON.stringify({ error: "Unauthorized: invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ────────────────────────────────────────────────────────────────────────────

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }
    const targetAccountId = body?.account_id;

    // Build accounts query
    let query = supabase
      .from("linkedin_accounts")
      .select(`
        id,
        li_at_encrypted,
        jsessionid_encrypted,
        status,
        linkedin_name,
        linkedin_headline,
        linkedin_profile_id,
        linkedin_profile_url,
        linkedin_avatar_url,
        team_member_id,
        team_members (name, email)
      `)
      .eq("auth_type", "cookie");

    if (targetAccountId) {
      query = query.eq("id", targetAccountId);
    } else {
      query = query.in("status", ["active", "error"]);
    }

    const { data: accounts, error } = await query;

    // Support direct profile details or avatar update via body
    if (body?.set_avatar_url || body?.set_profile_url || body?.set_headline || body?.set_name) {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (body.set_avatar_url) updateData.linkedin_avatar_url = body.set_avatar_url;
      if (body.set_profile_url) updateData.linkedin_profile_url = body.set_profile_url;
      if (body.set_headline) updateData.linkedin_headline = body.set_headline;
      if (body.set_name) updateData.linkedin_name = body.set_name;
      if (body.set_status) updateData.status = body.set_status;

      const targetId = targetAccountId || accounts?.[0]?.id;
      if (targetId) {
        await supabase
          .from("linkedin_accounts")
          .update(updateData)
          .eq("id", targetId);

        return new Response(
          JSON.stringify({
            success: true,
            updated: updateData,
            account_id: targetId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No cookie-based accounts to check", checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const account of accounts) {
      const liAt = await decryptCookie(account.li_at_encrypted ?? "", encryptionKey);
      const jsessionId = await decryptCookie(account.jsessionid_encrypted ?? "", encryptionKey);

      let validation = await validateLinkedInCookie(liAt, jsessionId);
      const now = new Date().toISOString();

      // If validation succeeded or if we already have a profile URL/ID, ensure avatar is filled
      let resolvedAvatar = validation.avatarUrl || account.linkedin_avatar_url;
      const effectiveProfileUrl = validation.profileUrl || account.linkedin_profile_url;

      if (!resolvedAvatar && effectiveProfileUrl) {
        resolvedAvatar = await fetchPublicLinkedInAvatar(effectiveProfileUrl);
      }

      if (validation.valid) {
        const updatePayload: Record<string, unknown> = {
          status: "active",
          last_verified_at: now,
          error_message: null,
          updated_at: now,
        };
        if (validation.name) updatePayload.linkedin_name = validation.name;
        if (validation.headline) updatePayload.linkedin_headline = validation.headline;
        if (validation.profileId) updatePayload.linkedin_profile_id = validation.profileId;
        if (effectiveProfileUrl) updatePayload.linkedin_profile_url = effectiveProfileUrl;
        if (resolvedAvatar) updatePayload.linkedin_avatar_url = resolvedAvatar;

        await supabase
          .from("linkedin_accounts")
          .update(updatePayload)
          .eq("id", account.id);

        results.push({
          id: account.id,
          name: validation.name || account.linkedin_name,
          headline: validation.headline || account.linkedin_headline,
          avatar_url: resolvedAvatar,
          profile_url: effectiveProfileUrl,
          valid: true,
        });
      } else {
        // If cookie is expired, mark account but preserve profile info and avatar
        await supabase
          .from("linkedin_accounts")
          .update({
            status: "expired",
            error_message: "LinkedIn session cookie (li_at) has expired. Please reconnect your account.",
            linkedin_avatar_url: resolvedAvatar || account.linkedin_avatar_url,
            updated_at: now,
          })
          .eq("id", account.id);

        // Pause any active campaigns for this account
        await supabase
          .from("linkedin_campaigns")
          .update({ status: "paused", updated_at: now })
          .eq("linkedin_account_id", account.id)
          .eq("status", "active");

        results.push({
          id: account.id,
          name: account.linkedin_name,
          avatar_url: resolvedAvatar || account.linkedin_avatar_url,
          valid: false,
          expired: true,
        });
      }

      if (accounts.length > 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (targetAccountId && results.length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          account: results[0],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expiredCount = results.filter((r) => !r.valid).length;

    return new Response(
      JSON.stringify({
        checked: accounts.length,
        valid: results.filter((r) => r.valid).length,
        expired: expiredCount,
        results,
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
