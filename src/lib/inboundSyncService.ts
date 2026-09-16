import { db } from './supabase';
import { Contact, EmailRecord, Interaction } from '../types/crm';

export interface InboundSyncResult {
  success: boolean;
  totalChecked: number;
  newRepliesCount: number;
  matchedContacts: Array<{ contactName: string; subject: string; from: string }>;
  message: string;
}

function parseComposioResponse(rawText: string): any[] {
  let messages: any[] = [];

  // 1. If SSE stream, extract lines starting with "data: "
  let jsonStr = rawText;
  if (rawText.includes('data: ')) {
    const dataLines = rawText
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.replace(/^data:\s*/, '').trim())
      .filter(Boolean);
    if (dataLines.length > 0) {
      jsonStr = dataLines.join('');
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Check if result has content array (MCP standard format with stringified json in content[0].text)
    const contentList = parsed?.result?.content || [];
    for (const c of contentList) {
      if (c.type === 'text' && c.text) {
        try {
          const inner = JSON.parse(c.text);
          const results = inner?.data?.results || inner?.results || [];
          for (const r of results) {
            const valList = r?.response?.data?.value;
            if (Array.isArray(valList)) {
              messages = valList;
              break;
            }
          }
        } catch (e) {
          console.warn('Inner parse error', e);
        }
      }
    }

    // Direct result.results format
    if (messages.length === 0) {
      const results = parsed?.result?.results || parsed?.data?.results || [];
      for (const r of results) {
        const valList = r?.response?.data?.value;
        if (Array.isArray(valList)) {
          messages = valList;
          break;
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse Composio MCP JSON', err);
  }

  return messages;
}

export async function syncOutlookInbox(): Promise<InboundSyncResult> {
  const composioApiKey =
    localStorage.getItem('crm_composio_api_key') ||
    import.meta.env.VITE_COMPOSIO_API_KEY ||
    'ck_SDOn08y-f0-B3wSCswR7';

  if (!composioApiKey) {
    return {
      success: false,
      totalChecked: 0,
      newRepliesCount: 0,
      matchedContacts: [],
      message: 'Composio API key is not configured.',
    };
  }

  try {
    const endpoint =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/api/composio'
        : 'https://connect.composio.dev/mcp';

    // Query last 30 inbox emails from connected Outlook mailbox
    const composioRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-consumer-api-key': composioApiKey.trim(),
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
          arguments: {
            current_step: 'SYNC_INBOX_EMAILS',
            sync_response_to_workbench: false,
            tools: [
              {
                tool_slug: 'OUTLOOK_QUERY_EMAILS',
                arguments: {
                  folder: 'inbox',
                  orderby: 'receivedDateTime desc',
                  top: 30,
                },
              },
            ],
          },
        },
      }),
    });

    const resText = await composioRes.text();
    const messages = parseComposioResponse(resText);

    if (!messages || messages.length === 0) {
      localStorage.setItem('crm_last_inbox_sync', new Date().toISOString());
      return {
        success: true,
        totalChecked: 0,
        newRepliesCount: 0,
        matchedContacts: [],
        message: 'Inbox checked: No messages returned from Outlook.',
      };
    }

    // Fetch CRM contacts and existing interactions
    const contacts = await db.getContacts();
    const contactEmailMap = new Map<string, Contact>();

    contacts.forEach((c) => {
      if (c.email) {
        contactEmailMap.set(c.email.trim().toLowerCase(), c);
      }
    });

    let newRepliesCount = 0;
    const matchedContacts: Array<{ contactName: string; subject: string; from: string }> = [];

    for (const msg of messages) {
      const fromEmail = msg?.from?.emailAddress?.address?.trim().toLowerCase();
      if (!fromEmail) continue;

      const matchedContact = contactEmailMap.get(fromEmail);
      if (!matchedContact) continue;

      const subject = msg?.subject || 'No Subject';
      const bodyPreview = msg?.bodyPreview || '';
      const receivedAt = msg?.receivedDateTime || new Date().toISOString();
      const messageId = msg?.id || '';
      const senderName = msg?.from?.emailAddress?.name || matchedContact.name;

      // Check if this interaction / email was already logged for this contact
      const existingInteractions = await db.getInteractions(matchedContact.id);
      const alreadyLogged = existingInteractions.some(
        (i) =>
          (messageId && i.content.includes(`[MsgID:${messageId}]`)) ||
          (i.content.includes(subject) && i.created_at.slice(0, 16) === receivedAt.slice(0, 16))
      );

      if (alreadyLogged) continue;

      // 1. Log into emails table as an Inbound email
      await db.saveEmail({
        contact_id: matchedContact.id,
        recipient_email: 'udaysharma@ingversionsdigital.com',
        sender_email: fromEmail,
        is_inbound: true,
        subject: subject,
        body: bodyPreview,
        ai_generated: false,
        sent_at: receivedAt,
        status: 'received',
      });

      // 2. Log into interactions timeline
      await db.addInteraction({
        contact_id: matchedContact.id,
        type: 'email',
        content: `📥 Inbound Email Reply Received\nFrom: ${senderName} <${fromEmail}>\nSubject: ${subject}\n\n${bodyPreview}\n[MsgID:${messageId}]`,
        created_at: receivedAt,
      });

      // 3. Auto-update contact stage if it was 'new' or 'contacted'
      if (matchedContact.status === 'new' || matchedContact.status === 'contacted') {
        await db.saveContact({
          id: matchedContact.id,
          status: 'qualified',
        });
      }

      newRepliesCount++;
      matchedContacts.push({
        contactName: matchedContact.name,
        subject,
        from: fromEmail,
      });
    }

    localStorage.setItem('crm_last_inbox_sync', new Date().toISOString());

    return {
      success: true,
      totalChecked: messages.length,
      newRepliesCount,
      matchedContacts,
      message:
        newRepliesCount > 0
          ? `Synced ${messages.length} emails: Found ${newRepliesCount} new reply from ${matchedContacts.map((m) => m.contactName).join(', ')}!`
          : `Synced ${messages.length} emails from inbox. No new replies from CRM contacts.`,
    };
  } catch (err: any) {
    console.error('Error syncing Outlook inbox:', err);
    return {
      success: false,
      totalChecked: 0,
      newRepliesCount: 0,
      matchedContacts: [],
      message: `Sync failed: ${err.message || err}`,
    };
  }
}
