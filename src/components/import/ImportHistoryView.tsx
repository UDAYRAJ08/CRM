import React, { useState, useEffect } from 'react';
import { ImportLog } from '../../types/crm';
import { db } from '../../lib/supabase';
import { FileSpreadsheet, User, Calendar, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const ImportHistoryView: React.FC<{ onRefreshNeeded?: () => void }> = () => {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await db.getImportLogs();
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Imports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Every spreadsheet uploaded to the CRM, and who uploaded it.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          title="Refresh logs"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No imports logged yet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Upload an Excel (.xlsx) or CSV file from the header to automatically log and deduplicate contacts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Spreadsheet Name</th>
                  <th className="p-3.5">Uploaded By</th>
                  <th className="p-3.5">Imported Rows</th>
                  <th className="p-3.5">Flagged / Duplicates</th>
                  <th className="p-3.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition">
                    <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>{log.file_name}</span>
                    </td>
                    <td className="p-3.5 text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{log.uploader?.name || 'Team Member'}</span>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {log.rows_imported} added
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        {log.rows_flagged} flagged
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500">
                      {log.created_at ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true }) : '—'}
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
