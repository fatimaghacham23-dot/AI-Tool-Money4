import type { ProductIdeaDraft } from "@/ai/types";

export const MOCK_PRODUCT_IDEAS: ProductIdeaDraft[] = [
  {
    title: "AI Client Portal Starter Kit",
    description:
      "A full-stack portal agencies can brand for clients with project updates, files, AI summaries, approvals, and invoices.",
    targetBuyer: "Small software agencies and freelancers",
    pain: "They keep rebuilding the same client portal and status workflow for each client.",
    whyBuySourceCode:
      "It gives them a polished client-facing product they can customize and resell immediately.",
    mvpFeatures: [
      "Client/project dashboard",
      "AI weekly status summaries",
      "File and approval center",
      "Admin workspace",
    ],
    fullFeatures: [
      "White-label themes",
      "Client invite flow",
      "Invoice and payment status",
      "AI meeting-note import",
      "Deployment guide",
    ],
    pricingIdea: "$249 founder license, $499 agency license",
    risks: ["Needs careful scope control", "Must look premium in demo"],
  },
  {
    title: "AI Proposal Generator for Agencies",
    description:
      "A proposal builder that turns discovery notes into scope, timeline, pricing tiers, and a client-ready PDF.",
    targetBuyer: "Agency owners and freelance developers",
    pain: "Writing proposals is repetitive and slows down sales.",
    whyBuySourceCode:
      "Buyers can adapt prompts, branding, and pricing logic for their own sales process.",
    mvpFeatures: [
      "Discovery-note intake",
      "AI scope generator",
      "Pricing tier builder",
      "Proposal preview",
    ],
    fullFeatures: [
      "PDF export",
      "Template library",
      "Client acceptance tracking",
      "CRM-style pipeline",
      "Prompt tuning notes",
    ],
    pricingIdea: "$199 solo license, $399 agency license",
    risks: ["Crowded idea", "PDF polish matters"],
  },
  {
    title: "AI Resume Analyzer Admin Dashboard",
    description:
      "A resume review product with upload, scoring, rewrite suggestions, recruiter notes, and admin analytics.",
    targetBuyer: "Career coaches and education businesses",
    pain: "They want an AI tool to productize resume feedback without building the stack.",
    whyBuySourceCode:
      "They can brand it, tune scoring prompts, and sell resume audits or subscriptions.",
    mvpFeatures: [
      "Resume upload",
      "AI scoring rubric",
      "Rewrite suggestions",
      "Admin review queue",
    ],
    fullFeatures: [
      "Coach comments",
      "Before/after exports",
      "Stripe-ready hooks",
      "Analytics",
      "Prompt templates",
    ],
    pricingIdea: "$149 starter, $349 business license",
    risks: ["Many existing tools", "Needs strong positioning"],
  },
  {
    title: "AI Invoice Follow-Up Tool",
    description:
      "A source-code package for freelancers to track invoices and generate polite follow-up messages.",
    targetBuyer: "Freelancers and consultants",
    pain: "Following up on unpaid invoices is awkward and repetitive.",
    whyBuySourceCode:
      "Developers can ship it as a client tool or customize it into finance workflows.",
    mvpFeatures: [
      "Invoice tracker",
      "Overdue detection",
      "AI follow-up drafts",
      "Client timeline",
    ],
    fullFeatures: [
      "Email integrations",
      "Tone presets",
      "Payment status import",
      "Team accounts",
      "CSV export",
    ],
    pricingIdea: "$99 personal, $249 commercial license",
    risks: ["Lower price ceiling", "Integration scope can sprawl"],
  },
  {
    title: "AI Admin Dashboard Template",
    description:
      "A polished Next/Supabase admin dashboard with AI search, user insights, and operational copilots.",
    targetBuyer: "Developers building internal tools",
    pain: "They need a modern starter that is more useful than generic dashboards.",
    whyBuySourceCode:
      "It saves setup time across auth, database, layout, charts, and AI workflows.",
    mvpFeatures: [
      "Auth dashboard shell",
      "AI command palette",
      "User/activity tables",
      "Audit log",
    ],
    fullFeatures: [
      "Role permissions",
      "Analytics widgets",
      "AI insight cards",
      "CRUD generator patterns",
      "Deployment docs",
    ],
    pricingIdea: "$129 developer, $299 team license",
    risks: ["Template market is noisy", "Needs distinctive AI workflows"],
  },
];

export function expandMockIdeas(): ProductIdeaDraft[] {
  const extras = [
    "AI Contract Clause Explainer",
    "AI Support Inbox Starter Kit",
    "AI Content Calendar Portal",
    "AI Lead Qualification Dashboard",
    "AI Course Feedback Analyzer",
    "AI SOP Generator for Agencies",
    "AI Meeting Recap Client Portal",
    "AI Recruiting Shortlist Tool",
    "AI Local Business Review Monitor",
    "AI Onboarding Checklist Builder",
    "AI Churn Risk Admin Panel",
    "AI Knowledge Base Builder",
    "AI Website Audit Report Tool",
    "AI Project Handoff Generator",
    "AI Niche CRM Template",
  ];

  return [
    ...MOCK_PRODUCT_IDEAS,
    ...extras.map((title, index) => ({
      title,
      description: `A scoped full-source-code product for buyers who want a customizable ${title.toLowerCase()} without starting from a blank repo.`,
      targetBuyer: index % 2 === 0 ? "Agencies and freelance developers" : "Technical founders",
      pain: "The buyer wants a faster path to a sellable or client-ready product.",
      whyBuySourceCode:
        "The code can be customized, rebranded, and reused as a service foundation.",
      mvpFeatures: [
        "Auth and workspace shell",
        "AI generation workflow",
        "Review dashboard",
        "Exportable output",
      ],
      fullFeatures: [
        "White-label settings",
        "Prompt library",
        "Client sharing",
        "Analytics",
        "Deployment docs",
      ],
      pricingIdea: "$149-$399 depending on license",
      risks: ["Needs precise niche positioning", "Demo must show immediate value"],
    })),
  ];
}
