import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { History, RefreshCw } from 'lucide-react';
import { listsDb } from '../../lib/contactLists';
import { getInitials } from '../../lib/utils';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import type { ActivityCursor, ActivityFeedItem, Contact, ContactList, ContactStatus } from '../../types/crm';
import { STATUS_CONFIG } from '../contacts/ContactList';
import { Button } from '../ui/Button';

interface ActivityLogViewProps {
  /** When set, shows only this list's assignment log and hides the list filter. */
  listId?: string;
  contacts: Contact[];
  onSelectContact?: (c: Contact) => void;
}

const PAGE = 50;
const statusLabel = (s?: string) => STATUS_CONFIG[s as ContactStatus]?.label ?? s ?? '—';

export const ActivityLogView: React.FC<ActivityLogViewProps> = ({ listId, contacts, onSelectContact }) => {
  const { teamMembers } = useTeam();
  const { error } = useToast();
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [next, setNext] = useState<ActivityCursor | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [memberId, setMemberId] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const listName = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists]);
  const member = (id?: string | null) => (id ? teamMembers.find((m) => m.id === id)?.name || 'Former member' : null);

  const filter = useMemo(
    () => ({
      memberId: memberId || undefined,
      listId: listId || listFilter || undefined,
      // Date inputs are local days; widen "to" to the end of that day.
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    }),
    [memberId, listId, listFilter, from, to]
  );

  const load = useCallback(
    async (before: ActivityCursor | null) => {
      setIsLoading(true);
      try {
        const page = await listsDb.getActivityFeed({ ...filter, before, pageSize: PAGE });
        setItems((prev) => (before ? [...prev, ...page.items] : page.items));
        setNext(page.next);
      } catch (e: any) {
        error('Could not load activity', e.message);
      } finally {
        setIsLoading(false);
      }
    },
    [filter, error]
  );

  useEffect(() => {
    load(null);
  }, [load]);

  useEffect(() => {
    listsDb.getLists().then(setLists).catch(() => setLists([]));
  }, []);

  const contactLink = (id: string | null) => {
    const c = id ? contactById.get(id) : undefined;
    if (!c) return <span className="font-medium">a contact</span>;
    return (
      <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => onSelectContact?.(c)}>
        {c.name}
      </button>
    );
  };

  const describe = (i: ActivityFeedItem): React.ReactNode => {
    const actor = member(i.actorId) ?? 'System / Claude connector';
    if (i.kind === 'email') {
      return (
        <>
          <b>{actor}</b> emailed {contactLink(i.contactId)}: <span className="text-slate-600">{i.email?.subject}</span>
        </>
      );
    }
    if (i.kind === 'interaction') {
      return (
        <>
          <b>{actor}</b> logged a {i.interaction?.type} on {contactLink(i.contactId)}
        </>
      );
    }
    const l = i.log!;
    const list = l.list_id ? listName.get(l.list_id) || 'a list' : null;
    const n = `${l.contact_count} contact${l.contact_count === 1 ? '' : 's'}`;
    switch (l.action) {
      case 'list_created':
        return <><b>{actor}</b> created list <b>{list}</b> with {n}</>;
      case 'assigned':
        return <><b>{actor}</b> assigned {n}{list ? <> from <b>{list}</b></> : null} to <b>{member(l.target_member_id)}</b></>;
      case 'unassigned':
        return <><b>{actor}</b> unassigned {n}{list ? <> in <b>{list}</b></> : null}</>;
      case 'list_contacts_added':
        return <><b>{actor}</b> added {n} to <b>{list}</b></>;
      case 'list_contacts_removed':
        return <><b>{actor}</b> removed {n} from <b>{list}</b></>;
      case 'owner_changed':
        return (
          <>
            <b>{actor}</b> changed owner of {contactLink(l.contact_id)} from {member(l.details?.from) ?? 'nobody'} to{' '}
            <b>{member(l.details?.to) ?? 'nobody'}</b>
          </>
        );
      case 'status_changed':
        return (
          <>
            <b>{actor}</b> changed status of {contactLink(l.contact_id)} from {statusLabel(l.details?.from)} to{' '}
            <b>{statusLabel(l.details?.to)}</b>
          </>
        );
      default:
        return <><b>{actor}</b> {String(l.action)}</>;
    }
  };

  const inputCls =
    'bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="space-y-4">
      {!listId && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Activity</h1>
          <p className="text-sm text-slate-500 mt-1">Who assigned, emailed, called or changed what.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Filter by team member" className={inputCls}>
          <option value="">Everyone</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {!listId && (
          <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} aria-label="Filter by list" className={inputCls}>
            <option value="">All activity</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                List: {l.name}
              </option>
            ))}
          </select>
        )}
        <label className="text-xs text-slate-500 flex items-center gap-1">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-slate-500 flex items-center gap-1">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <button
          onClick={() => load(null)}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          title="Refresh activity"
          aria-label="Refresh activity"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {items.length === 0 && (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <History className="w-6 h-6" />
            </div>
            <p className="text-sm text-slate-600">{isLoading ? 'Loading activity…' : 'No activity matches these filters.'}</p>
          </div>
        )}
        {items.map((i) => {
          const name = member(i.actorId);
          return (
            <div key={i.key} className="flex items-start gap-3 p-3.5 text-sm text-slate-800">
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                {name ? getInitials(name) : 'S'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="break-words">{describe(i)}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {i.at ? formatDistanceToNow(new Date(i.at), { addSuffix: true }) : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {next && (
        <div className="text-center">
          <Button size="sm" variant="ghost" isLoading={isLoading} onClick={() => load(next)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};
