import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ConfirmModal } from '../ui/ConfirmModal';
import { db } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
import { usePermissions } from '../../hooks/usePermissions';
import {
  UserCheck, Plus, Sparkles, AlertTriangle,
  Lock, Unlock, Key, Eye, EyeOff, ShieldCheck, Check
} from 'lucide-react';
import { TeamMember } from '../../types/crm';

export const TeamMemberModal: React.FC = () => {
  const {
    teamMembers,
    activeMember,
    setActiveMember,
    addTeamMember,
    updateMemberRole,
    updateMemberPin,
    verifyMemberPin,
    isPickerOpen,
    setIsPickerOpen,
  } = useTeam();
  const { success, error } = useToast();
  const { canManageTeam, isAdmin } = usePermissions();

  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('Sales Lead');
  const [newInitialPin, setNewInitialPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  // Authentication & PIN protection state
  const [targetMemberForAuth, setTargetMemberForAuth] = useState<TeamMember | null>(null);
  const [authMode, setAuthMode] = useState<'enter_pin' | 'setup_pin' | 'change_pin' | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isPinSubmitting, setIsPinSubmitting] = useState(false);

  // Select persona handler - checks PIN requirement
  const handleSelect = (memberId: string) => {
    const found = teamMembers.find((m) => m.id === memberId);
    if (!found) return;

    // Already active persona
    if (activeMember?.id === found.id) {
      success('Active Persona', `You are currently working as ${found.name}.`);
      setIsPickerOpen(false);
      return;
    }

    setTargetMemberForAuth(found);
    setEnteredPin('');
    setConfirmPin('');
    setShowPin(false);

    if (found.pin && found.pin.trim().length > 0) {
      // Persona has a PIN set -> challenge for password/PIN
      setAuthMode('enter_pin');
    } else {
      // Persona has no PIN set yet -> prompt to create one
      setAuthMode('setup_pin');
    }
  };

  // Submit PIN verification
  const handleVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMemberForAuth) return;

    if (!enteredPin.trim()) {
      error('PIN Required', 'Please enter the password or PIN for this persona.');
      return;
    }

    const isValid = await verifyMemberPin(targetMemberForAuth.id, enteredPin.trim());
    if (isValid) {
      setActiveMember(targetMemberForAuth);
      success(`Welcome back, ${targetMemberForAuth.name}!`, 'Actions and outreach will now be attributed to you.');
      setAuthMode(null);
      setTargetMemberForAuth(null);
      setEnteredPin('');
    } else {
      error('Authentication Failed', 'The PIN or password entered is incorrect. Please try again.');
    }
  };

  // Admin Quick Switch override
  const handleAdminOverride = () => {
    if (!targetMemberForAuth || !isAdmin) return;
    setActiveMember(targetMemberForAuth);
    success(`Admin Switch to ${targetMemberForAuth.name}`, 'Switched persona with Administrator privileges.');
    setAuthMode(null);
    setTargetMemberForAuth(null);
    setEnteredPin('');
  };

  // Submit initial PIN setup or PIN change
  const handleSavePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMemberForAuth) return;

    if (!enteredPin.trim()) {
      error('PIN Required', 'Please enter a PIN or password.');
      return;
    }

    if (enteredPin.trim().length < 4) {
      error('Too Short', 'PIN or password must be at least 4 characters.');
      return;
    }

    if (enteredPin.trim() !== confirmPin.trim()) {
      error('Mismatch', 'PIN entries do not match. Please re-enter.');
      return;
    }

    setIsPinSubmitting(true);
    try {
      await updateMemberPin(targetMemberForAuth.id, enteredPin.trim());
      const updated = { ...targetMemberForAuth, pin: enteredPin.trim() };

      if (authMode === 'setup_pin') {
        setActiveMember(updated);
        success(`PIN Created!`, `Secured and switched to ${targetMemberForAuth.name}.`);
      } else {
        success('PIN Updated', `Security PIN for ${targetMemberForAuth.name} has been changed.`);
      }

      setAuthMode(null);
      setTargetMemberForAuth(null);
      setEnteredPin('');
      setConfirmPin('');
    } catch (err: any) {
      error('Failed to update PIN', err.message);
    } finally {
      setIsPinSubmitting(false);
    }
  };

  const handleOpenChangePin = (e: React.MouseEvent, member: TeamMember) => {
    e.stopPropagation();
    setTargetMemberForAuth(member);
    setAuthMode('change_pin');
    setEnteredPin('');
    setConfirmPin('');
    setShowPin(false);
  };

  const handlePromoteToAdmin = async (e: React.MouseEvent, memberId: string) => {
    e.stopPropagation();
    try {
      await updateMemberRole(memberId, 'Admin');
      success('Role Promoted', 'Account is now a Workspace Administrator (Admin).');
    } catch (err: any) {
      error('Failed to update role', err.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTeam) {
      error('Access Restricted', 'Only Administrators have permission to add new team members.');
      return;
    }
    if (!newName.trim()) {
      error('Name required', 'Please enter your full name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await addTeamMember(
        newName,
        newEmail,
        newRole,
        undefined,
        newInitialPin.trim() || undefined
      );
      success(`Welcome to Team CRM!`, `Created profile for ${created.name}${newInitialPin.trim() ? ' with PIN protection' : ''}.`);
      setNewName('');
      setNewEmail('');
      setNewInitialPin('');
      setIsCreatingNew(false);
    } catch (err: any) {
      error('Failed to create team member', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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
                Pick your active team profile to attribute actions, notes, emails & LinkedIn accounts.
              </p>
            </div>
          </div>
        }
      >
        {!isCreatingNew ? (
          <div className="space-y-4">
            <div className="grid gap-2 max-h-[340px] overflow-y-auto pr-1">
              {teamMembers.map((member) => {
                const isSelected = activeMember?.id === member.id;
                const initials = getInitials(member.name, 'U');
                const hasPin = Boolean(member.pin && member.pin.trim());

                return (
                  <div
                    key={member.id}
                    onClick={() => handleSelect(member.id)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 truncate">
                            {member.name}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] uppercase font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                          {hasPin ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200/80"
                              title="Protected by PIN / Password"
                            >
                              <Lock className="w-2.5 h-2.5 text-slate-500" />
                              PIN
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200/70"
                              title="No PIN configured yet"
                            >
                              <Unlock className="w-2.5 h-2.5 text-amber-500" />
                              No PIN
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

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {/* Manage/Change PIN button */}
                      {(isAdmin || isSelected) && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenChangePin(e, member)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title={hasPin ? 'Change PIN / Password' : 'Set PIN / Password'}
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isSelected ? (
                        <>
                          {member.role?.toLowerCase() !== 'admin' && (
                            <button
                              type="button"
                              onClick={(e) => handlePromoteToAdmin(e, member.id)}
                              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-100/70 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-md transition cursor-pointer"
                              title="Promote this account to Administrator"
                            >
                              Promote 👑
                            </button>
                          )}
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                        </>
                      ) : member.role?.toLowerCase() !== 'admin' ? (
                        <button
                          type="button"
                          onClick={(e) => handlePromoteToAdmin(e, member.id)}
                          className="text-[10px] text-slate-400 hover:text-indigo-600 font-medium px-2 py-0.5 rounded transition cursor-pointer"
                          title="Set as Admin"
                        >
                          Make Admin
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setIsConfirmClearOpen(true)}
                  className="text-xs text-rose-500 hover:text-rose-700 font-medium hover:underline"
                >
                  Clear Local Data
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">Team directory</span>
              )}
              {canManageTeam && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setIsCreatingNew(true)}
                >
                  Add New Person
                </Button>
              )}
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

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Security PIN / Password (Optional)
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  placeholder="e.g. 1234 or secure password"
                  value={newInitialPin}
                  onChange={(e) => setNewInitialPin(e.target.value)}
                  className="w-full px-3 py-2 pr-10 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40 bg-slate-50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                If left blank, a PIN can be created the first time someone switches to this persona.
              </p>
            </div>

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

      {/* PIN Challenge Modal */}
      {authMode === 'enter_pin' && targetMemberForAuth && (
        <Modal
          isOpen={true}
          onClose={() => {
            setAuthMode(null);
            setTargetMemberForAuth(null);
          }}
          maxWidth="sm"
          title={
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Switch Persona: {targetMemberForAuth.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Enter password or PIN to continue
                </p>
              </div>
            </div>
          }
        >
          <form onSubmit={handleVerifyPinSubmit} className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                {getInitials(targetMemberForAuth.name, 'U')}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{targetMemberForAuth.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{targetMemberForAuth.role || 'Team Member'}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Password / PIN Code <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  placeholder="Enter PIN..."
                  autoFocus
                  required
                  className="w-full px-3 py-2 pr-10 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                This persona is password-protected.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAuthMode(null);
                    setTargetMemberForAuth(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  leftIcon={<Check className="w-4 h-4" />}
                >
                  Verify & Switch
                </Button>
              </div>

              {isAdmin && (
                <div className="pt-2 border-t border-dashed border-slate-200 flex justify-center">
                  <button
                    type="button"
                    onClick={handleAdminOverride}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold hover:underline cursor-pointer"
                  >
                    👑 Administrator Override (Switch without PIN)
                  </button>
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* PIN Setup Modal (First-time PIN setup for unprotected persona) */}
      {(authMode === 'setup_pin' || authMode === 'change_pin') && targetMemberForAuth && (
        <Modal
          isOpen={true}
          onClose={() => {
            setAuthMode(null);
            setTargetMemberForAuth(null);
          }}
          maxWidth="sm"
          title={
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {authMode === 'setup_pin'
                    ? `Protect Profile: ${targetMemberForAuth.name}`
                    : `Change PIN: ${targetMemberForAuth.name}`}
                </h3>
                <p className="text-xs text-slate-500">
                  {authMode === 'setup_pin'
                    ? 'Set a PIN to secure this persona'
                    : 'Enter new security PIN or password'}
                </p>
              </div>
            </div>
          }
        >
          <form onSubmit={handleSavePinSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900">
              <p className="font-semibold mb-0.5">
                {authMode === 'setup_pin' ? 'Persona Protection Required' : 'Updating Security PIN'}
              </p>
              <p className="text-[11px] text-amber-800">
                {authMode === 'setup_pin'
                  ? `Create a 4–6 digit PIN or password for ${targetMemberForAuth.name}. You will be asked for this PIN each time you switch to this profile.`
                  : `Enter a new PIN or password to protect ${targetMemberForAuth.name} from unauthorized switching.`}
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                {authMode === 'setup_pin' ? 'New Password / PIN' : 'New Security PIN'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  placeholder="Min. 4 characters (e.g. 1234)"
                  autoFocus
                  required
                  className="w-full px-3 py-2 pr-10 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Confirm Password / PIN <span className="text-red-500">*</span>
              </label>
              <input
                type={showPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Re-enter to confirm"
                required
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40 bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAuthMode(null);
                  setTargetMemberForAuth(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isPinSubmitting}
                leftIcon={<Lock className="w-4 h-4" />}
              >
                {authMode === 'setup_pin' ? 'Save PIN & Switch' : 'Update PIN'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modern In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmClearOpen}
        onClose={() => setIsConfirmClearOpen(false)}
        title="Reset Local Data?"
        message="Are you sure you want to reset all local storage data and start completely fresh? This will clear all offline cached contacts, tasks, and settings."
        confirmText="Reset & Reload"
        cancelText="Keep Data"
        variant="danger"
        icon={<AlertTriangle className="w-6 h-6" />}
        onConfirm={() => {
          db.clearAllLocalData();
          window.location.reload();
        }}
      />
    </>
  );
};

