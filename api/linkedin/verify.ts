import {
  getLinkedInCredentials,
  buildLinkedInHeaders,
  fetchLinkedInVoyager,
} from './_helpers';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { liAt, csrfToken, rawCookie } = getLinkedInCredentials(body);

    if (!liAt) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'LinkedIn session cookie (li_at) is required.',
        expiredCookie: true,
      });
    }

    const headers = buildLinkedInHeaders(liAt, csrfToken, rawCookie);

    // Test session by fetching current user identity from Voyager
    const meRes = await fetchLinkedInVoyager('https://www.linkedin.com/voyager/api/me', {
      headers,
    });

    if (
      meRes.status === 301 ||
      meRes.status === 302 ||
      meRes.status === 401 ||
      meRes.status === 403
    ) {
      return res.status(200).json({
        success: true,
        valid: false,
        error: 'LinkedIn session cookie (li_at) has expired or was challenged.',
        expiredCookie: true,
      });
    }

    if (!meRes.ok) {
      const errText = await meRes.text().catch(() => '');
      return res.status(200).json({
        success: true,
        valid: false,
        error: `LinkedIn verification returned status ${meRes.status}`,
        details: errText.slice(0, 200),
      });
    }

    const meData = (await meRes.json()) as any;
    const mini = meData.miniProfile || meData;

    const firstName = mini.firstName || meData.firstName || '';
    const lastName = mini.lastName || meData.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const headline = mini.occupation || meData.headline || meData.occupation || '';
    const publicIdentifier = mini.publicIdentifier || meData.publicIdentifier || '';
    const profileUrl = publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}` : undefined;

    let avatarUrl: string | undefined = undefined;
    const vector =
      mini.picture?.['com.linkedin.common.VectorImage'] ||
      meData.picture?.['com.linkedin.common.VectorImage'] ||
      mini.picture;

    if (vector?.rootUrl && Array.isArray(vector?.artifacts) && vector.artifacts.length > 0) {
      avatarUrl = `${vector.rootUrl}${vector.artifacts[0].fileIdentifyingUrlPath}`;
    }

    return res.status(200).json({
      success: true,
      valid: true,
      profile: {
        name: fullName || 'LinkedIn User',
        headline,
        publicIdentifier,
        profileUrl,
        avatarUrl,
      },
    });
  } catch (err: any) {
    console.error('Vercel LinkedIn verify error:', err);
    return res.status(500).json({
      success: false,
      valid: false,
      error: err.message || 'Internal error verifying LinkedIn cookie',
    });
  }
}
