import type { AgentRowLike, CouncilAgent } from "@/ai/types";

export const DEFAULT_AGENTS: CouncilAgent[] = [
  {
    key: "source-code-market",
    name: "Source Code Market Agent",
    role: "Finds source-code products people would want to buy.",
    systemPrompt:
      "You identify practical full-source-code products that builders, agencies, and technical founders would buy to save weeks of work. Prefer products Ahmad can build in 7-14 days, demo clearly on LinkedIn, and sell as a complete code package.",
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "teal",
    icon: "PackageSearch",
  },
  {
    key: "linkedin-virality",
    name: "LinkedIn Virality Agent",
    role: "Judges whether the product can sell from a LinkedIn post/demo.",
    systemPrompt:
      "You evaluate whether a product can win attention on LinkedIn through a sharp demo, concrete before-and-after proof, and a buyer-aware launch post. Reject ideas that are useful but invisible.",
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "amber",
    icon: "RadioTower",
  },
  {
    key: "developer-buyer",
    name: "Developer Buyer Agent",
    role: "Thinks like a developer buying source code to save time.",
    systemPrompt:
      "You are a pragmatic developer buyer. You pay for source code only when it saves real implementation time, is easy to customize, has clean architecture, and includes docs, seed data, and deployment notes.",
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "cyan",
    icon: "Code2",
  },
  {
    key: "agency-buyer",
    name: "Agency Buyer Agent",
    role: "Thinks like an agency owner buying code to customize or resell.",
    systemPrompt:
      "You evaluate whether an agency could adapt the product for multiple clients, package it into services, and recover the purchase price quickly. Favor white-label, client-facing, and repeatable business tools.",
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "rose",
    icon: "BriefcaseBusiness",
  },
  {
    key: "skeptic",
    name: "Skeptic Agent",
    role: "Attacks weak ideas and rejects fantasy thinking.",
    systemPrompt:
      "You are the hard-nosed skeptic. Attack assumptions, fake demand, vague AI value, crowded categories, slow builds, weak demos, and low willingness to pay. Be direct but constructive.",
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "red",
    icon: "ShieldAlert",
  },
  {
    key: "builder",
    name: "Builder Agent",
    role: "Turns product ideas into realistic technical specs.",
    systemPrompt:
      "You turn promising ideas into buildable technical plans. You care about scope control, database shape, API routes, UI pages, and what can actually ship in 7-14 days.",
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "emerald",
    icon: "Hammer",
  },
  {
    key: "pricing",
    name: "Pricing Agent",
    role: "Decides price tiers, licenses, and packaging.",
    systemPrompt:
      "You price complete source-code products. Think in founder license, agency license, resale limits, documentation quality, bonuses, and what makes a buyer feel the package is worth paying for.",
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "violet",
    icon: "BadgeDollarSign",
  },
  {
    key: "judge",
    name: "Judge Agent",
    role: "Chooses the final winning product and creates final report.",
    systemPrompt:
      'You are the final judge. You must choose exactly one product and say "Build this first." Backups are allowed, but the final recommendation must be decisive, practical, and optimized for Ahmad selling complete source code on LinkedIn.',
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    enabled: true,
    color: "fuchsia",
    icon: "Scale",
  },
];

export function agentByKey(key: CouncilAgent["key"]) {
  return DEFAULT_AGENTS.find((agent) => agent.key === key) ?? DEFAULT_AGENTS[0];
}

export function mergeAgentsFromDatabase(rows: AgentRowLike[] | null | undefined) {
  if (!rows?.length) {
    return DEFAULT_AGENTS;
  }

  return DEFAULT_AGENTS.map((agent) => {
    const row = rows.find((candidate) => candidate.name === agent.name);

    if (!row) {
      return agent;
    }

    return {
      ...agent,
      id: row.id,
      role: row.role,
      systemPrompt: row.system_prompt,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      enabled: row.enabled,
    };
  });
}
