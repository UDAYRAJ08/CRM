// Supabase Edge Function: generate-ai-draft
// Calls Anthropic Claude API (model: claude-sonnet-4-6 / claude-3-5-sonnet-latest)
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AIDraftRequest {
  contactName: string;
  contactEmail?: string;
  companyName?: string;
  contactTitle?: string;
  contactStatus?: string;
  recentInteractions?: Array<{
    type: string;
    content: string;
    created_at: string;
  }>;
  senderName: string;
  goal: string; // e.g. "follow up after demo", "cold intro", "check in on proposal"
  tone?: "professional" | "friendly" | "concise" | "persuasive";
  customInstructions?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_API_KEY is not set in Supabase Edge Function secrets",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: AIDraftRequest = await req.json();

    const interactionsContext = payload.recentInteractions && payload.recentInteractions.length > 0
      ? payload.recentInteractions
          .map(
            (i) =>
              `- [${new Date(i.created_at).toLocaleDateString()}] ${i.type.toUpperCase()}: ${i.content}`
          )
          .join("\n")
      : "No previous interactions logged.";

    const systemPrompt = `You are an expert sales communication assistant writing high-converting, personalized B2B emails for a small team CRM.
Key rules:
1. Open the email with an engaging greeting like "Hyy [First Name]," followed immediately by a direct value hook: "If you are looking for a team to help you execute tasks and hit your upcoming project deadlines on time, we would love to connect..."
2. NEVER use cliché openers like "I hope this email finds you well" or "I hope you are having a wonderful week".
3. Focus on delivering execution speed, removing bottlenecks, meeting project milestones, and delivering high quality work.
4. Output format: Return a JSON object with strictly two keys: "subject" and "body".
Do not wrap in markdown quotes if possible, return valid JSON.`;

    const userPrompt = `Generate an email draft with the following context:

Recipient:
- Name: ${payload.contactName}
- Title: ${payload.contactTitle || "Not specified"}
- Company: ${payload.companyName || "Their organization"}
- Status / Stage: ${payload.contactStatus || "General"}

Sender:
- Name: ${payload.senderName}

Recent Interaction History:
${interactionsContext}

Goal / Purpose:
${payload.goal}

Tone:
${payload.tone || "professional"}

Additional Instructions:
${payload.customInstructions || "None"}

Please produce an appropriate, punchy subject line and email body (with paragraphs separated by standard line breaks). Make sure the opening leads with helping them handle tasks and meet project deadlines. Sign off with ${payload.senderName}.
Return format:
{
  "subject": "...",
  "body": "..."
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `Claude API Error: ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawContent = data.content?.[0]?.text || "";

    // Parse JSON safely from Claude's response
    let parsedResult;
    try {
      // Find JSON block if formatted with markdown
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        parsedResult = {
          subject: `Follow up - ${payload.contactName}`,
          body: rawContent,
        };
      }
    } catch {
      parsedResult = {
        subject: `Follow up - ${payload.contactName}`,
        body: rawContent,
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        subject: parsedResult.subject,
        body: parsedResult.body,
        raw: rawContent,
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
