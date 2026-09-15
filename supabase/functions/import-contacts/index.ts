// Supabase Edge Function: import-contacts
// Serverless Excel/CSV parsing, column matching, deduplication checking against Postgres
// Deno runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRequest {
  fileBase64?: string;
  rows?: Array<Record<string, any>>;
  fileName?: string;
  uploadedBy?: string;
  autoCommit?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: ImportRequest = await req.json();
    let rawRows: Array<Record<string, any>> = [];

    if (payload.fileBase64) {
      const binaryString = atob(payload.fileBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const workbook = XLSX.read(bytes, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
    } else if (payload.rows) {
      rawRows = payload.rows;
    } else {
      return new Response(JSON.stringify({ error: "Missing fileBase64 or rows payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch existing contacts to check for email or phone duplicates
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("id, name, email, phone, company_id");

    const existingEmails = new Set(
      (existingContacts || [])
        .map((c) => c.email?.trim().toLowerCase())
        .filter(Boolean)
    );
    const existingPhones = new Set(
      (existingContacts || [])
        .map((c) => c.phone?.replace(/\D/g, ""))
        .filter(Boolean)
    );

    const validNewContacts: any[] = [];
    const duplicates: any[] = [];
    const invalidRows: any[] = [];

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];

      // Flexible header resolution
      const name =
        row.name ||
        row.Name ||
        row["Full Name"] ||
        row["Contact Name"] ||
        row["First Name"] ||
        "";
      const email = (
        row.email ||
        row.Email ||
        row["E-mail"] ||
        row["Email Address"] ||
        ""
      )
        .trim()
        .toLowerCase();
      const phone =
        row.phone ||
        row.Phone ||
        row["Phone Number"] ||
        row.Mobile ||
        row.Cell ||
        "";
      const company =
        row.company ||
        row.Company ||
        row["Company Name"] ||
        row.Organization ||
        "";
      const title = row.title || row.Title || row["Job Title"] || "";
      const status = (row.status || row.Status || "new").toLowerCase();

      if (!name || name.trim().length === 0) {
        invalidRows.push({ rowIndex: index + 1, row, reason: "Missing contact name" });
        continue;
      }

      const cleanPhone = phone.replace(/\D/g, "");
      const isEmailDuplicate = email && existingEmails.has(email);
      const isPhoneDuplicate = cleanPhone && existingPhones.has(cleanPhone);

      const contactObj = {
        name: name.trim(),
        email: email || null,
        phone: phone ? phone.trim() : null,
        title: title ? title.trim() : null,
        company_name: company ? company.trim() : null,
        status: ["new", "contacted", "qualified", "proposal", "won", "lost"].includes(status)
          ? status
          : "new",
        owner_id: payload.uploadedBy || null,
        tags: ["Imported"],
      };

      if (isEmailDuplicate || isPhoneDuplicate) {
        duplicates.push({
          rowIndex: index + 1,
          contact: contactObj,
          reason: isEmailDuplicate ? `Duplicate email: ${email}` : `Duplicate phone: ${phone}`,
        });
      } else {
        validNewContacts.push(contactObj);
      }
    }

    let insertedRecords = [];
    if (payload.autoCommit && validNewContacts.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("contacts")
        .insert(validNewContacts)
        .select();

      if (insertError) {
        throw insertError;
      }
      insertedRecords = inserted || [];

      // Log import
      await supabase.from("import_logs").insert({
        file_name: payload.fileName || "Uploaded File",
        uploaded_by: payload.uploadedBy || null,
        rows_imported: validNewContacts.length,
        rows_flagged: duplicates.length + invalidRows.length,
        details: {
          duplicateCount: duplicates.length,
          invalidCount: invalidRows.length,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalRows: rawRows.length,
          validCount: validNewContacts.length,
          duplicateCount: duplicates.length,
          invalidCount: invalidRows.length,
        },
        validNewContacts,
        duplicates,
        invalidRows,
        insertedCount: insertedRecords.length,
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
