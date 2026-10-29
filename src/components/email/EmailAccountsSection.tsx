import React, { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  EmailAccount,
  listMyEmailAccounts,
  connectOutlook,
  setDefaultEmailAccount,
  disconnectEmailAccount,
  sentTodayCount,
} from '../../lib/emailAccounts';

const notify = () => window.dispatchEvent(new CustomEvent('crm_email_accounts_updated'));

const STATUS_CHIP: Record<EmailAccount['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reauth_required: 'bg-amber-50 text-amber-800 border-amber-200',
  disabled: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const EmailAccountsSection: React.FC = () => {
  const { success, error } = useToast();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [removing, setRemoving] = useState<EmailAccount | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setAccounts(await listMyEmailAccounts());
    } catch (e: any) {
      error('Could not load mailboxes', e.message);
    } finally {
      setLoaded(true);
    }
  }, [error]);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async () => {
    try {
      await connectOutlook();
    } catch (e: any) {
      error('Could not connect Outlook', e.message);
    }
  };

  const makeDefault = async (a: EmailAccount) => {
    try {
      await setDefaultEmailAccount(a.id);
      await load();
      notify();
    } catch (e: any) {
      error('Could not change default', e.message);
    }
  };

  const disconnect = async () => {
    if (!removing) return;
    try {
      await disconnectEmailAccount(removing.id);
      success('Mailbox disconnected', removing.email);
      await load();
      notify();
    } catch (e: any) {
      error('Could not disconnect', e.message);
    }
  };

  return (
    <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 text-indigo-600" />
          Email Accounts
        </h4>
        {isSupabaseConfigured && (
          <Button type="button" variant="primary" size="sm" onClick={connect}>
            Connect Outlook
          </Button>
        )}
      </div>

      {!isSupabaseConfigured ? (
        <p className="text-[11px] text-slate-500">Mailboxes need Supabase sign-in.</p>
      ) : loaded && accounts.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          No mailbox connected. Connect Outlook to send email from your own address.
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{a.email}</div>
                <div className="text-[11px] text-slate-500">
                  {sentTodayCount(a)}/{a.daily_limit} sent today
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_CHIP[a.status]}`}>
                  {a.status === 'reauth_required' ? 'Reconnect needed' : a.status === 'active' ? 'Active' : 'Disabled'}
                </span>
                {a.is_default ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                    Default
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => makeDefault(a)}>
                    Make default
                  </Button>
                )}
                {a.status === 'reauth_required' && (
                  <Button type="button" variant="outline" size="sm" onClick={connect}>
                    Reconnect
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setRemoving(a)}>
                  Disconnect
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={disconnect}
        title="Disconnect mailbox?"
        message={`${removing?.email ?? ''} will no longer be used to send email from the CRM.`}
        confirmText="Disconnect"
        variant="danger"
      />
    </div>
  );
};
