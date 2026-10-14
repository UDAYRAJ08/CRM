import React, { useState } from 'react';
import { Download, Puzzle, Link2, LogIn, CheckCircle2, RefreshCw, Copy } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface LinkedInExtensionGuideProps {
  isOpen: boolean;
  onClose: () => void;
  /** Re-checks for the extension; resolves true when it is installed and linked to this site. */
  onCheck: () => Promise<boolean>;
}

const EXTENSION_ZIP_URL = '/linkedin-connector.zip';

const Step: React.FC<{ n: number; icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  n,
  icon,
  title,
  children,
}) => (
  <li className="flex gap-3">
    <div className="w-7 h-7 shrink-0 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
      {n}
    </div>
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
        <span className="text-slate-400">{icon}</span>
        {title}
      </p>
      <div className="text-xs text-slate-600 leading-relaxed">{children}</div>
    </div>
  </li>
);

export const LinkedInExtensionGuide: React.FC<LinkedInExtensionGuideProps> = ({ isOpen, onClose, onCheck }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCheck = async () => {
    setIsChecking(true);
    setNotFound(false);
    const ready = await onCheck();
    setIsChecking(false);
    if (!ready) setNotFound(true);
  };

  const copyExtensionsUrl = async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title="Connect LinkedIn with the Chrome extension"
      description="One-time setup, about a minute. The extension reads the session from your own logged-in Chrome, so there is no password to type and no cookie to copy."
    >
      <ol className="space-y-4">
        <Step n={1} icon={<Download className="w-3.5 h-3.5" />} title="Download and unzip the extension">
          <a
            href={EXTENSION_ZIP_URL}
            download
            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            linkedin-connector.zip
          </a>
        </Step>

        <Step n={2} icon={<Puzzle className="w-3.5 h-3.5" />} title="Load it in Chrome">
          Open{' '}
          <button
            type="button"
            onClick={copyExtensionsUrl}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-[11px] text-slate-700"
            title="Copy to clipboard (Chrome blocks links to this page)"
          >
            chrome://extensions <Copy className="w-3 h-3" />
          </button>{' '}
          {copied && <span className="text-emerald-600 font-semibold">copied, paste it in a new tab. </span>}
          then turn on <strong>Developer mode</strong>, press <strong>Load unpacked</strong> and choose the unzipped
          folder.
        </Step>

        <Step n={3} icon={<Link2 className="w-3.5 h-3.5" />} title="Link this CRM">
          Stay on this CRM tab, click the extension icon (puzzle piece, then pin it) and press{' '}
          <strong>Link this CRM</strong>. Chrome asks you to allow access to this site only.
        </Step>

        <Step n={4} icon={<LogIn className="w-3.5 h-3.5" />} title="Be signed in to LinkedIn">
          In the same Chrome, make sure you are logged in at{' '}
          <a href="https://www.linkedin.com/login" target="_blank" rel="noreferrer" className="text-blue-600 underline">
            linkedin.com
          </a>
          .
        </Step>
      </ol>

      {notFound && (
        <p className="mt-4 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
          Still not detected. Open the extension icon <strong>on this CRM tab</strong>: it should say{' '}
          <strong>Linked</strong> next to this site&apos;s address. If it says <em>Not linked</em>, press{' '}
          <strong>Link this CRM</strong> and allow the Chrome prompt. The address must match exactly (for example{' '}
          <code>localhost</code> and <code>127.0.0.1</code> count as different sites), and the extension must be version
          1.0.1 or newer.
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleCheck}
          disabled={isChecking}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-60"
        >
          {isChecking ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          I did this, check again
        </button>
      </div>
    </Modal>
  );
};
