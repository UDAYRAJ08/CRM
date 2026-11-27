import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArchiveRestore, ArrowLeft, Calendar, ChevronRight, Pencil, Trash2, UserPlus } from 'lucide-react';
import { listsDb } from '../../lib/contactLists';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import type { Contact, ContactList, ContactStatus } from '../../types/crm';
import { dateAddedKey, groupByDateAdded } from '../../lib/dateGroups';
import { STATUS_CONFIG } from '../contacts/ContactList';
import { contactMatchesSearch, googleMapsUrl } from '../../lib/utils';
import { db } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
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
  const { canManageLists, canEditLists } = usePermissions();
  // Admins assign anyone; everyone else can take unassigned contacts for themselves.
  const canAssign = canManageLists || !!activeMember;

  const [list, setList] = useState<ContactList | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'contacts' | 'activity'>('contacts');
  // Date opened from the date rows (null = show the dates).
  const [openDateKey, setOpenDateKey] = useState<string | null>(null);

  // Kept as typed text; parsed on submit so clearing the field doesn't snap it to 1.
  const [assignCountText, setAssignCountText] = useState('100');
  const assignCount = /^\d+$/.test(assignCountText.trim()) ? parseInt(assignCountText, 10) : 0;
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteContactsToo, setDeleteContactsToo] = useState(false);
  const [pendingReassign, setPendingReassign] = useState<{ memberId: string | null } | null>(null);
  const [assignTo, setAssignTo] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const [ownerFilter, setOwnerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [lists, ids] = await Promise.all([listsDb.getLists(), listsDb.getListContactIds(listId)]);
      setList(lists.find((l) => l.id === listId) ?? null);
      setMemberIds(ids);
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
      listContacts.filter(
        (c) =>
          (ownerFilter === 'all' ? true : ownerFilter === 'unassigned' ? !c.owner_id : c.owner_id === ownerFilter) &&
          contactMatchesSearch(c, search)
      ),
    [listContacts, ownerFilter, search]
  );

  const dateGroups = useMemo(() => groupByDateAdded(filtered), [filtered]);
  // Rows of the opened date; the table only shows once a date is opened.
  const rows = useMemo(
    () => (openDateKey ? filtered.filter((c) => dateAddedKey(c) === openDateKey) : filtered),
    [filtered, openDateKey]
  );
  const openGroup = dateGroups.find((g) => g.key === openDateKey);

  // Imported columns the CRM has no field for (e.g. ADDRESS, PIN CODE) live in custom_fields.
  const extraColumns = useMemo(
    () => [...new Set(listContacts.flatMap((c) => Object.keys(c.custom_fields || {})))],
    [listContacts]
  );
  const showEmail = listContacts.some((c) => c.email);

  const afterChange = () => {
    setSelected(new Set());
    onRefresh();
    load();
  };

  const handleAssign = async (assignTarget: string) => {
    if (!assignTarget || assignCount < 1) return;
    setIsAssigning(true);
    try {
      const n = await listsDb.assign({ listId, memberId: assignTarget, count: assignCount, actorId: activeMember?.id });
      const who = memberName(assignTarget);
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
      const skipped = selected.size - n;
      success('Contacts Assigned', `Assigned ${n} contacts to ${memberName(memberId)}.${skipped > 0 ? ` ${skipped} already had an owner.` : ''}`);
      afterChange();
    } catch (e: any) {
      error('Assign Failed', e.message);
    }
  };

  const handleStatusChange = async (contactId: string, status: ContactStatus) => {
    try {
      await db.saveContact({ id: contactId, status });
      success('Status Changed', `Contact updated to ${STATUS_CONFIG[status].label}`);
      onRefresh();
    } catch (e: any) {
      error('Update Failed', e.message || 'Could not change status.');
    }
  };

  const handleOwnerChange = async (contactId: string, ownerId: string | null) => {
    try {
      await db.saveContact({ id: contactId, owner_id: ownerId });
      success('Owner Changed', `Contact assigned to ${memberName(ownerId)}`);
      onRefresh();
    } catch (e: any) {
      error('Update Failed', e.message || 'Could not change owner.');
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

  const handleDelete = async () => {
    if (!list) return;
    try {
      const n = await listsDb.deleteList(listId, deleteContactsToo, activeMember?.id);
      success('List deleted', deleteContactsToo ? `Deleted "${list.name}" and ${n} contacts.` : `Deleted "${list.name}". Its contacts are back on the Contacts page.`);
      onRefresh();
      onBack();
    } catch (e: any) {
      error('Delete Failed', e.message);
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
  const page = rows.slice(0, shown);
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
        {canEditLists && list && (
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
            {canManageLists && (
              <Button
                size="sm"
                variant="danger"
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => {
                  setDeleteContactsToo(false);
                  setIsDeleteOpen(true);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {canAssign && list && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-2 text-sm">
          <UserPlus className="w-4 h-4 text-indigo-600" />
          <span className="text-slate-700">Assign</span>
          <input
            type="number"
            min={1}
            value={assignCountText}
            onChange={(e) => setAssignCountText(e.target.value)}
            aria-label="How many contacts to assign"
            className="w-20 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-slate-700">unassigned</span>
          {activeMember && (
            <Button size="sm" variant="primary" isLoading={isAssigning} disabled={assignCount < 1 || list.unassigned === 0} onClick={() => handleAssign(activeMember.id)}>
              Assign to me
            </Button>
          )}
          {canAssign && (
            <>
              <span className="text-slate-700">{activeMember ? 'or to' : 'to'}</span>
              <AssignMemberSelect value={assignTo} onChange={(id) => setAssignTo(id ?? '')} />
              <Button size="sm" variant="outline" isLoading={isAssigning} disabled={!assignTo || assignCount < 1 || list.unassigned === 0} onClick={() => handleAssign(assignTo)}>
                Assign
              </Button>
            </>
          )}
          <span className="text-xs text-slate-500 ml-auto">{list.unassigned} unassigned left</span>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 text-sm">
        {(['contacts', 'activity'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 -mb-px border-b-2 ${tab === t ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t === 'contacts' ? `Contacts (${listContacts.length})` : 'Activity'}
          </button>
        ))}
      </div>

      {tab === 'contacts' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE);
                setSelected(new Set());
              }}
              placeholder="Search name, phone, address, pin code…"
              aria-label="Search contacts in this list"
              className="w-72 max-w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
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
            {canAssign && rows.length > 0 && selected.size < rows.length && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(rows.map((c) => c.id)))}>
                Select all {rows.length} matching
              </Button>
            )}
            {canAssign && selected.size > 0 && (
              <>
                <span className="text-slate-600">{selected.size} selected</span>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                {activeMember && (
                  <Button size="sm" variant="primary" onClick={() => setPendingReassign({ memberId: activeMember.id })}>
                    Assign selected to me
                  </Button>
                )}
                <AssignMemberSelect value="" includeUnassigned placeholder="Assign / reassign to..." onChange={(memberId) => setPendingReassign({ memberId })} />
                {canEditLists && (
                  <Button size="sm" variant="outline" onClick={handleRemove}>
                    Remove from list
                  </Button>
                )}
              </>
            )}
          </div>

          {!openDateKey ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Grouped by Date Added:
                </span>
                <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-bold">
                  {dateGroups.length} {dateGroups.length === 1 ? 'Date' : 'Dates'}
                </span>
                <span>•</span>
                <span className="font-medium text-slate-600">{filtered.length} people total</span>
              </div>
              {dateGroups.length === 0 && (
                <p className="p-6 text-center text-sm text-slate-500">{loaded ? 'No contacts match.' : 'Loading…'}</p>
              )}
              {dateGroups.map((group) => (
                <button
                  type="button"
                  key={group.key}
                  onClick={() => {
                    setOpenDateKey(group.key);
                    setShown(PAGE);
                    setSelected(new Set());
                  }}
                  className="w-full text-left bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl px-5 md:px-6 py-4 flex items-center justify-between gap-4 shadow-xs hover:shadow-sm transition cursor-pointer"
                  title="Open the people added on this date"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/80 shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm md:text-base tracking-tight">{group.displayLabel}</h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                      {group.count} {group.count === 1 ? 'person added' : 'people added'}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-3 px-1">
            <button
              type="button"
              onClick={() => {
                setOpenDateKey(null);
                setSelected(new Set());
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              All dates
            </button>
            {openGroup && (
              <>
                <span className="text-slate-300">•</span>
                <h3 className="font-bold text-slate-900 text-sm tracking-tight">{openGroup.displayLabel}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                  {openGroup.count} {openGroup.count === 1 ? 'person added' : 'people added'}
                </span>
              </>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  {canAssign && (
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
                  <th className="p-3">Phone</th>
                  {showEmail && <th className="p-3">Email</th>}
                  {extraColumns.map((key) => (
                    <th key={key} className="p-3 whitespace-nowrap">{key}</th>
                  ))}
                  <th className="p-3">Owner</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {page.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    {canAssign && (
                      <td className="p-3">
                        <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      </td>
                    )}
                    <td className="p-3 font-semibold text-slate-900">
                      <button type="button" className="hover:text-indigo-600 text-left" onClick={() => onSelectContact(c)}>
                        {c.name}
                      </button>
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {c.phone ? (
                        // tel: opens the computer's calling app (e.g. Phone Link on Windows).
                        <a href={`tel:${c.phone}`} className="hover:text-indigo-600 hover:underline" title="Call">
                          {c.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    {showEmail && <td className="p-3 text-slate-600">{c.email || '—'}</td>}
                    {extraColumns.map((key) => {
                      const value = c.custom_fields?.[key];
                      const mapUrl = /address/i.test(key) ? googleMapsUrl(c.custom_fields) : null;
                      return (
                        <td key={key} className="p-3 text-slate-600 max-w-[260px] truncate" title={String(value ?? '')}>
                          {mapUrl && value ? (
                            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 hover:underline">
                              {value}
                            </a>
                          ) : (
                            value || '—'
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3">
                      <select
                        value={c.owner_id ?? ''}
                        onChange={(e) => handleOwnerChange(c.id, e.target.value || null)}
                        aria-label={`Owner of ${c.name}`}
                        className={`px-2 py-1 rounded-full border border-slate-200 bg-white text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${c.owner_id ? 'text-slate-700' : 'text-amber-700'}`}
                      >
                        <option value="">Unassigned</option>
                        {/* Keeps a removed member's name instead of showing a blank select. */}
                        {c.owner_id && !teamMembers.some((m) => m.id === c.owner_id) && (
                          <option value={c.owner_id}>{memberName(c.owner_id)}</option>
                        )}
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        value={c.status}
                        onChange={(e) => handleStatusChange(c.id, e.target.value as ContactStatus)}
                        aria-label={`Status of ${c.name}`}
                        className={`px-2 py-1 rounded-full border text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${STATUS_CONFIG[c.status]?.bg} ${STATUS_CONFIG[c.status]?.text} ${STATUS_CONFIG[c.status]?.border}`}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {STATUS_CONFIG[st].label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {page.length === 0 && (
                  <tr>
                    <td colSpan={6 + extraColumns.length} className="p-6 text-center text-slate-500">
                      No contacts match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > shown && (
            <div className="text-center">
              <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({rows.length - shown} left)
              </Button>
            </div>
          )}
          </>
          )}
        </div>
      )}


      {/* Mounted only while open: ConfirmModal keeps its own checkbox state, which must start unticked. */}
      {isDeleteOpen && (
        <ConfirmModal
          isOpen
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={handleDelete}
          title="Delete List"
          badgeLabel="Permanent"
          variant="danger"
          icon={<Trash2 className="w-7 h-7 text-rose-600" />}
          message={
            <p className="text-sm text-slate-600">
              Delete the list <strong className="text-slate-900">{list?.name}</strong>? Its {list?.total ?? 0} contacts move back to
              the Contacts page unless you also delete them below.
            </p>
          }
          checkboxLabel={`Also delete the ${list?.total ?? 0} contacts in this list, with their emails, notes, tasks and deals. This cannot be undone.`}
          checkboxDefaultChecked={false}
          onCheckboxChange={setDeleteContactsToo}
          confirmText="Delete"
        />
      )}

      <ConfirmModal
        isOpen={!!pendingReassign}
        onClose={() => setPendingReassign(null)}
        onConfirm={() => handleReassign(pendingReassign?.memberId ?? null)}
        title="Assign Contacts"
        message={
          <p className="text-sm text-slate-600">
            Make <strong className="text-slate-900">{memberName(pendingReassign?.memberId)}</strong> the owner of{' '}
            <strong className="text-slate-900">{selected.size} selected contacts</strong>? Their current owners are replaced.
          </p>
        }
        confirmText={`Assign ${selected.size}`}
        variant="primary"
      />

      {tab === 'activity' && <ActivityLogView listId={listId} contacts={contacts} onSelectContact={onSelectContact} />}
    </div>
  );
};
