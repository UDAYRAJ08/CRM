import React, { useState, useRef } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, ImportSummary, ParsedContactRow } from '../../types/crm';
import { parseExcelOrCsv, generateSampleExcelTemplate } from '../../lib/excelParser';
import { db } from '../../lib/supabase';
import { cleanCompanyName, getCompanyUrl } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ImportPreviewTable } from './ImportPreviewTable';
import confetti from 'canvas-confetti';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
} from 'lucide-react';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingContacts: Contact[];
  onImportComplete: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  existingContacts,
  onImportComplete,
}) => {
  const { activeMember } = useTeam();
  const { success, error, info } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'valid' | 'duplicate' | 'invalid'>('valid');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const result = parseExcelOrCsv(buffer, selectedFile.name, existingContacts);
      setSummary(result);

      if (result.validRows.length > 0) {
        setActiveTab('valid');
      } else if (result.duplicateRows.length > 0) {
        setActiveTab('duplicate');
      } else {
        setActiveTab('invalid');
      }
    } catch (err: any) {
      error('Failed to parse file', err.message || 'Please check that the file is a valid Excel (.xlsx, .xls) or CSV.');
      setFile(null);
      setSummary(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleToggleRow = (type: 'valid' | 'duplicate', index: number) => {
    if (!summary) return;
    setSummary((prev) => {
      if (!prev) return null;
      const targetList = type === 'valid' ? [...prev.validRows] : [...prev.duplicateRows];
      targetList[index] = { ...targetList[index], selected: !targetList[index].selected };
      return {
        ...prev,
        [type === 'valid' ? 'validRows' : 'duplicateRows']: targetList,
      };
    });
  };

  const handleToggleAll = (type: 'valid' | 'duplicate', selected: boolean) => {
    if (!summary) return;
    setSummary((prev) => {
      if (!prev) return null;
      const targetList = (type === 'valid' ? prev.validRows : prev.duplicateRows).map((r) => ({
        ...r,
        selected,
      }));
      return {
        ...prev,
        [type === 'valid' ? 'validRows' : 'duplicateRows']: targetList,
      };
    });
  };

  const handleCommitImport = async () => {
    if (!summary) return;

    const selectedValid = summary.validRows.filter((r) => r.selected);
    const selectedDuplicates = summary.duplicateRows.filter((r) => r.selected);
    const totalToInsert = [...selectedValid, ...selectedDuplicates];

    if (totalToInsert.length === 0) {
      info('No rows selected', 'Please select at least one contact to import.');
      return;
    }

    setIsCommitting(true);

    try {
      // Create companies if company_name provided
      const existingCompanies = await db.getCompanies();
      const companyMap = new Map<string, string>();
      existingCompanies.forEach((c) => companyMap.set(c.name.toLowerCase(), c.id));

      const contactsPayload: Partial<Contact>[] = [];

      for (const row of totalToInsert) {
        let companyId = null;
        if (row.company_name) {
          const rawComp = row.company_name.trim();
          const cleanName = cleanCompanyName(rawComp) || rawComp;
          const compKey = cleanName.toLowerCase();
          if (companyMap.has(compKey)) {
            companyId = companyMap.get(compKey);
          } else {
            const websiteCandidate = rawComp.includes('.') ? getCompanyUrl({ name: rawComp }) : undefined;
            const newComp = await db.addCompany({
              name: cleanName,
              website: websiteCandidate,
            });
            companyId = newComp.id;
            companyMap.set(compKey, newComp.id);
          }
        }

        contactsPayload.push({
          name: row.name,
          email: row.email,
          phone: row.phone,
          title: row.title,
          company_id: companyId,
          owner_id: activeMember?.id || null,
          status: row.status || 'new',
          tags: row.tags || ['Imported'],
          custom_fields: row.custom_fields || {},
        });
      }

      const insertedCount = await db.batchInsertContacts(contactsPayload, {
        fileName: summary.fileName,
        uploadedBy: activeMember?.id,
        flaggedCount: summary.duplicateRows.length + summary.invalidRows.length,
      });

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      success(
        'Import Successful!',
        `Added ${insertedCount} contacts to the CRM. Action logged under ${activeMember?.name}.`
      );

      onImportComplete();
      onClose();
      resetState();
    } catch (err: any) {
      error('Import failed', err.message || 'An error occurred while saving imported contacts.');
    } finally {
      setIsCommitting(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setSummary(null);
    setIsProcessing(false);
    setIsCommitting(false);
  };

  const selectedCount = summary
    ? summary.validRows.filter((r) => r.selected).length +
      summary.duplicateRows.filter((r) => r.selected).length
    : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetState();
        onClose();
      }}
      maxWidth="4xl"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Import Contacts from Excel or CSV
            </h3>
            <p className="text-xs text-slate-500">
              Upload spreadsheets with smart column mapping, duplicate detection, and review.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {!summary ? (
          <div className="space-y-4">
            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/20 rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Click to choose a spreadsheet or drag and drop
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports Microsoft Excel (.xlsx, .xls) and standard .csv files
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 pointer-events-none"
              >
                Browse Files
              </Button>
            </div>

            {/* Helper Download Template */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <FileSpreadsheet className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-slate-800">Need a sample file to test?</h5>
                  <p className="text-[11px] text-slate-500">
                    Download our ready-made template with pre-filled test contacts & demo duplicates.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<Download className="w-4 h-4" />}
                onClick={generateSampleExcelTemplate}
                className="text-indigo-600 hover:text-indigo-800 shrink-0"
              >
                Download Sample Excel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File info and summary pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <span className="font-bold text-xs sm:text-sm text-slate-900 block truncate max-w-xs">
                    {summary.fileName}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {summary.totalRows} total rows found in spreadsheet
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetState}
                >
                  Choose Another File
                </Button>
              </div>
            </div>

            {/* Review and Flagging Table */}
            <ImportPreviewTable
              validRows={summary.validRows}
              duplicateRows={summary.duplicateRows}
              invalidRows={summary.invalidRows}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />

            {/* Bottom action confirmation */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <span>Selected to import: </span>
                <strong className="text-slate-900 font-bold">{selectedCount}</strong>
                <span> contacts</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    resetState();
                    onClose();
                  }}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  isLoading={isCommitting}
                  disabled={selectedCount === 0}
                  leftIcon={<Sparkles className="w-4 h-4" />}
                  onClick={handleCommitImport}
                >
                  Confirm & Import ({selectedCount})
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
