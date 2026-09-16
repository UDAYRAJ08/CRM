import React, { useState, useMemo } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, ContactStatus } from '../../types/crm';
import { db } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
import { Badge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Users,
  Search,
  Filter,
  Phone,
  Mail,
  MoreVertical,
  Building,
  User,
  LayoutGrid,
  List,
  Trash2,
  Send,
  Plus,
  ArrowUpDown,
  Tag,
  CheckSquare,
  Clock,
  AlertTriangle,
  Reply,
  CheckCircle2,
} from 'lucide-react';

interface ContactListProps {
  contacts: Contact[];
  searchQuery: string;
  onSelectContact: (contact: Contact) => void;
  onEditContact: (contact: Contact) => void;
  onOpenEmailComposer: (contact: Contact) => void;
  onOpenLinkedIn?: (contact: Contact) => void;
  onOpenBulkEmail: (selectedContacts: Contact[]) => void;
  onAddNewContact: () => void;
  onRefresh: () => void;
}

function getFollowUpInfo(contact: Contact) {
  if (contact.status === 'new') {
    return {
      label: 'Not Started',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80',
      actionText: 'Send 1st Email',
      isOverdue: false,
      stage: 'new',
    };
  }
  if (contact.status === 'qualified') {
    return {
      label: 'Replied & Qualified',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
      actionText: 'View Details',
      isOverdue: false,
      stage: 'qualified',
    };
  }
  if (contact.status === 'contacted') {
    const contactDate = new Date(contact.updated_at || contact.created_at).getTime();
    const diffHours = (Date.now() - contactDate) / (1000 * 60 * 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays >= 3) {
      return {
        label: `🚨 3-Day Follow-up Due (${diffDays}d ago)`,
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold shadow-xs',
        actionText: 'Send Follow-up Message',
        isOverdue: true,
        stage: 'overdue',
      };
    } else {
      const remainingDays = Math.max(1, 3 - diffDays);
      return {
        label: `⏳ Waiting (Follow-up in ${remainingDays}d)`,
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
        actionText: 'Follow-up Email',
        isOverdue: false,
        stage: 'contacted',
      };
    }
  }
  return {
    label: contact.status,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    actionText: 'Contact',
    isOverdue: false,
    stage: contact.status,
  };
}

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  searchQuery,
  onSelectContact,
  onEditContact,
  onOpenEmailComposer,
  onOpenLinkedIn,
  onOpenBulkEmail,
  onAddNewContact,
  onRefresh,
}) => {
  const { teamMembers, activeMember } = useTeam();
  const { success, error } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'company'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    contacts.forEach((c) => c.tags?.forEach((t) => tagsSet.add(t)));
    return Array.from(tagsSet);
  }, [contacts]);

  // Filter and Sort contacts
  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = c.name.toLowerCase().includes(q);
          const matchEmail = c.email?.toLowerCase().includes(q) || false;
          const matchPhone = c.phone?.includes(q) || false;
          const matchCompany = c.company?.name.toLowerCase().includes(q) || false;
          const matchTag = c.tags?.some((t) => t.toLowerCase().includes(q)) || false;
          if (!matchName && !matchEmail && !matchPhone && !matchCompany && !matchTag) {
            return false;
          }
        }

        // Status filter
        if (statusFilter !== 'all' && c.status !== statusFilter) {
          return false;
        }

        // Owner filter
        if (ownerFilter !== 'all') {
          if (ownerFilter === 'unassigned' && c.owner_id) return false;
          if (ownerFilter !== 'unassigned' && c.owner_id !== ownerFilter) return false;
        }

        // Tag filter
        if (tagFilter !== 'all' && (!c.tags || !c.tags.includes(tagFilter))) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sortBy === 'company') {
          comparison = (a.company?.name || '').localeCompare(b.company?.name || '');
        } else {
          comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return sortOrder === 'asc' ? -comparison : comparison;
      });
  }, [contacts, searchQuery, statusFilter, ownerFilter, tagFilter, sortBy, sortOrder]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectedContacts = useMemo(() => {
    return contacts.filter((c) => selectedIds.has(c.id));
  }, [contacts, selectedIds]);

  const handleBulkDelete = async () => {
    if (window.confirm(`Delete ${selectedContacts.length} selected contacts?`)) {
      for (const c of selectedContacts) {
        await db.deleteContact(c.id);
      }
      setSelectedIds(new Set());
      success('Contacts Deleted', `Removed ${selectedContacts.length} contacts.`);
      onRefresh();
    }
  };

  const statusTabs: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'All Contacts' },
    { id: 'new', label: '🆕 Not Started' },
    { id: 'contacted', label: '⏰ Follow-ups & Reminders' },
    { id: 'qualified', label: '📥 Replied & Qualified' },
    { id: 'proposal', label: 'Proposal' },
    { id: 'won', label: 'Won' },
  ];

  return (
    <div className="space-y-4">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        {/* Pipeline Workflow Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            const count =
              tab.id === 'all'
                ? contacts.length
                : contacts.filter((c) => c.status === tab.id).length;

            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dropdowns & View switchers */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Tag Filter */}
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          )}

          {/* Owner Filter */}
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          >
            <option value="all">All Owners</option>
            <option value="unassigned">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          >
            <option value="created_at">Date Added</option>
            <option value="name">Name</option>
            <option value="company">Company</option>
          </select>

          <button
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition cursor-pointer"
            title="Toggle sort order"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          {/* View mode buttons */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'cards' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Banner when contacts are selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 border border-indigo-200 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
            <CheckSquare className="w-4 h-4 text-indigo-600" />
            <span>{selectedIds.size} contacts selected</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Send className="w-3.5 h-3.5" />}
              onClick={() => onOpenBulkEmail(selectedContacts)}
            >
              Send Bulk Email ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="danger"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={handleBulkDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Main List / Table */}
      {filteredContacts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No contacts match your criteria</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search terms or filters, or add new contacts to the CRM.
          </p>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={onAddNewContact}
            className="mt-4"
          >
            Add New Contact
          </Button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredContacts.length > 0 &&
                        selectedIds.size === filteredContacts.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5">Company</th>
                  <th className="p-3.5">Lifecycle / Follow-up Timer</th>
                  <th className="p-3.5">Owner</th>
                  <th className="p-3.5">Tags</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map((contact) => {
                  const isSelected = selectedIds.has(contact.id);
                  const followUp = getFollowUpInfo(contact);

                  return (
                    <tr
                      key={contact.id}
                      onClick={() => onSelectContact(contact)}
                      className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <td
                        className="p-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelect(contact.id, e as any)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                            {getInitials(contact.name, 'C')}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block text-sm hover:text-indigo-600 transition">
                              {contact.name || 'Unnamed Contact'}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              {contact.email && <span>{contact.email}</span>}
                              {contact.phone && (
                                <>
                                  <span>•</span>
                                  <span>{contact.phone}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5 text-slate-800">
                        {contact.company ? (
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{contact.company.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                        {contact.title && (
                          <span className="text-[11px] text-slate-500 block">
                            {contact.title}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${followUp.badgeClass}`}
                        >
                          {followUp.label}
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-600">
                        {contact.owner?.name ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                              {getInitials(contact.owner.name, 'U')[0]}
                            </div>
                            <span className="text-xs">{contact.owner.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Unassigned</span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {contact.tags && contact.tags.length > 0 ? (
                            contact.tags.slice(0, 2).map((t) => (
                              <Badge key={t} variant="neutral" size="sm">
                                {t}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                          {contact.tags && contact.tags.length > 2 && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              +{contact.tags.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      <td
                        className="p-3.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {followUp.isOverdue ? (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => onOpenEmailComposer(contact)}
                              leftIcon={<Mail className="w-3 h-3" />}
                              className="text-[11px] py-1 px-2.5 font-bold shadow-xs"
                            >
                              Send Reminder
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onOpenEmailComposer(contact)}
                              leftIcon={<Mail className="w-3.5 h-3.5 text-indigo-600" />}
                              className="text-[11px] py-1 px-2 font-medium"
                            >
                              {followUp.actionText}
                            </Button>
                          )}

                          {onOpenLinkedIn && (
                            <button
                              onClick={() => onOpenLinkedIn(contact)}
                              className="p-1.5 text-[#0077b5] hover:bg-blue-50 rounded-lg transition"
                              title="Direct Message on LinkedIn"
                            >
                              <span className="text-[11px] font-black">in</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => {
            const isSelected = selectedIds.has(contact.id);
            const initials = getInitials(contact.name, 'C');
            const followUp = getFollowUpInfo(contact);

            return (
              <div
                key={contact.id}
                onClick={() => onSelectContact(contact)}
                className={`bg-white p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md hover:border-indigo-300 relative space-y-3 ${
                  isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                      {initials}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{contact.name}</h4>
                      {contact.title && (
                        <p className="text-[11px] text-slate-500">{contact.title}</p>
                      )}
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${followUp.badgeClass}`}
                  >
                    {followUp.label}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  {contact.company && (
                    <div className="flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      <span>{contact.company.name}</span>
                    </div>
                  )}
                  {contact.email && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {contact.tags?.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={followUp.isOverdue ? 'danger' : 'primary'}
                      onClick={() => onOpenEmailComposer(contact)}
                      leftIcon={<Mail className="w-3.5 h-3.5" />}
                      className="text-[11px] py-1 px-2.5 font-bold"
                    >
                      {followUp.actionText}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
