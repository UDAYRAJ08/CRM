// Supabase Edge Function: generate-ai-draft
// Secure Multi-AI Backend Proxy (Anthropic, OpenAI, Gemini, Groq, DeepSeek)
// Keeps all API keys safely stored on the server side so client browsers never expose raw keys.
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AIProxyRequest {
  provider?: "anthropic" | "openai" | "gemini" | "groq" | "deepseek" | "openrouter";
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;

  // Legacy format compatibility
  contactName?: string;
  contactEmail?: string;
  companyName?: string;
  contactTitle?: string;
  contactStatus?: string;
  recentInteractions?: Array<{
    type: string;
    content: string;
    created_at: string;
  }>;
  senderName?: string;
  goal?: string;
  tone?: "professional" | "friendly" | "concise" | "persuasive";
  customInstructions?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Only signed-in CRM team members may spend the server's AI keys.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });
    const { data: who } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!who.user) return fail(401, "Sign in to the CRM first.");
    const { data: member, error: memberError } = await admin.from("team_members").select("id")
      .eq("auth_user_id", who.user.id).order("created_at").limit(1).maybeSingle();
    if (memberError) return fail(500, "CRM server is not configured.");
    if (!member) return fail(403, "Only CRM team members can generate drafts.");

    const payload: AIProxyRequest = await req.json();
    payload.maxTokens = Math.min(Math.max(1, Math.floor(Number(payload.maxTokens)) || 2048), 4000);

    // Determine target provider
    const provider = payload.provider || "anthropic";

    // Build prompts if legacy parameters were passed
    let systemPrompt = payload.systemPrompt || "";
    let userPrompt = payload.userPrompt || "";

    if (!userPrompt && payload.contactName) {
      const interactionsContext = payload.recentInteractions && payload.recentInteractions.length > 0
        ? payload.recentInteractions
            .map(
              (i) =>
                `- [${new Date(i.created_at).toLocaleDateString()}] ${i.type.toUpperCase()}: ${i.content}`
            )
            .join("\n")
        : "No previous interactions logged.";

      systemPrompt = `You are an expert sales communication assistant writing high-converting, personalized B2B emails for a small team CRM.
Rules:
1. Open with an engaging greeting like "Hi [First Name]," followed immediately by a direct value hook regarding helping them execute tasks and hit upcoming project deadlines on time.
2. NEVER use cliché openers like "I hope this email finds you well".
3. Return strictly a JSON object with two keys: "subject" and "body".`;

      userPrompt = `Generate an email draft with the following context:
Recipient:
- Name: ${payload.contactName}
- Title: ${payload.contactTitle || "Not specified"}
- Company: ${payload.companyName || "Their organization"}
- Status: ${payload.contactStatus || "General"}

Sender:
- Name: ${payload.senderName || "CRM Team"}

History:
${interactionsContext}

Goal:
${payload.goal || "Follow up on project deadlines"}

Tone:
${payload.tone || "professional"}

Additional Notes:
${payload.customInstructions || "None"}

Return JSON format:
{
  "subject": "...",
  "body": "..."
}`;
    }

    let rawText = "";

    // 1. ANTHROPIC CLAUDE PROXY
    if (provider === "anthropic") {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured in server secrets" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const model = payload.model || "claude-3-5-sonnet-latest";
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: payload.maxTokens || 2048,
          temperature: payload.temperature ?? 0.7,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return new Response(
          JSON.stringify({ error: `Claude API Error: ${errText}` }),
          { status: claudeRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await claudeRes.json();
      rawText = data.content?.[0]?.text || "";
    }

    // 2. OPENAI PROXY
    else if (provider === "openai") {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "OPENAI_API_KEY is not configured in server secrets" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const model = payload.model || "gpt-4o";
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: payload.temperature ?? 0.7,
          max_tokens: payload.maxTokens || 2048,
        }),
      });

      if (!openAiRes.ok) {
        const errText = await openAiRes.text();
        return new Response(
          JSON.stringify({ error: `OpenAI Error: ${errText}` }),
          { status: openAiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await openAiRes.json();
      rawText = data.choices?.[0]?.message?.content || "";
    }

    // 3. GOOGLE GEMINI PROXY
    else if (provider === "gemini") {
      const apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "GEMINI_API_KEY is not configured in server secrets" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const model = payload.model || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: payload.temperature ?? 0.7,
            maxOutputTokens: payload.maxTokens || 2048,
          },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return new Response(
          JSON.stringify({ error: `Gemini Error: ${errText}` }),
          { status: geminiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await geminiRes.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    // 4. GROQ PROXY
    else if (provider === "groq") {
      const apiKey = Deno.env.get("GROQ_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "GROQ_API_KEY is not configured in server secrets" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const model = payload.model || "llama-3.3-70b-versatile";
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: payload.temperature ?? 0.7,
          max_tokens: payload.maxTokens || 2048,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        return new Response(
          JSON.stringify({ error: `Groq Error: ${errText}` }),
          { status: groqRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await groqRes.json();
      rawText = data.choices?.[0]?.message?.content || "";
    }

    // 5. DEEPSEEK PROXY
    else if (provider === "deepseek") {
      const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "DEEPSEEK_API_KEY is not configured in server secrets" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const model = payload.model || "deepseek-chat";
      const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: payload.temperature ?? 0.7,
          max_tokens: payload.maxTokens || 2048,
        }),
      });

      if (!deepseekRes.ok) {
        const errText = await deepseekRes.text();
        return new Response(
          JSON.stringify({ error: `DeepSeek Error: ${errText}` }),
          { status: deepseekRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await deepseekRes.json();
      rawText = data.choices?.[0]?.message?.content || "";
    }

    // Parse JSON safely from output if available
    let parsedSubject = "";
    let parsedBody = "";

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsedSubject = parsed.subject || "";
        parsedBody = parsed.body || "";
      }
    } catch {
      parsedSubject = "Project Support";
      parsedBody = rawText;
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider,
        raw: rawText,
        subject: parsedSubject || undefined,
        body: parsedBody || rawText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
