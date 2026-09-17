import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { db } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
import { UserCheck, Plus, Sparkles, Shield } from 'lucide-react';

export const TeamMemberModal: React.FC = () => {
  const { teamMembers, activeMember, setActiveMember, addTeamMember, isPickerOpen, setIsPickerOpen } = useTeam();
  const { success, error } = useToast();

  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('Sales Lead');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelect = (memberId: string) => {
    const found = teamMembers.find((m) => m.id === memberId);
    if (found) {
      setActiveMember(found);
      success(`Welcome back, ${found.name}!`, `Actions will now be attributed to you.`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      error('Name required', 'Please enter your full name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await addTeamMember(newName, newEmail, newRole);
      success(`Welcome to Team CRM!`, `Created profile for ${created.name}`);
      setNewName('');
      setNewEmail('');
      setIsCreatingNew(false);
    } catch (err: any) {
      error('Failed to create team member', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isPickerOpen}
      onClose={() => {
        if (activeMember) {
          setIsPickerOpen(false);
        }
      }}
      showCloseButton={Boolean(activeMember)}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {activeMember ? 'Switch Active User' : 'Who is using CRM today?'}
            </h3>
            <p className="text-xs text-slate-500">
              Pick your active team profile to attribute actions, notes, emails & tasks.
            </p>
          </div>
        </div>
      }
    >
      {!isCreatingNew ? (
        <div className="space-y-4">
          <div className="grid gap-2 max-h-[320px] overflow-y-auto pr-1">
            {teamMembers.map((member) => {
              const isSelected = activeMember?.id === member.id;
              const initials = getInitials(member.name, 'U');

              return (
                <button
                  key={member.id}
                  onClick={() => handleSelect(member.id)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {member.name}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] uppercase font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate flex items-center gap-2 mt-0.5">
                        <span>{member.role || 'Member'}</span>
                        {member.email && (
                          <>
                            <span>•</span>
                            <span className="truncate">{member.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reset all local data and start fresh?')) {
                  db.clearAllLocalData();
                  window.location.reload();
                }
              }}
              className="text-xs text-rose-500 hover:text-rose-700 font-medium hover:underline"
            >
              Clear Local Data
            </button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsCreatingNew(true)}
            >
              Add New Person
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Full Name *"
            placeholder="e.g. Maya Lin"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Email Address (Optional)"
            placeholder="maya@company.internal"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />

          <Input
            label="Role / Title"
            placeholder="e.g. Account Executive"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          />

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreatingNew(false)}
            >
              Back to List
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              Save & Start
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
