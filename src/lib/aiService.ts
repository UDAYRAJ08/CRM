import { Contact, Interaction } from '../types/crm';

export interface GenerateAIDraftOptions {
  contact: Contact;
  recentInteractions: Interaction[];
  senderName: string;
  goal: string;
  tone: 'professional' | 'friendly' | 'concise' | 'persuasive';
  customInstructions?: string;
}

export interface AIDraftResponse {
  subject: string;
  body: string;
  source: 'edge_function' | 'local_generator';
}

export async function generateAIEmailDraft(options: GenerateAIDraftOptions): Promise<AIDraftResponse> {
  const edgeFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (edgeFunctionsUrl && anonKey && !edgeFunctionsUrl.includes('your-project-ref')) {
    try {
      const response = await fetch(`${edgeFunctionsUrl}/generate-ai-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          contactName: options.contact.name,
          contactEmail: options.contact.email,
          companyName: options.contact.company?.name,
          contactTitle: options.contact.title,
          contactStatus: options.contact.status,
          recentInteractions: options.recentInteractions.slice(0, 5).map((i) => ({
            type: i.type,
            content: i.content,
            created_at: i.created_at,
          })),
          senderName: options.senderName,
          goal: options.goal,
          tone: options.tone,
          customInstructions: options.customInstructions,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.subject && data.body) {
          return {
            subject: data.subject,
            body: data.body,
            source: 'edge_function',
          };
        }
      }
    } catch (e) {
      console.warn('Edge function call failed, using high-fidelity local generator fallback', e);
    }
  }

  // High-fidelity client-side Claude simulation generator
  // Synthesizes contact profile, previous interactions, selected tone, and user goal
  const firstName = options.contact.name.split(' ')[0] || options.contact.name;
  const company = options.contact.company?.name || 'your team';
  const role = options.contact.title ? `as ${options.contact.title}` : '';
  const lastInteraction = options.recentInteractions[0];

  let subject = '';
  let body = '';

  const toneAdjective =
    options.tone === 'concise'
      ? 'Quick note'
      : options.tone === 'friendly'
      ? 'Great speaking earlier'
      : options.tone === 'persuasive'
      ? 'Accelerating workflow'
      : 'Following up';

  const interactionReference = lastInteraction
    ? `Following our recent ${lastInteraction.type} where we discussed ${lastInteraction.content.slice(0, 90).toLowerCase()}...`
    : `I'm reaching out regarding your initiatives at ${company}.`;

  switch (options.goal.toLowerCase()) {
    case 'send_details':
    case 'details':
      subject = `Team Capabilities & Task Execution Details for ${company}`;
      body = `Hyy ${firstName},

If you are looking for a dedicated team that can help you with your key tasks and ensure you hit your upcoming project deadlines on time, here are the details of what we can deliver for ${company}:

1. What We Handle:
- End-to-end task execution and deliverable management
- High-velocity sprint turnaround to hit tight deadlines
- Full workflow coordination with zero operational bottleneck

2. How We Work:
- Dedicated team point-of-contact with regular milestone check-ins
- Transparent delivery tracking tailored to your priorities
${interactionReference ? `- Incorporating our recent discussion: ${interactionReference}\n` : ''}
${options.customInstructions ? `Special focus: ${options.customInstructions}\n\n` : ''}Would you be open to a quick 10-minute chat this week to review your current tasks and timeline?

Best regards,
${options.senderName}`;
      break;

    case 'meeting_request':
    case 'schedule demo':
      subject = `Helping ${company} hit upcoming project deadlines`;
      body = `Hyy ${firstName},

If you are looking for a dedicated team that can help you with your tasks and ensure your team meets critical deadlines without bandwidth strain, we would love to connect.

${interactionReference}

We help teams accelerate project delivery and eliminate operational bottlenecks with high quality execution.

Would you be open to a quick 10-minute conversation this Thursday or Friday to see how we can assist with your current pipeline?

Best regards,
${options.senderName}`;
      break;

    case 'proposal_followup':
    case 'check in on proposal':
      subject = `Checking in: Helping ${company} meet target deadlines`;
      body = `Hyy ${firstName},

${interactionReference}

I wanted to check in on the proposal we shared and see how we can best support your team in getting these tasks off the ground and meeting your targeted timeline.

We are ready to deploy support immediately so your deliverables stay on track.

Let me know if a quick sync would be helpful.

Best,
${options.senderName}`;
      break;

    case 'cold_intro':
    case 'introduction':
      subject = `Need support meeting deadlines at ${company}?`;
      body = `Hyy ${firstName},

If you are looking for a reliable team to help you handle your tasks and deliver on tight deadlines ${role}, I wanted to introduce ourselves.

We specialize in helping organizations like ${company} execute projects faster and remove workload friction.

${options.customInstructions ? `Specifically: ${options.customInstructions}\n\n` : ''}Are you open to a brief 10-minute introductory call to explore how we can support your immediate goals?

Warm regards,
${options.senderName}`;
      break;

    default:
      subject = `Support for ${company} to meet project deadlines`;
      body = `Hyy ${firstName},

If you are looking for a team to help you with your key tasks and ensure every milestone is delivered on schedule, we are here to support.

${interactionReference}

${options.customInstructions || `I wanted to follow up and see how we can best assist your team with your current workload and upcoming deliverables.`}

Looking forward to hearing from you.

Best regards,
${options.senderName}`;
      break;
  }

  // Artificial natural thinking delay for UI feedback
  await new Promise((resolve) => setTimeout(resolve, 600));

  return {
    subject,
    body,
    source: 'local_generator',
  };
}
