// ==============================================================================
// COMPANY & SERVICE PROFILE MANAGER
// Defines the services, value propositions, and pitch angles used by the AI
// to generate high-converting, professional bulk outreach emails.
// ==============================================================================

export interface CompanyServiceProfile {
  companyName: string;
  tagline: string;
  services: string[];
  valuePropositions: string[];
  targetAudience: string;
  defaultCTA: string;
  senderName: string;
  senderTitle: string;
  senderEmail: string;
  caseStudyOrProof?: string;
  pricingOrOfferHook?: string;
}

export interface ServiceProfilePreset {
  id: string;
  name: string;
  description: string;
  profile: Partial<CompanyServiceProfile>;
}

export const DEFAULT_SERVICE_PROFILE: CompanyServiceProfile = {
  companyName: 'Ingversions Digital',
  tagline: 'Shopify CRO, Experimentation & Discreet Agency Overflow Partner',
  services: [
    'Shopify CRO and A/B Testing',
    'Conversion-Focused Theme and Landing-Page Work',
    'Analytics QA & Cross-Device Tracking Verification',
    'Storefront Performance Improvements',
    'Discreet Overflow & Scoped Delivery Partner for Agencies',
  ],
  valuePropositions: [
    'Take approved hypotheses or design directions and build the required changes',
    'Verify tracking, cross-device behavior, and support thorough QA before launch',
    'Operate as a discreet overflow or scoped delivery partner without interrupting client relationships',
    'Provide specialist capacity for the implementation and experimentation layer of client work',
  ],
  targetAudience: 'Agency Directors, VP of Delivery, Heads of Commerce, Talent & Resource Planners',
  defaultCTA: 'Would a short conversation be relevant for your talent or delivery planning?',
  senderName: 'Uday Raj',
  senderTitle: 'Business Solutions & Delivery Partnerships',
  senderEmail: 'udaysharma@ingversionsdigital.com',
  caseStudyOrProof: 'Helping agencies and ecommerce brands execute CRO, A/B testing, and theme builds with zero workflow friction.',
  pricingOrOfferHook: 'Discreet overflow or scoped delivery partner with zero disruption to agency client relationships.',
};

export const SERVICE_PRESETS: ServiceProfilePreset[] = [
  {
    id: 'agency_overflow_cro',
    name: 'Shopify CRO & Agency Overflow',
    description: 'Specialist capacity for Shopify CRO, A/B testing, analytics QA, and discreet agency overflow.',
    profile: {
      companyName: 'Ingversions Digital',
      tagline: 'Shopify CRO, Experimentation & Discreet Agency Overflow Partner',
      services: [
        'Shopify CRO and A/B Testing',
        'Conversion-Focused Theme and Landing-Page Work',
        'Analytics QA & Cross-Device Tracking Verification',
        'Storefront Performance Improvements',
        'Discreet Overflow & Scoped Delivery Partner for Agencies',
      ],
      valuePropositions: [
        'Take approved hypotheses or design directions and build the required changes',
        'Verify tracking, cross-device behavior, and support QA before launch',
        'Discreet overflow partner operating without disrupting agency client relationships',
        'Specialist capacity for implementation & experimentation during large transformations',
      ],
      defaultCTA: 'Would a short conversation be relevant for your talent or delivery planning?',
    },
  },
  {
    id: 'engineering_sprints',
    name: 'Dedicated Engineering & Task Execution',
    description: 'Ingversions Digital core offering for tech teams facing deadlines and deliverable backlogs.',
    profile: {
      companyName: 'Ingversions Digital',
      tagline: 'High-Velocity Engineering & Dedicated Technical Teams',
      services: [
        'Dedicated Development Teams & Milestone Sprint Execution',
        'Full-Stack Web & Mobile Application Engineering',
        'End-to-End Task Management & Deliverable Delivery',
        'QA Automation & Operational Workflow Support',
      ],
      valuePropositions: [
        'Ensure you hit your upcoming project deadlines on time',
        'Dedicated team point-of-contact with regular milestone check-ins',
        'Zero bandwidth strain on your internal core staff',
      ],
      defaultCTA: 'Would you be open to a quick 10-minute chat this week to review your current tasks and timeline?',
    },
  },
  {
    id: 'digital_agency',
    name: 'Full-Service Digital & Web Agency',
    description: 'End-to-end design, custom web platforms, and product development.',
    profile: {
      companyName: 'Ingversions Digital',
      tagline: 'Modern Web, UI/UX Design & Scalable Platform Development',
      services: [
        'Custom Web & SaaS Platform Development',
        'Modern UI/UX Redesign & Conversion Optimization',
        'API & Database Integrations',
        'Ongoing Maintenance & Platform Scaling',
      ],
      valuePropositions: [
        'Elevate your digital brand with stunning, high-performance web products',
        'Fast 2-4 week sprints with production-ready deliverables',
        'Proven track record delivering reliable digital solutions',
      ],
      defaultCTA: 'Would you be open to a brief 15-minute demo call to see how we could help elevate your platform?',
    },
  },
  {
    id: 'staff_aug',
    name: 'Staff Augmentation & Dedicated Developers',
    description: 'Pre-vetted senior developers and technical specialists ready to embed in your team.',
    profile: {
      companyName: 'Ingversions Digital',
      tagline: 'Pre-Vetted Senior Engineers & Specialists on Demand',
      services: [
        'Dedicated Senior React / Node / Python Developers',
        'DevOps & Cloud Infrastructure Specialists',
        'QA Engineers & Automated Test Suites',
        'Flexible Sprint-Based or Monthly Team Embedding',
      ],
      valuePropositions: [
        'Scale your engineering velocity instantly without recruiting fees',
        'Seamless integration into your Slack, Jira, and GitHub workflow',
        'Risk-free trial period with 100% alignment guarantee',
      ],
      defaultCTA: 'Can we schedule a 10-minute discovery call this Thursday to understand your current hiring needs?',
    },
  },
  {
    id: 'consulting_ops',
    name: 'Workflow Automation & Tech Consulting',
    description: 'System integrations, CRM setup, and operations automation to eliminate manual work.',
    profile: {
      companyName: 'Ingversions Digital',
      tagline: 'Intelligent Workflow Automation & Operational Systems',
      services: [
        'CRM & Sales Pipeline Architecture',
        'Custom API Integrations & Webhook Automation',
        'Process Optimization & Lead Routing Systems',
        'Internal Tools & Executive Analytics Dashboards',
      ],
      valuePropositions: [
        'Save 15+ hours weekly per team member by eliminating repetitive data entry',
        'Real-time data synchronization across all your business tools',
        'High ROI within the first 30 days of implementation',
      ],
      defaultCTA: 'Would you be interested in a quick 10-minute workflow audit to pinpoint where automation can save your team hours?',
    },
  },
];

const PROFILE_STORAGE_KEY = 'crm_company_service_profile';

export function getCompanyServiceProfile(): CompanyServiceProfile {
  if (typeof window === 'undefined') return DEFAULT_SERVICE_PROFILE;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_SERVICE_PROFILE;
    const parsed = JSON.parse(raw);
    
    // Auto-migrate legacy generic profile if present
    if (parsed.tagline === 'High-Velocity Engineering, Dedicated Sprint Teams & Digital Execution') {
      return DEFAULT_SERVICE_PROFILE;
    }

    return {
      ...DEFAULT_SERVICE_PROFILE,
      ...parsed,
    };
  } catch {
    return DEFAULT_SERVICE_PROFILE;
  }
}

export function saveCompanyServiceProfile(profile: CompanyServiceProfile): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm_service_profile_updated'));
  }
}

export function resetCompanyServiceProfile(): CompanyServiceProfile {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('crm_service_profile_updated'));
  }
  return DEFAULT_SERVICE_PROFILE;
}
