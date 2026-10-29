import { supabase } from './supabase';

export type EmailAccount = {
  id: string;
  email: string;
  display_name: string | null;
  is_default: boolean;
  daily_limit: number;
  sent_today: number;
  sent_today_date: string | null;
  status: 'active' | 'reauth_required' | 'disabled';
  error_message: string | null;
};

// Safe columns only: token columns are not readable from the browser.
const COLUMNS =
  'id,email,display_name,is_default,daily_limit,sent_today,sent_today_date,status,error_message';

function getClient() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function apiPost<T = any>(
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function listMyEmailAccounts(): Promise<EmailAccount[]> {
  const { data, error } = await getClient()
    .from('email_accounts')
    .select(COLUMNS)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmailAccount[];
}

export async function connectOutlook(): Promise<void> {
  const { ok, data } = await apiPost<{ url?: string; error?: string; code?: string }>(
    '/api/email-oauth-start',
  );
  if (!ok || !data.url) throw new Error(data.error || data.code || 'Could not start Outlook sign-in');
  window.location.assign(data.url);
}

export async function setDefaultEmailAccount(id: string): Promise<void> {
  const client = getClient();
  // Partial unique index allows one default per user: clear others first.
  const cleared = await client.from('email_accounts').update({ is_default: false }).neq('id', id);
  if (cleared.error) throw new Error(cleared.error.message);
  const set = await client.from('email_accounts').update({ is_default: true }).eq('id', id);
  if (set.error) throw new Error(set.error.message);
}

export async function disconnectEmailAccount(id: string): Promise<void> {
  const { error } = await getClient().from('email_accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export function sentTodayCount(a: EmailAccount, today = new Date()): number {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return a.sent_today_date === ymd ? a.sent_today : 0;
}
