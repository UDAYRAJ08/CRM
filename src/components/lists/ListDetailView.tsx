import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArchiveRestore, ArrowLeft, Pencil, UserPlus } from 'lucide-react';
import { listsDb } from '../../lib/contactLists';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import type { Contact, ContactList, ContactStatus, ListProgressRow } from '../../types/crm';
import { STATUS_CONFIG } from '../contacts/ContactList';
import { Button } from '../ui/Button';
import { AssignMemberSelect } from './AssignMemberSelect';
import { ActivityLogView } from './ActivityLogView';

interface ListDetailViewProps {
  listId: string;
  contacts: Contact[];
  onBack: () => void;
  onSelectContact: (c: Contact) => void;
  onRefresh: () => void;
}

const PAGE = 100;
const STATUSES = Object.keys(STATUS_CONFIG) as ContactStatus[];

export const ListDetailView: React.FC<ListDetailViewProps> = ({ listId, contacts, onBack, onSelectContact, onRefresh }) => {
  const { teamMembers, activeMember } = useTeam();
  const { success, error, info } = useToast();
  const { isAdmin } = usePermissions();

  const [list, setList] = useState<ContactList | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<ListProgressRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'people' | 'contacts' | 'activity'>('people');

  const [assignCount, setAssignCount] = useState(100);
  const [assignTo, setAssignTo] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const [ownerFilter, setOwnerFilter] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [lists, ids, prog] = await Promise.all([
        listsDb.getLists(),
        listsDb.getListContactIds(listId),
        listsDb.getListProgress(listId),
      ]);
      setList(lists.find((l) => l.id === listId) ?? null);
      setMemberIds(ids);
      setProgress(prog);
    } catch (e: any) {
      error('Could not load list', e.message);
    } finally {
      setLoaded(true);
    }
  }, [listId, error]);

  // Reload when contacts change (assignments elsewhere, refreshes).
  useEffect(() => {
    load();
  }, [load, contacts]);

  const memberName = (id?: string | null) => (id ? teamMembers.find((m) => m.id === id)?.name || 'Former member' : 'Unassigned');

  const listContacts = useMemo(() => {
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return memberIds.map((id) => byId.get(id)).filter((c): c is Contact => !!c);
  }, [contacts, memberIds]);

  const filtered = useMemo(
    () =>
      listContacts.filter((c) =>
        ownerFilter === 'all' ? true : ownerFilter === 'unassigned' ? !c.owner_id : c.owner_id === ownerFilter
      ),
    [listContacts, ownerFilter]
  );

  const afterChange = () => {
    setSelected(new Set());
    onRefresh();
    load();
  };

  const handleAssign = async () => {
    if (!assignTo || assignCount < 1) return;
    setIsAssigning(true);
    try {
      const n = await listsDb.assign({ listId, memberId: assignTo, count: assignCount, actorId: activeMember?.id });
      const who = memberName(assignTo);
      if (n === 0) info('Nothing to assign', 'Every contact in this list already has an owner.');
      else if (n < assignCount) success('Contacts Assigned', `Assigned ${n} to ${who} (no more unassigned).`);
      else success('Contacts Assigned', `Assigned ${n} to ${who}.`);
      afterChange();
    } catch (e: any) {
      error('Assign Failed', e.message);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleReassign = async (memberId: string | null) => {
    try {
      const n = await listsDb.assign({ listId, memberId, contactIds: [...selected], actorId: activeMember?.id });
      success('Contacts Assigned', `Assigned ${n} contacts to ${memberName(memberId)}.`);
      afterChange();
    } catch (e: any) {
      error('Assign Failed', e.message);
    }
  };

  const handleRemove = async () => {
    try {
      const n = await listsDb.removeFromList(listId, [...selected], activeMember?.id);
      success('Removed from list', `Removed ${n} contacts. The contacts themselves are not deleted.`);
      afterChange();
    } catch (e: any) {
      error('Remove Failed', e.message);
    }
  };

  const handleRename = async () => {
    if (!list) return;
    const name = window.prompt('Rename list', list.name)?.trim();
    if (!name || name === list.name) return;
    try {
      await listsDb.renameList(listId, name);
      load();
    } catch (e: any) {
      error('Rename Failed', e.message);
    }
  };

  const handleArchive = async () => {
    if (!list) return;
    try {
      await listsDb.archiveList(listId, !list.archived);
      success(list.archived ? 'List restored' : 'List archived', list.name);
      load();
    } catch (e: any) {
      error('Archive Failed', e.message);
    }
  };

  if (loaded && !list) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> All lists
        </button>
        <p className="text-sm text-slate-600">This list does not exist or was removed.</p>
      </div>
    );
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const page = filtered.slice(0, shown);
  const allOnPageSelected = page.length > 0 && page.every((c) => selected.has(c.id));

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> All lists
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            {list?.name ?? '…'}
            {list?.archived && <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Archived</span>}
          </h1>
          {list && (
            <p className="text-sm text-slate-500 mt-1">
              {list.total} contacts · {list.unassigned} unassigned · created {formatDistanceToNow(new Date(list.created_at), { addSuffix: true })}
            </p>
          )}
        </div>
        {isAdmin && list && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={handleRename}>
              Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={list.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              onClick={handleArchive}
            >
              {list.archived ? 'Restore' : 'Archive'}
            </Button>
          </div>
        )}
      </div>

      {isAdmin && list && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-2 text-sm">
          <UserPlus className="w-4 h-4 text-indigo-600" />
          <span className="text-slate-700">Assign</span>
          <input
            type="number"
            min={1}
            value={assignCount}
            onChange={(e) => setAssignCount(Math.max(1, Number(e.target.value) || 1))}
            aria-label="How many contacts to assign"
            className="w-20 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-slate-700">unassigned to</span>
          <AssignMemberSelect value={assignTo} onChange={(id) => setAssignTo(id ?? '')} />
          <Button size="sm" variant="primary" isLoading={isAssigning} disabled={!assignTo || list.unassigned === 0} onClick={handleAssign}>
            Assign
          </Button>
          <span className="text-xs text-slate-500 ml-auto">{list.unassigned} unassigned left</span>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 text-sm">
        {(['people', 'contacts', 'activity'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 -mb-px border-b-2 ${tab === t ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t === 'people' ? 'Progress by person' : t === 'contacts' ? `Contacts (${listContacts.length})` : 'Activity'}
          </button>
        ))}
      </div>

      {tab === 'people' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Person</th>
                <th className="p-3 text-right">Assigned</th>
                {STATUSES.map((s) => (
                  <th key={s} className="p-3 text-right whitespace-nowrap">
                    {STATUS_CONFIG[s].label}
                  </th>
                ))}
                <th className="p-3 text-right">Touched</th>
                <th className="p-3">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {progress.length === 0 && (
                <tr>
                  <td colSpan={STATUSES.length + 4} className="p-6 text-center text-slate-500">
                    {loaded ? 'No contacts in this list yet.' : 'Loading…'}
                  </td>
                </tr>
              )}
              {[...progress]
                .sort((a, b) => (a.owner_id === null ? 1 : b.owner_id === null ? -1 : b.total - a.total))
                .map((row) => (
                  <tr key={row.owner_id ?? 'none'} className="hover:bg-slate-50/60">
                    <td className={`p-3 font-semibold ${row.owner_id ? 'text-slate-900' : 'text-amber-700'}`}>{memberName(row.owner_id)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{row.total}</td>
                    {STATUSES.map((s) => (
                      <td key={s} className="p-3 text-right tabular-nums text-slate-700">
                        {row.by_status?.[s] || <span className="text-slate-300">0</span>}
                      </td>
                    ))}
                    <td className="p-3 text-right tabular-nums">{row.touched}</td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {row.last_activity ? formatDistanceToNow(new Date(row.last_activity), { addSuffix: true }) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={ownerFilter}
              onChange={(e) => {
                setOwnerFilter(e.target.value);
                setShown(PAGE);
                setSelected(new Set());
              }}
              aria-label="Filter by owner"
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All owners</option>
              <option value="unassigned">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {isAdmin && selected.size > 0 && (
              <>
                <span className="text-slate-600">{selected.size} selected</span>
                <AssignMemberSelect value="" includeUnassigned placeholder="Reassign to..." onChange={handleReassign} />
                <Button size="sm" variant="outline" onClick={handleRemove}>
                  Remove from list
                </Button>
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  {isAdmin && (
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all shown"
                        checked={allOnPageSelected}
                        onChange={() =>
                          setSelected(allOnPageSelected ? new Set() : new Set(page.map((c) => c.id)))
                        }
                      />
                    </th>
                  )}
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Owner</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {page.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    {isAdmin && (
                      <td className="p-3">
                        <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      </td>
                    )}
                    <td className="p-3 font-semibold text-slate-900">
                      <button type="button" className="hover:text-indigo-600 text-left" onClick={() => onSelectContact(c)}>
                        {c.name}
                      </button>
                    </td>
                    <td className="p-3 text-slate-600">{c.email || '—'}</td>
                    <td className={`p-3 ${c.owner_id ? 'text-slate-700' : 'text-amber-700'}`}>{memberName(c.owner_id)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full border ${STATUS_CONFIG[c.status]?.bg} ${STATUS_CONFIG[c.status]?.text} ${STATUS_CONFIG[c.status]?.border}`}>
                        {STATUS_CONFIG[c.status]?.label ?? c.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {page.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      No contacts match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > shown && (
            <div className="text-center">
              <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({filtered.length - shown} left)
              </Button>
            </div>
          )}
        </div>
      )}


      {tab === 'activity' && <ActivityLogView listId={listId} contacts={contacts} onSelectContact={onSelectContact} />}
    </div>
  );
};
