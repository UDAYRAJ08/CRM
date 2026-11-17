import { supabase, getLocal, setLocal, notifyCRMEvent, fetchAllPages } from './supabase';
import type { ActivityAction, ActivityLog, Contact, ContactList, ListProgressRow } from '../types/crm';

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
};

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
    // RLS limits writes on contact_lists to admins.
    const { error } = await supabase.from('contact_lists').update(patch).eq('id', listId);
    if (error) throw new Error(error.message);
  } else {
    setLocal('contact_lists', getLocal<StoredList[]>('contact_lists', []).map((l) => (l.id === listId ? { ...l, ...patch } : l)));
  }
  notifyCRMEvent('crm_contacts_updated');
}
