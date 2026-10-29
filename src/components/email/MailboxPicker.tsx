import React, { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { EmailAccount, listMyEmailAccounts } from '../../lib/emailAccounts';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

export const MailboxPicker: React.FC<Props> = ({ value, onChange }) => {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    const load = () =>
      listMyEmailAccounts()
        .then((all) => alive && setAccounts(all.filter((a) => a.status === 'active')))
        .catch(() => {});
    load();
    window.addEventListener('crm_email_accounts_updated', load);
    return () => {
      alive = false;
      window.removeEventListener('crm_email_accounts_updated', load);
    };
  }, []);

  // Preselect the default (list is ordered default-first) unless the current value is still valid.
  useEffect(() => {
    if (accounts.length && !accounts.some((a) => a.id === value)) onChange(accounts[0].id);
  }, [accounts, value, onChange]);

  if (!accounts.length) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('crm_open_email_settings'))}
        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
      >
        Connect Outlook
      </button>
    );
  }

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="Send from"
      className="text-[11px] font-mono bg-white border border-slate-200 rounded-md px-1.5 py-1 max-w-[16rem] truncate"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.email}
        </option>
      ))}
    </select>
  );
};
