// Runs due LinkedIn campaign actions (linkedin_action_queue) from this browser via the
// LinkedIn Connector extension. LinkedIn revokes li_at when a server uses the session,
// so there is no server-side runner.
// shortcut: actions only run while a CRM tab is open with the extension linked; overdue ones run on next open.

import { supabase } from './supabase';
import { getMyLinkedInAccount } from './linkedinService';
import {
  ExtensionBridgeError,
  extensionSendInvite,
  extensionSendMessage,
  extensionViewProfile,
  pingExtension,
} from './linkedinExtensionBridge';
import type { LinkedInActionType } from '../types/linkedin';

const COUNTERS: Record<LinkedInActionType, { used: string; limit: string }> = {
  view_profile: { used: 'profile_views_today', limit: 'daily_view_limit' },
  send_connection: { used: 'connections_sent_today', limit: 'daily_connection_limit' },
  send_message: { used: 'messages_sent_today', limit: 'daily_message_limit' },
};

/** LinkedIn vanity name from a contact's linkedin_url column or any custom field holding a profile URL. */
export function contactVanity(contact: { linkedin_url?: string | null; custom_fields?: Record<string, unknown> | null } | null): string | null {
  const candidates = [contact?.linkedin_url, ...Object.values(contact?.custom_fields || {})];
  for (const value of candidates) {
    const m = String(value || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

/** Tomorrow 9:00–9:59 local time. */
function nextMorning(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

export interface QueueRunResult {
  processed: boolean;
  ok?: boolean;
  message?: string;
}

/** Execute at most one due action for this team member's LinkedIn account. */
export async function runNextLinkedInAction(teamMemberId: string): Promise<QueueRunResult> {
  if (!supabase) return { processed: false };
  const client = supabase;

  const account = await getMyLinkedInAccount(teamMemberId);
  if (!account || account.status !== 'active') return { processed: false };

  const ext = await pingExtension();
  if (!ext.installed || !ext.loggedIn) return { processed: false };

  const now = new Date().toISOString();
  const { data: due, error } = await client
    .from('linkedin_action_queue')
    .select(
      'id, campaign_id, action_type, message_content, retry_count, ' +
        'contacts(name, linkedin_url, custom_fields), ' +
        'linkedin_campaigns!inner(status, actions_completed, actions_failed)'
    )
    .eq('linkedin_account_id', account.id)
    .eq('status', 'pending')
    .eq('linkedin_campaigns.status', 'active')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  const action: any = due?.[0];
  if (!action) return { processed: false };

  const type = action.action_type as LinkedInActionType;
  const counter = COUNTERS[type];
  const used = Number((account as any)[counter.used] || 0);
  if (used >= Number((account as any)[counter.limit] || 0)) {
    await client.from('linkedin_action_queue').update({ scheduled_at: nextMorning(), updated_at: now }).eq('id', action.id);
    return { processed: false, message: 'Daily LinkedIn limit reached; action moved to tomorrow.' };
  }

  // Claim: only one tab or browser wins the pending -> processing switch.
  const { data: claimed, error: claimErr } = await client
    .from('linkedin_action_queue')
    .update({ status: 'processing', updated_at: now })
    .eq('id', action.id)
    .eq('status', 'pending')
    .select('id');
  if (claimErr) throw claimErr;
  if (!claimed?.length) return { processed: false };

  const finish = (fields: Record<string, unknown>) =>
    client
      .from('linkedin_action_queue')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', action.id);

  const contact = Array.isArray(action.contacts) ? action.contacts[0] : action.contacts;
  const vanity = contactVanity(contact);
  if (!vanity) {
    await finish({ status: 'skipped', error_message: 'No LinkedIn profile URL on contact' });
    return { processed: true, ok: false, message: `Skipped ${contact?.name || 'contact'}: no LinkedIn profile URL.` };
  }

  let failure: string | null = null;
  try {
    if (type === 'view_profile') await extensionViewProfile(vanity);
    else if (type === 'send_connection') await extensionSendInvite(vanity, action.message_content || '');
    else if (type === 'send_message') await extensionSendMessage(vanity, action.message_content || '');
    else failure = `Unknown action type: ${type}`;
  } catch (err) {
    const code = err instanceof ExtensionBridgeError ? err.code : null;
    // Not the action's fault: put it back so it runs later instead of burning it.
    if (code === 'DAILY_LIMIT') {
      await finish({ status: 'pending', scheduled_at: nextMorning() });
      return { processed: false, message: 'Daily LinkedIn invite limit reached; action moved to tomorrow.' };
    }
    if (code === 'EXTENSION_NOT_DETECTED' || code === 'NOT_LOGGED_IN' || code === 'NO_CSRF_TOKEN' || code === 'ORIGIN_NOT_LINKED') {
      await finish({ status: 'pending' });
      return { processed: false, message: (err as Error).message };
    }
    const details = err instanceof ExtensionBridgeError && err.details ? ` ${err.details}` : '';
    failure = `${(err as Error)?.message || 'LinkedIn action failed'}${details}`;
  }

  await finish({
    status: failure ? 'failed' : 'completed',
    executed_at: new Date().toISOString(),
    error_message: failure,
    retry_count: failure ? (action.retry_count || 0) + 1 : action.retry_count || 0,
  });

  const campaign = Array.isArray(action.linkedin_campaigns) ? action.linkedin_campaigns[0] : action.linkedin_campaigns;
  const statField = failure ? 'actions_failed' : 'actions_completed';
  // Stats and counters are best-effort: the queue row above is the record of truth.
  await client
    .from('linkedin_campaigns')
    .update({ [statField]: Number(campaign?.[statField] || 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', action.campaign_id);
  if (!failure) {
    await client
      .from('linkedin_accounts')
      .update({ [counter.used]: used + 1, last_action_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', account.id);
  }

  const who = contact?.name || vanity;
  return failure
    ? { processed: true, ok: false, message: `LinkedIn ${type.replace('_', ' ')} for ${who} failed: ${failure}` }
    : { processed: true, ok: true, message: `LinkedIn ${type.replace('_', ' ')} done for ${who}.` };
}
