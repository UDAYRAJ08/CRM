/// <reference types="node" />
import type { SupabaseClient } from '@supabase/supabase-js';

// CRM tools exposed to Claude over MCP. Each tool runs as the signed-in team member.

export const DEFAULT_DAILY_LIMIT = 25;

export class ToolError extends Error {}

export interface ToolContext {
  db: SupabaseClient;
  memberId: string;
}

type Args = Record<string, unknown>;

// Lower-cased profile slug from any linkedin.com/in/<slug> URL; null when it is not a profile URL.
export function linkedinVanity(url: unknown): string | null {
  const m = String(url ?? '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch { /* keep raw slug */ }
  return slug.toLowerCase();
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

function text(args: Args, key: string, max: number, required = false): string | null {
  const v = args[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolError(`"${key}" is required.`);
    return null;
  }
  if (typeof v !== 'string') throw new ToolError(`"${key}" must be a string.`);
  const s = v.trim();
  if (required && !s) throw new ToolError(`"${key}" is required.`);
  return s.slice(0, max) || null;
}

function requireVanity(args: Args): string {
  const vanity = linkedinVanity(args.linkedin_url);
  if (!vanity) throw new ToolError('"linkedin_url" must be a LinkedIn profile URL like https://www.linkedin.com/in/jane-doe.');
  return vanity;
}

function check<T>(r: { data: T; error: any }): T {
  if (r.error) throw new Error(r.error.message || 'Database error');
  return r.data;
}

async function usage(ctx: ToolContext) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0); // matches the LinkedIn daily counters, which reset at midnight UTC
  const [countRes, acctRes] = await Promise.all([
    ctx.db.from('linkedin_invites').select('id', { count: 'exact', head: true })
      .eq('sent_by', ctx.memberId).gte('sent_at', since.toISOString()),
    ctx.db.from('linkedin_accounts').select('daily_connection_limit')
      .eq('team_member_id', ctx.memberId).eq('status', 'active').limit(1).maybeSingle(),
  ]);
  if (countRes.error) throw new Error(countRes.error.message);
  const limit = Number((acctRes.data as any)?.daily_connection_limit) || DEFAULT_DAILY_LIMIT;
  const sent = countRes.count ?? 0;
  return { sent_today: sent, daily_limit: limit, remaining_today: Math.max(0, limit - sent) };
}

const INVITE_FIELDS = 'id, contact_id, linkedin_url, name, headline, company, note, status, sent_at, accepted_at, sender:team_members(name)';

function shapeInvite(row: any) {
  if (!row) return null;
  const { sender, status, ...rest } = row;
  return { ...rest, status: status === 'accepted' ? 'accepted' : 'not_accepted', sent_by: sender?.name ?? null };
}

async function findInvite(ctx: ToolContext, vanity: string) {
  return check(await ctx.db.from('linkedin_invites').select(INVITE_FIELDS).eq('linkedin_vanity', vanity).maybeSingle()) as any;
}

// shortcut: matches contacts.linkedin_url only, not LinkedIn links stored in custom_fields; widen if imports put them there.
async function findContact(ctx: ToolContext, vanity: string) {
  const rows = check(await ctx.db.from('contacts').select('id, name, status, linkedin_url')
    .ilike('linkedin_url', `%linkedin.com/in/${escapeLike(vanity)}%`).limit(10)) as any[];
  return rows?.find((c) => linkedinVanity(c.linkedin_url) === vanity) ?? null;
}

async function findOrCreateCompany(ctx: ToolContext, name: string): Promise<string | null> {
  const found = check(await ctx.db.from('companies').select('id').ilike('name', escapeLike(name)).limit(1)) as any[];
  if (found?.[0]) return found[0].id;
  const { data, error } = await ctx.db.from('companies').insert({ name }).select('id').single();
  return error ? null : (data as any).id; // a missing company never blocks recording the invite
}

async function checkInvite(ctx: ToolContext, args: Args) {
  const vanity = requireVanity(args);
  const [invite, contact, quota] = await Promise.all([findInvite(ctx, vanity), findContact(ctx, vanity), usage(ctx)]);
  return {
    already_invited: Boolean(invite),
    invite: shapeInvite(invite),
    existing_contact: contact ? { id: contact.id, name: contact.name, status: contact.status } : null,
    ...quota,
    allowed: !invite && quota.remaining_today > 0,
  };
}

async function recordInvite(ctx: ToolContext, args: Args) {
  const vanity = requireVanity(args);
  const name = text(args, 'name', 200, true)!;
  const headline = text(args, 'headline', 300);
  const company = text(args, 'company', 200);
  const note = text(args, 'note', 1000);
  const linkedinUrl = `https://www.linkedin.com/in/${encodeURIComponent(vanity)}`;

  const existing = await findInvite(ctx, vanity);
  if (existing) return { recorded: false, already_invited: true, invite: shapeInvite(existing), ...(await usage(ctx)) };

  // Recording never fails on the daily limit: the invite already happened, so losing it is worse.
  let contact = await findContact(ctx, vanity);
  let createdContact = false;
  if (!contact) {
    const companyId = company ? await findOrCreateCompany(ctx, company) : null;
    contact = check(await ctx.db.from('contacts').insert({
      name,
      title: headline,
      company_id: companyId,
      linkedin_url: linkedinUrl,
      owner_id: ctx.memberId,
      status: 'contacted',
      tags: ['linkedin', 'claude'],
    }).select('id, name, status').single());
    createdContact = true;
  }

  const ins = await ctx.db.from('linkedin_invites').insert({
    contact_id: contact.id,
    linkedin_vanity: vanity,
    linkedin_url: linkedinUrl,
    name,
    headline,
    company,
    note,
    sent_by: ctx.memberId,
  }).select(INVITE_FIELDS).single();
  if (ins.error?.code === '23505') {
    // Another chat recorded the same person a moment ago.
    return { recorded: false, already_invited: true, invite: shapeInvite(await findInvite(ctx, vanity)), ...(await usage(ctx)) };
  }
  const invite = check(ins);

  const logged = await ctx.db.from('interactions').insert({
    contact_id: contact.id,
    type: 'linkedin',
    content: note ? `LinkedIn invite sent via Claude with note: "${note}"` : 'LinkedIn invite sent via Claude (no note).',
    created_by: ctx.memberId,
  });
  // The invite is already recorded, so a failed activity log must not fail the tool.
  if (logged.error) console.error('mcp interactions insert failed:', logged.error);

  return { recorded: true, invite: shapeInvite(invite), contact_id: contact.id, created_contact: createdContact, ...(await usage(ctx)) };
}

async function updateStatus(ctx: ToolContext, args: Args) {
  const vanity = requireVanity(args);
  if (args.status !== 'accepted' && args.status !== 'not_accepted') throw new ToolError('"status" must be "accepted" or "not_accepted".');
  const accepted = args.status === 'accepted';
  const invite = await findInvite(ctx, vanity);
  if (!invite) throw new ToolError('No invite has been recorded for this profile. Use record_linkedin_invite first.');
  if ((invite.status === 'accepted') === accepted) return { changed: false, invite: shapeInvite(invite) };

  const updated = check(await ctx.db.from('linkedin_invites')
    .update({ status: accepted ? 'accepted' : 'pending', accepted_at: accepted ? new Date().toISOString() : null })
    .eq('id', invite.id).select(INVITE_FIELDS).single());
  if (accepted && invite.contact_id) {
    const logged = await ctx.db.from('interactions').insert({
      contact_id: invite.contact_id, type: 'linkedin', content: 'LinkedIn invite accepted.', created_by: ctx.memberId,
    });
    if (logged.error) console.error('mcp interactions insert failed:', logged.error);
  }
  return { changed: true, invite: shapeInvite(updated) };
}

// Saves one LinkedIn message on the contact's timeline. The same text is saved once, so Claude can re-check a chat safely.
async function logLinkedInMessage(ctx: ToolContext, args: Args, prefix: string, createdAt?: string) {
  const vanity = requireVanity(args);
  const message = text(args, 'message', 5000, true)!;
  const contact = await findContact(ctx, vanity);
  if (!contact) throw new ToolError('This person is not in the CRM. Record them with record_linkedin_invite first.');
  const content = `${prefix}: "${message}"`;

  const dup = check(await ctx.db.from('interactions').select('id')
    .eq('contact_id', contact.id).eq('type', 'linkedin').eq('content', content).limit(1)) as any[];
  if (dup?.length) return { contact, recorded: false, already_recorded: true };

  check(await ctx.db.from('interactions').insert({
    contact_id: contact.id, type: 'linkedin', content, created_by: ctx.memberId, ...(createdAt ? { created_at: createdAt } : {}),
  }));
  return { contact, recorded: true };
}

async function recordMessage(ctx: ToolContext, args: Args) {
  const { contact, ...result } = await logLinkedInMessage(ctx, args, 'LinkedIn message sent');
  return { ...result, contact_id: contact.id };
}

async function recordReply(ctx: ToolContext, args: Args) {
  const at = text(args, 'received_at', 40);
  const receivedAt = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : undefined;
  const { contact, ...result } = await logLinkedInMessage(ctx, args, 'LinkedIn reply received', receivedAt);

  // A reply means they engaged: move early-stage contacts to "Replied & Qualified", same as an email reply.
  let status = contact.status;
  if (['new', 'contacted', 'connected'].includes(status)) {
    check(await ctx.db.from('contacts').update({ status: 'qualified', updated_at: new Date().toISOString() }).eq('id', contact.id));
    status = 'qualified';
  }
  return { ...result, contact_id: contact.id, contact_status: status };
}

async function listInvites(ctx: ToolContext, args: Args) {
  const status = args.status ?? 'all';
  if (!['all', 'accepted', 'not_accepted'].includes(status as string)) throw new ToolError('"status" must be "all", "accepted" or "not_accepted".');
  const limit = Math.min(200, Math.max(1, Math.floor(Number(args.limit) || 50)));
  let q = ctx.db.from('linkedin_invites').select(INVITE_FIELDS).order('sent_at', { ascending: false }).limit(limit);
  if (status !== 'all') q = q.eq('status', status === 'accepted' ? 'accepted' : 'pending');
  const rows = check(await q) as any[];
  return { count: rows.length, invites: rows.map(shapeInvite) };
}

async function searchContacts(ctx: ToolContext, args: Args) {
  // Strip characters that carry meaning in a PostgREST or() filter or a LIKE pattern.
  const query = (text(args, 'query', 100, true) || '').replace(/[,()*%_\\:"]/g, ' ').trim();
  if (query.length < 2) throw new ToolError('"query" needs at least 2 letters.');
  const rows = check(await ctx.db.from('contacts')
    .select('id, name, email, title, status, linkedin_url, company:companies(name)')
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .order('name').limit(20)) as any[];
  return { count: rows.length, contacts: rows.map(({ company, ...c }) => ({ ...c, company: company?.name ?? null })) };
}

const linkedinUrlProp = { type: 'string', description: 'LinkedIn profile URL, e.g. https://www.linkedin.com/in/jane-doe' };

export const TOOLS = [
  {
    name: 'check_linkedin_invite',
    description: 'Call BEFORE sending a LinkedIn connection request. Says whether this person was already invited by anyone on the team and how many invites are left today. Only send when "allowed" is true.',
    inputSchema: { type: 'object', properties: { linkedin_url: linkedinUrlProp }, required: ['linkedin_url'] },
    annotations: { readOnlyHint: true },
    run: checkInvite,
  },
  {
    name: 'record_linkedin_invite',
    description: 'Call right AFTER a LinkedIn connection request was sent. Saves the person in the CRM (creates or links the contact), logs it on their timeline and returns the remaining daily quota.',
    inputSchema: {
      type: 'object',
      properties: {
        linkedin_url: linkedinUrlProp,
        name: { type: 'string', description: 'Full name as shown on LinkedIn' },
        headline: { type: 'string', description: 'LinkedIn headline / job title' },
        company: { type: 'string', description: 'Current company' },
        note: { type: 'string', description: 'The note sent with the invite, if any' },
      },
      required: ['linkedin_url', 'name'],
    },
    run: recordInvite,
  },
  {
    name: 'update_linkedin_invite_status',
    description: 'Mark a recorded invite as accepted or not accepted, e.g. after checking LinkedIn "Sent invitations" or "My Network".',
    inputSchema: {
      type: 'object',
      properties: { linkedin_url: linkedinUrlProp, status: { type: 'string', enum: ['accepted', 'not_accepted'] } },
      required: ['linkedin_url', 'status'],
    },
    run: updateStatus,
  },
  {
    name: 'record_linkedin_message',
    description: 'Call right AFTER sending a LinkedIn message to someone in the CRM. Saves the message on their timeline. Saving the same text twice is ignored.',
    inputSchema: {
      type: 'object',
      properties: {
        linkedin_url: linkedinUrlProp,
        message: { type: 'string', description: 'The exact message that was sent' },
      },
      required: ['linkedin_url', 'message'],
    },
    run: recordMessage,
  },
  {
    name: 'record_linkedin_reply',
    description: 'Save a reply someone sent you on LinkedIn, e.g. while checking LinkedIn messages. Logs it on their timeline and moves a new, contacted or connected contact to "Replied & Qualified". Saving the same reply twice is ignored.',
    inputSchema: {
      type: 'object',
      properties: {
        linkedin_url: linkedinUrlProp,
        message: { type: 'string', description: 'The reply text, exactly as written' },
        received_at: { type: 'string', description: 'When the reply was sent, ISO 8601 (optional)' },
      },
      required: ['linkedin_url', 'message'],
    },
    run: recordReply,
  },
  {
    name: 'list_linkedin_invites',
    description: 'List LinkedIn invites recorded in the CRM, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'accepted', 'not_accepted'], default: 'all' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
    },
    annotations: { readOnlyHint: true },
    run: listInvites,
  },
  {
    name: 'search_contacts',
    description: 'Search CRM contacts by name or email.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    annotations: { readOnlyHint: true },
    run: searchContacts,
  },
] as const;
