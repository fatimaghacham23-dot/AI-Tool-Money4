import { getAIProvider } from "@/providers";

export type PackageGeneratorInput = {
  ideaId: string;
  productName: string;
  targetBuyer: string;
  status: string;
};

export type PackagePlanDraft = {
  package_markdown: string;
  readme_markdown: string;
  quickstart_markdown: string;
  license_markdown: string;
  sales_page_copy: string;
  demo_video_script: string;
  onboarding_email: string;
};

export async function generatePackagePlan(input: PackageGeneratorInput) {
  const fallback = createDeterministicPackagePlan(input);
  const provider = getAIProvider();

  if (provider.name === "local") {
    return fallback;
  }

  return provider.generateJSON<PackagePlanDraft>({
    system: "You generate practical source-code package sale plans in markdown.",
    prompt: `Create a complete source code sale package plan for ${input.productName} for ${input.targetBuyer}.`,
    temperature: 0.2,
    fallback,
  });
}

export function createDeterministicPackagePlan(input: PackageGeneratorInput): PackagePlanDraft {
  const slug = input.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const packageName = `${input.productName} Source Kit`;
  return {
    package_markdown: `# Package Overview
- Product name: ${input.productName}
- Target buyer: ${input.targetBuyer}
- Suggested package name: ${packageName}
- One-sentence sales promise: Launch a production-ready version fast with full source ownership.
- Recommended price tiers: Lite $149, Pro $299, Agency $599
- License model: Commercial source-code license
- Buyer outcome: Buyer can install, customize, and resell implementation services.

## Folder Structure

\`\`\`
/${slug}-source-code
  /apps
  /docs
  /screenshots
  /demo-data
  /supabase
  /deployment
  /licenses
  README.md
  .env.example
  CHANGELOG.md
  LICENSE.md
  QUICKSTART.md
\`\`\`

## Deployment Guide
- Vercel: connect repo, set build command, publish.
- Supabase: import schema, set auth URLs, seed demo data.
- Environment variables: add provider keys + Supabase keys.
- Production checks: login, core workflow, AI output, export.
- Common errors: missing env vars, invalid redirect URL, failed migration.

## Screenshots Checklist
- Dashboard
- Main workflow
- AI output/report
- Admin/settings
- Mobile view
- Before/after comparison (if relevant)
`,
    readme_markdown: `# ${input.productName}
## What this product is
## Who it is for
## Features
## Tech stack
## Setup steps
## Environment variables
## Database setup
## AI provider setup
## Deployment steps
## Customization guide
## Troubleshooting
## License terms
## Support / contact
`,
    quickstart_markdown: `# Quickstart
1. Install dependencies
2. Copy env file
3. Configure Supabase
4. Run migrations
5. Seed demo data
6. Start dev server
7. Deploy to Vercel
`,
    license_markdown: `# License Tiers
## Lite License
- Price suggestion: $149
- Allowed use: 1 project
- Commercial rights: limited
- Resale rights: no
- Client project rights: 1 client
- Limitations: no redistribution

## Pro License
- Price suggestion: $299
- Allowed use: up to 5 projects
- Commercial rights: yes
- Resale rights: no
- Client project rights: yes
- Limitations: no template resale

## Agency License
- Price suggestion: $599
- Allowed use: unlimited client projects
- Commercial rights: yes
- Resale rights: internal service resale only
- Client project rights: yes
- Limitations: no public code redistribution

## White-label License
- Price suggestion: $999
- Allowed use: branded distribution to end clients
- Commercial rights: yes
- Resale rights: limited white-label bundles
- Client project rights: yes
- Limitations: cannot resell raw source package
`,
    sales_page_copy: `# Sales Page Copy
## Headline
Ship ${input.productName} in days, not months.
## Subheadline
A full source-code package built for ${input.targetBuyer}.
## Problem
Buyers lose time rebuilding the same workflows.
## Solution
Install, customize, and launch a proven starter with AI-ready architecture.
## Feature bullets
- Production-ready app shell
- Supabase schema and migrations
- AI workflow scaffolding
## What's included
Source code, docs, deployment guide, licenses, demo assets.
## Who should buy
Freelancers, agencies, indie founders.
## Pricing table copy
Lite / Pro / Agency / White-label
## FAQ
Q: Can I use this for clients? A: Yes with Pro+ tiers.
## Guarantee/disclaimer
No revenue guarantee; technical support scope defined in docs.
`,
    demo_video_script: `# Demo Video Script
## 30-second version
Show problem, app dashboard, AI output, and package contents.
## 90-second version
Show setup, workflow, generated output, deployment proof, and license tiers.
## LinkedIn version
Hook with pain, show before/after, CTA to comment "PACKAGE".
`,
    onboarding_email: `# Buyer Onboarding Email
## Purchase confirmation email
Subject: You're in — ${packageName}
Body: Thanks for purchasing. Download link + next steps.

## Setup email
Subject: Setup your ${input.productName} in 30 minutes
Body: Quickstart steps, environment setup, and support link.

## Follow-up email
Subject: Need help customizing ${input.productName}?
Body: Common customization options + upgrade path.
`,
  };
}
