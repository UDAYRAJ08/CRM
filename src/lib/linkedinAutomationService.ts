import { db } from './supabase';
import { Contact } from '../types/crm';
import { executeAICompletion } from './multiAiService';
import {
  ExtensionBridgeError,
  extensionQuota,
  extensionSearchPeople,
  extensionSendInvite,
} from './linkedinExtensionBridge';

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
  // The extension counts invites, since it is the one sending them.
  const quota = await extensionQuota();
  if (quota) {
    return {
      date: quota.date,
      sentToday: quota.count,
      maxDailyLimit: quota.maxLimit,
      remaining: quota.remaining,
      hasSessionCookie: true,
    };
  }
  return {
    date: new Date().toISOString().slice(0, 10),
    sentToday: 0,
    maxDailyLimit: 15,
    remaining: 15,
    hasSessionCookie: true,
  };
}

type RawProspect = Omit<LinkedInProspect, 'sendMode' | 'status' | 'isDuplicate' | 'duplicateReason'>;

/** Turn LinkedIn's raw people-search JSON into prospects, applying the title/keyword/location filters. */
export function parseLinkedInSearchResults(rawData: any, filters: ProspectSearchFilters = {}): RawProspect[] {
  const prospects: RawProspect[] = [];
  const norm = (list?: string[]) => (list || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const targetTitles = norm(filters.targetTitles);
  const negativeKeywords = norm(filters.negativeKeywords);
  const targetLocations = norm(filters.locations);

  const parseAvatar = (item: any): string | undefined => {
    const vector =
      item?.image?.attributes?.[0]?.detailData?.nonEntityProfilePicture?.vectorImage ||
      item?.image?.attributes?.[0]?.detailData?.['com.linkedin.common.VectorImage'] ||
      item?.picture?.['com.linkedin.common.VectorImage'] ||
      item?.picture;
    if (vector?.rootUrl && Array.isArray(vector?.artifacts) && vector.artifacts.length > 0) {
      return `${vector.rootUrl}${vector.artifacts[0].fileIdentifyingUrlPath}`;
    }
    return undefined;
  };

  const items = [...(rawData?.included || []), ...(rawData?.elements || [])];
  const seen = new Set<string>();

  for (const item of items) {
    const name = item.title?.text || item.title || '';
    const headline = item.primarySubtitle?.text || item.headline || '';
    const location = item.secondarySubtitle?.text || item.subline || '';
    let navUrl = item.navigationUrl || '';
    const distance = item.badgeText?.text || item.distance || '2nd';

    if (!navUrl && item.publicIdentifier) navUrl = `https://www.linkedin.com/in/${item.publicIdentifier}`;
    if (typeof name !== 'string' || typeof headline !== 'string' || !name || !headline) continue;
    if (!navUrl.includes('/in/') && !item.publicIdentifier) continue;

    const vanityMatch = navUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
    const vanity = vanityMatch ? decodeURIComponent(vanityMatch[1]) : item.publicIdentifier || '';
    if (!vanity || seen.has(vanity.toLowerCase())) continue;
    seen.add(vanity.toLowerCase());

    let isQualified = true;
    let qualificationReason = 'Matches all criteria';
    const headlineLower = headline.toLowerCase();
    const nameLower = name.toLowerCase();

    const matchedNeg = negativeKeywords.find((neg) => headlineLower.includes(neg) || nameLower.includes(neg));
    if (matchedNeg) {
      isQualified = false;
      qualificationReason = `Excluded by keyword: "${matchedNeg}"`;
    }
    if (isQualified && targetTitles.length > 0 && !targetTitles.some((t) => headlineLower.includes(t))) {
      isQualified = false;
      qualificationReason = 'Does not match target title keywords';
    }
    if (isQualified && targetLocations.length > 0 && !targetLocations.some((l) => location.toLowerCase().includes(l))) {
      isQualified = false;
      qualificationReason = 'Does not match target location';
    }

    prospects.push({
      fullName: name,
      headline,
      location,
      vanity,
      profileUrl: `https://www.linkedin.com/in/${vanity}`,
      avatarUrl: parseAvatar(item),
      networkDistance: String(distance).replace(/[^0-9a-zA-Z]/g, ''),
      isQualified,
      qualificationReason,
    });
  }
  return prospects;
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
  void cookieOverride; // The extension uses the browser's own LinkedIn session.
  try {
    let searchKeywords = (keywords || '').trim();
    const url = (searchUrl || '').trim();
    if (url) {
      try {
        const urlKeywords = new URL(url).searchParams.get('keywords');
        if (urlKeywords) searchKeywords = urlKeywords;
      } catch {
        const match = url.match(/keywords=([^&]+)/);
        if (match) searchKeywords = decodeURIComponent(match[1]);
      }
    }
    if (!searchKeywords) {
      return {
        success: false,
        totalFound: 0,
        qualifiedCount: 0,
        prospects: [],
        error: 'Search keywords or a valid LinkedIn search URL are required.',
      };
    }

    let rawData: any;
    try {
      rawData = await extensionSearchPeople(searchKeywords);
    } catch (e) {
      const err = e instanceof ExtensionBridgeError ? e : null;
      return {
        success: false,
        totalFound: 0,
        qualifiedCount: 0,
        prospects: [],
        error: err?.message || 'Failed to search LinkedIn prospects',
        expiredCookie: err?.code === 'NOT_LOGGED_IN',
      };
    }

    const rawProspects = parseLinkedInSearchResults(rawData, filters);

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

    void cookieOverride; // The extension uses the browser's own LinkedIn session.
    const vanityMatch = (targetUrl || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
    const vanity = vanityMatch
      ? decodeURIComponent(vanityMatch[1])
      : contact.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    let data: Awaited<ReturnType<typeof extensionSendInvite>>;
    let fallbackToBlank = false;
    try {
      try {
        data = await extensionSendInvite(vanity, note.slice(0, 300));
      } catch (e) {
        // Free accounts cannot attach notes: retry once as a blank invitation.
        const errStr = e instanceof ExtensionBridgeError ? `${e.message} ${e.details || ''}`.toLowerCase() : '';
        const noteRejected =
          e instanceof ExtensionBridgeError &&
          e.code === 'FAILED' &&
          (errStr.includes('invitation_message_limit') || errStr.includes('premium') || errStr.includes('note') || e.status === 400);
        if (!note.trim() || !noteRejected) throw e;
        console.warn('Custom note limit suspected on free account, retrying with blank invitation...');
        data = await extensionSendInvite(vanity, '');
        fallbackToBlank = true;
      }
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Failed to dispatch LinkedIn invite',
        error: e?.message || 'Unknown error',
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
      message: data.alreadySent
        ? `Connection request is already pending for ${data.name}.`
        : `Connection request sent to ${data.name}!`,
      alreadySent: data.alreadySent,
      sentToday: data.quota?.count,
      remaining: data.quota?.remaining,
      fallbackToBlank,
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
