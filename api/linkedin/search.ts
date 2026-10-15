import {
  getLinkedInCredentials,
  buildLinkedInHeaders,
  fetchLinkedInVoyager,
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
        error: 'LinkedIn session cookie (li_at) is required. Please set LINKEDIN_LI_AT in Vercel environment variables or enter it in the app.',
        expiredCookie: true,
      });
    }

    let searchKeywords = (body.keywords || '').trim();
    const searchUrl = (body.searchUrl || '').trim();

    // If a search URL was pasted, parse query parameters
    if (searchUrl) {
      try {
        const parsed = new URL(searchUrl);
        const urlKeywords = parsed.searchParams.get('keywords');
        if (urlKeywords) searchKeywords = urlKeywords;
      } catch {
        const match = searchUrl.match(/keywords=([^&]+)/);
        if (match) searchKeywords = decodeURIComponent(match[1]);
      }
    }

    if (!searchKeywords) {
      return res.status(400).json({
        success: false,
        error: 'Search keywords or a valid LinkedIn search URL are required.',
      });
    }

    const headers = buildLinkedInHeaders(liAt, csrfToken, rawCookie);
    const encodedKeywords = encodeURIComponent(searchKeywords);

    const clusterUrl = `https://www.linkedin.com/voyager/api/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-174&origin=GLOBAL_SEARCH_HEADER&q=all&query=(keywords:${encodedKeywords},flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(PEOPLE))))`;
    const blendedUrl = `https://www.linkedin.com/voyager/api/search/blended?keywords=${encodedKeywords}&origin=GLOBAL_SEARCH_HEADER&q=all&filters=List(resultType->PEOPLE)`;

    let searchRes: any = null;
    try {
      searchRes = await fetchLinkedInVoyager(clusterUrl, { headers });
    } catch (e) {
      console.warn('Cluster search failed, trying blended search:', e);
    }

    // Check for cookie expiry / login checkpoint redirect
    if (searchRes && (searchRes.status === 301 || searchRes.status === 302 || searchRes.status === 401 || searchRes.status === 403)) {
      return res.status(401).json({
        success: false,
        error: 'LinkedIn session cookie (li_at) has expired or was challenged. Please update it in Vercel settings or in the app.',
        expiredCookie: true,
      });
    }

    if (!searchRes || !searchRes.ok) {
      try {
        searchRes = await fetchLinkedInVoyager(blendedUrl, { headers });
      } catch (e) {
        console.warn('Blended search failed:', e);
      }
    }

    if (searchRes && (searchRes.status === 301 || searchRes.status === 302 || searchRes.status === 401 || searchRes.status === 403)) {
      return res.status(401).json({
        success: false,
        error: 'LinkedIn session cookie (li_at) has expired or was challenged. Please update it in Vercel settings or in the app.',
        expiredCookie: true,
      });
    }

    if (!searchRes || !searchRes.ok) {
      const status = searchRes?.status || 400;
      const errText = searchRes ? await searchRes.text().catch(() => '') : '';
      return res.status(status >= 400 && status < 500 ? status : 400).json({
        success: false,
        error: `LinkedIn search returned status ${status}. Your cookie may be challenged or proxy required.`,
        details: errText.slice(0, 300),
        expiredCookie: status === 401 || status === 403 || status === 302,
      });
    }

    const rawData = (await searchRes.json()) as any;
    const prospects: any[] = [];
    const targetTitles: string[] = (body.filters?.targetTitles || []).map((t: string) => t.trim().toLowerCase()).filter(Boolean);
    const negativeKeywords: string[] = (body.filters?.negativeKeywords || []).map((n: string) => n.trim().toLowerCase()).filter(Boolean);
    const targetLocations: string[] = (body.filters?.locations || []).map((l: string) => l.trim().toLowerCase()).filter(Boolean);

    const parseAvatar = (item: any): string | undefined => {
      const vector =
        item?.image?.attributes?.[0]?.detailData?.['com.linkedin.common.VectorImage'] ||
        item?.picture?.['com.linkedin.common.VectorImage'] ||
        item?.picture;
      if (vector?.rootUrl && Array.isArray(vector?.artifacts) && vector.artifacts.length > 0) {
        return `${vector.rootUrl}${vector.artifacts[0].fileIdentifyingUrlPath}`;
      }
      return undefined;
    };

    const items = [...(rawData.included || []), ...(rawData.elements || [])];
    const seenUrls = new Set<string>();

    for (const item of items) {
      const name = item.title?.text || item.title || '';
      const headline = item.primarySubtitle?.text || item.headline || '';
      const location = item.secondarySubtitle?.text || item.subline || '';
      let navUrl = item.navigationUrl || '';
      const distance = item.badgeText?.text || item.distance || '2nd';

      if (!navUrl && item.publicIdentifier) {
        navUrl = `https://www.linkedin.com/in/${item.publicIdentifier}`;
      }

      if (!name || !headline) continue;
      if (!navUrl.includes('/in/') && !item.publicIdentifier) continue;

      let vanity = '';
      const vanityMatch = navUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
      if (vanityMatch) {
        vanity = decodeURIComponent(vanityMatch[1]);
      } else if (item.publicIdentifier) {
        vanity = item.publicIdentifier;
      }

      if (!vanity || seenUrls.has(vanity.toLowerCase())) continue;
      seenUrls.add(vanity.toLowerCase());

      const profileUrl = `https://www.linkedin.com/in/${vanity}`;
      const avatarUrl = parseAvatar(item);

      let isQualified = true;
      let qualificationReason = 'Matches all criteria';

      const headlineLower = headline.toLowerCase();
      const nameLower = name.toLowerCase();

      // Negative keywords check
      if (negativeKeywords.length > 0) {
        const matchedNeg = negativeKeywords.find((neg: string) => headlineLower.includes(neg) || nameLower.includes(neg));
        if (matchedNeg) {
          isQualified = false;
          qualificationReason = `Excluded by keyword: "${matchedNeg}"`;
        }
      }

      // Target titles check
      if (isQualified && targetTitles.length > 0) {
        const matchesTitle = targetTitles.some((title: string) => headlineLower.includes(title));
        if (!matchesTitle) {
          isQualified = false;
          qualificationReason = `Does not match target title keywords`;
        }
      }

      // Location check
      if (isQualified && targetLocations.length > 0) {
        const locationLower = location.toLowerCase();
        const matchesLoc = targetLocations.some((loc: string) => locationLower.includes(loc));
        if (!matchesLoc) {
          isQualified = false;
          qualificationReason = `Does not match target location`;
        }
      }

      prospects.push({
        fullName: name,
        headline,
        location,
        vanity,
        profileUrl,
        avatarUrl,
        networkDistance: distance.replace(/[^0-9a-zA-Z]/g, ''),
        isQualified,
        qualificationReason,
      });
    }

    return res.status(200).json({
      success: true,
      totalFound: prospects.length,
      qualifiedCount: prospects.filter((p) => p.isQualified).length,
      prospects,
    });
  } catch (err: any) {
    console.error('Vercel LinkedIn search error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error executing LinkedIn search on Vercel',
    });
  }
}
