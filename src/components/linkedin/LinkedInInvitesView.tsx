import React, { useEffect, useMemo, useState } from 'react';
import { Search, Copy, ExternalLink, Plug, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { getLinkedInInvites, setLinkedInInviteStatus } from '../../lib/linkedinService';
import { LinkedInInvite } from '../../types/linkedin';
import { Contact } from '../../types/crm';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';

type Filter = 'all' | 'accepted' | 'pending';

interface Props {
  contacts: Contact[];
  onOpenContact?: (contact: Contact) => void;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'pending', label: 'Not accepted' },
];

export const LinkedInInvitesView: React.FC<Props> = ({ contacts, onOpenContact }) => {
  const { activeMember } = useTeam();
  const { success, error: showError } = useToast();
  const [invites, setInvites] = useState<LinkedInInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  const mcpUrl = `${window.location.origin}/api/mcp`;

  const load = async () => {
    setLoading(true);
    try {
      setInvites(await getLinkedInInvites());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load invites.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const accepted = invites.filter((i) => i.status === 'accepted').length;
  const stats = [
    { label: 'Sent', value: invites.length, tone: 'text-slate-900' },
    { label: 'Accepted', value: accepted, tone: 'text-emerald-600' },
    { label: 'Not accepted', value: invites.length - accepted, tone: 'text-amber-600' },
    { label: 'Accept rate', value: invites.length ? `${Math.round((accepted / invites.length) * 100)}%` : '—', tone: 'text-slate-900' },
  ];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invites.filter(
      (i) =>
        (filter === 'all' || i.status === filter) &&
        (!q || i.name.toLowerCase().includes(q) || (i.company || '').toLowerCase().includes(q))
    );
  }, [invites, filter, query]);

  const toggleStatus = async (invite: LinkedInInvite) => {
    const next = invite.status === 'accepted' ? 'pending' : 'accepted';
    setBusyId(invite.id);
    try {
      const updated = await setLinkedInInviteStatus(invite, next, activeMember?.id ?? null);
      setInvites((list) => list.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e: any) {
      showError('Could not update status', e?.message);
    } finally {
      setBusyId(null);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      success('Connector URL copied');
    } catch {
      showError('Copy failed', 'Select the URL and copy it manually.');
    }
  };

  const openContact = (invite: LinkedInInvite) => {
    const contact = contacts.find((c) => c.id === invite.contact_id);
    if (contact && onOpenContact) onOpenContact(contact);
    else window.open(invite.linkedin_url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-5">
      {/* Connect Claude */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <Plug className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Connect Claude to this CRM</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Claude records every connection request it sends here, and skips people your team already invited.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConnect((v) => !v)}
            className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {showConnect ? 'Hide steps' : 'How to connect'}
          </button>
        </div>
        {showConnect && (
          <div className="mt-4 space-y-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-800">{mcpUrl}</code>
              <button onClick={copyUrl} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="Copy connector URL">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>In Claude, open <b>Settings → Connectors → Add custom connector</b>.</li>
              <li>Name it <b>CRM</b> and paste the URL above.</li>
              <li>Press <b>Connect</b>, sign in with your CRM account and choose <b>Allow</b>.</li>
              <li>In Claude in Chrome, open <b>+ → Connectors</b> and switch <b>CRM</b> on.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
            <div className={`text-xl font-semibold ${s.tone}`}>{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 self-start">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filter === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or company"
            aria-label="Search invites"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <button onClick={load} className="self-start p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-x-auto">
        {loadError ? (
          <p className="p-6 text-sm text-red-600">
            {loadError} If this is a new install, run <code>supabase/claude_mcp.sql</code> in Supabase.
          </p>
        ) : !loading && rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {invites.length === 0 ? 'No invites yet. Connect Claude above and ask it to send connection requests.' : 'No invites match this filter.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Sent</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openContact(i)} className="font-medium text-slate-900 hover:text-blue-600 text-left">
                        {i.name}
                      </button>
                      <a href={i.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${i.name} on LinkedIn`}>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                      </a>
                    </div>
                    {i.headline && <div className="text-xs text-slate-500 truncate max-w-xs">{i.headline}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{i.company || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{format(new Date(i.sent_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggleStatus(i)}
                      disabled={busyId === i.id}
                      title={i.status === 'accepted' ? 'Mark as not accepted' : 'Mark as accepted'}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap disabled:opacity-50 ${
                        i.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${i.status === 'accepted' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {i.status === 'accepted' ? 'Accepted' : 'Not accepted'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                    {i.source === 'claude' ? 'Claude' : i.source}
                    {i.sender?.name ? ` · ${i.sender.name}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
