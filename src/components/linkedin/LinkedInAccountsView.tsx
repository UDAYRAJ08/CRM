import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, Clock,
  RefreshCw, Trash2, Zap, XCircle, Eye, EyeOff, Info,
  ExternalLink, Camera, Edit3, Check, X, Sparkles, Puzzle
} from 'lucide-react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import {
  getLinkedInAccounts,
  connectLinkedInCookie,
  disconnectLinkedInAccount,
  deleteLinkedInAccount,
  refreshLinkedInAccount,
  updateLinkedInProfile,
  updateLinkedInLimits,
} from '../../lib/linkedinService';
import { ConfirmModal } from '../ui/ConfirmModal';
import { LinkedInAccount, LinkedInAccountStatus } from '../../types/linkedin';
import { Linkedin } from './LinkedInIcon';
import { parseLinkedInCookieInput } from './LinkedInAgentModal';
import { LinkedInExtensionGuide } from './LinkedInExtensionGuide';
import {
  ExtensionBridgeError,
  pingExtension,
  requestLinkedInSession,
} from '../../lib/linkedinExtensionBridge';

const statusConfig: Record<LinkedInAccountStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active: {
    label: 'Connected',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  expired: {
    label: 'Cookie Expired',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  error: {
    label: 'Error',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  disconnected: {
    label: 'Disconnected',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

interface LinkedInAccountsViewProps {
  onOpenAgent?: () => void;
}

export const LinkedInAccountsView: React.FC<LinkedInAccountsViewProps> = ({ onOpenAgent }) => {
  const { activeMember } = useTeam();
  const { success, error: showError, info } = useToast();

  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [showCookie, setShowCookie] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // 1-Click Browser login state
  const [isLaunchingBrowser, setIsLaunchingBrowser] = useState(false);

  // Chrome extension connect (HeyReach-style)
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [isConnectingExtension, setIsConnectingExtension] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [cookieInputTab, setCookieInputTab] = useState<'browser' | 'json' | 'fields'>('browser');
  const [jsonCookieInput, setJsonCookieInput] = useState('');
  const [parsedSummary, setParsedSummary] = useState<string | null>(null);

  // Connect form state
  const [liAt, setLiAt] = useState('');
  const [jsessionId, setJsessionId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [customProfileUrl, setCustomProfileUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Edit photo modal state
  const [editingAccount, setEditingAccount] = useState<LinkedInAccount | null>(null);
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editProfileUrl, setEditProfileUrl] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete account confirmation state
  const [accountToDelete, setAccountToDelete] = useState<LinkedInAccount | null>(null);

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getLinkedInAccounts();
      setAccounts(data);
    } catch (e: any) {
      showError('Load failed', e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Watch for expired accounts and show browser notification
  useEffect(() => {
    const expired = accounts.filter((a) => a.status === 'expired');
    if (expired.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
      expired.forEach((a) => {
        new Notification('⚠️ LinkedIn Cookie Expired', {
          body: `${a.linkedin_name || 'Your LinkedIn account'}'s session has expired. Please reconnect.`,
          icon: '/favicon.ico',
        });
      });
    }
  }, [accounts]);

  /** True when the extension is installed and linked to this CRM site. */
  const checkExtension = useCallback(async (): Promise<boolean> => {
    const status = await pingExtension(900);
    setExtensionStatus(status.installed ? 'ready' : 'missing');
    return status.installed;
  }, []);

  useEffect(() => {
    checkExtension();
    // The user links the extension in another UI, so re-check when they come back to this tab.
    const onFocus = () => { checkExtension(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkExtension]);

  /** Persist a captured LinkedIn session (from the extension or the dev-only Chrome launcher). */
  const saveCapturedSession = async (data: {
    liAt: string;
    csrfToken: string;
    rawCookie?: string;
    profile?: { name?: string; publicIdentifier?: string; avatarUrl?: string } | null;
  }) => {
    if (!activeMember?.id) throw new Error('No active persona/team member selected.');

    // Keep localStorage primed for immediate Vibe Prospecting use
    localStorage.setItem('crm_custom_li_at', data.liAt);
    if (data.csrfToken) localStorage.setItem('crm_custom_jsessionid', data.csrfToken);
    if (data.rawCookie) localStorage.setItem('crm_custom_raw_cookie', data.rawCookie);
    localStorage.setItem('crm_linkedin_credential_mode', 'saved');

    const profileName = data.profile?.name || activeMember.name || 'LinkedIn User';
    const profileUrl = data.profile?.publicIdentifier
      ? `https://www.linkedin.com/in/${data.profile.publicIdentifier}`
      : undefined;

    const updated = await connectLinkedInCookie(
      activeMember.id,
      data.liAt,
      data.csrfToken || '',
      data.profile?.avatarUrl,
      profileUrl,
      profileName
    );

    await loadAccounts();
    setShowConnectForm(false);
    setLiAt('');
    setJsessionId('');
    setJsonCookieInput('');
    setParsedSummary(null);

    if (updated.status === 'expired') {
      showError(
        'Session not accepted',
        'LinkedIn rejected this session. Make sure you are logged in to LinkedIn in this browser and try again.'
      );
      return;
    }

    success('LinkedIn Connected! 🎉', `Connected as ${updated.linkedin_name || profileName}. Ready for Vibe Prospecting!`);
    if (onOpenAgent) {
      info('Ready for Vibe Prospecting', 'Click "Launch Vibe Prospecting" to start prospecting leads.');
    }
  };

  /** One-click connect through the Chrome extension (works locally and in production). */
  const handleExtensionConnect = async () => {
    if (!activeMember?.id) {
      showError('Error', 'No active persona/team member selected.');
      return;
    }

    setIsConnectingExtension(true);
    try {
      const session = await requestLinkedInSession();
      setExtensionStatus('ready');
      setShowExtensionGuide(false);
      await saveCapturedSession({
        liAt: session.liAt,
        csrfToken: session.jsessionId,
        rawCookie: session.rawCookie,
        profile: session.profile,
      });
    } catch (e: any) {
      if (e instanceof ExtensionBridgeError && e.code === 'EXTENSION_NOT_DETECTED') {
        setExtensionStatus('missing');
        setShowExtensionGuide(true);
      } else if (e instanceof ExtensionBridgeError && e.code === 'NOT_LOGGED_IN') {
        window.open('https://www.linkedin.com/login', '_blank', 'noopener');
        showError('Sign in to LinkedIn first', `${e.message} We opened LinkedIn in a new tab; press Connect again once you are signed in.`);
      } else {
        showError('Connection failed', e?.message || 'Could not read the LinkedIn session.');
      }
    } finally {
      setIsConnectingExtension(false);
    }
  };

  /** Dev-server only: launches Chrome on this machine and captures the session. Not available in production. */
  const handleLaunchBrowserLogin = async () => {
    if (!activeMember?.id) {
      showError('Error', 'No active persona/team member selected.');
      return;
    }

    setIsLaunchingBrowser(true);
    info(
      'Opening Chrome...',
      'A real Chrome window is opening. Log in to LinkedIn; the session is captured once you reach your feed.'
    );

    try {
      const res = await fetch('/api/linkedin/launch-browser-login', { method: 'POST' });
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      if (!isJson) {
        throw new Error('This launcher only exists in the local dev server. Use the Chrome extension instead.');
      }
      const data = await res.json();

      if (data.success && data.liAt) {
        await saveCapturedSession({
          liAt: data.liAt,
          csrfToken: data.csrfToken || '',
          rawCookie: data.rawCookie,
          profile: data.profile,
        });
      } else {
        showError('Login Incomplete', data.error || 'Could not capture session from browser.');
      }
    } catch (e: any) {
      showError('Browser Error', e.message || 'Could not launch browser.');
    } finally {
      setIsLaunchingBrowser(false);
    }
  };

  /** Parse and auto-apply Cookie-Editor JSON array */
  const handleApplyJsonCookies = (jsonStr: string) => {
    setJsonCookieInput(jsonStr);
    const parsed = parseLinkedInCookieInput(jsonStr, jsessionId);
    if (parsed) {
      setLiAt(parsed.liAt);
      setJsessionId(parsed.jsessionId);
      if (parsed.rawCookie) {
        localStorage.setItem('crm_custom_raw_cookie', parsed.rawCookie);
      }
      localStorage.setItem('crm_custom_li_at', parsed.liAt);
      localStorage.setItem('crm_custom_jsessionid', parsed.jsessionId);
      const keySummary = parsed.detectedKeys.slice(0, 5).join(', ') + (parsed.detectedKeys.length > 5 ? '...' : '');
      setParsedSummary(`Parsed ${parsed.count} cookies (${keySummary})`);
    } else if (!jsonStr.trim()) {
      setParsedSummary(null);
    }
  };

  const handleConnect = async () => {
    if (!activeMember?.id) return showError('Error', 'No active team member found');
    const cleanLiAt = liAt.trim().replace(/^li_at=/, '').replace(/^["']|["']$/g, '');
    const cleanJsessionId = jsessionId.trim().replace(/^JSESSIONID=/, '').replace(/^["']|["']$/g, '') || '';

    if (!cleanLiAt) return showError('Missing field', 'Please enter your li_at cookie');
    if (!cleanJsessionId) return showError('Missing field', 'Please enter your JSESSIONID');

    setIsConnecting(true);
    try {
      // Keep localStorage primed for Vibe Prospecting
      localStorage.setItem('crm_custom_li_at', cleanLiAt);
      localStorage.setItem('crm_custom_jsessionid', cleanJsessionId);
      localStorage.setItem('crm_linkedin_credential_mode', 'saved');

      const updated = await connectLinkedInCookie(
        activeMember.id,
        cleanLiAt,
        cleanJsessionId,
        customAvatarUrl.trim() || undefined,
        customProfileUrl.trim() || undefined,
        customName.trim() || undefined
      );

      if (updated.status === 'expired') {
        showError(
          'Session Expired or Invalid',
          'LinkedIn reported this session cookie as invalid or expired. Please make sure you are actively logged in to LinkedIn in your browser and copy fresh li_at and JSESSIONID cookies.'
        );
      } else {
        success(
          'LinkedIn Connected! 🎉',
          updated.linkedin_name
            ? `Connected as ${updated.linkedin_name}. Profile synchronized and ready for Vibe Prospecting!`
            : 'Your LinkedIn account has been connected and is ready for Vibe Prospecting.'
        );
      }

      setShowConnectForm(false);
      setLiAt('');
      setJsessionId('');
      setJsonCookieInput('');
      setParsedSummary(null);
      setCustomName('');
      setCustomAvatarUrl('');
      setCustomProfileUrl('');
      await loadAccounts();

      // Request notification permission for cookie expiry alerts
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch (e: any) {
      showError('Connection failed', e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefresh = async (accountId: string) => {
    setRefreshingId(accountId);
    try {
      const updated = await refreshLinkedInAccount(accountId);
      success('Profile Refreshed 🔄', `Synced latest LinkedIn details for ${updated.linkedin_name || 'account'}.`);
      await loadAccounts();
    } catch (e: any) {
      showError('Refresh failed', e.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleOpenEdit = (acc: LinkedInAccount) => {
    setEditingAccount(acc);
    setEditAvatarUrl(acc.linkedin_avatar_url || '');
    setEditProfileUrl(acc.linkedin_profile_url || '');
  };

  const handleSaveEdit = async () => {
    if (!editingAccount) return;
    setIsSavingEdit(true);
    try {
      await updateLinkedInProfile(editingAccount.id, {
        linkedin_avatar_url: editAvatarUrl.trim() || null,
        linkedin_profile_url: editProfileUrl.trim() || null,
      });
      success('Profile Updated', 'Profile picture and link updated.');
      setEditingAccount(null);
      await loadAccounts();
    } catch (e: any) {
      showError('Update failed', e.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) return;
    try {
      await deleteLinkedInAccount(accountToDelete.id);
      success('Profile & Cookies Deleted', 'LinkedIn profile and stored session cookies have been completely removed.');
      setAccountToDelete(null);
      setShowConnectForm(false);
      await loadAccounts();
    } catch (e: any) {
      showError('Delete failed', e.message);
    }
  };

  const handleDisconnect = async (accountId: string, name?: string | null) => {
    if (!confirm(`Disconnect ${name || 'this LinkedIn account'}? Active campaigns will be paused.`)) return;
    try {
      await disconnectLinkedInAccount(accountId);
      success('Disconnected', 'LinkedIn session disconnected.');
      await loadAccounts();
    } catch (e: any) {
      showError('Failed to disconnect', e.message);
    }
  };

  const myAccount = accounts.find((a) => a.team_member_id === activeMember?.id);
  const otherAccounts = accounts.filter((a) => a.team_member_id !== activeMember?.id);

  return (
    <div className="space-y-6">
      <LinkedInExtensionGuide
        isOpen={showExtensionGuide}
        onClose={() => setShowExtensionGuide(false)}
        onCheck={async () => {
          const ready = await checkExtension();
          if (ready) {
            setShowExtensionGuide(false);
            handleExtensionConnect();
          }
          return ready;
        }}
      />

      {/* 1-Click Connect & Instructions Banner */}
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/80 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Linkedin className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">
              LinkedIn Session Connection &amp; Vibe Prospecting
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
              Connect your LinkedIn account here to immediately sync your profile and use <strong>Vibe Prospecting</strong> to autonomously discover and connect with 2nd-degree leads.
            </p>
            <button
              type="button"
              onClick={() => (extensionStatus === 'ready' ? checkExtension() : setShowExtensionGuide(true))}
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-0.5 border transition ${
                extensionStatus === 'ready'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  extensionStatus === 'ready' ? 'bg-emerald-500' : extensionStatus === 'checking' ? 'bg-slate-400 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {extensionStatus === 'ready'
                ? 'Chrome extension connected'
                : extensionStatus === 'checking'
                  ? 'Checking for Chrome extension...'
                  : 'Chrome extension not detected, set it up'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExtensionConnect}
            disabled={isConnectingExtension}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition disabled:opacity-60"
          >
            {isConnectingExtension ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Reading your session...
              </>
            ) : (
              <>
                <Puzzle className="w-3.5 h-3.5" />
                Connect with Chrome Extension
              </>
            )}
          </button>
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={handleLaunchBrowserLogin}
              disabled={isLaunchingBrowser}
              title="Dev server only: opens Chrome on this machine"
              className="px-3 py-2 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-slate-500 font-semibold text-[11px] transition disabled:opacity-60"
            >
              {isLaunchingBrowser ? 'Waiting for sign-in...' : 'Dev: open Chrome'}
            </button>
          )}
          {!showConnectForm && (
            <button
              onClick={() => setShowConnectForm(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition"
            >
              Manual Cookies
            </button>
          )}
        </div>
      </div>

      {/* My Account Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              {activeMember?.name ? `${activeMember.name}'s LinkedIn Account` : 'My LinkedIn Account'}
            </h2>
            <p className="text-xs text-slate-500">
              Active Persona: <strong className="text-blue-600 font-semibold">{activeMember?.name || 'Unknown'}</strong> ({activeMember?.role || 'Member'})
            </p>
          </div>
          <div className="flex items-center gap-2">
            {myAccount && myAccount.status === 'active' && onOpenAgent && (
              <button
                onClick={onOpenAgent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Launch Vibe Prospecting
              </button>
            )}
            {myAccount ? (
              <>
                <button
                  onClick={() => setShowConnectForm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition shadow-xs"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Switch / Change Account
                </button>
                <button
                  onClick={() => setAccountToDelete(myAccount)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Profile
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowConnectForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Connect Account
              </button>
            )}
          </div>
        </div>

        {/* Connect Form */}
        {showConnectForm && (
          <div className="mb-4 rounded-2xl border-2 border-blue-400/40 bg-blue-50/40 p-5 sm:p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Linkedin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {myAccount
                      ? `Switch / Replace LinkedIn Account for ${activeMember?.name || 'Active Persona'}`
                      : `Connect LinkedIn for ${activeMember?.name || 'Active Persona'}`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {myAccount
                      ? `Connecting a new account will replace (${myAccount.linkedin_name || 'LinkedIn User'}) and update credentials for Vibe Prospecting.`
                      : `Attaching live LinkedIn session to persona: ${activeMember?.name}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowConnectForm(false); setLiAt(''); setJsessionId(''); setJsonCookieInput(''); setParsedSummary(null); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* METHOD 1: Chrome extension one-click connect (Hero Card) */}
            <div className="rounded-xl bg-emerald-600 text-white p-4 sm:p-5 shadow-sm space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-emerald-100 text-[10px] font-bold uppercase tracking-wider">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    Recommended Method
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-white">
                    One-click connect with the Chrome extension
                  </h4>
                  <p className="text-xs text-emerald-100/90 leading-relaxed max-w-xl">
                    The extension reads the LinkedIn session from your own logged-in Chrome and connects it here, including your profile picture and headline. No password and no cookie copying.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExtensionConnect}
                  disabled={isConnectingExtension}
                  className="px-5 py-3 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 active:scale-95 font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition disabled:opacity-60 shrink-0"
                >
                  {isConnectingExtension ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                      Reading session...
                    </>
                  ) : (
                    <>
                      <Puzzle className="w-4 h-4 text-emerald-600" />
                      Connect with Extension
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Or Connect Manually via Cookies
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Tabs for manual input: JSON vs Fields */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setCookieInputTab('json')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  cookieInputTab === 'json'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                📋 Paste Cookie-Editor JSON (Fastest)
              </button>
              <button
                type="button"
                onClick={() => setCookieInputTab('fields')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  cookieInputTab === 'fields'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                ✏️ Manual li_at &amp; JSESSIONID Fields
              </button>
            </div>

            {cookieInputTab === 'json' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Paste Full Cookie-Editor Export JSON:
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Cookie-Editor Extension &gt; Export &gt; JSON
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={jsonCookieInput}
                  onChange={(e) => handleApplyJsonCookies(e.target.value)}
                  placeholder={`[\n  { "name": "li_at", "value": "AQED..." },\n  { "name": "JSESSIONID", "value": "\\"ajax:...\\"" }\n]`}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                {parsedSummary && (
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      {parsedSummary}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700">
                      li_at: {liAt.slice(0, 14)}...
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    li_at Cookie <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showCookie ? 'text' : 'password'}
                      value={liAt}
                      onChange={(e) => setLiAt(e.target.value)}
                      placeholder="AQEDAU..."
                      className="w-full px-3 py-2 pr-10 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCookie((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                    JSESSIONID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type={showCookie ? 'text' : 'password'}
                    value={jsessionId}
                    onChange={(e) => setJsessionId(e.target.value)}
                    placeholder={`"ajax:1234567890123456789"`}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-slate-50"
                  />
                </div>
              </div>
            )}

            {/* Optional Profile Info / Overrides */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <span>{showAdvanced ? 'Hide optional photo & link overrides' : '+ Add custom profile photo or link (optional)'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                      Account / Display Name (optional - auto-synced from LinkedIn, or enter manually)
                    </label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. John Doe (auto-synced if left blank)"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                      Profile Picture URL (auto-fetched, or paste custom image link)
                    </label>
                    <input
                      type="url"
                      value={customAvatarUrl}
                      onChange={(e) => setCustomAvatarUrl(e.target.value)}
                      placeholder="https://... (image URL)"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                      LinkedIn Profile URL
                    </label>
                    <input
                      type="url"
                      value={customProfileUrl}
                      onChange={(e) => setCustomProfileUrl(e.target.value)}
                      placeholder="https://www.linkedin.com/in/username"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1 border-t border-slate-100">
              <button
                onClick={handleConnect}
                disabled={isConnecting || !liAt}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition shadow-sm"
              >
                {isConnecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {isConnecting ? 'Verifying & Fetching Profile...' : myAccount ? 'Update & Switch Account' : 'Connect & Sync Profile'}
              </button>
              <button
                onClick={() => { setShowConnectForm(false); setLiAt(''); setJsessionId(''); setJsonCookieInput(''); setParsedSummary(null); }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {myAccount ? (
          <AccountCard
            account={myAccount}
            isOwn
            isRefreshing={refreshingId === myAccount.id}
            onRefresh={() => handleRefresh(myAccount.id)}
            onEdit={() => handleOpenEdit(myAccount)}
            onDisconnect={() => handleDisconnect(myAccount.id, myAccount.linkedin_name)}
            onReconnect={() => setShowConnectForm(true)}
            onDelete={() => setAccountToDelete(myAccount)}
            onOpenAgent={onOpenAgent}
          />
        ) : !showConnectForm ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <Linkedin className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">No LinkedIn account connected</p>
            <p className="text-xs text-slate-500 mt-1">Connect your account with the Chrome extension or cookies to start Vibe Prospecting and outreach</p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={handleExtensionConnect}
                disabled={isConnectingExtension}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-60"
              >
                {isConnectingExtension ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Puzzle className="w-3.5 h-3.5" />}
                Connect with Chrome Extension
              </button>
              <button
                onClick={() => setShowConnectForm(true)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
              >
                Enter Cookies Manually
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Team Members' Accounts */}
      {otherAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Team Accounts</h2>
          <div className="space-y-3">
            {otherAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isOwn={false}
                isRefreshing={refreshingId === account.id}
                onRefresh={() => handleRefresh(account.id)}
                onEdit={() => handleOpenEdit(account)}
                onDisconnect={() => {}}
                onReconnect={() => {}}
                onDelete={() => setAccountToDelete(account)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Edit Profile Details Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">LinkedIn Profile Picture & Info</h3>
              </div>
              <button
                onClick={() => setEditingAccount(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Preview */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/70">
              <div className="relative shrink-0">
                {editAvatarUrl ? (
                  <img
                    src={editAvatarUrl}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-xs"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-base">
                    {editingAccount.linkedin_name?.charAt(0) || 'L'}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center border border-white">
                  <Linkedin className="w-2.5 h-2.5" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">{editingAccount.linkedin_name || 'LinkedIn User'}</p>
                <p className="text-[11px] text-slate-400 truncate">{editingAccount.linkedin_headline || 'Professional Profile'}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 mb-1 block">Profile Picture URL</label>
                <input
                  type="url"
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  placeholder="https://media.licdn.com/dms/image/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-xs font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">Paste your LinkedIn profile picture image URL directly if desired.</p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 mb-1 block">LinkedIn Profile URL</label>
                <input
                  type="url"
                  value={editProfileUrl}
                  onChange={(e) => setEditProfileUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/your-profile"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditingAccount(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
              >
                {isSavingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {accountToDelete && (
        <ConfirmModal
          isOpen={!!accountToDelete}
          onClose={() => setAccountToDelete(null)}
          onConfirm={handleDeleteConfirm}
          title="Delete LinkedIn Profile & Cookies?"
          variant="danger"
          confirmText="Delete Profile"
          cancelText="Cancel"
          message={
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Are you sure you want to delete the connected LinkedIn profile for{' '}
                <strong className="text-slate-900">
                  {accountToDelete.linkedin_name || accountToDelete.team_member?.name || 'this persona'}
                </strong>?
              </p>
              <p className="text-xs text-slate-500">
                This will permanently erase the stored cookies, remove the synced profile picture and headline, and allow you to connect a completely fresh LinkedIn account.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};

// Account Card Component
interface AccountCardProps {
  account: LinkedInAccount;
  isOwn: boolean;
  isRefreshing?: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onDelete: () => void;
  onOpenAgent?: () => void;
}

const AccountCard: React.FC<AccountCardProps> = ({
  account, isOwn, isRefreshing, onRefresh, onEdit, onDisconnect, onReconnect, onDelete, onOpenAgent
}) => {
  const status = statusConfig[account.status];
  const isExpired = account.status === 'expired';
  const isDisconnected = account.status === 'disconnected';
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [account.linkedin_avatar_url]);

  return (
    <div className={`rounded-xl border bg-white p-5 shadow-xs transition hover:shadow-sm ${
      isExpired ? 'border-red-200 bg-red-50/30' : isDisconnected ? 'border-slate-200 bg-slate-50/40' : 'border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Avatar with live photo and LinkedIn badge */}
          <div className="relative shrink-0 w-14 h-14 min-w-[3.5rem] min-h-[3.5rem]">
            {account.linkedin_avatar_url && !imgFailed ? (
              <img
                src={account.linkedin_avatar_url}
                alt={account.linkedin_name || 'LinkedIn Profile'}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-blue-500/20 shadow-sm border border-slate-200 bg-slate-100"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm ring-2 ring-blue-500/20 border border-slate-200">
                {account.linkedin_name?.charAt(0)?.toUpperCase() || (isExpired ? '?' : account.team_member?.name?.charAt(0)?.toUpperCase()) || 'L'}
              </div>
            )}

            {/* LinkedIn Mini Badge on corner */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs border-2 border-white">
              <Linkedin className="w-2.5 h-2.5" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-900 truncate">
                {account.linkedin_name || (isExpired ? 'LinkedIn Session Expired' : account.team_member?.name ? `${account.team_member.name}'s Account` : 'LinkedIn User')}
              </p>
              {account.status === 'active' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              )}
            </div>

            {account.linkedin_headline && (
              <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{account.linkedin_headline}</p>
            )}

            <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
              {account.team_member?.name && (
                <span>Team: <strong className="text-slate-600 font-medium">{account.team_member.name}</strong></span>
              )}
              {account.linkedin_profile_url && (
                <a
                  href={account.linkedin_profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium hover:underline"
                >
                  <span>View Profile</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status.color}`}>
            {status.icon}
            {status.label}
          </span>

          {isOwn && account.status === 'active' && onOpenAgent && (
            <button
              onClick={onOpenAgent}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition hover:scale-[1.02] active:scale-[0.98]"
              title="Launch Vibe Prospecting with this account"
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Vibe Prospecting</span>
            </button>
          )}

          <div className="flex gap-1 items-center">
            {/* Sync / Refresh button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
              title="Sync latest LinkedIn profile picture and details"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            {/* Edit Photo / Link */}
            {isOwn && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                title="Edit profile photo or profile URL"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Switch / Reconnect Account button */}
            {isOwn && (
              <button
                onClick={onReconnect}
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                title="Switch or reconnect LinkedIn account with new cookies"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete Profile & Cookies */}
            {isOwn && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                title="Delete LinkedIn profile & cookies"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Daily Usage Stats */}
      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
        <UsageStat
          label="Connections Today"
          current={account.connections_sent_today}
          limit={account.daily_connection_limit}
          color="blue"
        />
        <UsageStat
          label="Messages Today"
          current={account.messages_sent_today}
          limit={account.daily_message_limit}
          color="purple"
        />
        <UsageStat
          label="Profile Views Today"
          current={account.profile_views_today}
          limit={account.daily_view_limit}
          color="emerald"
        />
      </div>

      {/* Expired Warning */}
      {isExpired && (
        <div className="mt-3 flex items-start justify-between gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-start gap-2.5 text-xs text-red-700 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">LinkedIn Session Needs Reconnection</p>
              <p className="mt-0.5 text-red-600">
                The session cookie (li_at) is invalid or has expired. Please reconnect with fresh cookies from LinkedIn to sync your profile details and enable automated outreach.
              </p>
            </div>
          </div>
          {isOwn && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onReconnect}
                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1 shadow-xs"
              >
                <Zap className="w-3 h-3" />
                Switch / Reconnect
              </button>
              <button
                onClick={onDelete}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50 transition flex items-center gap-1 shadow-xs"
              >
                <Trash2 className="w-3 h-3" />
                Delete Profile
              </button>
            </div>
          )}
        </div>
      )}

      {/* Disconnected Notice */}
      {isDisconnected && (
        <div className="mt-3 flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-2.5 text-xs text-slate-600 min-w-0">
            <XCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-700">Account Disconnected</p>
              <p className="mt-0.5 text-slate-500">Your LinkedIn session is disconnected. Connect a new cookie profile or delete this account.</p>
            </div>
          </div>
          {isOwn && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onReconnect}
                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1 shadow-xs"
              >
                <Zap className="w-3 h-3" />
                Connect / Switch
              </button>
              <button
                onClick={onDelete}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50 transition flex items-center gap-1 shadow-xs"
              >
                <Trash2 className="w-3 h-3" />
                Delete Profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Usage Stat Chip
const UsageStat: React.FC<{
  label: string;
  current: number;
  limit: number;
  color: 'blue' | 'purple' | 'emerald';
}> = ({ label, current, limit, color }) => {
  const pct = Math.min(100, Math.round((current / limit) * 100));
  const colors = {
    blue: 'bg-blue-500 text-blue-700',
    purple: 'bg-purple-500 text-purple-700',
    emerald: 'bg-emerald-500 text-emerald-700',
  };

  return (
    <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
        <span>{label}</span>
        <span className="font-bold text-slate-700">{current} / {limit}</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors[color].split(' ')[0]} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
