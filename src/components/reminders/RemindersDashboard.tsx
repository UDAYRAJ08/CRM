import React, { useState, useEffect, useRef } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Reminder, Contact } from '../../types/crm';
import { db } from '../../lib/supabase';
import { followUpStep } from '../../lib/emailService';
import { Button } from '../ui/Button';
import { ConfirmModal, ConfirmVariant } from '../ui/ConfirmModal';
import {
  CalendarCheck2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  User,
  Plus,
  ArrowUpRight,
  Mail,
  RotateCw,
  RotateCcw,
  Trash2,
  X,
  Sparkles,
} from 'lucide-react';
import { isToday, isPast, format } from 'date-fns';

interface RemindersDashboardProps {
  contacts?: Contact[];
  reminders: Reminder[];
  onRefresh: () => void;
  onOpenContact: (contact: Contact) => void;
  onOpenEmailComposer?: (contact: Contact) => void;
  onOpenBulkEmail?: (contacts: Contact[], initialTemplate?: 'followup') => void;
  onAddNewReminder: () => void;
}

export const RemindersDashboard: React.FC<RemindersDashboardProps> = ({
  contacts = [],
  reminders,
  onRefresh,
  onOpenContact,
  onOpenEmailComposer,
  onOpenBulkEmail,
  onAddNewReminder,
}) => {
  const { activeMember } = useTeam();
  const { success, error } = useToast();

  const [isCleaning, setIsCleaning] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<'all' | 'mine'>('all');
  const [activeTab, setActiveTab] = useState<'today' | 'overdue' | 'upcoming' | 'completed'>('today');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Modern in-app confirmation modal state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmVariant;
    icon?: React.ReactNode;
    badgeLabel?: string;
    checkboxLabel?: string;
    checkboxDefaultChecked?: boolean;
    onCheckboxChange?: (checked: boolean) => void;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Clear selections when switching tab or assignee filter
  useEffect(() => {
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  }, [activeTab, filterAssignee]);

  const filteredByAssignee = reminders.filter((r) => {
    if (filterAssignee === 'mine' && activeMember) {
      return r.assigned_to === activeMember.id;
    }
    return true;
  });

  const now = new Date();

  const overdueList = filteredByAssignee.filter(
    (r) => !r.done && new Date(r.due_date) < now && !isToday(new Date(r.due_date))
  );

  const todayList = filteredByAssignee.filter(
    (r) => !r.done && isToday(new Date(r.due_date))
  );

  const upcomingList = filteredByAssignee.filter(
    (r) => !r.done && new Date(r.due_date) > now && !isToday(new Date(r.due_date))
  );

  const completedList = filteredByAssignee.filter((r) => r.done);

  const getActiveList = () => {
    switch (activeTab) {
      case 'overdue':
        return overdueList;
      case 'upcoming':
        return upcomingList;
      case 'completed':
        return completedList;
      case 'today':
      default:
        return todayList;
    }
  };

  const currentList = getActiveList();

  // Prune any selectedIds that are no longer in currentList
  useEffect(() => {
    setSelectedIds((prev) => {
      const currentIdSet = new Set(currentList.map((r) => r.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIdSet.has(id)) {
          next.add(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [currentList]);

  const allSelected = currentList.length > 0 && selectedIds.size === currentList.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < currentList.length;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(currentList.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string, index: number, e: React.MouseEvent) => {
    const next = new Set(selectedIds);
    if (e.shiftKey && lastSelectedIndex !== null && lastSelectedIndex !== index) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        if (currentList[i]) {
          next.add(currentList[i].id);
        }
      }
    } else {
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
    }
    setLastSelectedIndex(index);
    setSelectedIds(next);
  };

  const handleToggle = async (reminder: Reminder) => {
    const nextDone = !reminder.done;
    try {
      await db.toggleReminder(reminder.id, nextDone);
    } catch (e: any) {
      error('Update Failed', e?.message || 'Could not update the task.');
      return;
    }
    success(
      nextDone ? 'Task Completed!' : 'Task Reopened',
      `"${reminder.note}"`
    );
    if (selectedIds.has(reminder.id)) {
      const next = new Set(selectedIds);
      next.delete(reminder.id);
      setSelectedIds(next);
    }
    onRefresh();
  };

  const executeBulkToggle = async (markAsDone: boolean, targetIds: string[]) => {
    try {
      await db.bulkToggleReminders(targetIds, markAsDone);
      success(
        markAsDone ? 'Tasks Completed!' : 'Tasks Reopened!',
        `Successfully updated ${targetIds.length} ${targetIds.length === 1 ? 'task' : 'tasks'}.`
      );
      setSelectedIds(new Set());
      onRefresh();
    } catch (err: any) {
      error('Update Failed', err.message || 'Could not update reminders.');
    }
  };

  const handleBulkToggle = (markAsDone: boolean, idsToToggle?: string[]) => {
    const targetIds = idsToToggle || Array.from(selectedIds);
    if (targetIds.length === 0) return;

    if (targetIds.length > 5) {
      const actionText = markAsDone ? 'completed' : 'reopened';
      setConfirmConfig({
        isOpen: true,
        title: markAsDone ? 'Complete Tasks' : 'Reopen Tasks',
        badgeLabel: markAsDone ? 'Batch Completion' : 'Batch Reopen',
        message: (
          <div className="space-y-3.5">
            <p className="text-slate-600 text-sm">
              Are you sure you want to mark{' '}
              <strong className="text-slate-900 font-bold">{targetIds.length} reminders</strong> as{' '}
              <span className={markAsDone ? 'font-bold text-emerald-600' : 'font-bold text-indigo-600'}>
                {actionText}
              </span>?
            </p>
            <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3.5 flex items-center justify-between text-xs text-slate-600 shadow-2xs">
              <span className="font-medium text-slate-500">Selected Tasks</span>
              <span className="font-semibold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                {targetIds.length} Records
              </span>
            </div>
          </div>
        ),
        confirmText: markAsDone ? `Mark as Completed (${targetIds.length})` : `Reopen All (${targetIds.length})`,
        variant: markAsDone ? 'success' : 'primary',
        icon: markAsDone ? <CheckCircle2 className="w-7 h-7 text-emerald-600" /> : <RotateCcw className="w-7 h-7 text-indigo-600" />,
        onConfirm: () => executeBulkToggle(markAsDone, targetIds),
      });
      return;
    }

    executeBulkToggle(markAsDone, targetIds);
  };

  const handleBulkDelete = () => {
    const targetIds = Array.from(selectedIds);
    if (targetIds.length === 0) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Reminders',
      badgeLabel: 'Permanent Deletion',
      message: (
        <div className="space-y-3.5">
          <p className="text-slate-600 text-sm">
            Permanently delete <strong className="text-slate-900 font-bold">{targetIds.length} selected {targetIds.length === 1 ? 'reminder' : 'reminders'}</strong>? This action cannot be undone.
          </p>
          <div className="bg-rose-50/80 border border-rose-200/80 rounded-2xl p-3.5 flex items-center justify-between text-xs text-rose-700 shadow-2xs">
            <span className="font-medium">Impact</span>
            <span className="font-semibold bg-white px-2.5 py-1 rounded-lg border border-rose-200 text-rose-800 shadow-2xs">
              Irreversible
            </span>
          </div>
        </div>
      ),
      confirmText: `Delete ${targetIds.length} ${targetIds.length === 1 ? 'Reminder' : 'Reminders'}`,
      variant: 'danger',
      icon: <Trash2 className="w-7 h-7 text-rose-600" />,
      onConfirm: async () => {
        try {
          await db.bulkDeleteReminders(targetIds);
          success('Reminders Deleted', `Removed ${targetIds.length} reminders.`);
          setSelectedIds(new Set());
          onRefresh();
        } catch (err: any) {
          error('Delete Failed', err.message || 'Could not delete reminders.');
        }
      },
    });
  };

  // Diagnostics & cleanup calculations
  const totalContacts = contacts?.length || 0;
  const validContactIds = new Set((contacts || []).map((c) => c.id));
  const openReminders = reminders.filter((r) => !r.done);
  const completedReminders = reminders.filter((r) => r.done);

  // Group open reminders by contact_id to detect duplicates
  const activeByContact = new Map<string, Reminder[]>();
  // Only auto follow-ups count, matching db.deduplicateReminders (hand-written reminders are kept).
  for (const r of openReminders) {
    if (r.contact_id && followUpStep(r.note || '') !== null) {
      const list = activeByContact.get(r.contact_id) || [];
      list.push(r);
      activeByContact.set(r.contact_id, list);
    }
  }
  let duplicateCount = 0;
  let contactsWithDuplicates = 0;
  for (const list of activeByContact.values()) {
    if (list.length > 1) {
      duplicateCount += list.length - 1;
      contactsWithDuplicates++;
    }
  }

  // Orphaned reminders whose contact doesn't exist
  const orphanedReminders = contacts && contacts.length > 0
    ? reminders.filter((r) => !r.contact_id || !validContactIds.has(r.contact_id))
    : [];
  const orphanedCount = orphanedReminders.length;

  const handleDeduplicate = async () => {
    setIsCleaning(true);
    try {
      const res = await db.deduplicateReminders();
      success(
        'Deduplication Complete',
        res.removedCount > 0
          ? `Removed ${res.removedCount} duplicate tasks. Each contact now has at most 1 active follow-up.`
          : 'No duplicate tasks found.'
      );
      onRefresh();
    } catch (err: any) {
      error('Deduplication Failed', err.message || 'Could not deduplicate tasks.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleCleanOrphans = async () => {
    setIsCleaning(true);
    try {
      const res = await db.cleanupOrphanedReminders();
      success(
        'Orphaned Tasks Cleaned',
        res.removedCount > 0
          ? `Cleaned up ${res.removedCount} tasks with no matching contacts.`
          : 'No orphaned tasks found.'
      );
      onRefresh();
    } catch (err: any) {
      error('Cleanup Failed', err.message || 'Could not clean orphaned tasks.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleClearCompleted = () => {
    if (completedReminders.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Clear Completed Tasks History',
      badgeLabel: 'Purge History',
      message: (
        <div className="space-y-3 text-left">
          <p className="text-sm text-slate-600">
            Permanently clear all <strong className="text-slate-900 font-bold">{completedReminders.length} completed tasks</strong> from CRM history?
          </p>
          <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3.5 flex items-center justify-between text-xs text-slate-600 shadow-2xs">
            <span className="font-medium text-slate-500">History Records</span>
            <span className="font-semibold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              {completedReminders.length} Tasks
            </span>
          </div>
          <p className="text-xs text-slate-400">
            This will reduce your total task count from {reminders.length} down to {openReminders.length} active tasks, keeping only pending follow-ups.
          </p>
        </div>
      ),
      confirmText: `Clear ${completedReminders.length} Completed`,
      variant: 'danger',
      icon: <Trash2 className="w-7 h-7 text-rose-600" />,
      onConfirm: async () => {
        setIsCleaning(true);
        try {
          const res = await db.clearCompletedReminders();
          success('Completed Tasks Cleared', `Removed ${res.removedCount} completed task records.`);
          onRefresh();
        } catch (err: any) {
          error('Clear Failed', err.message || 'Could not clear completed tasks.');
        } finally {
          setIsCleaning(false);
        }
      },
    });
  };

  const handleCleanAll = () => {
    let clearCompleted = true;
    setConfirmConfig({
      isOpen: true,
      title: 'Clean & Align Follow-up Tasks',
      badgeLabel: '1-Click Optimization',
      message: (
        <div className="space-y-3.5 text-left">
          <p className="text-xs text-slate-600">
            The following optimizations will be applied to harmonize your follow-ups with your {totalContacts} contacts:
          </p>
          <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3.5 space-y-2.5 text-xs text-slate-700 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Deduplicate active tasks (keeps 1 active reminder per contact, removes {duplicateCount} duplicates)</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Remove {orphanedCount} orphaned tasks with missing contacts</span>
            </div>
          </div>
        </div>
      ),
      checkboxLabel: completedReminders.length > 0 ? `Also clear all ${completedReminders.length} completed history records` : undefined,
      checkboxDefaultChecked: true,
      onCheckboxChange: (val) => {
        clearCompleted = val;
      },
      confirmText: 'Run Clean & Align',
      variant: 'primary',
      icon: <Sparkles className="w-7 h-7 text-indigo-600" />,
      onConfirm: async () => {
        setIsCleaning(true);
        try {
          const dedupRes = await db.deduplicateReminders();
          const orphanRes = await db.cleanupOrphanedReminders();
          let completedRemoved = 0;
          if (clearCompleted) {
            const compRes = await db.clearCompletedReminders();
            completedRemoved = compRes.removedCount;
          }
          success(
            'Tasks Synchronized & Cleaned!',
            `Cleaned ${dedupRes.removedCount} duplicates and ${orphanRes.removedCount} orphans${
              completedRemoved > 0 ? `, and cleared ${completedRemoved} completed records` : ''
            }.`
          );
          onRefresh();
        } catch (err: any) {
          error('Optimization Failed', err.message || 'Could not complete task optimization.');
        } finally {
          setIsCleaning(false);
        }
      },
    });
  };

  const handleSingleDelete = (reminderId: string, reminderNote?: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Reminder',
      message: (
        <div className="text-slate-600 text-left">
          <p>Are you sure you want to permanently delete this task?</p>
          {reminderNote && (
            <p className="mt-2 text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              &quot;{reminderNote}&quot;
            </p>
          )}
        </div>
      ),
      confirmText: 'Delete Task',
      variant: 'danger',
      icon: <Trash2 className="w-6 h-6" />,
      onConfirm: async () => {
        try {
          await db.deleteReminder(reminderId);
          success('Task Deleted', 'Reminder was removed.');
          onRefresh();
        } catch (err: any) {
          error('Delete Failed', err.message || 'Could not delete reminder.');
        }
      },
    });
  };

  // Contacts associated with all current list items (for top bar)
  const pendingContactReminders = currentList
    .map((r) => r.contact)
    .filter((c): c is Contact => Boolean(c && c.email));
  const uniqueContacts = Array.from(new Map(pendingContactReminders.map((c) => [c.id, c])).values());

  // Contacts associated with currently selected items (for bulk action bar)
  const selectedReminders = currentList.filter((r) => selectedIds.has(r.id));
  const selectedContactReminders = selectedReminders
    .map((r) => r.contact)
    .filter((c): c is Contact => Boolean(c && c.email));
  const selectedUniqueContacts = Array.from(
    new Map(selectedContactReminders.map((c) => [c.id, c])).values()
  );

  return (
    <div className="space-y-5">
      {/* Top Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Follow-ups</h1>
          <p className="text-sm text-slate-500 mt-1">
            Calls, agreements and deliverables to follow up on.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setFilterAssignee('all')}
              className={`px-3 py-1 rounded-lg transition ${
                filterAssignee === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Team Tasks
            </button>
            <button
              onClick={() => setFilterAssignee('mine')}
              className={`px-3 py-1 rounded-lg transition ${
                filterAssignee === 'mine'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My Tasks Only
            </button>
          </div>

          {uniqueContacts.length > 0 && onOpenBulkEmail && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<RotateCw className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={() => onOpenBulkEmail(uniqueContacts, 'followup')}
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 hidden sm:inline-flex"
              title="Launch Bulk Follow-up Sender for all contacts in this view"
            >
              Bulk Follow-up ({uniqueContacts.length})
            </Button>
          )}

          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={onAddNewReminder}
          >
            New Reminder
          </Button>
        </div>
      </div>

      {/* Diagnostics & Alignment Banner */}
      {(duplicateCount > 0 || orphanedCount > 0 || completedReminders.length > 0 || (totalContacts > 0 && reminders.length > totalContacts)) && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 flex items-center gap-1.5">
                  Task cleanup
                </span>
                <span className="text-xs text-slate-500">
                  {totalContacts > 0 ? `${totalContacts} Contacts in CRM` : ''} • {openReminders.length} Active Tasks • {completedReminders.length} Completed
                </span>
              </div>

              <h3 className="text-sm font-semibold text-slate-900">
                {reminders.length} tasks across {totalContacts} contacts
              </h3>
              
              <p className="text-xs text-slate-500 leading-relaxed">
                You have {totalContacts} total contacts in the CRM. The {reminders.length} tasks in database include {openReminders.length} active/upcoming reminders and {completedReminders.length} completed task records.
                {duplicateCount > 0 && ` Found ${duplicateCount} duplicate open task${duplicateCount === 1 ? '' : 's'} across ${contactsWithDuplicates} contact${contactsWithDuplicates === 1 ? '' : 's'}.`}
                {orphanedCount > 0 && ` Found ${orphanedCount} orphaned task${orphanedCount === 1 ? '' : 's'} from removed contacts.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isCleaning}
                onClick={handleCleanAll}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <span>Clean up all</span>
              </button>

              {duplicateCount > 0 && (
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeduplicate}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
                  title="Remove duplicate open tasks for the same contact"
                >
                  Deduplicate ({duplicateCount})
                </button>
              )}

              {orphanedCount > 0 && (
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleCleanOrphans}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
                  title="Remove tasks linked to deleted contacts"
                >
                  Remove Orphans ({orphanedCount})
                </button>
              )}

              {completedReminders.length > 0 && (
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleClearCompleted}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
                  title="Purge completed task history from database"
                >
                  Clear Completed ({completedReminders.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Categorized Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex items-center gap-2 pb-3 px-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'today'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4 text-indigo-500" />
          <span>Due Today</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
            {todayList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('overdue')}
          className={`flex items-center gap-2 pb-3 px-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'overdue'
              ? 'border-rose-600 text-rose-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-rose-500" />
          <span>Overdue</span>
          {overdueList.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              {overdueList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex items-center gap-2 pb-3 px-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'upcoming'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4 text-slate-500" />
          <span>Upcoming</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {upcomingList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`flex items-center gap-2 pb-3 px-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'completed'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>Completed</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            {completedList.length}
          </span>
        </button>
      </div>

      {/* Bulk Selection Header / Master Tick Bar */}
      {currentList.length > 0 && (
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs select-none">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer">
              <input
                ref={masterCheckboxRef}
                type="checkbox"
                checked={allSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>
                {selectedIds.size === 0
                  ? `Select all (${currentList.length})`
                  : `${selectedIds.size} of ${currentList.length} selected`}
              </span>
            </label>

            {selectedIds.size > 0 && selectedIds.size < currentList.length && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(currentList.map((r) => r.id)))}
                className="text-indigo-600 hover:text-indigo-800 font-bold underline transition cursor-pointer"
              >
                Select all {currentList.length}
              </button>
            )}

            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-500 hover:text-slate-800 font-medium transition cursor-pointer"
              >
                Clear selection
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.size === 0 ? (
              activeTab !== 'completed' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleBulkToggle(true, currentList.map((r) => r.id))}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    title={`Mark all ${currentList.length} tasks in this view as completed`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Mark All as Done ({currentList.length})</span>
                  </button>

                  {duplicateCount > 0 && (
                    <button
                      type="button"
                      disabled={isCleaning}
                      onClick={handleDeduplicate}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                      title={`Remove ${duplicateCount} duplicate open tasks across your contacts`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>Deduplicate ({duplicateCount})</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleBulkToggle(false, currentList.map((r) => r.id))}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                    title={`Reopen all ${currentList.length} completed tasks`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Reopen All ({currentList.length})</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCleaning}
                    onClick={handleClearCompleted}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    title={`Permanently delete all ${currentList.length} completed tasks from history`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Clear Completed ({currentList.length})</span>
                  </button>
                </div>
              )
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleBulkToggle(activeTab !== 'completed')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {activeTab === 'completed'
                      ? `Reopen Selected (${selectedIds.size})`
                      : `Mark Done (${selectedIds.size})`}
                  </span>
                </button>

                {selectedUniqueContacts.length > 0 && onOpenBulkEmail && (
                  <button
                    type="button"
                    onClick={() => onOpenBulkEmail(selectedUniqueContacts, 'followup')}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                    title="Send follow-up emails to selected contacts"
                  >
                    <Mail className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Follow-up ({selectedUniqueContacts.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition cursor-pointer"
                  title="Delete selected reminders"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reminders List */}
      <div className="space-y-2.5">
        {currentList.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <CalendarCheck2 className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
            <h4 className="text-sm font-bold text-slate-800">
              {activeTab === 'overdue'
                ? 'No overdue tasks — all caught up!'
                : activeTab === 'today'
                ? 'No reminders due today'
                : activeTab === 'upcoming'
                ? 'No upcoming reminders scheduled'
                : 'No completed tasks yet'}
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Schedule follow-up alerts from any contact page or click &quot;New Reminder&quot; above.
            </p>
          </div>
        ) : (
          currentList.map((reminder, index) => {
            const dueDateObj = new Date(reminder.due_date);
            const isDueToday = isToday(dueDateObj);
            const isPastDue = isPast(dueDateObj) && !isDueToday && !reminder.done;
            const isSelected = selectedIds.has(reminder.id);

            return (
              <div
                key={reminder.id}
                className={`flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3 sm:gap-0 p-4 rounded-2xl border transition-all bg-white hover:shadow-xs ${
                  isSelected
                    ? 'border-indigo-400 ring-2 ring-indigo-500/20 bg-indigo-50/20'
                    : isPastDue
                    ? 'border-rose-200/90 bg-rose-50/10'
                    : reminder.done
                    ? 'border-slate-200 bg-slate-50/60 opacity-75'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleToggleSelect(reminder.id, index, e.nativeEvent as any)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    title="Tick to select for bulk action (Shift-click for range)"
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        reminder.done
                          ? 'line-through text-slate-400'
                          : 'text-slate-900'
                      }`}
                    >
                      {reminder.note}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
                      {reminder.contact ? (
                        <button
                          type="button"
                          onClick={() => onOpenContact(reminder.contact!)}
                          className="font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 group"
                        >
                          <span>{reminder.contact.name}</span>
                          {reminder.contact.company?.name && (
                            <span className="text-slate-400 font-normal">
                              ({reminder.contact.company.name})
                            </span>
                          )}
                          <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </button>
                      ) : (
                        <span className="text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                          Contact Deleted / Not Found
                        </span>
                      )}

                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span
                          className={
                            isPastDue
                              ? 'text-rose-600 font-bold'
                              : isDueToday
                              ? 'text-indigo-600 font-bold'
                              : 'text-slate-600'
                          }
                        >
                          {isDueToday
                            ? `Today at ${format(dueDateObj, 'p')}`
                            : format(dueDateObj, 'MMM d, yyyy • p')}
                        </span>
                      </span>

                      {reminder.assignee && (
                        <span className="flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{reminder.assignee.name}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pl-7 sm:pl-0 sm:ml-3 flex flex-wrap items-center gap-2">
                  {reminder.contact && onOpenEmailComposer && !reminder.done && (
                    <Button
                      size="sm"
                      variant={isPastDue ? 'danger' : 'outline'}
                      onClick={() => onOpenEmailComposer(reminder.contact!)}
                      leftIcon={<Mail className="w-3.5 h-3.5" />}
                      className="text-xs py-1 px-2.5 font-bold"
                    >
                      {isPastDue ? 'Send Reminder' : 'Follow-up Email'}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggle(reminder)}
                    leftIcon={
                      reminder.done ? (
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      )
                    }
                    className="text-xs py-1 px-2.5 font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50"
                    title={reminder.done ? 'Mark as incomplete' : 'Mark as completed'}
                  >
                    {reminder.done ? 'Reopen' : 'Done'}
                  </Button>

                  <button
                    type="button"
                    onClick={() => handleSingleDelete(reminder.id, reminder.note)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition cursor-pointer"
                    title="Permanently delete this task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Bar (Slides Up When Tasks Are Ticked / Selected) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-0 mx-auto max-w-2xl px-4 z-40 animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-lg border border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
            {/* Counter */}
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>{selectedIds.size} Selected</span>
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleBulkToggle(activeTab !== 'completed')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {activeTab === 'completed'
                    ? `Reopen (${selectedIds.size})`
                    : `Mark as Completed (${selectedIds.size})`}
                </span>
              </button>

              {selectedUniqueContacts.length > 0 && onOpenBulkEmail && (
                <button
                  type="button"
                  onClick={() => onOpenBulkEmail(selectedUniqueContacts, 'followup')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  title="Send bulk follow-up emails to selected contacts"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Bulk Follow-up ({selectedUniqueContacts.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleBulkDelete}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                title="Delete selected reminders"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-slate-700 mx-1" />

              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer font-medium"
              >
                <X className="w-3.5 h-3.5" />
                <span>Deselect All</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        variant={confirmConfig.variant}
        icon={confirmConfig.icon}
        badgeLabel={confirmConfig.badgeLabel}
        checkboxLabel={confirmConfig.checkboxLabel}
        checkboxDefaultChecked={confirmConfig.checkboxDefaultChecked}
        onCheckboxChange={confirmConfig.onCheckboxChange}
      />
    </div>
  );
};
