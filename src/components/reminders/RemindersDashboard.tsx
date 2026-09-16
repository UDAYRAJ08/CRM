import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Reminder, Contact } from '../../types/crm';
import { db } from '../../lib/supabase';
import { Button } from '../ui/Button';
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
} from 'lucide-react';
import { isToday, isPast, isFuture, format, isThisWeek } from 'date-fns';

interface RemindersDashboardProps {
  reminders: Reminder[];
  onRefresh: () => void;
  onOpenContact: (contact: Contact) => void;
  onOpenEmailComposer?: (contact: Contact) => void;
  onAddNewReminder: () => void;
}

export const RemindersDashboard: React.FC<RemindersDashboardProps> = ({
  reminders,
  onRefresh,
  onOpenContact,
  onOpenEmailComposer,
  onAddNewReminder,
}) => {
  const { activeMember } = useTeam();
  const { success } = useToast();

  const [filterAssignee, setFilterAssignee] = useState<'all' | 'mine'>('all');
  const [activeTab, setActiveTab] = useState<'today' | 'overdue' | 'upcoming' | 'completed'>('today');

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

  const handleToggle = async (reminder: Reminder) => {
    const nextDone = !reminder.done;
    await db.toggleReminder(reminder.id, nextDone);
    success(
      nextDone ? 'Task Completed!' : 'Task Reopened',
      `"${reminder.note}"`
    );
    onRefresh();
  };

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

  return (
    <div className="space-y-5">
      {/* Top Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Follow-up Reminders & Tasks</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Never drop a lead — keep track of team calls, agreements, and deliverables.
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
          currentList.map((reminder) => {
            const dueDateObj = new Date(reminder.due_date);
            const isDueToday = isToday(dueDateObj);
            const isPastDue = isPast(dueDateObj) && !isDueToday && !reminder.done;

            return (
              <div
                key={reminder.id}
                className={`flex items-start justify-between p-4 rounded-2xl border transition-all bg-white hover:shadow-xs ${
                  isPastDue
                    ? 'border-rose-200/90 bg-rose-50/10'
                    : reminder.done
                    ? 'border-slate-200 bg-slate-50/60 opacity-75'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={reminder.done}
                    onChange={() => handleToggle(reminder)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
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
                      {reminder.contact && (
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

                {reminder.contact && onOpenEmailComposer && !reminder.done && (
                  <div className="shrink-0 ml-3">
                    <Button
                      size="sm"
                      variant={isPastDue ? 'danger' : 'outline'}
                      onClick={() => onOpenEmailComposer(reminder.contact!)}
                      leftIcon={<Mail className="w-3.5 h-3.5" />}
                      className="text-xs py-1 px-2.5 font-bold"
                    >
                      {isPastDue ? 'Send Reminder' : 'Follow-up Email'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
