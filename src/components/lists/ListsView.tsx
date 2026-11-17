import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ListChecks, RefreshCw } from 'lucide-react';
import { listsDb } from '../../lib/contactLists';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import type { ContactList } from '../../types/crm';

export const ListsView: React.FC<{ onOpenList: (id: string) => void }> = ({ onOpenList }) => {
  const { teamMembers } = useTeam();
  const { error } = useToast();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setLists(await listsDb.getLists());
    } catch (e: any) {
      error('Could not load lists', e.message);
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = lists.filter((l) => showArchived || !l.archived);
  const memberName = (id?: string | null) => teamMembers.find((m) => m.id === id)?.name || '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lists</h1>
          <p className="text-sm text-slate-500 mt-1">Groups of contacts you can hand out to the team.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <button
            onClick={load}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            title="Refresh lists"
            aria-label="Refresh lists"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ListChecks className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">{isLoading ? 'Loading lists…' : 'No lists yet'}</h4>
            {!isLoading && (
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Import a spreadsheet with "Save as list", or select contacts on the Contacts page and choose "Add to list".
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">List</th>
                  <th className="p-3.5">Created by</th>
                  <th className="p-3.5">Created</th>
                  <th className="p-3.5 text-right">Contacts</th>
                  <th className="p-3.5 text-right">Unassigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((l) => (
                  <tr key={l.id} onClick={() => onOpenList(l.id)} className="hover:bg-slate-50/60 transition cursor-pointer">
                    <td className="p-3.5 font-bold text-slate-900">
                      {/* Click bubbles to the row; the button gives keyboard users a focus target. */}
                      <button type="button" className="flex items-center gap-2 text-left">
                        <ListChecks className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>{l.name}</span>
                        {l.archived && <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Archived</span>}
                      </button>
                    </td>
                    <td className="p-3.5 text-slate-700">{memberName(l.created_by)}</td>
                    <td className="p-3.5 text-slate-500">
                      {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                    </td>
                    <td className="p-3.5 text-right tabular-nums text-slate-900 font-semibold">{l.total}</td>
                    <td className="p-3.5 text-right tabular-nums">
                      <span className={l.unassigned > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}>{l.unassigned}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
