// Supabase Edge Function: send-email
// Dispatches emails via Resend API and records them into the emails table
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailPayload {
  contactId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  senderId?: string;
  senderName?: string;
  aiGenerated?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const defaultFrom = Deno.env.get("RESEND_FROM_EMAIL") || "CRM Team <onboarding@resend.dev>";

    const payload: SendEmailPayload = await req.json();

    if (!payload.recipientEmail || !payload.subject || !payload.body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: recipientEmail, subject, or body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let emailSent = false;
    let resendData = null;
    let errorMessage: string | null = null;

    if (resendApiKey) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: defaultFrom,
          to: [payload.recipientEmail],
          subject: payload.subject,
          text: payload.body,
          html: `<div style="font-family: sans-serif; line-height: 1.6; white-space: pre-wrap;">${payload.body}</div>`,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        errorMessage = `Resend Error: ${errText}`;
      } else {
        emailSent = true;
        resendData = await resendRes.json();
      }
    } else {
      // In demo / test mode without API key
      emailSent = true;
      errorMessage = "Demo Mode: No RESEND_API_KEY provided; logged directly to CRM.";
    }

    // Record in Supabase emails table if configured
    let savedRecord = null;
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data, error: dbError } = await supabase.from("emails").insert({
        contact_id: payload.contactId || null,
        recipient_email: payload.recipientEmail,
        subject: payload.subject,
        body: payload.body,
        ai_generated: payload.aiGenerated || false,
        sent_by: payload.senderId || null,
        sent_at: new Date().toISOString(),
        status: emailSent ? "sent" : "failed",
        error_message: errorMessage,
      }).select().single();

      if (!dbError) {
        savedRecord = data;
      }
    }

    return new Response(
      JSON.stringify({
        success: emailSent,
        resend: resendData,
        record: savedRecord,
        message: emailSent ? "Email dispatched successfully" : "Email delivery failed",
        error: errorMessage,
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
