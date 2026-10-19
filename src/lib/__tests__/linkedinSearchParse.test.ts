import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase', () => ({ db: {} }));
vi.mock('../multiAiService', () => ({ executeAICompletion: vi.fn() }));

import { parseLinkedInSearchResults } from '../linkedinAutomationService';

const person = (vanity: string, headline: string, location = 'Mumbai') => ({
  title: { text: `Name ${vanity}` },
  primarySubtitle: { text: headline },
  secondarySubtitle: { text: location },
  navigationUrl: `https://www.linkedin.com/in/${vanity}?mini=true`,
  badgeText: { text: '• 2nd' },
});

describe('parseLinkedInSearchResults', () => {
  it('extracts people, dedupes, and skips non-profiles', () => {
    const out = parseLinkedInSearchResults({
      included: [person('a', 'CTO'), person('a', 'CTO'), { title: { text: 'Acme' }, primarySubtitle: { text: 'Company' }, navigationUrl: 'https://www.linkedin.com/company/acme' }],
      elements: [person('b', 'Founder')],
    });
    expect(out.map((p) => p.vanity)).toEqual(['a', 'b']);
    expect(out[0]).toMatchObject({ profileUrl: 'https://www.linkedin.com/in/a', networkDistance: '2nd', isQualified: true });
  });

  it('parses the GraphQL voyagerSearchDashClusters shape', () => {
    const out = parseLinkedInSearchResults({
      data: { data: { searchDashClustersByAll: { '*elements': [] } } },
      included: [
        { $type: 'com.linkedin.voyager.dash.search.SearchClusterViewModel', title: { text: 'People' } },
        {
          $type: 'com.linkedin.voyager.dash.search.EntityResultViewModel',
          entityUrn: 'urn:li:fsd_entityResultViewModel:(urn:li:fsd_profile:ACoAA,SEARCH_SRP,DEFAULT)',
          title: { text: 'Jane Doe' },
          primarySubtitle: { text: 'Founder at Acme' },
          secondarySubtitle: { text: 'Lucknow' },
          navigationUrl: 'https://www.linkedin.com/in/jane-doe?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAA',
          badgeText: { text: '• 2nd' },
          image: {
            attributes: [
              { detailData: { nonEntityProfilePicture: { vectorImage: { rootUrl: 'https://media/', artifacts: [{ fileIdentifyingUrlPath: 'p.jpg' }] } } } },
            ],
          },
        },
      ],
    });
    expect(out).toEqual([
      expect.objectContaining({
        fullName: 'Jane Doe',
        headline: 'Founder at Acme',
        location: 'Lucknow',
        vanity: 'jane-doe',
        profileUrl: 'https://www.linkedin.com/in/jane-doe',
        avatarUrl: 'https://media/p.jpg',
        networkDistance: '2nd',
      }),
    ]);
  });

  it('applies negative keyword, title and location filters', () => {
    const out = parseLinkedInSearchResults(
      { included: [person('a', 'CTO at X'), person('b', 'Intern'), person('c', 'CTO', 'Delhi'), person('d', 'Recruiter CTO')] },
      { targetTitles: ['CTO'], negativeKeywords: ['recruiter'], locations: ['mumbai'] }
    );
    expect(out.map((p) => [p.vanity, p.isQualified])).toEqual([['a', true], ['b', false], ['c', false], ['d', false]]);
    expect(out[3].qualificationReason).toBe('Excluded by keyword: "recruiter"');
  });
});
