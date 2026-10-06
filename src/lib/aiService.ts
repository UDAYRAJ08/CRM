// ==============================================================================
// AI EMAIL DRAFT SERVICE
// Integrates with Multi-AI system (OpenAI, Claude, Gemini, Groq, DeepSeek, OpenRouter)
// for personalized 1-on-1 drafts and full past conversation synthesis.
// ==============================================================================

import { Contact, Interaction, EmailRecord } from '../types/crm';
import { executeAICompletion } from './multiAiService';
import { getCompanyServiceProfile } from './serviceProfile';
import { getActiveAIProvider, getSelectedModel } from './aiConfig';
import { resolveContactCompany } from './emailService';
import { stripHtml } from './utils';

export interface ConversationMessage {
  direction: 'inbound' | 'outbound' | 'internal_note';
  sender: string;
  recipient?: string;
  subject?: string;
  content: string;
  date: string;
}

export interface GenerateAIDraftOptions {
  contact: Contact;
  recentInteractions: Interaction[];
  pastEmails?: EmailRecord[];
  conversationHistory?: ConversationMessage[];
  includeConversationContext?: boolean;
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
  conversationMessagesAnalyzed?: number;
}

/**
 * Synthesizes all past emails, inbound replies, and logged interactions
 * into a single unified chronological conversation thread for the AI to read.
 */
export function buildConversationHistory(
  emails: EmailRecord[] = [],
  interactions: Interaction[] = [],
  contactName: string = 'Lead'
): ConversationMessage[] {
  const items: ConversationMessage[] = [];

  // 1. Process all past EmailRecords
  for (const e of emails) {
    const isInbound = Boolean(e.is_inbound || e.status === 'received');
    items.push({
      direction: isInbound ? 'inbound' : 'outbound',
      sender: isInbound ? (contactName || 'Lead') : (e.sender?.name || 'CRM Team'),
      recipient: isInbound ? 'CRM Team' : (contactName || 'Lead'),
      subject: e.subject || undefined,
      content: stripHtml(e.body),
      date: e.sent_at || e.created_at || new Date().toISOString(),
    });
  }

  // 2. Process all Interaction logs (replies, notes, calls, meetings)
  for (const i of interactions) {
    const cleanContent = stripHtml(i.content);
    if (!cleanContent) continue;

    if ((i.type as string) === 'reply_received') {
      const alreadyLogged = items.some(
        (m) => m.direction === 'inbound' && m.content.slice(0, 50) === cleanContent.slice(0, 50)
      );
      if (!alreadyLogged) {
        items.push({
          direction: 'inbound',
          sender: contactName || 'Lead',
          content: cleanContent,
          date: i.created_at,
        });
      }
    } else if (i.type === 'email') {
      const alreadyLogged = items.some(
        (m) => m.direction === 'outbound' && m.content.slice(0, 50) === cleanContent.slice(0, 50)
      );
      if (!alreadyLogged) {
        items.push({
          direction: 'outbound',
          sender: i.creator?.name || 'CRM Team',
          content: cleanContent,
          date: i.created_at,
        });
      }
    } else if (i.type === 'call' || i.type === 'meeting' || i.type === 'note') {
      items.push({
        direction: 'internal_note',
        sender: i.creator?.name || 'Team Member',
        content: `[${i.type.toUpperCase()}] ${cleanContent}`,
        date: i.created_at,
      });
    } else if (i.type === 'linkedin') {
      items.push({
        direction: 'outbound',
        sender: i.creator?.name || 'Team Member',
        content: `[LinkedIn Outreach] ${cleanContent}`,
        date: i.created_at,
      });
    }
  }

  // Sort chronologically: oldest to newest so newest message is at the end of the history
  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return items;
}

export async function generateAIEmailDraft(options: GenerateAIDraftOptions): Promise<AIDraftResponse> {
  const profile = getCompanyServiceProfile();
  const firstName = options.contact.name.split(' ')[0] || options.contact.name;
  const company = resolveContactCompany(options.contact) || 'your company';
  const role = options.contact.title ? `as ${options.contact.title}` : '';

  // Synthesize or use provided conversation history
  const conversationHistory = options.conversationHistory || buildConversationHistory(
    options.pastEmails || [],
    options.recentInteractions || [],
    options.contact.name
  );

  const hasConversation = options.includeConversationContext !== false && conversationHistory.length > 0;
  const latestMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1] : null;

  // Format conversation history for AI prompt
  const formattedConversation = conversationHistory.map((item, idx) => {
    const dirLabel = item.direction === 'inbound'
      ? `INBOUND (From ${item.sender})`
      : item.direction === 'outbound'
      ? `OUTBOUND (Sent by ${item.sender})`
      : `INTERNAL LOG (${item.sender})`;
    const subjectLine = item.subject ? ` | Subject: "${item.subject}"` : '';
    const dateStr = item.date ? new Date(item.date).toLocaleDateString() : '';
    return `--- Message ${idx + 1} [${dateStr}] ${dirLabel}${subjectLine} ---\n${item.content}`;
  }).join('\n\n');

  // Fallback simple interaction text
  const interactionsContext = options.recentInteractions.length > 0
    ? options.recentInteractions
        .slice(0, 5)
        .map((i) => `- [${new Date(i.created_at).toLocaleDateString()}] ${i.type.toUpperCase()}: ${stripHtml(i.content)}`)
        .join('\n')
    : 'No previous interactions recorded.';

  // Construct context-aware system prompt
  const systemPrompt = hasConversation
    ? `You are an elite B2B sales strategist and executive account director for ${options.senderName} at ${profile.companyName} (${profile.tagline}).

Core Specialty & Services:
${profile.services.map((s) => `- ${s}`).join('\n')}

Core Value Propositions:
${profile.valuePropositions.map((v) => `- ${v}`).join('\n')}

MODE: ONGOING CLIENT CONVERSATION CONTINUATION & STRATEGIC FOLLOW-UP
You are actively continuing an existing, ongoing email conversation with ${options.contact.name} at ${company}.

CRITICAL CONVERSATION CONTINUATION RULES:
1. CAREFULLY READ THE PAST CONVERSATION THREAD PROVIDED BELOW.
2. DO NOT ACT LIKE A COLD STRANGER. Never open with "I'm reaching out because I saw..." or re-introduce company credentials from zero if they were already introduced.
3. Natural Contextual Hook: Acknowledge what was previously discussed or where things were left off. If the client asked questions (e.g., regarding pricing, capabilities, timeline, or availability), answer or address them with high clarity and authority.
4. If following up on an unreplied outbound message, write a polite, high-value, concise bump that adds fresh perspective, references the prior note, or asks a low-friction question.
5. If replying to an inbound message from the client, craft a direct, warm, consultative reply addressing their points.
6. Advance the conversation forward towards the Communication Goal: "${options.goal}".
7. Tone of Voice: ${options.tone} (professional, consultative, credible).
8. Subject Line: If following up or replying on an existing thread, maintain thread continuity (e.g., "Re: [Previous Subject]" or an updated relevant title).
9. Output valid JSON with strictly two keys: "subject" and "body".`
    : `You are an elite B2B sales strategist writing tailored, high-converting partnership and outreach emails for ${options.senderName} at ${profile.companyName} (${profile.tagline}).

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

${hasConversation 
  ? `PAST CONVERSATION THREAD (${conversationHistory.length} chronological messages):\n${formattedConversation}\n\nLATEST EXCHANGE IN THREAD:\n${latestMessage ? `${latestMessage.direction.toUpperCase()} from ${latestMessage.sender} on ${latestMessage.date}:\n"${latestMessage.content.slice(0, 300)}"` : 'None'}`
  : `Interaction History:\n${interactionsContext}`}

Communication Goal:
${options.goal}

Tone of Voice:
${options.tone}

${options.customInstructions ? `Special Context or Offer:\n${options.customInstructions}\n` : ''}

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
          conversationMessagesAnalyzed: hasConversation ? conversationHistory.length : 0,
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
          conversationMessagesAnalyzed: hasConversation ? conversationHistory.length : 0,
        };
      }
    }
  } catch (err) {
    console.warn('[AIService] Unified AI completion failed, using intelligent local template fallback', err);
  }

  // Smart local template fallback that understands conversation continuation
  if (hasConversation && latestMessage) {
    const isClientLast = latestMessage.direction === 'inbound';
    const fallbackSubject = latestMessage.subject
      ? (latestMessage.subject.toLowerCase().startsWith('re:') ? latestMessage.subject : `Re: ${latestMessage.subject}`)
      : `Following up on our discussion - ${company} & ${profile.companyName}`;

    const cleanSnippet = latestMessage.content.slice(0, 90).replace(/\n/g, ' ').trim();

    const body = `Hi ${firstName},

${isClientLast
  ? `Thanks for your note regarding "${cleanSnippet}"... I wanted to follow up with the next steps.`
  : `Following up on my previous note regarding ${company}'s delivery and experimentation needs.`}

${options.customInstructions ? `${options.customInstructions}\n\n` : ''}We have dedicated team capacity ready to support your upcoming sprint cycles and CRO initiatives without interrupting your internal workflow.

Would you be open to a brief 10-minute touchpoint this week to align on timing and deliverables?

Best regards,
${options.senderName}
${profile.companyName}`;

    return {
      subject: fallbackSubject,
      body,
      source: 'local_generator',
      conversationMessagesAnalyzed: conversationHistory.length,
    };
  }

  // Default cold outreach fallback
  const subject = `Specialist implementation capacity for ${company}`;
  const body = `Hi ${firstName},

I’m reaching out because ${company}’s Shopify Plus and commerce work appears to sit at the intersection of strategy, experience, and technical delivery. I wanted to ask whether your teams ever need additional specialist capacity for the implementation and experimentation layer of client work.

${profile.companyName} helps ecommerce teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements. We can take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.

For ${company}, this could be useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations. I’d be happy to share how we typically work alongside an existing agency team without interrupting its client relationship or process.
${options.customInstructions ? `\nSpecial Context or Offer: ${options.customInstructions}\n` : ''}
Would a short conversation be relevant for your talent or delivery planning?

Best regards,
${options.senderName}
${profile.companyName}`;

  return {
    subject,
    body,
    source: 'local_generator',
    conversationMessagesAnalyzed: 0,
  };
}
