// ==============================================================================
// AI EMAIL DRAFT SERVICE
// Integrates with Multi-AI system (OpenAI, Claude, Gemini, Groq, DeepSeek, OpenRouter)
// for personalized 1-on-1 drafts and interaction synthesis.
// ==============================================================================

import { Contact, Interaction } from '../types/crm';
import { executeAICompletion } from './multiAiService';
import { getCompanyServiceProfile } from './serviceProfile';
import { getActiveAIProvider, getSelectedModel } from './aiConfig';

export interface GenerateAIDraftOptions {
  contact: Contact;
  recentInteractions: Interaction[];
  senderName: string;
  goal: string;
  tone: 'professional' | 'friendly' | 'concise' | 'persuasive';
  customInstructions?: string;
  provider?: string;
  model?: string;
}

export interface AIDraftResponse {
  subject: string;
  body: string;
  source: 'ai_completion' | 'edge_function' | 'local_generator';
  provider?: string;
  model?: string;
}

export async function generateAIEmailDraft(options: GenerateAIDraftOptions): Promise<AIDraftResponse> {
  const profile = getCompanyServiceProfile();
  const firstName = options.contact.name.split(' ')[0] || options.contact.name;
  const company = options.contact.company?.name || 'your company';
  const role = options.contact.title ? `as ${options.contact.title}` : '';
  const lastInteraction = options.recentInteractions[0];

  const interactionsContext = options.recentInteractions.length > 0
    ? options.recentInteractions
        .slice(0, 5)
        .map((i) => `- [${new Date(i.created_at).toLocaleDateString()}] ${i.type.toUpperCase()}: ${i.content}`)
        .join('\n')
    : 'No previous interactions recorded.';

  const systemPrompt = `You are an elite B2B sales strategist writing tailored, high-converting partnership and outreach emails for ${options.senderName} at ${profile.companyName} (${profile.tagline}).

Core Specialty & Services:
${profile.services.map((s) => `- ${s}`).join('\n')}

Core Value Propositions:
${profile.valuePropositions.map((v) => `- ${v}`).join('\n')}

Target Email Structure & Voice:
You write in an executive, consultative, high-credibility tone (similar to top agency-to-agency partnership letters). Avoid generic sales pitches, hyperbole, or robotic bullet points. Write in elegant, focused paragraphs.

1. GREETING & CONTEXTUAL HOOK:
   Open with "Hi ${firstName},"
   Immediately open with an observant, personalized bridge acknowledging ${company}—specifically how their work (e.g., in Shopify Plus, commerce, digital experiences, or engineering) appears to sit at the intersection of strategy, experience, and technical delivery. Ask whether their teams ever need additional specialist capacity for the implementation and experimentation layer of client work.

2. EXECUTION CAPABILITY & CONCRETE SCOPE:
   Introduce how ${profile.companyName} helps ecommerce and digital teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements.
   Highlight our ability to take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.

3. DISCREET OVERFLOW & AGENCY-SAFE COLLABORATION:
   Explain that for ${company}, this is useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations or tight client deadlines.
   Reassure them that we work seamlessly alongside existing teams without interrupting client relationships or internal processes.

4. FRICTIONLESS CALL TO ACTION:
   Conclude with a low-friction consultative question, such as: "Would a short conversation be relevant for your talent or delivery planning?"

5. SIGN OFF:
   Best regards,
   ${options.senderName}
   ${profile.companyName}

CRITICAL RULES:
- NEVER use generic clichés like "I hope this email finds you well" or "Hope you're having a great week".
- Write in clean, articulate paragraphs rather than raw bullet-point lists.
- Adapt intelligently to the recipient's role (${role || 'leadership'}), company (${company}), and any past interactions.
- Return valid JSON with strictly two keys: "subject" and "body".`;

  const userPrompt = `Generate a personalized email draft for:
Recipient:
- Name: ${options.contact.name}
- Title: ${options.contact.title || 'Not specified'}
- Company: ${company}
- Status: ${options.contact.status}

Interaction History:
${interactionsContext}

Goal:
${options.goal}

Tone:
${options.tone}

${options.customInstructions ? `Additional Notes / Specific Focus: ${options.customInstructions}\n` : ''}

Output JSON format:
{
  "subject": "...",
  "body": "..."
}`;

  try {
    const activeProvider = (options.provider as any) || getActiveAIProvider();
    const activeModel = options.model || getSelectedModel(activeProvider);

    const completion = await executeAICompletion({
      provider: activeProvider,
      model: activeModel,
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxTokens: 1500,
      jsonMode: true,
    });

    // Parse JSON
    let cleanJson = completion.text.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(cleanJson);
      if (parsed.subject && parsed.body) {
        return {
          subject: parsed.subject,
          body: parsed.body,
          source: completion.provider === 'local_fallback' ? 'local_generator' : 'ai_completion',
          provider: completion.provider,
          model: completion.model,
        };
      }
    } catch {
      // Regex fallback if JSON was slightly malformed
      const subMatch = cleanJson.match(/"subject":\s*"([^"]+)"/);
      if (subMatch) {
        return {
          subject: subMatch[1],
          body: cleanJson,
          source: 'ai_completion',
          provider: completion.provider,
          model: completion.model,
        };
      }
    }
  } catch (err) {
    console.warn('[AIService] Unified AI completion failed, using intelligent local template fallback', err);
  }

  // High-fidelity fallback matching the exact high-converting agency overflow format
  const interactionReference = lastInteraction
    ? `Following up on our recent ${lastInteraction.type} regarding ${lastInteraction.content.slice(0, 80).toLowerCase()}...\n\n`
    : '';

  const subject = `Specialist implementation capacity for ${company}`;
  const body = `Hi ${firstName},

${interactionReference}I’m reaching out because ${company}’s Shopify Plus and commerce work appears to sit at the intersection of strategy, experience, and technical delivery. I wanted to ask whether your teams ever need additional specialist capacity for the implementation and experimentation layer of client work.

${profile.companyName} helps ecommerce teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements. We can take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.

For ${company}, this could be useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations. I’d be happy to share how we typically work alongside an existing agency team without interrupting its client relationship or process.
${options.customInstructions ? `\nSpecial focus: ${options.customInstructions}\n` : ''}
Would a short conversation be relevant for your talent or delivery planning?

Best regards,
${options.senderName}
${profile.companyName}`;

  return {
    subject,
    body,
    source: 'local_generator',
  };
}
