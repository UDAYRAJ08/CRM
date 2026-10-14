import { db } from './supabase';
import { Contact } from '../types/crm';
import { executeAICompletion } from './multiAiService';

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
  fallbackToBlank?: boolean;
}

export interface LinkedInProspect {
  id?: string;
  fullName: string;
  headline: string;
  location?: string;
  vanity: string;
  profileUrl: string;
  avatarUrl?: string;
  company?: string;
  networkDistance?: string;
  isQualified: boolean;
  qualificationReason?: string;
  isDuplicate?: boolean;
  duplicateReason?: string;
  sendMode: 'blank' | 'ai_note';
  customNote?: string;
  status: 'pending' | 'approved' | 'discarded' | 'queued' | 'sent' | 'failed' | 'already_connected';
}

export interface ProspectSearchFilters {
  targetTitles?: string[];
  negativeKeywords?: string[];
  locations?: string[];
}

/**
 * Fetch current daily invite quota and safety limits
 */
export async function fetchLinkedInQuota(): Promise<LinkedInQuotaInfo> {
  try {
    const res = await fetch('/api/linkedin/quota');
    if (res.ok) {
      const data = await res.json();
      const quota = data.quota || data;
      return {
        date: quota.date || new Date().toISOString().slice(0, 10),
        sentToday: quota.sentToday !== undefined ? quota.sentToday : (quota.count || 0),
        maxDailyLimit: quota.maxDailyLimit || quota.maxLimit || 15,
        remaining: quota.remaining !== undefined ? quota.remaining : 15,
        hasSessionCookie: Boolean(data.hasSessionCookie ?? true),
      };
    }
  } catch (e) {
    console.warn('Could not fetch LinkedIn quota:', e);
  }
  return {
    date: new Date().toISOString().slice(0, 10),
    sentToday: 0,
    maxDailyLimit: 15,
    remaining: 15,
    hasSessionCookie: true,
  };
}

/**
 * Search LinkedIn for people using keywords or a search URL, applying hard filters and deduplication
 */
export async function searchLinkedInProspects({
  keywords,
  searchUrl,
  filters,
  cookieOverride,
  existingContacts = [],
}: {
  keywords?: string;
  searchUrl?: string;
  filters?: ProspectSearchFilters;
  cookieOverride?: { liAt: string; jsessionId: string; rawCookie?: string };
  existingContacts?: Contact[];
}): Promise<{
  success: boolean;
  totalFound: number;
  qualifiedCount: number;
  prospects: LinkedInProspect[];
  error?: string;
  expiredCookie?: boolean;
}> {
  try {
    const payload = {
      keywords: keywords?.trim(),
      searchUrl: searchUrl?.trim(),
      filters,
      cookieOverride,
    };

    let res: Response;
    try {
      res = await fetch('/api/linkedin/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (netErr: any) {
      return {
        success: false,
        totalFound: 0,
        qualifiedCount: 0,
        prospects: [],
        error: 'Cannot connect to local server (/api/linkedin/search). Make sure npm run dev is running.',
      };
    }

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = { error: `Server returned status ${res.status}` };
    }

    if (!res.ok || !data.success) {
      return {
        success: false,
        totalFound: 0,
        qualifiedCount: 0,
        prospects: [],
        error: data.error || 'Failed to search LinkedIn prospects',
        expiredCookie: Boolean(data.expiredCookie || res.status === 401),
      };
    }

    const rawProspects: any[] = data.prospects || [];

    // Map existing contact profile URLs for deduplication
    const knownUrls = new Set<string>();
    const knownVanities = new Set<string>();

    existingContacts.forEach((c) => {
      if (c.linkedin_url) {
        const urlNorm = c.linkedin_url.toLowerCase().replace(/\/$/, '');
        knownUrls.add(urlNorm);
        const match = urlNorm.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (match) knownVanities.add(match[1]);
      }
      if (c.custom_fields) {
        Object.values(c.custom_fields).forEach((val) => {
          const str = String(val || '').toLowerCase();
          if (str.includes('linkedin.com/in/')) {
            const match = str.match(/linkedin\.com\/in\/([^/?#]+)/i);
            if (match) knownVanities.add(match[1]);
          }
        });
      }
    });

    const parsed: LinkedInProspect[] = rawProspects.map((p) => {
      const pUrl = (p.profileUrl || `https://www.linkedin.com/in/${p.vanity}`).toLowerCase().replace(/\/$/, '');
      const pVanity = (p.vanity || '').toLowerCase();

      let isDuplicate = false;
      let duplicateReason = '';

      if (knownUrls.has(pUrl) || (pVanity && knownVanities.has(pVanity))) {
        isDuplicate = true;
        duplicateReason = 'Already in CRM contacts list';
      }

      if (p.networkDistance === '1st') {
        isDuplicate = true;
        duplicateReason = 'Already a 1st-degree connection';
      }

      return {
        fullName: p.fullName,
        headline: p.headline,
        location: p.location,
        vanity: p.vanity,
        profileUrl: p.profileUrl,
        avatarUrl: p.avatarUrl,
        company: p.company,
        networkDistance: p.networkDistance || '2nd',
        isQualified: p.isQualified !== false && !isDuplicate,
        qualificationReason: isDuplicate ? duplicateReason : p.qualificationReason || 'Matches all criteria',
        isDuplicate,
        duplicateReason,
        sendMode: 'blank', // default for free account safety
        status: isDuplicate ? 'already_connected' : p.isQualified ? 'pending' : 'discarded',
      };
    });

    return {
      success: true,
      totalFound: parsed.length,
      qualifiedCount: parsed.filter((p) => p.isQualified).length,
      prospects: parsed,
    };
  } catch (err: any) {
    console.error('LinkedIn search error:', err);
    return {
      success: false,
      totalFound: 0,
      qualifiedCount: 0,
      prospects: [],
      error: err.message || 'Network error performing search',
    };
  }
}

/**
 * Generate a personalized LinkedIn connection request note (< 300 chars) using Multi-AI engine
 */
export async function generateAIConnectionNote({
  prospect,
  userProfileHeadline,
  userOffering,
}: {
  prospect: LinkedInProspect;
  userProfileHeadline?: string;
  userOffering?: string;
}): Promise<string> {
  const firstName = prospect.fullName.split(' ')[0] || prospect.fullName;

  const systemPrompt = `You are a world-class B2B networking strategist. Write a short, personalized, natural LinkedIn connection request note.
CRITICAL CONSTRAINT: 
- The note MUST be under 260 characters (LinkedIn maximum limit is 300 characters, so keep a safety buffer).
- Plain text only. No markdown, quotes, emojis, or greetings like "Dear".
- Sound like a genuine peer, NOT a pushy salesperson or bot.
- Do NOT include any placeholders like [Name], [Company], or [Topic]. Write the exact message ready to send.`;

  const userPrompt = `Prospect:
- Name: ${prospect.fullName} (First name: ${firstName})
- Headline: ${prospect.headline}
- Location: ${prospect.location || 'Unknown'}

Sender Context:
- Role/Headline: ${userProfileHeadline || 'Founder & Product Leader'}
- Value/Expertise: ${userOffering || 'B2B CRM Automation & Growth'}

Write a punchy, warm invite note (< 260 characters) mentioning their background or role and proposing to connect.`;

  try {
    const res = await executeAICompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxTokens: 100,
    });

    let note = res.text.trim().replace(/^["']|["']$/g, '');
    if (note.length > 290) {
      note = note.slice(0, 280).trim() + '...';
    }
    return note;
  } catch (e) {
    console.warn('AI Note generation failed, using tailored template:', e);
    // Reliable contextual fallback note (< 200 chars)
    return `Hi ${firstName}, saw your profile and focus on ${prospect.headline.slice(0, 45)}. Would love to connect and follow your work here on LinkedIn!`;
  }
}

/**
 * Send a single LinkedIn connection invite with optional note & CRM logging
 */
export async function sendLinkedInConnectionInvite({
  contact,
  profileUrl,
  note = '',
  cookieOverride,
  userId,
}: {
  contact: Partial<Contact> & { name: string };
  profileUrl?: string | null;
  note?: string;
  cookieOverride?: { liAt: string; jsessionId: string; rawCookie?: string };
  userId?: string | null;
}): Promise<SendInviteResult> {
  try {
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
      cookieOverride,
    };

    let res = await fetch('/api/linkedin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = await res.json();

    // Free account note quota fallback: If error indicates note limit or free tier restriction, retry with blank note!
    if (!res.ok && note.trim().length > 0) {
      const errStr = JSON.stringify(data).toLowerCase();
      if (
        errStr.includes('invitation_message_limit') ||
        errStr.includes('premium') ||
        errStr.includes('note') ||
        res.status === 400
      ) {
        console.warn('Custom note limit suspected on free account, retrying with blank invitation...');
        const fallbackRes = await fetch('/api/linkedin/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, note: '' }),
        });
        if (fallbackRes.ok) {
          data = await fallbackRes.json();
          data.fallbackToBlank = true;
          res = fallbackRes;
        }
      }
    }

    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.error || 'Failed to dispatch LinkedIn invite',
        error: data.error || 'Unknown error',
      };
    }

    // 1. Auto-create or update CRM contact
    let contactId = contact.id;
    if (!contactId && targetUrl) {
      try {
        const newContact = await db.saveContact({
          name: contact.name,
          title: contact.title || undefined,
          linkedin_url: targetUrl,
          status: 'contacted',
          tags: ['LinkedIn Agent', 'Invite Sent'],
          custom_fields: {
            invite_note: note || '(Blank Invitation)',
            invited_at: new Date().toISOString(),
          },
        });
        contactId = newContact?.id;
      } catch (e) {
        console.warn('Failed to auto-upsert contact:', e);
      }
    } else if (contactId) {
      await db.saveContact({
        id: contactId,
        status: 'contacted',
      }).catch(() => {});
    }

    // 2. Log interaction
    if (contactId) {
      await db.addInteraction({
        contact_id: contactId,
        type: 'linkedin',
        content: note.trim()
          ? `💼 LinkedIn Connection Invite Sent:\n\n"${note.trim()}"`
          : `💼 Blank LinkedIn Connection Invite Sent`,
        created_by: userId || null,
      }).catch(() => {});
    }

    return {
      success: true,
      message: data.message || `Connection request sent to ${contact.name}!`,
      alreadySent: data.alreadySent,
      sentToday: data.sentToday,
      remaining: data.remaining,
      fallbackToBlank: data.fallbackToBlank,
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

/**
 * Dispatch a batch of approved prospects with safe human-like randomized delays (45–150s)
 */
export async function dispatchAgentBatchWithJitter({
  prospects,
  userId,
  cookieOverride,
  minDelaySec = 45,
  maxDelaySec = 120,
  onProgress,
  signal,
}: {
  prospects: LinkedInProspect[];
  userId?: string | null;
  cookieOverride?: { liAt: string; jsessionId: string; rawCookie?: string };
  minDelaySec?: number;
  maxDelaySec?: number;
  onProgress?: (progress: {
    currentIndex: number;
    total: number;
    currentProspect: LinkedInProspect;
    status: 'sending' | 'waiting' | 'success' | 'failed' | 'skipped' | 'fallback_blank';
    message: string;
    nextDelaySeconds?: number;
    quota?: LinkedInQuotaInfo;
  }) => void;
  signal?: AbortSignal;
}): Promise<{
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  results: { prospect: LinkedInProspect; success: boolean; message: string }[];
}> {
  const results: { prospect: LinkedInProspect; success: boolean; message: string }[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < prospects.length; i++) {
    if (signal?.aborted) {
      break;
    }

    const prospect = prospects[i];

    // Skip if not approved or already connected
    if (prospect.status === 'discarded' || prospect.status === 'already_connected' || !prospect.isQualified) {
      skipped++;
      continue;
    }

    // Check quota before sending
    const quota = await fetchLinkedInQuota();
    if (quota.remaining <= 0) {
      onProgress?.({
        currentIndex: i,
        total: prospects.length,
        currentProspect: prospect,
        status: 'skipped',
        message: 'Daily safety limit reached. Pausing remaining invites until tomorrow.',
        quota,
      });
      break;
    }

    onProgress?.({
      currentIndex: i,
      total: prospects.length,
      currentProspect: prospect,
      status: 'sending',
      message: `Sending invite to ${prospect.fullName}...`,
      quota,
    });

    const note = prospect.sendMode === 'ai_note' ? prospect.customNote || '' : '';
    const res = await sendLinkedInConnectionInvite({
      contact: {
        name: prospect.fullName,
        title: prospect.headline,
        linkedin_url: prospect.profileUrl,
      },
      profileUrl: prospect.profileUrl,
      note,
      userId,
      cookieOverride,
    });

    if (res.success) {
      sent++;
      prospect.status = 'sent';
      const statusType = res.fallbackToBlank ? 'fallback_blank' : 'success';
      const msg = res.fallbackToBlank
        ? `Sent blank invite to ${prospect.fullName} (free note limit fallback)`
        : `Successfully sent invite to ${prospect.fullName}`;

      results.push({ prospect, success: true, message: msg });

      onProgress?.({
        currentIndex: i + 1,
        total: prospects.length,
        currentProspect: prospect,
        status: statusType,
        message: msg,
        quota,
      });
    } else {
      failed++;
      prospect.status = 'failed';
      results.push({ prospect, success: false, message: res.error || 'Failed to send' });

      onProgress?.({
        currentIndex: i + 1,
        total: prospects.length,
        currentProspect: prospect,
        status: 'failed',
        message: `Failed: ${res.error || 'Could not send invite'}`,
        quota,
      });
    }

    // Wait with randomized jitter if there are more prospects to send
    if (i < prospects.length - 1 && !signal?.aborted) {
      const delaySec = Math.floor(Math.random() * (maxDelaySec - minDelaySec + 1)) + minDelaySec;
      
      onProgress?.({
        currentIndex: i + 1,
        total: prospects.length,
        currentProspect: prospect,
        status: 'waiting',
        message: `Safe jitter delay: waiting ${delaySec}s before next invite...`,
        nextDelaySeconds: delaySec,
        quota,
      });

      // Split sleep into 1-second chunks so abort is responsive
      for (let s = delaySec; s > 0; s--) {
        if (signal?.aborted) break;
        onProgress?.({
          currentIndex: i + 1,
          total: prospects.length,
          currentProspect: prospect,
          status: 'waiting',
          message: `Safe delay: next invite in ${s}s...`,
          nextDelaySeconds: s,
          quota,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  return {
    total: prospects.length,
    sent,
    failed,
    skipped,
    results,
  };
}
