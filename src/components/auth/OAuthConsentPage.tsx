import React, { useEffect, useState } from 'react';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

// Supabase's OAuth 2.1 server sends people here (/oauth/consent?authorization_id=...) when an
// MCP client such as Claude asks to connect. The user is already signed in by the time this renders.
export const OAuthConsentPage: React.FC = () => {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id');
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return setError('Supabase is not configured.');
    if (!authorizationId) return setError('This link is missing its authorization request. Start the connection again from Claude.');
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: err }) => {
      if (err || !data) return setError(err?.message || 'This authorization request has expired. Start again from Claude.');
      if ('authorization_id' in data) setDetails(data);
      else window.location.href = data.redirect_url; // already approved earlier
    });
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    if (!supabase || !authorizationId) return;
    setBusy(true);
    const oauth = supabase.auth.oauth;
    const { error: err } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    // On success Supabase redirects the browser back to the client.
    if (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-5">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Can't connect</h1>
            <p className="text-sm text-slate-600">{error}</p>
            <a href="/" className="inline-block text-sm font-semibold text-blue-600 hover:underline">Back to the CRM</a>
          </>
        ) : !details ? (
          <p className="text-sm text-slate-500">Loading request…</p>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-slate-900">
                Allow {details.client.name || 'this app'} to use your CRM?
              </h1>
              <p className="text-sm text-slate-500">Signed in as {details.user.email}</p>
            </div>
            <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
              <li>Check and record LinkedIn connection requests</li>
              <li>Create and update contacts and their timeline</li>
              <li>Search your contacts</li>
            </ul>
            <p className="text-xs text-slate-400 break-all">It will return to {details.redirect_uri}</p>
            <div className="flex gap-3">
              <button
                onClick={() => decide(false)}
                disabled={busy}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Deny
              </button>
              <button
                onClick={() => decide(true)}
                disabled={busy}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                Allow
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
