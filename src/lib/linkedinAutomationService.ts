import { db } from './supabase';
import { Contact } from '../types/crm';

export interface LinkedInQuotaInfo {
  date: string;
  sentToday: number;
  maxDailyLimit: number;
  remaining: number;
  hasSessionCookie: boolean;
}

export interface SendInviteResult {
  success: boolean;
  message: string;
  alreadySent?: boolean;
  sentToday?: number;
  remaining?: number;
  error?: string;
}

export async function fetchLinkedInQuota(): Promise<LinkedInQuotaInfo> {
  try {
    const res = await fetch('/api/linkedin/quota');
    if (res.ok) {
      const data = await res.json();
      return {
        date: data.date || new Date().toISOString().slice(0, 10),
        sentToday: data.sentToday || 0,
        maxDailyLimit: data.maxDailyLimit || 20,
        remaining: data.remaining !== undefined ? data.remaining : 20,
        hasSessionCookie: Boolean(data.hasSessionCookie),
      };
    }
  } catch (e) {
    console.warn('Could not fetch LinkedIn quota:', e);
  }
  return {
    date: new Date().toISOString().slice(0, 10),
    sentToday: 0,
    maxDailyLimit: 20,
    remaining: 20,
    hasSessionCookie: true,
  };
}

export async function sendLinkedInConnectionInvite({
  contact,
  profileUrl,
  note,
  userId,
}: {
  contact: Contact;
  profileUrl?: string | null;
  note: string;
  userId?: string | null;
}): Promise<SendInviteResult> {
  try {
    // Determine profile URL
    let targetUrl = profileUrl || contact.linkedin_url;
    if (!targetUrl && contact.custom_fields) {
      for (const [, val] of Object.entries(contact.custom_fields)) {
        const strVal = String(val || '').trim();
        if (strVal.includes('linkedin.com/in/') || strVal.includes('linkedin.com/')) {
          targetUrl = strVal.startsWith('http') ? strVal : `https://${strVal}`;
          break;
        }
      }
    }

    const payload = {
      profileUrl: targetUrl || '',
      contactName: contact.name,
      note: note.slice(0, 300),
      contactId: contact.id,
    };

    const res = await fetch('/api/linkedin/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.error || 'Failed to dispatch LinkedIn invite',
        error: data.error || 'Unknown error',
      };
    }

    // 1. Log interaction to CRM database
    await db.addInteraction({
      contact_id: contact.id,
      type: 'linkedin',
      content: `⚡ Automated LinkedIn Connection Invite Sent:\n\n${note.trim()}`,
      created_by: userId || null,
    });

    // 2. Advance contact pipeline stage to 'contacted'
    if (contact.status === 'new') {
      await db.saveContact({
        id: contact.id,
        status: 'contacted',
      });
    }

    return {
      success: true,
      message: data.message || `Connection request sent to ${contact.name}!`,
      alreadySent: data.alreadySent,
      sentToday: data.sentToday,
      remaining: data.remaining,
    };
  } catch (err: any) {
    console.error('Error sending LinkedIn invite:', err);
    return {
      success: false,
      message: err.message || 'Network error sending invite',
      error: err.message,
    };
  }
}
