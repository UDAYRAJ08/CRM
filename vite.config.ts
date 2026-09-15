import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import fs from 'fs'
import path from 'path'

// Helper for local daily quota tracking
const QUOTA_FILE = path.resolve(process.cwd(), 'scratch', 'linkedin_quota.json');
const MAX_DAILY_LIMIT = 20;

function getDailyQuotaRecord(): { date: string; count: number } {
  try {
    if (fs.existsSync(QUOTA_FILE)) {
      const data = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
      const today = new Date().toISOString().slice(0, 10);
      if (data.date === today) {
        return data;
      }
    }
  } catch {}
  return { date: new Date().toISOString().slice(0, 10), count: 0 };
}

function incrementDailyQuota(): number {
  const current = getDailyQuotaRecord();
  const updated = { date: new Date().toISOString().slice(0, 10), count: current.count + 1 };
  try {
    const dir = path.dirname(QUOTA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write quota file', err);
  }
  return updated.count;
}

function linkedinAutomationPlugin(): Plugin {
  return {
    name: 'linkedin-automation-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/linkedin')) {
          return next();
        }

        const env = loadEnv('development', process.cwd(), '');
        const liAt = env.LINKEDIN_LI_AT || env.VITE_LINKEDIN_LI_AT || '';
        const rawCsrf = env.LINKEDIN_JSESSIONID || env.VITE_LINKEDIN_JSESSIONID || 'ajax:1501412021019096562';
        const csrfToken = rawCsrf.replace(/^["']|["']$/g, '');

        res.setHeader('Content-Type', 'application/json');

        // 1. Quota Check Endpoint
        if (req.url === '/api/linkedin/quota' && req.method === 'GET') {
          const quota = getDailyQuotaRecord();
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              success: true,
              date: quota.date,
              sentToday: quota.count,
              maxDailyLimit: MAX_DAILY_LIMIT,
              remaining: Math.max(0, MAX_DAILY_LIMIT - quota.count),
              hasSessionCookie: Boolean(liAt),
            })
          );
        }

        // 2. Send Connection Invitation Endpoint
        if (req.url === '/api/linkedin/invite' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => (bodyStr += chunk));
          req.on('end', async () => {
            try {
              if (!liAt) {
                res.statusCode = 400;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'LinkedIn session cookie (LINKEDIN_LI_AT) is not configured in .env',
                  })
                );
              }

              const quota = getDailyQuotaRecord();
              if (quota.count >= MAX_DAILY_LIMIT) {
                res.statusCode = 429;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: `Daily safety limit reached (${MAX_DAILY_LIMIT}/${MAX_DAILY_LIMIT}). Please wait until tomorrow to prevent LinkedIn flags.`,
                  })
                );
              }

              const { profileUrl, note, contactName } = JSON.parse(bodyStr || '{}');
              if (!profileUrl && !contactName) {
                res.statusCode = 400;
                return res.end(
                  JSON.stringify({ success: false, error: 'profileUrl or contactName is required' })
                );
              }

              // Extract vanity name or public identifier from profile URL
              let vanity = '';
              if (profileUrl) {
                const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
                if (match) vanity = decodeURIComponent(match[1]).replace(/\/$/, '');
              }
              if (!vanity && contactName) {
                vanity = contactName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
              }

              const commonHeaders: Record<string, string> = {
                cookie: `li_at=${liAt}; JSESSIONID="${csrfToken}"`,
                'csrf-token': csrfToken,
                'x-restli-protocol-version': '2.0.0',
                'user-agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                accept: 'application/vnd.linkedin.normalized+json+2.1',
              };

              // Step A: Resolve Profile and Member ID
              let targetProfileId: string | null = null;
              let targetPublicName = contactName || vanity;

              if (vanity) {
                const queryUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(
                  vanity
                )}`;
                const profileRes = await fetch(queryUrl, { headers: commonHeaders });
                if (profileRes.ok) {
                  const profileData = (await profileRes.json()) as any;
                  for (const inc of profileData.included || []) {
                    if (inc.$type?.includes('Profile') && inc.entityUrn) {
                      const parts = inc.entityUrn.split(':');
                      targetProfileId = parts[parts.length - 1];
                      if (inc.firstName || inc.lastName) {
                        targetPublicName = `${inc.firstName || ''} ${inc.lastName || ''}`.trim();
                      }
                      break;
                    }
                  }
                }
              }

              // Step B: Send Connection Invitation via Voyager
              const invitePayload: any = {
                message: (note || '').slice(0, 300),
              };

              if (targetProfileId) {
                invitePayload.invitee = {
                  'com.linkedin.voyager.growth.invitation.InviteeProfile': {
                    profileId: targetProfileId,
                  },
                };
              } else {
                invitePayload.invitee = {
                  'com.linkedin.voyager.growth.invitation.InviteeProfile': {
                    profileId: vanity,
                  },
                };
              }

              const inviteRes = await fetch(
                'https://www.linkedin.com/voyager/api/growth/normInvitations',
                {
                  method: 'POST',
                  headers: {
                    ...commonHeaders,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(invitePayload),
                }
              );

              const inviteStatus = inviteRes.status;
              const resText = await inviteRes.text();

              if (inviteStatus === 200 || inviteStatus === 201 || inviteStatus === 204) {
                const newCount = incrementDailyQuota();
                res.statusCode = 200;
                return res.end(
                  JSON.stringify({
                    success: true,
                    message: `Connection request sent to ${targetPublicName}!`,
                    sentToday: newCount,
                    remaining: Math.max(0, MAX_DAILY_LIMIT - newCount),
                  })
                );
              }

              // Handle already invited or connection pending
              if (
                resText.includes('INVITATION_ALREADY_SENT') ||
                resText.includes('already invited') ||
                resText.includes('DUPLICATE')
              ) {
                res.statusCode = 200;
                return res.end(
                  JSON.stringify({
                    success: true,
                    message: `Connection request is already pending for ${targetPublicName}.`,
                    alreadySent: true,
                    sentToday: quota.count,
                    remaining: Math.max(0, MAX_DAILY_LIMIT - quota.count),
                  })
                );
              }

              // Other Voyager response handling
              console.warn('LinkedIn invite response error:', inviteStatus, resText);
              res.statusCode = inviteStatus >= 400 && inviteStatus < 500 ? inviteStatus : 400;
              return res.end(
                JSON.stringify({
                  success: false,
                  error: `LinkedIn returned status ${inviteStatus}. Check that the profile URL is valid.`,
                  details: resText,
                })
              );
            } catch (err: any) {
              console.error('LinkedIn automation error:', err);
              res.statusCode = 500;
              return res.end(
                JSON.stringify({
                  success: false,
                  error: err.message || 'Internal error dispatching LinkedIn invite',
                })
              );
            }
          });
          return;
        }

        // Catch-all
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), linkedinAutomationPlugin()],
  server: {
    proxy: {
      '/api/resend': {
        target: 'https://api.resend.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/resend/, ''),
      },
      '/api/composio': {
        target: 'https://connect.composio.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/composio/, '/mcp'),
      },
    },
  },
})
