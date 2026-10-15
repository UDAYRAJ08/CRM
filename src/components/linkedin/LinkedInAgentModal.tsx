import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Search, Link as LinkIcon, Filter,
  Clock, Shield, UserX, Send, RefreshCw, X, ChevronRight, Pause,
  ExternalLink, ArrowRight, Users, Info, Key, AlertTriangle, Check,
  CheckCircle2, Zap, Plus
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Contact } from '../../types/crm';
import {
  searchLinkedInProspects,
  generateAIConnectionNote,
  dispatchAgentBatchWithJitter,
  fetchLinkedInQuota,
  LinkedInProspect,
  LinkedInQuotaInfo,
} from '../../lib/linkedinAutomationService';
import { getLinkedInAccounts, connectLinkedInCookie } from '../../lib/linkedinService';
import { requestLinkedInSession } from '../../lib/linkedinExtensionBridge';
import { LinkedInAccount } from '../../types/linkedin';
import { useToast } from '../../context/ToastContext';
import { useTeam } from '../../context/TeamContext';
import { Linkedin } from './LinkedInIcon';

interface LinkedInAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onRefreshContacts?: () => void;
}

export interface ParsedCookiesResult {
  liAt: string;
  jsessionId: string;
  rawCookie?: string;
  count: number;
  isJson: boolean;
  detectedKeys: string[];
}

export function parseLinkedInCookieInput(input: string, fallbackCsrf = ''): ParsedCookiesResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. JSON Array format (e.g. Cookie-Editor / EditThisCookie export)
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        let cookieHeader = '';
        let extractedLiAt = '';
        let extractedCsrf = '';
        const detectedKeys: string[] = [];

        for (const c of arr) {
          if (!c?.name || c?.value === undefined) continue;
          cookieHeader += `${c.name}=${c.value}; `;
          detectedKeys.push(c.name);
          if (c.name === 'li_at') extractedLiAt = String(c.value);
          if (c.name === 'JSESSIONID') extractedCsrf = String(c.value).replace(/^["']|["']$/g, '');
        }

        if (extractedLiAt) {
          return {
            liAt: extractedLiAt,
            jsessionId: extractedCsrf || fallbackCsrf,
            rawCookie: cookieHeader.trim(),
            count: detectedKeys.length,
            isJson: true,
            detectedKeys,
          };
        }
      }
    } catch {}
  }

  // 2. Full cookie string (e.g. semicolon-separated)
  if (trimmed.includes(';') || trimmed.includes('bcookie=') || trimmed.includes('lidc=')) {
    const liAtMatch = trimmed.match(/(?:^|;\s*)li_at=([^;]+)/);
    const csrfMatch = trimmed.match(/(?:^|;\s*)JSESSIONID="?([^;"]+)"?/);
    const extractedLiAt = liAtMatch ? liAtMatch[1] : '';
    const extractedCsrf = csrfMatch ? csrfMatch[1] : '';

    if (extractedLiAt) {
      return {
        liAt: extractedLiAt,
        jsessionId: extractedCsrf || fallbackCsrf,
        rawCookie: trimmed,
        count: trimmed.split(';').length,
        isJson: false,
        detectedKeys: ['li_at', ...(extractedCsrf ? ['JSESSIONID'] : [])],
      };
    }
  }

  // 3. Simple token
  const cleanLiAt = trimmed.replace(/^li_at=/, '').replace(/^["']|["']$/g, '');
  if (cleanLiAt) {
    return {
      liAt: cleanLiAt,
      jsessionId: fallbackCsrf,
      count: 1,
      isJson: false,
      detectedKeys: ['li_at'],
    };
  }

  return null;
}

export const LinkedInAgentModal: React.FC<LinkedInAgentModalProps> = ({
  isOpen,
  onClose,
  contacts,
  onRefreshContacts,
}) => {
  const { success, error: showError, warning, info } = useToast();

  // Mode & Step
  const [searchMode, setSearchMode] = useState<'keywords' | 'url'>('keywords');
  const [activeStep, setActiveStep] = useState<'search' | 'review' | 'running'>('search');

  // Input states
  const [keywords, setKeywords] = useState('Founder OR CEO SaaS');
  const [searchUrl, setSearchUrl] = useState('');
  const [targetTitles, setTargetTitles] = useState<string[]>(['Founder', 'CEO', 'Co-Founder', 'Director']);
  const [titleInput, setTitleInput] = useState('');
  const [negativeKeywords, setNegativeKeywords] = useState<string[]>(['Student', 'Intern', 'Assistant', 'Seeking']);
  const [negativeInput, setNegativeInput] = useState('');
  const [targetLocation, setTargetLocation] = useState('');
  const [defaultSendMode, setDefaultSendMode] = useState<'blank' | 'ai_note'>('blank');

  // Multi-account & Custom Cookie selection
  const { activeMember } = useTeam();
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [credentialMode, setCredentialMode] = useState<'saved' | 'custom'>('custom');
  const [cookieInputTab, setCookieInputTab] = useState<'json' | 'fields'>('json');
  const [cookieJsonInput, setCookieJsonInput] = useState('');
  const [cookieImportSummary, setCookieImportSummary] = useState<string | null>(() => {
    const raw = localStorage.getItem('crm_custom_raw_cookie');
    if (raw && raw.includes(';')) {
      return `Loaded authentic browser session jar (${raw.split(';').length} tokens)`;
    }
    return null;
  });
  const [customLiAt, setCustomLiAt] = useState(() => localStorage.getItem('crm_custom_li_at') || '');
  const [customJsessionId, setCustomJsessionId] = useState(() => localStorage.getItem('crm_custom_jsessionid') || '');
  const [showCustomCookiePassword, setShowCustomCookiePassword] = useState(false);
  const [customAccountName, setCustomAccountName] = useState('');
  const [isSavingCustomAccount, setIsSavingCustomAccount] = useState(false);
  const [isVerifyingCookie, setIsVerifyingCookie] = useState(false);
  const [cookieVerification, setCookieVerification] = useState<{
    tested: boolean;
    valid: boolean;
    name?: string;
    headline?: string;
    error?: string;
  } | null>(null);

  const [quota, setQuota] = useState<LinkedInQuotaInfo>({
    date: new Date().toISOString().slice(0, 10),
    sentToday: 0,
    maxDailyLimit: 15,
    remaining: 15,
    hasSessionCookie: false,
  });

  // Cookie expiration & quick updater state
  const [hasCookieError, setHasCookieError] = useState(false);
  const [showCookieUpdater, setShowCookieUpdater] = useState(false);
  const [newLiAt, setNewLiAt] = useState('');
  const [newJsessionId, setNewJsessionId] = useState('');
  const [isUpdatingCookie, setIsUpdatingCookie] = useState(false);
  const [isLaunchingBrowser, setIsLaunchingBrowser] = useState(false);

  // Prospect queue
  const [isSearching, setIsSearching] = useState(false);
  const [prospects, setProspects] = useState<LinkedInProspect[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'qualified' | 'excluded'>('qualified');
  const [generatingNoteId, setGeneratingNoteId] = useState<string | null>(null);

  // Execution states
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{
    currentIndex: number;
    total: number;
    currentProspect?: LinkedInProspect;
    status: string;
    message: string;
    nextDelaySeconds?: number;
  }>({
    currentIndex: 0,
    total: 0,
    status: 'idle',
    message: '',
  });
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Mode switcher with persistent preference
  const changeCredentialMode = (mode: 'saved' | 'custom') => {
    setCredentialMode(mode);
    localStorage.setItem('crm_linkedin_credential_mode', mode);
  };

  // Load initial accounts and daily quota
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    try {
      const [accs, q] = await Promise.all([getLinkedInAccounts(), fetchLinkedInQuota()]);
      setAccounts(accs);

      const savedMode = localStorage.getItem('crm_linkedin_credential_mode') as 'saved' | 'custom' | null;
      const cachedCustomLiAt = localStorage.getItem('crm_custom_li_at');

      // If user specifically picked custom or has a custom cookie, prefer custom!
      if (savedMode === 'custom' || (!savedMode && cachedCustomLiAt)) {
        setCredentialMode('custom');
      } else if (accs.length > 0) {
        if (!selectedAccountId) {
          setSelectedAccountId(accs[0].id);
        }
        setCredentialMode('saved');
      } else {
        setCredentialMode('custom');
      }
      setQuota(q);
    } catch (e: any) {
      console.warn('Could not load accounts or quota:', e);
      setCredentialMode('custom');
    }
  };

  /** Resolve active credentials from either selected saved account or custom inputs */
  const resolveActiveCredentials = async (): Promise<{ liAt: string; jsessionId: string; rawCookie?: string } | null> => {
    if (credentialMode === 'saved' && selectedAccountId) {
      // Seamless fallback to cached credentials from 1-click connect
      const cachedLiAt = localStorage.getItem('crm_custom_li_at') || '';
      const cachedCsrf = localStorage.getItem('crm_custom_jsessionid') || '';
      const rawCookie = localStorage.getItem('crm_custom_raw_cookie') || undefined;
      if (cachedLiAt) {
        return { liAt: cachedLiAt, jsessionId: cachedCsrf, rawCookie };
      }
    }

    // Custom Mode — direct from user input or localStorage (no .env required)
    const cleanLiAt = customLiAt.trim().replace(/^li_at=/, '').replace(/^["']|["']$/g, '');
    const cleanJsessionId = customJsessionId.trim().replace(/^JSESSIONID=/, '').replace(/^["']|["']$/g, '') || '';
    const rawCookie = localStorage.getItem('crm_custom_raw_cookie') || undefined;

    if (cleanLiAt) {
      localStorage.setItem('crm_custom_li_at', cleanLiAt);
      localStorage.setItem('crm_custom_jsessionid', cleanJsessionId);
      return { liAt: cleanLiAt, jsessionId: cleanJsessionId, rawCookie };
    }

    return null;
  };

  /** Apply Cookie-Editor JSON array string */
  const handleApplyJsonCookies = (jsonStr: string) => {
    setCookieJsonInput(jsonStr);
    const parsed = parseLinkedInCookieInput(jsonStr, customJsessionId);
    if (parsed) {
      setCustomLiAt(parsed.liAt);
      setCustomJsessionId(parsed.jsessionId);
      localStorage.setItem('crm_custom_li_at', parsed.liAt);
      localStorage.setItem('crm_custom_jsessionid', parsed.jsessionId);
      if (parsed.rawCookie) {
        localStorage.setItem('crm_custom_raw_cookie', parsed.rawCookie);
      }
      const keySummary = parsed.detectedKeys.slice(0, 5).join(', ') + (parsed.detectedKeys.length > 5 ? '...' : '');
      setCookieImportSummary(`Parsed ${parsed.count} cookies (${keySummary})`);
      setCookieVerification(null);
    } else if (!jsonStr.trim()) {
      setCookieImportSummary(null);
    } else {
      setCookieImportSummary('Invalid cookie format. Please paste JSON starting with [');
    }
  };

  /** Change custom li_at with auto-detection for JSON or raw headers */
  const handleCustomLiAtChange = (input: string) => {
    const parsed = parseLinkedInCookieInput(input, customJsessionId);
    if (parsed && (parsed.isJson || parsed.rawCookie)) {
      setCustomLiAt(parsed.liAt);
      setCustomJsessionId(parsed.jsessionId);
      localStorage.setItem('crm_custom_li_at', parsed.liAt);
      localStorage.setItem('crm_custom_jsessionid', parsed.jsessionId);
      if (parsed.rawCookie) {
        localStorage.setItem('crm_custom_raw_cookie', parsed.rawCookie);
      }
      setCookieImportSummary(`Imported ${parsed.count} cookies (${parsed.detectedKeys.slice(0, 4).join(', ')})`);
      setCookieVerification(null);
    } else {
      const val = input.replace(/^li_at=/, '').replace(/^["']|["']$/g, '');
      setCustomLiAt(val);
      localStorage.setItem('crm_custom_li_at', val);
      localStorage.removeItem('crm_custom_raw_cookie');
      setCookieImportSummary(null);
      setCookieVerification(null);
    }
  };

  /** 1-Click Verification of Custom Cookie */
  const handleVerifyCustomCookie = async (overrideLiAt?: string, _overrideCsrf?: string) => {
    const rawLiAt = overrideLiAt !== undefined ? overrideLiAt : customLiAt;
    const cleanLiAt = rawLiAt.trim().replace(/^li_at=/, '').replace(/^["']|["']$/g, '');

    if (!cleanLiAt) {
      showError('Cookie Required', 'Please paste your li_at session cookie first.');
      return;
    }

    setIsVerifyingCookie(true);
    setCookieVerification(null);

    try {
      // Checks this browser's LinkedIn session through the extension; the cookie never leaves the browser.
      const { profile } = await requestLinkedInSession();
      setCookieVerification({
        tested: true,
        valid: true,
        name: profile?.name || 'LinkedIn User',
        headline: profile?.headline,
      });
      success('Cookie Valid! 🎉', `Connected as ${profile?.name || 'LinkedIn User'}`);
    } catch (err: any) {
      setCookieVerification({
        tested: true,
        valid: false,
        error: err.message || 'Cannot verify cookie with server.',
      });
      showError('Verification Error', err.message || 'Failed to verify cookie.');
    } finally {
      setIsVerifyingCookie(false);
    }
  };

  /** 1-Click Visible Browser LinkedIn Connect (Launch Chrome & Capture Live Session) */
  const handleLaunchBrowserLogin = async () => {
    setIsLaunchingBrowser(true);
    info('Opening Chrome...', 'A real Chrome browser window is opening. Please sign in to your LinkedIn account.');

    try {
      const res = await fetch('/api/linkedin/launch-browser-login', {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success && data.liAt) {
        setCustomLiAt(data.liAt);
        if (data.csrfToken) setCustomJsessionId(data.csrfToken);
        localStorage.setItem('crm_custom_li_at', data.liAt);
        if (data.csrfToken) localStorage.setItem('crm_custom_jsessionid', data.csrfToken);
        if (data.rawCookie) localStorage.setItem('crm_custom_raw_cookie', data.rawCookie);

        setCookieVerification({
          tested: true,
          valid: true,
          name: data.profile?.name || 'LinkedIn User',
          headline: data.profile?.headline,
        });

        setCookieImportSummary(`Live Browser Connected (${data.profile?.name || 'LinkedIn User'})`);
        setHasCookieError(false);
        setShowCookieUpdater(false);
        changeCredentialMode('custom');
        success('LinkedIn Connected! 🎉', `Welcome, ${data.profile?.name || 'LinkedIn User'}! Your session is verified.`);
      } else {
        showError('Login Incomplete', data.error || 'Could not capture session from browser.');
      }
    } catch (e: any) {
      showError('Browser Error', e.message || 'Could not launch browser.');
    } finally {
      setIsLaunchingBrowser(false);
    }
  };

  /** Save custom cookie as a named account in CRM for future 1-click switching */
  const handleSaveCustomAccount = async () => {
    const cleanLiAt = customLiAt.trim().replace(/^li_at=/, '').replace(/^["']|["']$/g, '');
    const cleanJsessionId = customJsessionId.trim().replace(/^JSESSIONID=/, '').replace(/^["']|["']$/g, '') || '';

    if (!cleanLiAt) {
      showError('Cookie Required', 'Please enter a valid li_at cookie before saving.');
      return;
    }

    const teamMemberId = activeMember?.id || accounts[0]?.team_member_id;
    if (!teamMemberId) {
      showError('No Team Member', 'Could not resolve team member ID to save account.');
      return;
    }

    setIsSavingCustomAccount(true);
    try {
      const saved = await connectLinkedInCookie(
        teamMemberId,
        cleanLiAt,
        cleanJsessionId,
        undefined,
        undefined,
        customAccountName.trim() || 'Custom LinkedIn Account'
      );
      const freshAccs = await getLinkedInAccounts();
      setAccounts(freshAccs);
      if (saved?.id) {
        setSelectedAccountId(saved.id);
      }
      success('Account Saved to CRM!', `Saved "${saved?.linkedin_name || customAccountName || 'Account'}" for 1-click switching.`);
      setCustomAccountName('');
    } catch (err: any) {
      showError('Save Failed', err.message || 'Could not save account to CRM.');
    } finally {
      setIsSavingCustomAccount(false);
    }
  };

  // Add / Remove title tags
  const handleAddTitle = () => {
    const val = titleInput.trim();
    if (val && !targetTitles.some((t) => t.toLowerCase() === val.toLowerCase())) {
      setTargetTitles([...targetTitles, val]);
      setTitleInput('');
    }
  };

  const handleRemoveTitle = (t: string) => {
    setTargetTitles(targetTitles.filter((item) => item !== t));
  };

  // Add / Remove negative keyword tags
  const handleAddNegative = () => {
    const val = negativeInput.trim();
    if (val && !negativeKeywords.some((n) => n.toLowerCase() === val.toLowerCase())) {
      setNegativeKeywords([...negativeKeywords, val]);
      setNegativeInput('');
    }
  };

  const handleRemoveNegative = (n: string) => {
    setNegativeKeywords(negativeKeywords.filter((item) => item !== n));
  };

  /** Instantly use fresh cookie as Custom Cookie and retry search (Zero DB save required) */
  const handleUseAsCustomCookieAndRetry = async () => {
    if (!newLiAt.trim()) {
      showError('Cookie Required', 'Please paste your fresh li_at session cookie or JSON.');
      return;
    }

    const parsed = parseLinkedInCookieInput(newLiAt, newJsessionId);
    const cleanLiAt = parsed ? parsed.liAt : newLiAt.trim().replace(/^li_at=/, '').replace(/^["']|["']$/g, '');
    const cleanJsessionId = parsed ? parsed.jsessionId : newJsessionId.trim().replace(/^JSESSIONID=/, '').replace(/^["']|["']$/g, '') || '';
    const rawCookie = parsed?.rawCookie;

    setCustomLiAt(cleanLiAt);
    setCustomJsessionId(cleanJsessionId);
    localStorage.setItem('crm_custom_li_at', cleanLiAt);
    localStorage.setItem('crm_custom_jsessionid', cleanJsessionId);
    if (rawCookie) {
      localStorage.setItem('crm_custom_raw_cookie', rawCookie);
    }
    changeCredentialMode('custom');

    setHasCookieError(false);
    setShowCookieUpdater(false);
    setNewLiAt('');
    setNewJsessionId('');
    success('Using Custom Cookie', 'Retrying search with your fresh session cookie...');

    await handleRunSearch({
      liAt: cleanLiAt,
      jsessionId: cleanJsessionId,
      rawCookie,
    });
  };

  /** Update active saved account in DB and retry search */
  const handleUpdateSavedAccountAndRetry = async () => {
    if (!newLiAt.trim()) {
      showError('Cookie required', 'Please paste your li_at session cookie or JSON from LinkedIn.');
      return;
    }

    setIsUpdatingCookie(true);
    try {
      const parsed = parseLinkedInCookieInput(newLiAt, newJsessionId);
      const cleanLiAt = parsed ? parsed.liAt : newLiAt.trim().replace(/^li_at=/, '').replace(/^["']|["']$/g, '');
      const cleanJsessionId = parsed ? parsed.jsessionId : newJsessionId.trim().replace(/^JSESSIONID=/, '').replace(/^["']|["']$/g, '') || '';

      const activeAcc = accounts.find((a) => a.id === selectedAccountId) || accounts[0];
      const memberId = activeAcc?.team_member_id || activeMember?.id;
      if (memberId) {
        await connectLinkedInCookie(
          memberId,
          cleanLiAt,
          cleanJsessionId
        );
        const freshAccs = await getLinkedInAccounts();
        setAccounts(freshAccs);
      }

      setHasCookieError(false);
      setShowCookieUpdater(false);
      setNewLiAt('');
      setNewJsessionId('');
      success('Account Updated', 'LinkedIn session saved to CRM. Retrying search...');

      // Re-run search with the updated cookie override
      await handleRunSearch({
        liAt: cleanLiAt,
        jsessionId: cleanJsessionId,
      });
    } catch (e: any) {
      showError('Update Failed', e.message || 'Could not save cookie.');
    } finally {
      setIsUpdatingCookie(false);
    }
  };

  // Execute Search
  const handleRunSearch = async (cookieOverride?: { liAt: string; jsessionId: string; rawCookie?: string }) => {
    if (searchMode === 'keywords' && !keywords.trim()) {
      showError('Keywords required', 'Please enter search keywords (e.g. "Founder SaaS").');
      return;
    }
    if (searchMode === 'url' && !searchUrl.trim()) {
      showError('URL required', 'Please paste a LinkedIn search results URL.');
      return;
    }

    // The extension searches with the browser's own LinkedIn session; no cookie needed here.
    const creds = cookieOverride || (await resolveActiveCredentials()) || undefined;

    setIsSearching(true);
    setProspects([]);
    setHasCookieError(false);

    try {
      const res = await searchLinkedInProspects({
        keywords: searchMode === 'keywords' ? keywords : undefined,
        searchUrl: searchMode === 'url' ? searchUrl : undefined,
        filters: {
          targetTitles,
          negativeKeywords,
          locations: targetLocation ? [targetLocation] : undefined,
        },
        cookieOverride: creds,
        existingContacts: contacts,
      });

      if (!res.success) {
        if (res.expiredCookie) {
          setHasCookieError(true);
          setShowCookieUpdater(true);
          showError('Session Expired', 'Your LinkedIn session cookie is expired or requires re-authentication.');
        } else {
          showError('Search Failed', res.error || 'Could not fetch profiles from LinkedIn.');
        }
        setIsSearching(false);
        return;
      }

      if (res.prospects.length === 0) {
        warning('No profiles found', 'Try broadening your search keywords or removing some restrictive filters.');
      } else {
        success(
          'Discovery Complete',
          `Found ${res.totalFound} profiles (${res.qualifiedCount} qualified).`
        );
        const formatted = res.prospects.map((p) => ({
          ...p,
          sendMode: defaultSendMode,
        }));
        setProspects(formatted);
        setActiveStep('review');
      }
    } catch (err: any) {
      showError('Error', err.message || 'Unexpected search error.');
    } finally {
      setIsSearching(false);
    }
  };

  // Generate AI Note for a specific prospect
  const handleGenerateNote = async (index: number) => {
    const prospect = prospects[index];
    setGeneratingNoteId(prospect.vanity || index.toString());

    try {
      const activeAcc = accounts.find((a) => a.id === selectedAccountId);
      const note = await generateAIConnectionNote({
        prospect,
        userProfileHeadline: activeAcc?.linkedin_headline || 'Founder & Business Leader',
      });

      const updated = [...prospects];
      updated[index] = {
        ...updated[index],
        customNote: note,
        sendMode: 'ai_note',
      };
      setProspects(updated);
      info('AI Note Drafted', `Generated personalized note (${note.length}/300 chars).`);
    } catch (e: any) {
      showError('Note Generation Failed', e.message);
    } finally {
      setGeneratingNoteId(null);
    }
  };

  // Toggle prospect selection
  const handleToggleProspect = (index: number) => {
    const updated = [...prospects];
    const curr = updated[index];
    if (curr.status === 'discarded') {
      updated[index].status = 'pending';
      updated[index].isQualified = true;
    } else {
      updated[index].status = 'discarded';
      updated[index].isQualified = false;
    }
    setProspects(updated);
  };

  // Bulk set send mode
  const handleSetAllSendMode = (mode: 'blank' | 'ai_note') => {
    setDefaultSendMode(mode);
    setProspects(
      prospects.map((p) => ({
        ...p,
        sendMode: mode,
      }))
    );
  };

  // Select all or deselect all
  const handleToggleAll = (select: boolean) => {
    setProspects(
      prospects.map((p) => {
        if (p.isDuplicate) return p;
        return {
          ...p,
          status: select ? 'pending' : 'discarded',
          isQualified: select,
        };
      })
    );
  };

  // Start Batch Execution
  const handleStartBatchExecution = async () => {
    const approvedProspects = prospects.filter((p) => p.isQualified && p.status !== 'discarded' && !p.isDuplicate);

    if (approvedProspects.length === 0) {
      warning('No prospects selected', 'Please select at least one qualified prospect to connect.');
      return;
    }

    if (quota.remaining <= 0) {
      showError('Daily Safety Cap Reached', 'You have already sent your daily limit of invites today.');
      return;
    }

    const countToSend = Math.min(approvedProspects.length, quota.remaining);

    setActiveStep('running');
    setIsExecuting(true);
    setExecutionLogs([`🚀 Starting batch execution for ${countToSend} prospects with safe human jitter (45–120s)...`]);

    abortControllerRef.current = new AbortController();

    const creds = (await resolveActiveCredentials()) || undefined;

    try {
      const res = await dispatchAgentBatchWithJitter({
        prospects: approvedProspects.slice(0, countToSend),
        cookieOverride: creds,
        minDelaySec: 45,
        maxDelaySec: 120,
        signal: abortControllerRef.current.signal,
        onProgress: (p) => {
          setExecutionProgress({
            currentIndex: p.currentIndex,
            total: p.total,
            currentProspect: p.currentProspect,
            status: p.status,
            message: p.message,
            nextDelaySeconds: p.nextDelaySeconds,
          });

          if (p.message) {
            setExecutionLogs((prev) => [
              `[${new Date().toLocaleTimeString()}] ${p.message}`,
              ...prev.slice(0, 40),
            ]);
          }

          if (p.quota) {
            setQuota(p.quota);
          }
        },
      });

      success(
        'Batch Completed',
        `Successfully sent ${res.sent} connection requests (${res.failed} failed). Contacts added to CRM!`
      );
      if (onRefreshContacts) onRefreshContacts();
      const updatedQ = await fetchLinkedInQuota();
      setQuota(updatedQ);
    } catch (e: any) {
      showError('Execution Halted', e.message);
    } finally {
      setIsExecuting(false);
    }
  };

  // Stop / Cancel Execution
  const handleStopExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExecuting(false);
    warning('Execution Stopped', 'Batch process was safely aborted.');
  };

  const qualifiedList = prospects.filter((p) => p.isQualified && !p.isDuplicate);
  const excludedList = prospects.filter((p) => !p.isQualified || p.isDuplicate);
  const displayedProspects = filterTab === 'all'
    ? prospects
    : filterTab === 'qualified'
    ? qualifiedList
    : excludedList;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isExecuting) {
          if (!window.confirm('A connection batch is currently running. Stop and close?')) return;
          handleStopExecution();
        }
        onClose();
      }}
      maxWidth="5xl"
      className="p-0 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]"
    >
      {/* Sleek Gradient Header */}
      <div className="bg-slate-900 px-4 sm:px-6 py-4 text-white border-b border-indigo-900/40 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">LinkedIn Prospecting Agent</h2>
                <span className="px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  AI Auto-Pilot
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-1 mt-0.5">
                Target 2nd-degree profiles, filter hard criteria, and send connection invites safely.
              </p>
            </div>
          </div>

          {/* Daily Quota Indicator */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs">
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <span className="text-slate-400">Daily: </span>
                <span className="font-semibold text-white">
                  {quota.sentToday}/{quota.maxDailyLimit}
                </span>
                <span className="text-emerald-400 ml-1 font-medium">
                  ({quota.remaining} left)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Step Indicator Tabs */}
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/80 overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setActiveStep('search')}
            disabled={isExecuting}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg shrink-0 transition-colors ${
              activeStep === 'search'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>1. Search Criteria</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <button
            onClick={() => prospects.length > 0 && setActiveStep('review')}
            disabled={prospects.length === 0 || isExecuting}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg shrink-0 transition-colors ${
              activeStep === 'review'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : prospects.length > 0
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            <span>2. Review Queue ({prospects.length})</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <button
            disabled={!isExecuting && executionLogs.length === 0}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg shrink-0 transition-colors ${
              activeStep === 'running'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-slate-600'
            }`}
          >
            <span>3. Batch Dispatch</span>
          </button>
        </div>
      </div>

      {/* Main Body with Clean Scrolling */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/70">
        {/* STEP 1: SEARCH DEFINITION */}
        {activeStep === 'search' && (
          <div className="space-y-5 max-w-3xl mx-auto">
            {/* LINKEDIN ACCOUNT & CREDENTIALS SELECTOR */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                    <Linkedin className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                      LinkedIn Account & Session Credentials
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Select a saved account or enter custom cookies directly — no .env required!
                    </p>
                  </div>
                </div>

                {/* Mode toggle tabs */}
                <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => changeCredentialMode('custom')}
                    className={`px-3 py-1 rounded-md font-semibold transition ${
                      credentialMode === 'custom'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ⚡ Custom / Manual Cookie
                  </button>
                  {accounts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => changeCredentialMode('saved')}
                      className={`px-3 py-1 rounded-md font-semibold transition ${
                        credentialMode === 'saved'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Saved Accounts ({accounts.length})
                    </button>
                  )}
                </div>
              </div>

              {/* 1. Saved Accounts Mode */}
              {credentialMode === 'saved' && accounts.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {accounts.find((a) => a.id === selectedAccountId)?.linkedin_name?.charAt(0) || 'L'}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {accounts.find((a) => a.id === selectedAccountId)?.linkedin_name || 'Active Account'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {accounts.find((a) => a.id === selectedAccountId)?.linkedin_headline || 'Connected CRM Persona'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.linkedin_name || 'Account'} ({a.status})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => changeCredentialMode('custom')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline whitespace-nowrap px-1"
                    >
                      + Use another cookie
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Custom Cookie Mode */}
              {credentialMode === 'custom' && (
                <div className="space-y-3.5 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        Use Any LinkedIn Cookie (Full JSON / Cookie-Editor Supported)
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Paste your full Cookie-Editor JSON export array or individual cookies below. Zero .env edits needed.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setCookieInputTab('json')}
                          className={`px-2.5 py-1 rounded-md font-semibold transition ${
                            cookieInputTab === 'json'
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          📋 Paste JSON Array
                        </button>
                        <button
                          type="button"
                          onClick={() => setCookieInputTab('fields')}
                          className={`px-2.5 py-1 rounded-md font-semibold transition ${
                            cookieInputTab === 'fields'
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Individual Fields
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleLaunchBrowserLogin}
                        disabled={isLaunchingBrowser}
                        className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        {isLaunchingBrowser ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Opening Chrome...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            Auto-Connect in Chrome
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleVerifyCustomCookie()}
                        disabled={isVerifyingCookie || !customLiAt}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg flex items-center gap-1.5 transition disabled:opacity-40"
                      >
                        {isVerifyingCookie ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Test Connection
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Cookie Import Summary Badge if JSON parsed or jar active */}
                  {cookieImportSummary && (
                    <div className="p-2.5 rounded-lg text-xs bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center justify-between gap-2">
                      <span className="font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        {cookieImportSummary}
                      </span>
                      {customLiAt && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 font-mono px-2 py-0.5 rounded font-semibold shrink-0">
                          li_at: {customLiAt.slice(0, 12)}...
                        </span>
                      )}
                    </div>
                  )}

                  {/* Verification status preview banner if tested */}
                  {cookieVerification?.tested && (
                    <div className={`p-2.5 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                      cookieVerification.valid
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <div className="flex items-center gap-2">
                        {cookieVerification.valid ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        )}
                        <div>
                          <span className="font-bold">
                            {cookieVerification.valid ? `Connected as: ${cookieVerification.name}` : 'Cookie Invalid or Expired'}
                          </span>
                          {cookieVerification.headline && (
                            <span className="text-[11px] text-emerald-700 block opacity-90 truncate max-w-md">
                              {cookieVerification.headline}
                            </span>
                          )}
                          {!cookieVerification.valid && cookieVerification.error && (
                            <span className="text-[11px] text-red-700 block">
                              {cookieVerification.error}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/70 shrink-0">
                        {cookieVerification.valid ? 'Active Session' : 'Needs Fresh Cookie'}
                      </span>
                    </div>
                  )}

                  {/* Tab 1: Full JSON Array Input */}
                  {cookieInputTab === 'json' ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Paste Full Cookie-Editor Export JSON:
                        </label>
                        <span className="text-[10px] text-slate-500">
                          In Chrome: Cookie-Editor &gt; Export &gt; JSON &gt; Paste here
                        </span>
                      </div>
                      <textarea
                        rows={4}
                        value={cookieJsonInput}
                        onChange={(e) => handleApplyJsonCookies(e.target.value)}
                        placeholder={`[\n  { "domain": ".linkedin.com", "name": "li_at", "value": "AQED..." },\n  { "name": "JSESSIONID", "value": "\\"ajax:...\\"" },\n  { "name": "bcookie", "value": "..." }\n]`}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>Auto-detects li_at, JSESSIONID, bcookie, lidc and all authentic browser tokens.</span>
                        {customLiAt && (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            Session Loaded
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Tab 2: Manual Individual Fields */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            li_at Cookie <span className="text-red-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowCustomCookiePassword(!showCustomCookiePassword)}
                            className="text-[10px] text-slate-500 hover:text-slate-700"
                          >
                            {showCustomCookiePassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <input
                          type={showCustomCookiePassword ? 'text' : 'password'}
                          value={customLiAt}
                          onChange={(e) => handleCustomLiAtChange(e.target.value)}
                          placeholder="AQED... (or paste JSON here too!)"
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          JSESSIONID (CSRF-TOKEN) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type={showCustomCookiePassword ? 'text' : 'password'}
                          value={customJsessionId}
                          onChange={(e) => {
                            const val = e.target.value.trim().replace(/^JSESSIONID=/, '').replace(/^["']|["']$/g, '');
                            setCustomJsessionId(val);
                            localStorage.setItem('crm_custom_jsessionid', val);
                            setCookieVerification(null);
                          }}
                          placeholder="ajax:1234567890123456789"
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Optional 1-click Save to CRM Accounts */}
                  <div className="pt-2.5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Want to save this account for 1-click switching later? Give it a nickname:</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customAccountName}
                        onChange={(e) => setCustomAccountName(e.target.value)}
                        placeholder="Nickname (e.g. Sales Account 2)"
                        className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white w-48"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCustomAccount}
                        disabled={isSavingCustomAccount || !customLiAt}
                        className="px-3 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition disabled:opacity-40 flex items-center gap-1 shrink-0"
                      >
                        {isSavingCustomAccount ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            Save Account
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* In-Modal Cookie Expired / Updater Banner */}
            {(hasCookieError || showCookieUpdater) && (
              <div className="bg-amber-500/10 border border-amber-300 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-amber-900">
                        LinkedIn Session Expired or Challenged
                      </h3>
                      <p className="text-[11px] sm:text-xs text-amber-700/90 mt-0.5 leading-relaxed">
                        LinkedIn requires a fresh session cookie (<code className="font-mono bg-amber-100/80 px-1 rounded">li_at</code>). Enter it here to resume immediately without editing any files:
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCookieUpdater(false)}
                    className="text-amber-800/60 hover:text-amber-900 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                        Paste Fresh Cookie-Editor JSON or li_at Cookie:
                      </label>
                      <span className="text-[10px] text-amber-800/80">
                        JSON array [ ... ] or AQED...
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      value={newLiAt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewLiAt(val);
                        const parsed = parseLinkedInCookieInput(val, newJsessionId);
                        if (parsed && (parsed.isJson || parsed.rawCookie)) {
                          if (parsed.jsessionId) setNewJsessionId(parsed.jsessionId);
                        }
                      }}
                      placeholder={`Paste Cookie-Editor JSON array [ { "name": "li_at", ... } ] or single AQED... value`}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-amber-800 mb-0.5">
                        Active li_at:
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={newLiAt.startsWith('[') ? (parseLinkedInCookieInput(newLiAt)?.liAt ? `${parseLinkedInCookieInput(newLiAt)!.liAt.slice(0, 18)}... (Auto-Extracted)` : 'Parsing...') : newLiAt}
                        placeholder="AQED..."
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/60 font-mono text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-amber-800 mb-0.5">
                        JSESSIONID (CSRF-Token):
                      </label>
                      <input
                        type="text"
                        value={newJsessionId}
                        onChange={(e) => setNewJsessionId(e.target.value)}
                        placeholder="ajax:1501412..."
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      changeCredentialMode('custom');
                      setShowCookieUpdater(false);
                      setHasCookieError(false);
                    }}
                    className="text-xs text-amber-900 hover:text-amber-950 underline font-semibold text-left"
                  >
                    👉 Or switch to Custom Cookie Mode directly
                  </button>

                  <div className="flex flex-wrap items-center gap-2 self-end">
                    <button
                      type="button"
                      onClick={() => setShowCookieUpdater(false)}
                      className="px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100/70 rounded-lg font-medium"
                    >
                      Dismiss
                    </button>
                    {/* Primary Button 0: 1-Click Browser Login (Automatic, zero manual copying) */}
                    <button
                      type="button"
                      onClick={handleLaunchBrowserLogin}
                      disabled={isLaunchingBrowser}
                      className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      {isLaunchingBrowser ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Logging in via Chrome...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          🚀 1-Click Login in Chrome (Zero Copying)
                        </>
                      )}
                    </button>
                    {/* Primary Button 1: Instant Custom Cookie Retry */}
                    <button
                      type="button"
                      onClick={handleUseAsCustomCookieAndRetry}
                      disabled={!newLiAt.trim()}
                      className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 disabled:opacity-40 transition"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Use as Custom Cookie &amp; Search
                    </button>
                    {/* Optional Button 2: Update Saved Account in DB */}
                    {accounts.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUpdateSavedAccountAndRetry}
                        disabled={isUpdatingCookie || !newLiAt.trim()}
                        className="px-3.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 disabled:opacity-40 transition"
                      >
                        {isUpdatingCookie ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Key className="w-3.5 h-3.5" />
                            Save to CRM Account
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Input Mode Toggle */}
            <div className="bg-slate-200/70 p-1 rounded-xl flex gap-1">
              <button
                onClick={() => setSearchMode('keywords')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  searchMode === 'keywords'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-blue-600" />
                <span>Keyword &amp; Hard Filters</span>
              </button>
              <button
                onClick={() => setSearchMode('url')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  searchMode === 'url'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Paste Search URL</span>
              </button>
            </div>

            {/* Search Configuration Card */}
            {searchMode === 'keywords' ? (
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Search Keywords / Boolean Query
                  </label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="e.g. Founder OR CEO SaaS"
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Searches LinkedIn people in your 2nd-degree network for maximum acceptance.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Target Location (Optional)
                    </label>
                    <input
                      type="text"
                      value={targetLocation}
                      onChange={(e) => setTargetLocation(e.target.value)}
                      placeholder="e.g. United States, London, India"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Default Invite Mode
                    </label>
                    <select
                      value={defaultSendMode}
                      onChange={(e) => setDefaultSendMode(e.target.value as any)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="blank">Blank Invite (Recommended for Free Accounts)</option>
                      <option value="ai_note">AI Personalized Note (&lt; 300 chars)</option>
                    </select>
                  </div>
                </div>

                {/* Hard Title Filters */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-blue-600" />
                      Must-Have Titles (Match Any)
                    </label>
                    <span className="text-[11px] text-slate-400">Prospect must hold one of these titles</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-100">
                    {targetTitles.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {t}
                        <button onClick={() => handleRemoveTitle(t)} className="hover:text-blue-900">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTitle())}
                      placeholder="Add title (e.g. CTO, VP Sales) and press Enter"
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddTitle}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Negative Exclusions */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <UserX className="w-3.5 h-3.5 text-rose-500" />
                      Negative Exclusions (Hard Skip)
                    </label>
                    <span className="text-[11px] text-slate-400">Profiles matching these are automatically rejected</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-100">
                    {negativeKeywords.map((neg) => (
                      <span
                        key={neg}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-200"
                      >
                        {neg}
                        <button onClick={() => handleRemoveNegative(neg)} className="hover:text-rose-900">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={negativeInput}
                      onChange={(e) => setNegativeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddNegative())}
                      placeholder="Add negative word (e.g. Intern, Student) and press Enter"
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddNegative}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* URL Mode Form */
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    LinkedIn People Search URL
                  </label>
                  <input
                    type="url"
                    value={searchUrl}
                    onChange={(e) => setSearchUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 mt-3 flex items-start gap-2.5 text-xs text-blue-900">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Instructions:</span>
                      <p className="mt-0.5 text-blue-800 text-[11px] leading-relaxed">
                        Go to LinkedIn in your browser, search for your audience, set your desired filters (Connections, Location, Industry), and copy the entire URL from your browser address bar.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Default Invite Mode
                  </label>
                  <select
                    value={defaultSendMode}
                    onChange={(e) => setDefaultSendMode(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="blank">Blank Invite (Recommended for Free Accounts)</option>
                    <option value="ai_note">AI Personalized Note (&lt; 300 chars)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Launch Search Button */}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => handleRunSearch()}
                disabled={isSearching}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2.5 transition-all disabled:opacity-60"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Searching LinkedIn &amp; Filtering Profiles...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Find &amp; Qualify Prospects
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW QUEUE */}
        {activeStep === 'review' && (
          <div className="space-y-4">
            {/* Filter and Bulk Actions Toolbar */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                <button
                  onClick={() => setFilterTab('qualified')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all ${
                    filterTab === 'qualified'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Qualified ({qualifiedList.length})
                </button>
                <button
                  onClick={() => setFilterTab('excluded')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all ${
                    filterTab === 'excluded'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Excluded / Duplicates ({excludedList.length})
                </button>
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all ${
                    filterTab === 'all'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All ({prospects.length})
                </button>
              </div>

              {/* Bulk Toggle Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 text-xs">
                <button
                  onClick={() => handleToggleAll(true)}
                  className="px-2.5 py-1 text-blue-600 font-semibold hover:bg-blue-50 rounded-lg shrink-0"
                >
                  Select All
                </button>
                <button
                  onClick={() => handleToggleAll(false)}
                  className="px-2.5 py-1 text-slate-500 font-semibold hover:bg-slate-100 rounded-lg shrink-0"
                >
                  Deselect
                </button>
                <div className="h-3.5 w-px bg-slate-200 mx-1 shrink-0" />
                <button
                  onClick={() => handleSetAllSendMode('blank')}
                  className="px-2.5 py-1 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg shrink-0"
                >
                  All Blank
                </button>
                <button
                  onClick={() => handleSetAllSendMode('ai_note')}
                  className="px-2.5 py-1 text-purple-600 font-semibold hover:bg-purple-50 rounded-lg flex items-center gap-1 shrink-0"
                >
                  <Sparkles className="w-3 h-3" />
                  All AI Notes
                </button>
              </div>
            </div>

            {/* Prospects Cards List */}
            <div className="space-y-3">
              {displayedProspects.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                  <Users className="w-9 h-9 text-slate-400 mx-auto mb-2" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-700">No prospects in this filter</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Switch to the Qualified tab or modify search criteria.</p>
                </div>
              ) : (
                displayedProspects.map((prospect, idx) => {
                  const originalIndex = prospects.findIndex((p) => p.vanity === prospect.vanity);
                  const isSelected = prospect.isQualified && prospect.status !== 'discarded';

                  return (
                    <div
                      key={prospect.vanity || idx}
                      className={`bg-white rounded-2xl border transition-all p-3.5 sm:p-4 ${
                        prospect.isDuplicate
                          ? 'border-amber-200 bg-amber-50/20 opacity-80'
                          : isSelected
                          ? 'border-blue-300 shadow-xs ring-1 ring-blue-500/10'
                          : 'border-slate-200 opacity-60 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Checkbox, Avatar, Info */}
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={prospect.isDuplicate}
                            onChange={() => handleToggleProspect(originalIndex)}
                            className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer shrink-0"
                          />

                          {/* Avatar */}
                          <div className="relative shrink-0">
                            {prospect.avatarUrl ? (
                              <img
                                src={prospect.avatarUrl}
                                alt={prospect.fullName}
                                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-blue-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center">
                                {prospect.fullName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="absolute -bottom-1 -right-1 text-[9px] font-bold px-1 rounded-full bg-slate-900 text-white border border-white">
                              {prospect.networkDistance || '2nd'}
                            </span>
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {prospect.fullName}
                              </h4>
                              <a
                                href={prospect.profileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 text-[11px] font-semibold"
                              >
                                Profile
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                              {prospect.isDuplicate ? (
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                  {prospect.duplicateReason || 'In CRM / Connected'}
                                </span>
                              ) : prospect.isQualified ? (
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Qualified
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                                  {prospect.qualificationReason}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 line-clamp-1">
                              {prospect.headline}
                            </p>

                            {prospect.location && (
                              <span className="text-[10px] text-slate-400 mt-0.5 block">
                                📍 {prospect.location}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Send Mode dropdown */}
                        <div className="self-end sm:self-center shrink-0">
                          <select
                            value={prospect.sendMode}
                            disabled={prospect.isDuplicate || !isSelected}
                            onChange={(e) => {
                              const updated = [...prospects];
                              updated[originalIndex].sendMode = e.target.value as any;
                              setProspects(updated);
                            }}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 shadow-xs focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="blank">Blank Invite</option>
                            <option value="ai_note">AI Note (&lt;300 chars)</option>
                          </select>
                        </div>
                      </div>

                      {/* AI Note Editing Area */}
                      {prospect.sendMode === 'ai_note' && isSelected && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-purple-600" />
                              Personalized Note:
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold ${
                                (prospect.customNote?.length || 0) > 280 ? 'text-amber-600' : 'text-slate-400'
                              }`}>
                                {prospect.customNote?.length || 0}/300 chars
                              </span>
                              <button
                                type="button"
                                onClick={() => handleGenerateNote(originalIndex)}
                                disabled={generatingNoteId === (prospect.vanity || originalIndex.toString())}
                                className="text-[11px] font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1 hover:underline"
                              >
                                {generatingNoteId === (prospect.vanity || originalIndex.toString()) ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Drafting...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3 h-3" />
                                    {prospect.customNote ? 'Regenerate' : 'Generate with AI'}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <textarea
                            rows={2}
                            value={prospect.customNote || ''}
                            onChange={(e) => {
                              const updated = [...prospects];
                              updated[originalIndex].customNote = e.target.value.slice(0, 300);
                              setProspects(updated);
                            }}
                            placeholder="Click 'Generate with AI' or type a personalized connection note..."
                            className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans leading-relaxed"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Sticky Bottom Actions Bar */}
            <div className="sticky bottom-0 bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500">Selected for connect: </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  {qualifiedList.length} prospects
                </span>
                <span className="text-xs text-emerald-600 ml-2 font-semibold">
                  (Daily capacity: {quota.remaining})
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => setActiveStep('search')}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100"
                >
                  Back to Search
                </button>
                <button
                  onClick={handleStartBatchExecution}
                  disabled={qualifiedList.length === 0}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Approve &amp; Send Batch ({Math.min(qualifiedList.length, quota.remaining)})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: RUNNING BATCH DISPATCH */}
        {activeStep === 'running' && (
          <div className="space-y-5 max-w-3xl mx-auto py-2">
            {/* Progress Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {isExecuting ? 'Dispatching Connection Requests' : 'Batch Execution Finished'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                    {executionProgress.message || 'Processing queue...'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isExecuting && (
                    <button
                      onClick={handleStopExecution}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Halt Process
                    </button>
                  )}
                  {!isExecuting && (
                    <button
                      onClick={() => setActiveStep('review')}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
                    >
                      Return to Queue
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>
                    Sent: {executionProgress.currentIndex} / {executionProgress.total}
                  </span>
                  <span>
                    {executionProgress.total > 0
                      ? Math.round((executionProgress.currentIndex / executionProgress.total) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{
                      width: `${
                        executionProgress.total > 0
                          ? (executionProgress.currentIndex / executionProgress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Countdown Meter for Jitter Delay */}
              {isExecuting && executionProgress.nextDelaySeconds && executionProgress.nextDelaySeconds > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-blue-50/80 border border-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-blue-900">
                    <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
                    <span className="font-medium">
                      Human randomized jitter delay active (protects account)
                    </span>
                  </div>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    Next in {executionProgress.nextDelaySeconds}s
                  </span>
                </div>
              )}
            </div>

            {/* Live Terminal Log */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 shadow-inner text-xs font-mono text-slate-300">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Event Stream
                </span>
                <span>{executionLogs.length} events</span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {executionLogs.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
