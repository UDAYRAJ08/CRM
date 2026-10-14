import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { sendEmailDirectly } from '../../lib/emailService';
import {
  X,
  Mail,
  UserPlus,
  Copy,
  Check,
  Send,
  Sparkles,
  Link,
  ShieldCheck,
  Clock,
  Trash2,
} from 'lucide-react';
import { Button } from '../ui/Button';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PendingInvite {
  id: string;
  name: string;
  email: string;
  role: string;
  sentAt: string;
  status: 'sent' | 'copied';
}

const STORAGE_INVITES_KEY = 'crm_sent_invitations';

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose }) => {
  const { activeMember } = useTeam();
  const { user } = useAuth();
  const { success, error, info } = useToast();
  const { canManageTeam, isAdmin } = usePermissions();

  const activeSenderEmail = (activeMember?.email || user?.email || '').trim();
  const activeSenderName = (activeMember?.name || user?.user_metadata?.full_name || 'Administrator').trim();

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Sales Representative');
  const [customNote, setCustomNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'invite' | 'history'>('invite');
  const [invitesHistory, setInvitesHistory] = useState<PendingInvite[]>([]);

  // Load invites history
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_INVITES_KEY);
      if (stored) {
        setInvitesHistory(JSON.parse(stored));
      }
    } catch {}
  }, [isOpen]);

  const saveInvites = (list: PendingInvite[]) => {
    setInvitesHistory(list);
    localStorage.setItem(STORAGE_INVITES_KEY, JSON.stringify(list));
  };

  if (!isOpen) return null;

  const orgName = localStorage.getItem('crm_organization_name') || 'Nexus CRM';

  // Construct invite URL
  const generateInviteUrl = (name: string, email: string, role: string) => {
    const origin = window.location.origin;
    const params = new URLSearchParams({
      invite: 'true',
      email: email.trim(),
      name: name.trim(),
      role: role.trim(),
      org: orgName,
    });
    return `${origin}?${params.toString()}`;
  };

  const currentInviteUrl = generateInviteUrl(
    inviteName || 'Team Member',
    inviteEmail || 'colleague@company.com',
    inviteRole
  );

  // Copy link to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentInviteUrl);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2500);
      success('Link Copied!', 'Invitation link copied to clipboard.');

      if (inviteEmail) {
        const newRecord: PendingInvite = {
          id: crypto.randomUUID(),
          name: inviteName.trim() || 'Colleague',
          email: inviteEmail.trim(),
          role: inviteRole,
          sentAt: new Date().toISOString(),
          status: 'copied',
        };
        saveInvites([newRecord, ...invitesHistory.filter((i) => i.email !== inviteEmail.trim())]);
      }
    } catch (err) {
      error('Copy Failed', 'Please manually copy the link from the field.');
    }
  };

  // Send Direct Email Invitation
  const handleSendEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTeam) {
      error('Access Restricted', 'Only Administrators have permission to invite new team members.');
      return;
    }
    const email = inviteEmail.trim();
    const name = inviteName.trim();

    if (!email) {
      error('Email Required', 'Please provide a recipient email address.');
      return;
    }

    const inviteLink = generateInviteUrl(name || 'Colleague', email, inviteRole);
    const senderName = activeSenderName || 'A team member';

    const emailSubject = `Invitation: Join ${senderName} on ${orgName}`;
    const emailBody = `Hi ${name || 'there'},\n\n${senderName} has invited you to collaborate on ${orgName} as a ${inviteRole}.\n\nClick the link below to accept your invitation and activate your CRM workspace account:\n${inviteLink}\n\n${customNote ? `Note from ${senderName}:\n"${customNote}"\n\n` : ''}Best regards,\nThe ${orgName} Team`;

    setIsSending(true);
    try {
      const res = await sendEmailDirectly({
        recipientEmail: email,
        recipientName: name || 'Colleague',
        subject: emailSubject,
        body: emailBody,
        senderEmail: activeSenderEmail || undefined,
        senderName: senderName,
        senderId: activeMember?.id,
      });

      if (res.success) {
        success('Invitation Dispatched!', `An invite email was sent to ${email}`);
        const newRecord: PendingInvite = {
          id: crypto.randomUUID(),
          name: name || 'Colleague',
          email: email,
          role: inviteRole,
          sentAt: new Date().toISOString(),
          status: 'sent',
        };
        saveInvites([newRecord, ...invitesHistory.filter((i) => i.email !== email)]);
        setInviteEmail('');
        setInviteName('');
        setCustomNote('');
      } else {
        error('Delivery Notice', res.message || 'Could not send direct email. You can copy the invite link instead.');
      }
    } catch (err: any) {
      error('Invite Error', err.message || 'Failed to deliver invitation.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteHistory = (id: string) => {
    const updated = invitesHistory.filter((i) => i.id !== id);
    saveInvites(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#1e4634] text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Invite Team Members
              </h3>
              <p className="text-xs text-emerald-200/80 mt-0.5">
                Share access to {orgName} with colleagues and partners
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('invite')}
            className={`flex-1 py-2.5 px-4 text-center border-b-2 transition cursor-pointer ${
              activeTab === 'invite'
                ? 'border-[#1e4634] text-[#1e4634] bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            New Invitation
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 px-4 text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-[#1e4634] text-[#1e4634] bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Sent Invites ({invitesHistory.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {activeTab === 'invite' ? (
            <form onSubmit={handleSendEmailInvite} className="space-y-4">
              {!canManageTeam && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Only Workspace Administrators can invite new members and manage workspace roles.</span>
                </div>
              )}
              {/* Recipient Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Colleague's Full Name
                  </label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1e4634] focus:ring-1 focus:ring-[#1e4634]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1e4634] focus:ring-1 focus:ring-[#1e4634]"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assign Workspace Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#1e4634] focus:ring-1 focus:ring-[#1e4634]"
                >
                  <option value="Sales Representative">Sales Representative (Deals, Outreach & Contacts)</option>
                  <option value="Account Executive">Account Executive (High-Value Pipeline)</option>
                  <option value="Sales Manager">Sales Manager (Team & Analytics Oversight)</option>
                  <option value="Outreach Specialist">Outreach Specialist (LinkedIn & Automated Campaigns)</option>
                  <option value="Workspace Admin">Workspace Admin (Full System Access)</option>
                </select>
              </div>

              {/* Custom Personal Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Personal Message (Optional)
                </label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="e.g. Excited to have you test our new outreach tool!"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1e4634] focus:ring-1 focus:ring-[#1e4634]"
                />
              </div>

              {/* Instant Shareable Link Box */}
              <div className="pt-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Or share invite link directly
                </label>
                <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex-1 px-2.5 py-1 text-xs text-slate-600 font-mono truncate select-all">
                    {currentInviteUrl}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-[#1e4634] font-semibold text-xs rounded-lg transition flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
                  >
                    {hasCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Instant access via secure token</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    Close
                  </Button>
                  <button
                    type="submit"
                    disabled={isSending || !inviteEmail.trim() || !canManageTeam}
                    className="py-2 px-4 bg-[#1e4634] hover:bg-[#163829] active:bg-[#122e22] text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSending ? (
                      <span>Sending Email...</span>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Email Invite</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {invitesHistory.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <UserPlus className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-600">No invites sent yet</p>
                  <p className="mt-0.5">Use the "New Invitation" tab to invite team members.</p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {invitesHistory.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{inv.name}</div>
                        <div className="text-slate-500 text-[11px]">
                          {inv.email} • <span className="text-[#1e4634] font-medium">{inv.role}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(inv.sentAt).toLocaleDateString()} at{' '}
                          {new Date(inv.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const link = generateInviteUrl(inv.name, inv.email, inv.role);
                            navigator.clipboard.writeText(link);
                            success('Copied', `Invite link for ${inv.email} copied!`);
                          }}
                          className="p-1.5 text-slate-500 hover:text-[#1e4634] hover:bg-white rounded-lg border border-slate-200 transition cursor-pointer"
                          title="Copy join link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(inv.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Remove from history"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
