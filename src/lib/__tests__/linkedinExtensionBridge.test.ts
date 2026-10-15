import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import {
  pingExtension,
  requestLinkedInSession,
  ExtensionBridgeError,
  extensionSearchPeople,
  extensionSendInvite,
  extensionQuota,
} from '../linkedinExtensionBridge';

// jsdom delivers window.postMessage events with source = null and origin = '', but real
// browsers set source = window and origin = the page origin (which the bridge verifies).
// Emulate the browser so the security checks are exercised rather than bypassed.
const realPostMessage = window.postMessage.bind(window);
beforeAll(() => {
  window.postMessage = ((data: unknown) => {
    setTimeout(
      () => window.dispatchEvent(new MessageEvent('message', { data, source: window, origin: window.location.origin })),
      0
    );
  }) as typeof window.postMessage;
});
afterAll(() => {
  window.postMessage = realPostMessage;
});

/** Simulates the extension's content bridge answering page requests. */
function installFakeExtension(handler: (type: string, payload?: any) => Record<string, unknown>) {
  const listener = (event: MessageEvent) => {
    const d = event.data;
    if (event.source !== window || !d || d.source !== 'crm-page') return;
    window.postMessage(
      { source: 'crm-linkedin-extension', requestId: d.requestId, ...handler(d.type, d.payload) },
      window.location.origin
    );
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

describe('pingExtension', () => {
  it('reports not installed when nothing answers', async () => {
    expect(await pingExtension(50)).toEqual({ installed: false });
  });

  it('reports installed, version and login state', async () => {
    uninstall = installFakeExtension(() => ({ ok: true, version: '1.0.0', loggedIn: true }));
    expect(await pingExtension(500)).toEqual({ installed: true, loggedIn: true, version: '1.0.0' });
  });

  it('treats an unlinked-origin reply as not installed', async () => {
    uninstall = installFakeExtension(() => ({ ok: false, error: 'ORIGIN_NOT_LINKED' }));
    expect(await pingExtension(500)).toEqual({ installed: false });
  });
});

describe('requestLinkedInSession', () => {
  it('returns the session', async () => {
    uninstall = installFakeExtension(() => ({
      ok: true,
      liAt: 'AQEDAR',
      jsessionId: 'ajax:123',
      rawCookie: 'li_at=AQEDAR; JSESSIONID="ajax:123"',
      profile: { name: 'Jane Doe', publicIdentifier: 'jane-doe' },
    }));
    const session = await requestLinkedInSession(500);
    expect(session.liAt).toBe('AQEDAR');
    expect(session.jsessionId).toBe('ajax:123');
    expect(session.profile?.name).toBe('Jane Doe');
  });

  it('throws NOT_LOGGED_IN when the user is signed out', async () => {
    uninstall = installFakeExtension(() => ({ ok: false, error: 'NOT_LOGGED_IN' }));
    await expect(requestLinkedInSession(500)).rejects.toMatchObject({ code: 'NOT_LOGGED_IN' });
  });

  it('throws EXTENSION_NOT_DETECTED on timeout', async () => {
    const err = await requestLinkedInSession(50).catch((e) => e);
    expect(err).toBeInstanceOf(ExtensionBridgeError);
    expect(err.code).toBe('EXTENSION_NOT_DETECTED');
  });

  it('rejects an ok reply with missing cookies', async () => {
    uninstall = installFakeExtension(() => ({ ok: true, liAt: '', jsessionId: '' }));
    await expect(requestLinkedInSession(500)).rejects.toMatchObject({ code: 'NOT_LOGGED_IN' });
  });

  it('ignores replies for other requests', async () => {
    uninstall = installFakeExtension(() => ({ ok: true, liAt: 'x', jsessionId: 'y' }));
    // A stray message with a wrong requestId must not resolve a pending request.
    const pending = requestLinkedInSession(80);
    window.postMessage(
      { source: 'crm-linkedin-extension', requestId: 'someone-else', ok: false, error: 'NOT_LOGGED_IN' },
      window.location.origin
    );
    await expect(pending).resolves.toMatchObject({ liAt: 'x' });
  });
});

describe('LinkedIn actions', () => {
  it('passes search keywords and returns raw data', async () => {
    uninstall = installFakeExtension((type, payload) => ({ ok: type === 'SEARCH_PEOPLE', data: { echo: payload.keywords } }));
    expect(await extensionSearchPeople('cto', 500)).toEqual({ echo: 'cto' });
  });

  it('sends an invite and returns the quota', async () => {
    const quota = { date: '2026-10-15', count: 1, maxLimit: 15, remaining: 14 };
    uninstall = installFakeExtension((type, payload) =>
      type === 'SEND_INVITE' ? { ok: true, name: payload.vanity, quota } : { ok: false }
    );
    expect(await extensionSendInvite('jane-doe', '', 500)).toEqual({ name: 'jane-doe', alreadySent: false, quota });
  });

  it('carries LinkedIn status and details on failure', async () => {
    uninstall = installFakeExtension(() => ({ ok: false, error: 'FAILED', message: 'LinkedIn returned status 400.', status: 400, details: 'note' }));
    const err = await extensionSendInvite('jane-doe', 'hi', 500).catch((e) => e);
    expect(err).toMatchObject({ code: 'FAILED', message: 'LinkedIn returned status 400.', status: 400, details: 'note' });
  });

  it('returns null quota when the extension is missing', async () => {
    expect(await extensionQuota(50)).toBeNull();
  });
});
