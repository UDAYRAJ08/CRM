// ==============================================================================
// AI BULK EMAIL GENERATOR ENGINE
// Writes professional, conversion-focused B2B bulk emails highlighting the
// company's services, capabilities, and value propositions with dynamic merge tags.
// ==============================================================================

import { executeAICompletion } from './multiAiService';
import { getCompanyServiceProfile, CompanyServiceProfile } from './serviceProfile';
import { AIProviderId, getActiveAIProvider, getSelectedModel } from './aiConfig';

export type CampaignGoalKey =
  | 'agency_overflow'
  | 'shopify_cro'
  | 'capabilities'
  | 'deadlines'
  | 'followup'
  | 'intro'
  | 'reengagement'
  | 'custom';

export type EmailTone = 'professional' | 'persuasive' | 'concise' | 'friendly';

export interface GenerateBulkEmailOptions {
  campaignGoal: CampaignGoalKey;
  tone: EmailTone;
  highlightedServices?: string[];
  customInstructions?: string;
  senderName?: string;
  senderTitle?: string;
  provider?: AIProviderId;
  model?: string;
  customProfile?: Partial<CompanyServiceProfile>;
}

export interface BulkEmailVariation {
  id: string;
  title: string;
  pitchAngle: string;
  subject: string;
  body: string;
}

export interface BulkEmailGenerationResult {
  variations: BulkEmailVariation[];
  providerUsed: string;
  modelUsed: string;
  latencyMs: number;
  fallbackOccurred?: boolean;
}

export async function generateProfessionalBulkEmails(
  opts: GenerateBulkEmailOptions
): Promise<BulkEmailGenerationResult> {
  const profile = {
    ...getCompanyServiceProfile(),
    ...(opts.customProfile || {}),
  };

  const senderName = opts.senderName || profile.senderName || 'Uday Raj';
  const senderCompany = profile.companyName || 'Ingversions Digital';

  const servicesText = opts.highlightedServices && opts.highlightedServices.length > 0
    ? opts.highlightedServices.join('\n- ')
    : profile.services.join('\n- ');

  const valuePropsText = profile.valuePropositions.join('\n- ');

  const goalDescriptions: Record<CampaignGoalKey, string> = {
    agency_overflow: 'Offer specialist implementation capacity and discreet overflow support for client experimentation and commerce transformations without disrupting agency processes.',
    shopify_cro: 'Pitch Shopify CRO, A/B testing execution, conversion theme builds, analytics QA, and storefront performance.',
    capabilities: 'Highlight team capabilities, end-to-end task execution, and sprint turnaround for their upcoming projects.',
    deadlines: 'Pitch immediate assistance helping their team meet upcoming critical deadlines and eliminate project backlogs.',
    followup: 'Follow up professionally on a prior email or discussion, referencing ongoing support for their key initiatives.',
    intro: 'Cold executive introduction to our high-velocity team, establishing credibility and suggesting a low-friction sync.',
    reengagement: 'Re-engage a cold or quiet account with a fresh value hook regarding upcoming quarterly deliverables.',
    custom: opts.customInstructions || 'Pitch our services professionally to help their organization scale.',
  };

  const toneGuidelines: Record<EmailTone, string> = {
    professional: 'Authoritative, polished, executive, and consultative. Fluid, intelligent paragraphs without bullet points or sales fluff.',
    persuasive: 'Emphasize execution reliability, speed of delivery, risk-reduction, and discreet agency collaboration.',
    concise: 'Short, direct, minimal fluff. 3 to 4 punchy sentences designed for high reply rates from busy executives.',
    friendly: 'Warm, collaborative, personable, and relationship-oriented while remaining thoroughly professional.',
  };

  const systemPrompt = `You are an elite B2B sales copywriter and agency partnership strategist.
You craft high-converting, professional bulk emails for business service providers and agencies.

CRITICAL GUIDELINES:
1. MERGE TAGS:
   You MUST include dynamic merge tags so the email can be dispatched in bulk to individual recipients:
   - {{first_name}} : Recipient's first name
   - {{company}} : Recipient's company or organization
   - {{title}} : Recipient's job title (optional)
   - {{name}} : Recipient's full name

2. NO CLICHÉS:
   NEVER use generic openings like "I hope this email finds you well", "I hope you are having a wonderful week", or "Allow me to introduce myself".
   Open with an engaging, respectful greeting like "Hi {{first_name}}," followed immediately by an executive value hook or direct problem-solver.

3. SENDER CONTEXT & SERVICES:
   - Company: ${senderCompany}
   - Tagline / Focus: ${profile.tagline}
   - Core Services:
- ${servicesText}
   - Core Value Propositions:
- ${valuePropsText}
   - Target Call to Action: ${profile.defaultCTA}
   - Sign-off: Use "${senderName}" and "${senderCompany}".

4. WRITING STYLE & FORMAT:
   - Write in crisp, articulate paragraphs rather than raw bulleted lists.
   - For agency outreach, position ${senderCompany} as a discreet overflow or scoped delivery partner for the implementation and experimentation layer (Shopify CRO, A/B testing, theme builds, analytics QA) that operates without disrupting their client relationship or internal processes.
   - Return ONLY a valid JSON object with a single "variations" key containing an array of 3 distinct variations.
   No markdown wrapper around the JSON if possible, just the JSON string.
   Schema:
   {
     "variations": [
       {
         "id": "variation_1",
         "title": "Clear short label describing the angle",
         "pitchAngle": "Brief 1-sentence description of the strategic angle",
         "subject": "Compelling subject line with {{company}} or {{first_name}}",
         "body": "Complete email body text formatted with standard linebreaks and merge tags"
       }
     ]
   }`;

  const userPrompt = `Generate 3 distinct, high-converting B2B bulk outreach variations for:
- Goal: ${goalDescriptions[opts.campaignGoal]}
- Tone: ${toneGuidelines[opts.tone]}
- Services to Highlight:
- ${servicesText}
${opts.customInstructions ? `- Specific Instructions / Offers: ${opts.customInstructions}\n` : ''}

Generate 3 variations:
1. Variation 1: "Discreet Agency Overflow & Capacity" (Positions us as specialist capacity for implementation and experimentation layer, taking hypotheses/designs to production, tracking QA, without disrupting agency-client relationships)
2. Variation 2: "Shopify CRO & Experimentation Sprints" (Emphasizes high-converting theme builds, A/B testing execution, analytics QA, and storefront performance)
3. Variation 3: "Consultative Talent & Delivery Planning" (Direct, short executive inquiry on whether extra implementation capacity is relevant for upcoming quarters)

Remember to format with {{first_name}} and {{company}} merge tags and sign off with ${senderName}, ${senderCompany}.`;

  const provider = opts.provider || getActiveAIProvider();
  const model = opts.model || getSelectedModel(provider);

  const response = await executeAICompletion({
    provider,
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    maxTokens: 2500,
    jsonMode: true,
  });

  // Parse JSON response
  let variations: BulkEmailVariation[] = [];

  try {
    let cleanJson = response.text.trim();
    // Strip markdown code fences if model returned them
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed.variations) && parsed.variations.length > 0) {
      variations = parsed.variations.map((v: any, index: number) => ({
        id: v.id || `var_${index + 1}`,
        title: v.title || `Variation ${index + 1}`,
        pitchAngle: v.pitchAngle || 'Strategic B2B outreach angle',
        subject: v.subject || `Supporting {{company}}'s project milestones`,
        body: v.body || '',
      }));
    }
  } catch (err) {
    console.warn('[AIBulkGenerator] Failed to parse JSON variations, falling back to regex or simulation:', err);
  }

  // Fallback if variations were not parsed properly
  if (variations.length === 0) {
    variations = [
      {
        id: 'var_1',
        title: 'Discreet Agency Overflow & Capacity',
        pitchAngle: 'Specialist capacity for the implementation and experimentation layer without disrupting client processes',
        subject: `Specialist implementation capacity for {{company}}`,
        body: `Hi {{first_name}},

I’m reaching out because {{company}}’s Shopify Plus and commerce work appears to sit at the intersection of strategy, experience, and technical delivery. I wanted to ask whether your teams ever need additional specialist capacity for the implementation and experimentation layer of client work.

${senderCompany} helps ecommerce teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements. We can take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.

For {{company}}, this could be useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations. I’d be happy to share how we typically work alongside an existing agency team without interrupting its client relationship or process.

Would a short conversation be relevant for your talent or delivery planning?

Best regards,
${senderName}
${senderCompany}`,
      },
      {
        id: 'var_2',
        title: 'Shopify CRO & Experimentation Sprints',
        pitchAngle: 'Focuses on taking approved hypotheses to live storefront builds with verified analytics QA',
        subject: `Shopify CRO & experimentation support for {{company}}`,
        body: `Hi {{first_name}},

When your team at {{company}} is rolling out commerce transformations or conversion roadmaps, executing the backlog of A/B tests, landing-page variants, and theme tweaks can quickly strain internal engineering resources.

At ${senderCompany}, we specialize in the execution layer: turning approved hypotheses into clean Shopify builds, verifying cross-device tracking, and managing pre-launch QA so your client experiments go live without delay.

We function as a seamless extension of your delivery team with zero operational friction.

Would a quick 10-minute sync be worth exploring for your upcoming sprint planning?

Best regards,
${senderName}
${senderCompany}`,
      },
      {
        id: 'var_3',
        title: 'Executive Delivery Planning Note',
        pitchAngle: 'Concise consultative inquiry tailored for busy agency and delivery leaders',
        subject: `Quick question regarding {{company}}'s implementation bandwidth`,
        body: `Hi {{first_name}},

Quick question: does {{company}} ever bring in external specialist capacity for the implementation and experimentation layer of client work—specifically Shopify CRO, theme builds, or analytics QA?

We partner with agency teams as discreet overflow during peak delivery periods or large transformations, operating strictly in the background without touching your client relationships.

Would a brief conversation be relevant for your upcoming delivery planning?

Best regards,
${senderName}
${senderCompany}`,
      },
    ];
  }

  return {
    variations,
    providerUsed: response.provider,
    modelUsed: response.model,
    latencyMs: response.latencyMs,
    fallbackOccurred: response.fallbackOccurred,
  };
}
