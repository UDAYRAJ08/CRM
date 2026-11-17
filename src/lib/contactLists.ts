import { supabase, getLocal, setLocal, notifyCRMEvent, fetchAllPages } from './supabase';
import type {
  ActivityAction,
  ActivityCursor,
  ActivityFeedItem,
  ActivityLog,
  Contact,
  ContactList,
  EmailRecord,
  Interaction,
  ListProgressRow,
} from '../types/crm';

// Contact lists, assignment and the activity log. With Supabase every write goes
// through the admin-checked SQL functions in supabase/contact_lists.sql; without
// it (local demo mode) the same rules run against localStorage.

type StoredList = Omit<ContactList, 'total' | 'unassigned'>;
type StoredMember = { list_id: string; contact_id: string; added_at: string };

const now = () => new Date().toISOString();

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function logLocal(entry: Partial<ActivityLog> & { action: ActivityAction }): void {
  const row: ActivityLog = {
    id: crypto.randomUUID(),
    actor_id: null,
    list_id: null,
    target_member_id: null,
    contact_id: null,
    contact_count: 0,
    contact_ids: [],
    details: {},
    created_at: now(),
    ...entry,
  };
  setLocal('activity_logs', [row, ...getLocal<ActivityLog[]>('activity_logs', [])]);
}

const localMembers = () => getLocal<StoredMember[]>('contact_list_members', []);
const localContacts = () => getLocal<Contact[]>('contacts', []);

export const listsDb = {
  async getLists(): Promise<ContactList[]> {
    if (supabase) return rpc<ContactList[]>('get_contact_lists', {});
    const owner = new Map(localContacts().map((c) => [c.id, c.owner_id ?? null]));
    const members = localMembers();
    return getLocal<StoredList[]>('contact_lists', []).map((l) => {
      const ids = members.filter((m) => m.list_id === l.id && owner.has(m.contact_id)).map((m) => m.contact_id);
      return { ...l, total: ids.length, unassigned: ids.filter((id) => !owner.get(id)).length };
    });
  },

  async createList(
    name: string,
    contactIds: string[],
    opts: { importLogId?: string | null; description?: string; actorId?: string } = {}
  ): Promise<string> {
    if (!name.trim()) throw new Error('List name is required');
    if (supabase) {
      const id = await rpc<string>('create_contact_list', {
        p_name: name,
        p_contact_ids: contactIds,
        p_import_log_id: opts.importLogId ?? null,
        p_description: opts.description ?? null,
      });
      notifyCRMEvent('crm_contacts_updated');
      return id;
    }
    const list: StoredList = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: opts.description ?? null,
      created_by: opts.actorId ?? null,
      import_log_id: opts.importLogId ?? null,
      archived: false,
      created_at: now(),
    };
    setLocal('contact_lists', [list, ...getLocal<StoredList[]>('contact_lists', [])]);
    const added = addLocal(list.id, contactIds);
    logLocal({ action: 'list_created', actor_id: opts.actorId ?? null, list_id: list.id, contact_count: added.length, details: { name: list.name } });
    notifyCRMEvent('crm_contacts_updated');
    return list.id;
  },

  async addToList(listId: string, contactIds: string[], actorId?: string): Promise<number> {
    let n: number;
    if (supabase) {
      n = await rpc<number>('add_contacts_to_list', { p_list_id: listId, p_contact_ids: contactIds });
    } else {
      const added = addLocal(listId, contactIds);
      if (added.length) logLocal({ action: 'list_contacts_added', actor_id: actorId ?? null, list_id: listId, contact_count: added.length, contact_ids: added });
      n = added.length;
    }
    notifyCRMEvent('crm_contacts_updated');
    return n;
  },

  async removeFromList(listId: string, contactIds: string[], actorId?: string): Promise<number> {
    let n: number;
    if (supabase) {
      n = await rpc<number>('remove_contacts_from_list', { p_list_id: listId, p_contact_ids: contactIds });
    } else {
      const drop = new Set(contactIds);
      const all = localMembers();
      const removed = all.filter((m) => m.list_id === listId && drop.has(m.contact_id)).map((m) => m.contact_id);
      setLocal('contact_list_members', all.filter((m) => !(m.list_id === listId && drop.has(m.contact_id))));
      if (removed.length) logLocal({ action: 'list_contacts_removed', actor_id: actorId ?? null, list_id: listId, contact_count: removed.length, contact_ids: removed });
      n = removed.length;
    }
    notifyCRMEvent('crm_contacts_updated');
    return n;
  },

  // count: next N unassigned contacts of the list; contactIds: exactly these. memberId null = unassign.
  async assign(args: { listId: string | null; memberId: string | null; count?: number; contactIds?: string[]; actorId?: string }): Promise<number> {
    const { listId, memberId, count, contactIds, actorId } = args;
    if ((count === undefined) === (contactIds === undefined)) throw new Error('Pass either a count or contact ids');
    if (supabase) {
      const n = await rpc<number>('assign_list_contacts', {
        p_list_id: listId,
        p_member_id: memberId,
        p_count: count ?? null,
        p_contact_ids: contactIds ?? null,
      });
      notifyCRMEvent('crm_contacts_updated');
      return n;
    }

    const contacts = localContacts();
    const byId = new Map(contacts.map((c) => [c.id, c]));
    let ids: string[];
    if (count !== undefined) {
      if (!listId) throw new Error('A list is required to assign by count');
      ids = localMembers()
        .filter((m) => m.list_id === listId && byId.has(m.contact_id) && !byId.get(m.contact_id)!.owner_id)
        .slice(0, Math.max(count, 0))
        .map((m) => m.contact_id);
    } else {
      ids = contactIds!.filter((id) => byId.has(id));
    }
    if (ids.length === 0) return 0;

    const pick = new Set(ids);
    const previous = Object.fromEntries(ids.map((id) => [id, byId.get(id)!.owner_id ?? null]));
    setLocal('contacts', contacts.map((c) => (pick.has(c.id) ? { ...c, owner_id: memberId, updated_at: now() } : c)));
    logLocal({
      action: memberId ? 'assigned' : 'unassigned',
      actor_id: actorId ?? null,
      list_id: listId,
      target_member_id: memberId,
      contact_count: ids.length,
      contact_ids: ids,
      details: { previous_owners: previous },
    });
    notifyCRMEvent('crm_contacts_updated');
    return ids.length;
  },

  async getListContactIds(listId: string): Promise<string[]> {
    if (supabase) {
      const { data, error } = await fetchAllPages<{ contact_id: string }>((from, to) =>
        supabase!
          .from('contact_list_members')
          .select('contact_id')
          .eq('list_id', listId)
          .order('added_at')
          .order('contact_id')
          .range(from, to)
      );
      if (error) throw new Error(error.message);
      return (data || []).map((r) => r.contact_id);
    }
    return localMembers().filter((m) => m.list_id === listId).map((m) => m.contact_id);
  },

  async getListProgress(listId: string): Promise<ListProgressRow[]> {
    if (supabase) return rpc<ListProgressRow[]>('get_list_progress', { p_list_id: listId });
    // Local mode has no email/interaction timestamps worth tracking here: status counts only.
    const ids = new Set(await this.getListContactIds(listId));
    const rows = new Map<string | null, ListProgressRow>();
    for (const c of localContacts().filter((c) => ids.has(c.id))) {
      const key = c.owner_id ?? null;
      const row = rows.get(key) ?? { owner_id: key, total: 0, by_status: {}, touched: 0, last_activity: null };
      row.total += 1;
      row.by_status[c.status] = (row.by_status[c.status] ?? 0) + 1;
      rows.set(key, row);
    }
    return [...rows.values()];
  },

  async renameList(listId: string, name: string): Promise<void> {
    await updateList(listId, { name: name.trim() });
  },

  async archiveList(listId: string, archived: boolean): Promise<void> {
    await updateList(listId, { archived });
  },

  // Assignment logs + outbound emails + interactions, newest first, keyset-paged by (at, key).
  async getActivityFeed(f: FeedFilter): Promise<{ items: ActivityFeedItem[]; next: ActivityCursor | null }> {
    const size = f.pageSize ?? 50;
    const cursor = f.before ?? null;
    const batches = await Promise.all(feedSources(f).map((source) => source(cursor, size)));
    const items = batches
      .flat()
      .filter((i) => !cursor || isBefore(i, cursor))
      .sort(newestFirst)
      .slice(0, size);
    const last = items[items.length - 1];
    return { items, next: items.length === size ? { at: last.at, key: last.key } : null };
  },
};

export interface FeedFilter {
  memberId?: string;
  listId?: string;
  from?: string;
  to?: string;
  before?: ActivityCursor | null;
  pageSize?: number;
}

// Timestamps from one backend share a format, so string order is time order.
const isBefore = (i: ActivityFeedItem, c: ActivityCursor) => i.at < c.at || (i.at === c.at && i.key < c.key);
const newestFirst = (a: ActivityFeedItem, b: ActivityFeedItem) =>
  a.at === b.at ? (a.key < b.key ? 1 : a.key > b.key ? -1 : 0) : a.at < b.at ? 1 : -1;

const fromLog = (l: ActivityLog): ActivityFeedItem => ({
  key: `log:${l.id}`, kind: 'log', at: l.created_at, actorId: l.actor_id, contactId: l.contact_id, log: l,
});
const fromEmail = (e: EmailRecord): ActivityFeedItem => ({
  key: `email:${e.id}`, kind: 'email', at: e.sent_at || e.created_at || '', actorId: e.sent_by ?? null, contactId: e.contact_id ?? null, email: e,
});
const fromInteraction = (i: Interaction): ActivityFeedItem => ({
  key: `interaction:${i.id}`, kind: 'interaction', at: i.created_at, actorId: i.created_by ?? null, contactId: i.contact_id, interaction: i,
});

// A source returns its newest `limit` rows strictly before the cursor, plus every row AT the
// cursor time (ties), so the merged page can never skip a row.
type FeedSource = (cursor: ActivityCursor | null, limit: number) => Promise<ActivityFeedItem[]>;

function feedSources(f: FeedFilter): FeedSource[] {
  // The list view shows that list's assignment log only (spec: "filtered activity_logs").
  const withMessages = !f.listId;

  if (!supabase) {
    const inRange = (at: string) => (!f.from || at >= f.from) && (!f.to || at <= f.to);
    const local = (rows: ActivityFeedItem[]): FeedSource => async () => rows.filter((r) => inRange(r.at));
    const logs = getLocal<ActivityLog[]>('activity_logs', [])
      .filter((l) => !f.listId || l.list_id === f.listId)
      .filter((l) => !f.memberId || l.actor_id === f.memberId || l.target_member_id === f.memberId)
      .map(fromLog);
    if (!withMessages) return [local(logs)];
    const emails = getLocal<EmailRecord[]>('emails', [])
      .filter((e) => !e.is_inbound && e.status === 'sent')
      .filter((e) => !f.memberId || e.sent_by === f.memberId)
      .map(fromEmail);
    const interactions = getLocal<Interaction[]>('interactions', [])
      .filter((i) => !f.memberId || i.created_by === f.memberId)
      .map(fromInteraction);
    return [local(logs), local(emails), local(interactions)];
  }

  const remote =
    <T>(kind: ActivityFeedItem['kind'], table: string, columns: string, timeCol: string, map: (row: T) => ActivityFeedItem, narrow: (q: any) => any): FeedSource =>
    async (cursor, limit) => {
      const base = () => {
        let q = narrow(supabase!.from(table).select(columns));
        if (f.from) q = q.gte(timeCol, f.from);
        if (f.to) q = q.lte(timeCol, f.to);
        return q;
      };
      const older = cursor ? base().lt(timeCol, cursor.at) : base();
      const queries = [older.order(timeCol, { ascending: false }).order('id', { ascending: false }).limit(limit)];
      if (cursor) {
        // Ties at the cursor time, keyset-paged too (PostgREST caps a response at max-rows).
        // Keys are "<kind>:<id>": compare this source's kind with the cursor's first.
        const sep = cursor.key.indexOf(':');
        const cursorKind = cursor.key.slice(0, sep);
        if (kind <= cursorKind) {
          let tie = base().eq(timeCol, cursor.at);
          if (kind === cursorKind) tie = tie.lt('id', cursor.key.slice(sep + 1));
          queries.push(tie.order('id', { ascending: false }).limit(limit));
        }
      }
      const results = await Promise.all(queries);
      const rows: T[] = [];
      for (const { data, error } of results) {
        if (error) throw new Error(error.message);
        rows.push(...(data || []));
      }
      return rows.map(map);
    };

  const sources: FeedSource[] = [
    remote<ActivityLog>('log', 'activity_logs', '*', 'created_at', fromLog, (q) => {
      if (f.listId) q = q.eq('list_id', f.listId);
      if (f.memberId) q = q.or(`actor_id.eq.${f.memberId},target_member_id.eq.${f.memberId}`);
      return q;
    }),
  ];
  if (withMessages) {
    sources.push(
      remote<EmailRecord>('email', 'emails', 'id, contact_id, subject, sent_by, sent_at, status, is_inbound', 'sent_at', fromEmail, (q) => {
        q = q.eq('status', 'sent').or('is_inbound.is.null,is_inbound.eq.false');
        return f.memberId ? q.eq('sent_by', f.memberId) : q;
      }),
      remote<Interaction>('interaction', 'interactions', 'id, contact_id, type, content, created_by, created_at', 'created_at', fromInteraction, (q) =>
        f.memberId ? q.eq('created_by', f.memberId) : q
      )
    );
  }
  return sources;
}

function addLocal(listId: string, contactIds: string[]): string[] {
  const all = localMembers();
  const existing = new Set(all.filter((m) => m.list_id === listId).map((m) => m.contact_id));
  const known = new Set(localContacts().map((c) => c.id));
  const added = [...new Set(contactIds)].filter((id) => known.has(id) && !existing.has(id));
  const at = now();
  setLocal('contact_list_members', [...all, ...added.map((contact_id) => ({ list_id: listId, contact_id, added_at: at }))]);
  return added;
}

async function updateList(listId: string, patch: Partial<StoredList>): Promise<void> {
  if (supabase) {
    // RLS limits writes on contact_lists to admins, and a blocked update returns no error, only no rows.
    const { data, error } = await supabase.from('contact_lists').update(patch).eq('id', listId).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Only admins can manage contact lists');
  } else {
    setLocal('contact_lists', getLocal<StoredList[]>('contact_lists', []).map((l) => (l.id === listId ? { ...l, ...patch } : l)));
  }
  notifyCRMEvent('crm_contacts_updated');
}
