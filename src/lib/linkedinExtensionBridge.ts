/**
 * Client for the "CRM LinkedIn Connector" Chrome extension (extensions/linkedin-connector).
 *
 * The extension reads the LinkedIn session from the user's own logged-in browser and
 * replies to this page via window.postMessage. It only injects its bridge on CRM sites
 * the user explicitly linked from the extension popup, so on an unlinked site every
 * request simply times out ("not detected").
 */

const PAGE_SOURCE = 'crm-page';
const EXTENSION_SOURCE = 'crm-linkedin-extension';

export interface ExtensionProfile {
  name?: string;
  headline?: string;
  publicIdentifier?: string;
  avatarUrl?: string;
}

export interface ExtensionSession {
  liAt: string;
  jsessionId: string;
  rawCookie: string;
  profile: ExtensionProfile | null;
}

export interface ExtensionStatus {
  installed: boolean;
  loggedIn?: boolean;
  version?: string;
}

export type ExtensionErrorCode =
  | 'EXTENSION_NOT_DETECTED'
  | 'NOT_LOGGED_IN'
  | 'NO_CSRF_TOKEN'
  | 'ORIGIN_NOT_LINKED'
  | 'DAILY_LIMIT'
  | 'FAILED'
  | 'UNKNOWN';

export class ExtensionBridgeError extends Error {
  code: ExtensionErrorCode;
  /** LinkedIn's HTTP status and response excerpt, when LinkedIn rejected the action. */
  status?: number;
  details?: string;
  constructor(code: ExtensionErrorCode, message: string) {
    super(message);
    this.name = 'ExtensionBridgeError';
    this.code = code;
  }
}

const ERROR_MESSAGES: Record<ExtensionErrorCode, string> = {
  EXTENSION_NOT_DETECTED:
    'The LinkedIn Connector extension was not detected on this site. Install it and link this CRM from the extension popup.',
  NOT_LOGGED_IN: 'You are not signed in to LinkedIn in this browser. Log in at linkedin.com, then try again.',
  NO_CSRF_TOKEN: 'LinkedIn did not return a session token. Open linkedin.com once, then try again.',
  ORIGIN_NOT_LINKED: 'This CRM site is not linked in the extension. Open the extension popup on this tab and press "Link this CRM".',
  DAILY_LIMIT: 'Daily safety limit reached. Please wait until tomorrow.',
  FAILED: 'LinkedIn rejected the request.',
  UNKNOWN: 'The extension returned an unexpected response.',
};

interface ExtensionReply {
  source: string;
  requestId: string;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

let counter = 0;

function request(
  type: 'PING' | 'GET_SESSION' | 'SEARCH_PEOPLE' | 'SEND_INVITE' | 'QUOTA',
  timeoutMs: number,
  win: Window = window,
  payload?: Record<string, unknown>
): Promise<ExtensionReply> {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${++counter}`;

    const cleanup = () => {
      clearTimeout(timer);
      win.removeEventListener('message', onMessage);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== win || event.origin !== win.location.origin) return;
      const data = event.data as ExtensionReply | undefined;
      if (!data || data.source !== EXTENSION_SOURCE || data.requestId !== requestId) return;
      cleanup();
      resolve(data);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new ExtensionBridgeError('EXTENSION_NOT_DETECTED', ERROR_MESSAGES.EXTENSION_NOT_DETECTED));
    }, timeoutMs);

    win.addEventListener('message', onMessage);
    win.postMessage({ source: PAGE_SOURCE, type, requestId, payload }, win.location.origin);
  });
}

function toBridgeError(code: string | undefined, reply?: ExtensionReply): ExtensionBridgeError {
  const known = (code && code in ERROR_MESSAGES ? code : 'UNKNOWN') as ExtensionErrorCode;
  const message = known === 'NOT_LOGGED_IN' ? undefined : (reply?.message as string | undefined);
  const err = new ExtensionBridgeError(known, message || ERROR_MESSAGES[known]);
  if (typeof reply?.status === 'number') err.status = reply.status;
  if (typeof reply?.details === 'string') err.details = reply.details;
  return err;
}

/** Is the extension installed AND linked to this site? Never throws. */
export async function pingExtension(timeoutMs = 1000, win: Window = window): Promise<ExtensionStatus> {
  try {
    const reply = await request('PING', timeoutMs, win);
    if (!reply.ok) return { installed: false };
    return { installed: true, loggedIn: Boolean(reply.loggedIn), version: reply.version as string | undefined };
  } catch {
    return { installed: false };
  }
}

/** Ask the extension for the user's LinkedIn session. Throws ExtensionBridgeError. */
export async function requestLinkedInSession(timeoutMs = 10000, win: Window = window): Promise<ExtensionSession> {
  const reply = await request('GET_SESSION', timeoutMs, win);
  if (!reply.ok) throw toBridgeError(reply.error);
  const liAt = String(reply.liAt || '');
  const jsessionId = String(reply.jsessionId || '');
  if (!liAt || !jsessionId) throw toBridgeError('NOT_LOGGED_IN');
  return {
    liAt,
    jsessionId,
    rawCookie: String(reply.rawCookie || ''),
    profile: (reply.profile as ExtensionProfile | null) || null,
  };
}

export interface ExtensionQuota {
  date: string;
  count: number;
  maxLimit: number;
  remaining: number;
}

/** Run a LinkedIn people search from the user's own browser. Returns LinkedIn's raw JSON. Throws ExtensionBridgeError. */
export async function extensionSearchPeople(keywords: string, timeoutMs = 30000, win: Window = window): Promise<any> {
  const reply = await request('SEARCH_PEOPLE', timeoutMs, win, { keywords });
  if (!reply.ok) throw toBridgeError(reply.error, reply);
  return reply.data;
}

/** Send a connection invite from the user's own browser. Throws ExtensionBridgeError. */
export async function extensionSendInvite(
  vanity: string,
  note: string,
  timeoutMs = 30000,
  win: Window = window
): Promise<{ name: string; alreadySent: boolean; quota: ExtensionQuota }> {
  const reply = await request('SEND_INVITE', timeoutMs, win, { vanity, note });
  if (!reply.ok) throw toBridgeError(reply.error, reply);
  return { name: String(reply.name || vanity), alreadySent: Boolean(reply.alreadySent), quota: reply.quota as ExtensionQuota };
}

/** Today's invite count, kept by the extension. Null when the extension is not reachable. */
export async function extensionQuota(timeoutMs = 1500, win: Window = window): Promise<ExtensionQuota | null> {
  try {
    const reply = await request('QUOTA', timeoutMs, win);
    return reply.ok ? (reply.quota as ExtensionQuota) : null;
  } catch {
    return null;
  }
}
