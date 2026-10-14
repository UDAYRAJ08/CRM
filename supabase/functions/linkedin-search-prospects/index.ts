// Supabase Edge Function: linkedin-search-prospects
// Searches LinkedIn for people matching keywords or a search URL, applies hard filters, and returns qualified prospects.
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

      const secret = Deno.env.get("SUPABASE_ANON_KEY") || fallbackKey || "";
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

  try {
    const { account_id, keywords, search_url, filters, cookie_override } = await req.json();

    let liAt = cookie_override?.liAt || "";
    let jsessionId = (cookie_override?.jsessionId || "").replace(/^["']|["']$/g, "");

    // If account_id provided and no cookie_override, fetch and decrypt from DB
    if (!liAt && account_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: acc, error: accErr } = await supabase
        .from("linkedin_accounts")
        .select("li_at_encrypted, jsessionid_encrypted, status")
        .eq("id", account_id)
        .single();

      if (accErr || !acc) {
        return new Response(JSON.stringify({ success: false, error: "LinkedIn account not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const encryptionKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      liAt = await decryptCookie(acc.li_at_encrypted || "", encryptionKey);
      jsessionId = (await decryptCookie(acc.jsessionid_encrypted || "", encryptionKey)).replace(/^["']|["']$/g, "");
    }

    if (!liAt) {
      return new Response(
        JSON.stringify({ success: false, error: "Active LinkedIn session cookie (li_at) is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let searchKeywords = (keywords || "").trim();
    if (search_url) {
      try {
        const parsed = new URL(search_url);
        const urlKw = parsed.searchParams.get("keywords");
        if (urlKw) searchKeywords = urlKw;
      } catch {
        const match = search_url.match(/keywords=([^&]+)/);
        if (match) searchKeywords = decodeURIComponent(match[1]);
      }
    }

    if (!searchKeywords) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords or search URL required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const commonHeaders: Record<string, string> = {
      cookie: `li_at=${liAt}; JSESSIONID="${jsessionId}"`,
      "csrf-token": jsessionId,
      "x-restli-protocol-version": "2.0.0",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      accept: "application/vnd.linkedin.normalized+json+2.1",
    };

    const encodedKeywords = encodeURIComponent(searchKeywords);
    const blendedUrl = `https://www.linkedin.com/voyager/api/search/blended?keywords=${encodedKeywords}&origin=GLOBAL_SEARCH_HEADER&q=all&filters=List(resultType->PEOPLE)`;
    const clusterUrl = `https://www.linkedin.com/voyager/api/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-174&origin=GLOBAL_SEARCH_HEADER&q=all&query=(keywords:${encodedKeywords},flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(PEOPLE))))`;

    let searchRes = await fetch(clusterUrl, { headers: commonHeaders });
    if (!searchRes.ok) {
      searchRes = await fetch(blendedUrl, { headers: commonHeaders });
    }

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      return new Response(
        JSON.stringify({
          success: false,
          error: `LinkedIn search returned status ${searchRes.status}.`,
          details: errText.slice(0, 300),
        }),
        { status: searchRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawData = (await searchRes.json()) as any;
    const prospects: any[] = [];
    const targetTitles: string[] = (filters?.targetTitles || []).map((t: string) => t.trim().toLowerCase()).filter(Boolean);
    const negativeKeywords: string[] = (filters?.negativeKeywords || []).map((n: string) => n.trim().toLowerCase()).filter(Boolean);
    const targetLocations: string[] = (filters?.locations || []).map((l: string) => l.trim().toLowerCase()).filter(Boolean);

    const parseAvatar = (item: any): string | undefined => {
      const vector = item?.image?.attributes?.[0]?.detailData?.["com.linkedin.common.VectorImage"] ||
                     item?.picture?.["com.linkedin.common.VectorImage"] ||
                     item?.picture;
      if (vector?.rootUrl && Array.isArray(vector?.artifacts) && vector.artifacts.length > 0) {
        return `${vector.rootUrl}${vector.artifacts[0].fileIdentifyingUrlPath}`;
      }
      return undefined;
    };

    const items = [...(rawData.included || []), ...(rawData.elements || [])];
    const seenUrls = new Set<string>();

    for (const item of items) {
      const name = item.title?.text || item.title || "";
      const headline = item.primarySubtitle?.text || item.headline || "";
      const location = item.secondarySubtitle?.text || item.subline || "";
      let navUrl = item.navigationUrl || "";
      const distance = item.badgeText?.text || item.distance || "2nd";

      if (!navUrl && item.publicIdentifier) {
        navUrl = `https://www.linkedin.com/in/${item.publicIdentifier}`;
      }

      if (!name || !headline) continue;
      if (!navUrl.includes("/in/") && !item.publicIdentifier) continue;

      let vanity = "";
      const vanityMatch = navUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
      if (vanityMatch) {
        vanity = decodeURIComponent(vanityMatch[1]);
      } else if (item.publicIdentifier) {
        vanity = item.publicIdentifier;
      }

      if (!vanity || seenUrls.has(vanity.toLowerCase())) continue;
      seenUrls.add(vanity.toLowerCase());

      const profileUrl = `https://www.linkedin.com/in/${vanity}`;
      const avatarUrl = parseAvatar(item);

      let isQualified = true;
      let qualificationReason = "Matches all criteria";

      const headlineLower = headline.toLowerCase();
      const nameLower = name.toLowerCase();

      if (negativeKeywords.length > 0) {
        const matchedNeg = negativeKeywords.find((neg: string) => headlineLower.includes(neg) || nameLower.includes(neg));
        if (matchedNeg) {
          isQualified = false;
          qualificationReason = `Excluded by keyword: "${matchedNeg}"`;
        }
      }

      if (isQualified && targetTitles.length > 0) {
        const matchesTitle = targetTitles.some((title: string) => headlineLower.includes(title));
        if (!matchesTitle) {
          isQualified = false;
          qualificationReason = `Does not match target title keywords`;
        }
      }

      if (isQualified && targetLocations.length > 0) {
        const locationLower = location.toLowerCase();
        const matchesLoc = targetLocations.some((loc: string) => locationLower.includes(loc));
        if (!matchesLoc) {
          isQualified = false;
          qualificationReason = `Does not match target location`;
        }
      }

      prospects.push({
        fullName: name,
        headline,
        location,
        vanity,
        profileUrl,
        avatarUrl,
        networkDistance: distance.replace(/[^0-9a-zA-Z]/g, ""),
        isQualified,
        qualificationReason,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalFound: prospects.length,
        qualifiedCount: prospects.filter((p) => p.isQualified).length,
        prospects,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
