// LinkedIn Service Library
// Handles all Supabase DB operations for LinkedIn integration.
// Designed to be auth-type agnostic — cookie now, OAuth/hybrid later.

import { supabase } from './supabase';
import {
  LinkedInAccount,
  LinkedInCampaign,
  LinkedInCampaignStep,
  LinkedInActionQueueItem,
  CampaignBuilderForm,
  CampaignBuilderStep,
} from '../types/linkedin';

function getClient() {
  if (!supabase) {
    throw new Error('Supabase client is not initialized. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.');
  }
  return supabase;
}

// ==============================================================================
// ENCRYPTION HELPERS — AES-GCM via Web Crypto API
// The encryption key is derived from the Supabase anon key so it is unique
// per workspace without exposing a separate secret in the bundle.
// ==============================================================================

const CRYPTO_VERSION_PREFIX = 'aes_v1:';

async function deriveKey(): Promise<CryptoKey> {
  const baseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'fallback-local-dev-key';
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey('raw', enc.encode(baseKey), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('nexus_crm_li_cookie_v1'), iterations: 100_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function encryptValue(value: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(value));
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return CRYPTO_VERSION_PREFIX + bytesToBase64(combined);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function decryptValue(encrypted: string): Promise<string> {
  try {
    if (!encrypted.startsWith(CRYPTO_VERSION_PREFIX)) return encrypted;
    const rawBase64 = encrypted.slice(CRYPTO_VERSION_PREFIX.length);
    const combined = base64ToBytes(rawBase64);
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const key = await deriveKey();
    const decryptedBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(decryptedBuf);
  } catch (err) {
    console.warn('Decryption failed, returning raw value:', err);
    return encrypted;
  }
}

/** Retrieve active session cookies for an account */
export async function getAccountCredentials(accountId: string): Promise<{ liAt: string; jsessionId: string } | null> {
  const { data, error } = await getClient()
    .from('linkedin_accounts')
    .select('li_at_encrypted, jsessionid_encrypted')
    .eq('id', accountId)
    .maybeSingle();

  if (error || !data) return null;
  const liAt = data.li_at_encrypted ? await decryptValue(data.li_at_encrypted) : '';
  const jsessionId = data.jsessionid_encrypted ? await decryptValue(data.jsessionid_encrypted) : '';
  return { liAt, jsessionId };
}

/** Returns the active Supabase session JWT, or null if not logged in. */
async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

// ==============================================================================
// LINKEDIN ACCOUNTS
// ==============================================================================

// Fields that must NEVER be sent to the browser — cookies live server-side only.
const SAFE_ACCOUNT_FIELDS = `
  id,
  team_member_id,
  auth_type,
  status,
  error_message,
  linkedin_name,
  linkedin_headline,
  linkedin_profile_id,
  linkedin_avatar_url,
  linkedin_profile_url,
  daily_connection_limit,
  daily_message_limit,
  daily_view_limit,
  connections_sent_today,
  messages_sent_today,
  profile_views_today,
  last_verified_at,
  created_at,
  updated_at,
  team_member:team_members (name, email, avatar_url)
`;

function normalizeAccount(row: any): LinkedInAccount {
  const teamMember = Array.isArray(row?.team_member) ? row.team_member[0] : row?.team_member;
  return {
    ...row,
    team_member: teamMember || undefined,
  } as LinkedInAccount;
}

export async function getLinkedInAccounts(): Promise<LinkedInAccount[]> {
  const { data, error } = await getClient()
    .from('linkedin_accounts')
    .select(SAFE_ACCOUNT_FIELDS)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeAccount);
}

export async function getMyLinkedInAccount(teamMemberId: string): Promise<LinkedInAccount | null> {
  const { data, error } = await getClient()
    .from('linkedin_accounts')
    .select(SAFE_ACCOUNT_FIELDS)
    .eq('team_member_id', teamMemberId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeAccount(data) : null;
}

export async function connectLinkedInCookie(
  teamMemberId: string,
  liAt: string,
  jsessionId: string,
  customAvatarUrl?: string,
  customProfileUrl?: string,
  customName?: string
): Promise<LinkedInAccount> {
  const encrypted = {
    li_at_encrypted: await encryptValue(liAt.trim()),
    jsessionid_encrypted: await encryptValue(jsessionId.trim()),
  };

  const payload: Record<string, unknown> = {
    team_member_id: teamMemberId,
    auth_type: 'cookie',
    ...encrypted,
    status: 'active',
    error_message: null,
    // Reset or set initial name so fresh account info is populated
    linkedin_name: customName?.trim() || null,
    linkedin_headline: null,
    linkedin_profile_id: null,
    linkedin_avatar_url: customAvatarUrl?.trim() || null,
    linkedin_profile_url: customProfileUrl?.trim() || null,
    connections_sent_today: 0,
    messages_sent_today: 0,
    profile_views_today: 0,
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. Upsert account record
  const { data, error } = await getClient()
    .from('linkedin_accounts')
    .upsert(payload, { onConflict: 'team_member_id' })
    .select(SAFE_ACCOUNT_FIELDS)
    .single();

  if (error) throw error;

  // 2. Trigger validation & profile metadata fetch via local/Vercel /api/linkedin/verify
  // (Avoids direct AWS datacenter IP hits that cause automatic cookie revocation)
  try {
    const verifyRes = await fetch('/api/linkedin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookieOverride: {
          liAt: liAt.trim(),
          jsessionId: jsessionId.trim(),
        },
      }),
    });

    if (verifyRes.ok) {
      const verifyData = await verifyRes.json();
      if (verifyData.valid && verifyData.profile) {
        const profileUpdates: Record<string, any> = {
          status: 'active',
          error_message: null,
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (verifyData.profile.name) profileUpdates.linkedin_name = verifyData.profile.name;
        if (verifyData.profile.headline) profileUpdates.linkedin_headline = verifyData.profile.headline;
        if (verifyData.profile.avatarUrl) profileUpdates.linkedin_avatar_url = verifyData.profile.avatarUrl;
        if (verifyData.profile.profileUrl) profileUpdates.linkedin_profile_url = verifyData.profile.profileUrl;

        await getClient()
          .from('linkedin_accounts')
          .update(profileUpdates)
          .eq('id', data.id);
      } else {
        // Keep status active so the session is never killed automatically!
        await getClient()
          .from('linkedin_accounts')
          .update({
            status: 'active',
            linkedin_name: customName?.trim() || data.linkedin_name || 'LinkedIn Connected Account',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);
      }
    }
  } catch (err) {
    console.warn('Auto-profile fetch on connect warning:', err);
  }

  // 3. Fetch latest record with updated profile info & avatar
  const { data: refreshed } = await getClient()
    .from('linkedin_accounts')
    .select(SAFE_ACCOUNT_FIELDS)
    .eq('id', data.id)
    .single();

  return refreshed ? normalizeAccount(refreshed) : normalizeAccount(data);
}

export async function refreshLinkedInAccount(accountId: string): Promise<LinkedInAccount> {
  try {
    const creds = await getAccountCredentials(accountId);
    const verifyRes = await fetch('/api/linkedin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId,
        cookieOverride: creds ? { liAt: creds.liAt, jsessionId: creds.jsessionId } : undefined,
      }),
    });

    if (verifyRes.ok) {
      const verifyData = await verifyRes.json();
      if (verifyData.valid && verifyData.profile) {
        await getClient()
          .from('linkedin_accounts')
          .update({
            status: 'active',
            error_message: null,
            linkedin_name: verifyData.profile.name,
            linkedin_headline: verifyData.profile.headline,
            linkedin_avatar_url: verifyData.profile.avatarUrl,
            linkedin_profile_url: verifyData.profile.profileUrl,
            last_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', accountId);
      }
    }
  } catch (err) {
    console.warn('Could not call /api/linkedin/verify:', err);
  }

  const { data, error } = await getClient()
    .from('linkedin_accounts')
    .select(SAFE_ACCOUNT_FIELDS)
    .eq('id', accountId)
    .single();

  if (error) throw error;
  return normalizeAccount(data);
}

export async function updateLinkedInProfile(
  accountId: string,
  updates: { linkedin_avatar_url?: string | null; linkedin_profile_url?: string | null; linkedin_name?: string | null }
): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) throw error;
}

export async function disconnectLinkedInAccount(accountId: string): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_accounts')
    .update({
      status: 'disconnected',
      li_at_encrypted: null,
      jsessionid_encrypted: null,
      error_message: 'Account disconnected by user',
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  if (error) throw error;
}

export async function deleteLinkedInAccount(accountId: string): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_accounts')
    .delete()
    .eq('id', accountId);

  if (error) throw error;
}

export async function updateLinkedInLimits(
  accountId: string,
  limits: { daily_connection_limit?: number; daily_message_limit?: number; daily_view_limit?: number }
): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_accounts')
    .update({ ...limits, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) throw error;
}

// ==============================================================================
// CAMPAIGNS
// ==============================================================================

export async function getLinkedInCampaigns(): Promise<LinkedInCampaign[]> {
  const { data, error } = await getClient()
    .from('linkedin_campaigns')
    .select(`
      *,
      steps:linkedin_campaign_steps (
        id, step_order, action_type,
        connection_note, connection_note_ai_generated,
        message_body, message_ai_generated,
        delay_after_hours, delay_jitter_hours, created_at
      ),
      linkedin_account:linkedin_accounts (
        id, linkedin_name, linkedin_headline, linkedin_avatar_url, status
      ),
      creator:team_members!created_by (name)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((c: any) => ({
    ...c,
    steps: (c.steps || []).sort((a: any, b: any) => a.step_order - b.step_order),
  })) as LinkedInCampaign[];
}

export async function getCampaignById(id: string): Promise<LinkedInCampaign | null> {
  const { data, error } = await getClient()
    .from('linkedin_campaigns')
    .select(`
      *,
      steps:linkedin_campaign_steps (*),
      linkedin_account:linkedin_accounts (*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    steps: (data.steps || []).sort((a: any, b: any) => a.step_order - b.step_order),
  } as LinkedInCampaign;
}

export async function createCampaign(
  form: CampaignBuilderForm,
  createdBy: string,
  resolvedContactIds: string[]
): Promise<LinkedInCampaign> {
  // 1. Create the campaign
  const { data: campaign, error: campError } = await getClient()
    .from('linkedin_campaigns')
    .insert({
      created_by: createdBy,
      linkedin_account_id: form.linkedin_account_id,
      name: form.name,
      description: form.description || null,
      audience_filters: form.audience_filters,
      contact_ids: resolvedContactIds,
      start_date: form.start_date,
      end_date: form.end_date,
      working_hours_start: form.working_hours_start,
      working_hours_end: form.working_hours_end,
      working_days: form.working_days,
      status: 'draft',
      total_contacts: resolvedContactIds.length,
    })
    .select()
    .single();

  if (campError) throw campError;

  // 2. Insert steps
  if (form.steps.length > 0) {
    const steps = form.steps.map((s) => ({
      campaign_id: campaign.id,
      step_order: s.step_order,
      action_type: s.action_type,
      connection_note: s.connection_note || null,
      connection_note_ai_generated: s.connection_note_ai_generated,
      message_body: s.message_body || null,
      message_ai_generated: s.message_ai_generated,
      delay_after_hours: s.delay_after_hours,
      delay_jitter_hours: s.delay_jitter_hours,
    }));

    const { error: stepsError } = await getClient().from('linkedin_campaign_steps').insert(steps);
    if (stepsError) throw stepsError;
  }

  return campaign as LinkedInCampaign;
}

export async function updateCampaign(
  id: string,
  updates: Partial<LinkedInCampaign>
): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_campaigns')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Launch a campaign: change status to 'active' and populate the action queue
export async function launchCampaign(campaignId: string): Promise<void> {
  // Get campaign with steps
  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (!campaign.steps || campaign.steps.length === 0) throw new Error('Campaign has no steps');
  if (campaign.contact_ids.length === 0) throw new Error('Campaign has no contacts');

  // Pre-compute scheduled_at for each action
  const queueItems: any[] = [];

  for (const contactId of campaign.contact_ids) {
    let currentTime = new Date(campaign.start_date + 'T' + campaign.working_hours_start);

    for (const step of campaign.steps) {
      // Add random jitter within working hours
      const jitterMs = Math.random() * step.delay_jitter_hours * 60 * 60 * 1000;
      const scheduledAt = new Date(currentTime.getTime() + jitterMs);

      queueItems.push({
        campaign_id: campaignId,
        campaign_step_id: step.id,
        linkedin_account_id: campaign.linkedin_account_id,
        contact_id: contactId,
        action_type: step.action_type,
        message_content:
          step.action_type === 'send_connection'
            ? step.connection_note || null
            : step.action_type === 'send_message'
            ? step.message_body || null
            : null,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
      });

      // Advance time by delay + jitter for next step
      currentTime = new Date(
        currentTime.getTime() + step.delay_after_hours * 60 * 60 * 1000
      );
    }
  }

  // Bulk insert queue items
  if (queueItems.length > 0) {
    // Insert in batches of 100 to avoid payload limits
    for (let i = 0; i < queueItems.length; i += 100) {
      const batch = queueItems.slice(i, i + 100);
      const { error } = await getClient().from('linkedin_action_queue').insert(batch);
      if (error) throw error;
    }
  }

  // Mark campaign as active
  const { error } = await getClient()
    .from('linkedin_campaigns')
    .update({
      status: 'active',
      launched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  if (error) throw error;
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  if (error) throw error;
}

export async function resumeCampaign(campaignId: string): Promise<void> {
  const { error } = await getClient()
    .from('linkedin_campaigns')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  if (error) throw error;
}

// ==============================================================================
// ACTION QUEUE
// ==============================================================================

export async function getCampaignQueue(campaignId: string): Promise<LinkedInActionQueueItem[]> {
  const { data, error } = await getClient()
    .from('linkedin_action_queue')
    .select(`
      *,
      contact:contacts (name, linkedin_url)
    `)
    .eq('campaign_id', campaignId)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return (data || []) as LinkedInActionQueueItem[];
}

// ==============================================================================
// ANALYTICS
// ==============================================================================

export async function getLinkedInAnalytics(): Promise<{
  totalCampaigns: number;
  activeCampaigns: number;
  totalActionsCompleted: number;
  totalConnectionsSent: number;
  totalMessagesSent: number;
  totalReplies: number;
  recentQueue: LinkedInActionQueueItem[];
}> {
  const client = getClient();
  const [campaignsRes, queueRes] = await Promise.all([
    client.from('linkedin_campaigns').select('status, actions_completed, connections_accepted, replies_received'),
    client
      .from('linkedin_action_queue')
      .select('*, contact:contacts(name)')
      .in('status', ['completed', 'failed', 'pending'])
      .order('updated_at', { ascending: false })
      .limit(20),
  ]);

  const campaigns = campaignsRes.data || [];
  const queue = queueRes.data || [];

  return {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter((c: any) => c.status === 'active').length,
    totalActionsCompleted: campaigns.reduce((acc: number, c: any) => acc + (c.actions_completed || 0), 0),
    totalConnectionsSent: campaigns.reduce((acc: number, c: any) => acc + (c.connections_accepted || 0), 0),
    totalMessagesSent: 0, // from queue later
    totalReplies: campaigns.reduce((acc: number, c: any) => acc + (c.replies_received || 0), 0),
    recentQueue: queue as LinkedInActionQueueItem[],
  };
}
