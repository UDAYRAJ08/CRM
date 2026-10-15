import {
  getLinkedInCredentials,
  buildLinkedInHeaders,
  fetchLinkedInVoyager,
  getDailyQuota,
  incrementDailyQuota,
} from './_helpers.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { liAt, csrfToken, rawCookie } = getLinkedInCredentials(body);

    if (!liAt) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn session cookie (LINKEDIN_LI_AT) is not configured in Vercel environment variables.',
      });
    }

    const quota = getDailyQuota();
    if (quota.count >= quota.maxLimit) {
      return res.status(429).json({
        success: false,
        error: `Daily safety limit reached (${quota.maxLimit}/${quota.maxLimit}). Please wait until tomorrow.`,
      });
    }

    const { profileUrl, note, contactName } = body;
    if (!profileUrl && !contactName) {
      return res.status(400).json({ success: false, error: 'profileUrl or contactName is required' });
    }

    let vanity = '';
    if (profileUrl) {
      const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
      if (match) vanity = decodeURIComponent(match[1]).replace(/\/$/, '');
    }
    if (!vanity && contactName) {
      vanity = contactName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    }

    const headers = buildLinkedInHeaders(liAt, csrfToken, rawCookie);

    // Step A: Resolve Profile and Member ID
    let targetProfileId: string | null = null;
    let targetPublicName = contactName || vanity;

    if (vanity) {
      try {
        const queryUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(
          vanity
        )}`;
        const profileRes = await fetchLinkedInVoyager(queryUrl, { headers });
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
      } catch (e) {
        console.warn('Profile ID resolution fallback:', e);
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

    const inviteRes = await fetchLinkedInVoyager(
      'https://www.linkedin.com/voyager/api/growth/normInvitations',
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
        },
        body: JSON.stringify(invitePayload),
      }
    );

    const inviteStatus = inviteRes.status;
    const resText = await inviteRes.text();

    if (inviteStatus === 200 || inviteStatus === 201 || inviteStatus === 204) {
      const newCount = incrementDailyQuota();
      return res.status(200).json({
        success: true,
        message: `Connection request sent to ${targetPublicName}!`,
        sentToday: newCount,
        remaining: Math.max(0, quota.maxLimit - newCount),
      });
    }

    // Handle already invited or duplicate
    if (
      resText.includes('INVITATION_ALREADY_SENT') ||
      resText.includes('already invited') ||
      resText.includes('DUPLICATE')
    ) {
      return res.status(200).json({
        success: true,
        message: `Connection request is already pending for ${targetPublicName}.`,
        alreadySent: true,
        sentToday: quota.count,
        remaining: Math.max(0, quota.maxLimit - quota.count),
      });
    }

    // Cookie challenged / expired
    if (inviteStatus === 401 || inviteStatus === 403 || inviteStatus === 302) {
      return res.status(401).json({
        success: false,
        error: 'LinkedIn session cookie (li_at) has expired or was challenged. Please update it.',
        expiredCookie: true,
      });
    }

    return res.status(inviteStatus >= 400 && inviteStatus < 500 ? inviteStatus : 400).json({
      success: false,
      error: `LinkedIn returned status ${inviteStatus}. Check that the profile URL is valid.`,
      details: resText.slice(0, 300),
    });
  } catch (err: any) {
    console.error('Vercel LinkedIn invite error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error dispatching LinkedIn invite on Vercel',
    });
  }
}
