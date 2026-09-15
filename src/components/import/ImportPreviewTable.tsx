import React from 'react';
import { ParsedContactRow } from '../../types/crm';
import { StatusBadge } from '../ui/Badge';
import { AlertTriangle, XCircle, CheckCircle, Info } from 'lucide-react';

interface ImportPreviewTableProps {
  validRows: ParsedContactRow[];
  duplicateRows: ParsedContactRow[];
  invalidRows: ParsedContactRow[];
  onToggleRow: (type: 'valid' | 'duplicate', index: number) => void;
  onToggleAll: (type: 'valid' | 'duplicate', selected: boolean) => void;
  activeTab: 'valid' | 'duplicate' | 'invalid';
  setActiveTab: (tab: 'valid' | 'duplicate' | 'invalid') => void;
}

export const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  validRows,
  duplicateRows,
  invalidRows,
  onToggleRow,
  onToggleAll,
  activeTab,
  setActiveTab,
}) => {
  const currentRows =
    activeTab === 'valid'
      ? validRows
      : activeTab === 'duplicate'
      ? duplicateRows
      : invalidRows;

  const allSelected =
    currentRows.length > 0 && currentRows.every((r) => r.selected);

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('valid')}
          className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'valid'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>Valid New Contacts</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            {validRows.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('duplicate')}
          className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'duplicate'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Flagged Duplicates</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
            {duplicateRows.length}
          </span>
        </button>

        {invalidRows.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('invalid')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'invalid'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <XCircle className="w-4 h-4 text-rose-500" />
            <span>Invalid Rows</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              {invalidRows.length}
            </span>
          </button>
        )}
      </div>

      {/* Helper Banner for Current Tab */}
      <div className="text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-600">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            {activeTab === 'valid'
              ? 'These rows will be added to the CRM as new contacts.'
              : activeTab === 'duplicate'
              ? 'These rows match an existing email or phone in the database. Check them to import anyway.'
              : 'These rows are missing a required contact name and will be skipped.'}
          </span>
        </div>
        {activeTab !== 'invalid' && currentRows.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleAll(activeTab, !allSelected)}
            className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer shrink-0 ml-2"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/90 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
            <tr>
              {activeTab !== 'invalid' && (
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onToggleAll(activeTab, e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
              )}
              <th className="p-2.5">Row</th>
              <th className="p-2.5">Name</th>
              <th className="p-2.5">Email</th>
              <th className="p-2.5">Phone</th>
              <th className="p-2.5">Company</th>
              <th className="p-2.5">Status</th>
              {activeTab === 'duplicate' && <th className="p-2.5">Reason</th>}
              {activeTab === 'invalid' && <th className="p-2.5">Error</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {currentRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="p-8 text-center text-slate-400 font-medium"
                >
                  No rows in this category.
                </td>
              </tr>
            ) : (
              currentRows.map((row, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    row.selected ? 'bg-indigo-50/20' : ''
                  }`}
                >
                  {activeTab !== 'invalid' && (
                    <td className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(row.selected)}
                        onChange={() => onToggleRow(activeTab, idx)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                  )}
                  <td className="p-2.5 text-slate-400 font-mono">
                    #{row.originalRowIndex || idx + 1}
                  </td>
                  <td className="p-2.5 font-bold text-slate-900">
                    {row.name || <span className="text-rose-500 italic">Empty</span>}
                    {row.title && (
                      <span className="block text-[11px] font-normal text-slate-500">
                        {row.title}
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-slate-600">{row.email || '—'}</td>
                  <td className="p-2.5 text-slate-600">{row.phone || '—'}</td>
                  <td className="p-2.5 text-slate-700 font-medium">
                    {row.company_name || '—'}
                  </td>
                  <td className="p-2.5">
                    <StatusBadge status={row.status || 'new'} size="sm" />
                  </td>
                  {activeTab === 'duplicate' && (
                    <td className="p-2.5 text-amber-700 text-[11px]">
                      {row.duplicateReason}
                    </td>
                  )}
                  {activeTab === 'invalid' && (
                    <td className="p-2.5 text-rose-600 text-[11px] font-medium">
                      {row.invalidReason}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
