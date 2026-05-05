import type { AgentRowLike, CouncilAgent } from "@/ai/types";

export const DEFAULT_AGENTS: CouncilAgent[] = [
  {
    key: "source-code-market",
    name: "Source Code Market Agent",
    role: "Finds source-code products people would want to buy.",
    systemPrompt:
      "You find hidden, unsolved workflow problems that builders, agencies, and technical founders would pay to solve. Avoid generic app categories and obvious crowded tools. Prefer specific workflows with real manual workarounds (spreadsheets/docs/Notion/Slack/email/screenshots/repetition), that Ahmad can build in 7-14 days, demo clearly on LinkedIn, and sell as a complete source-code package.",
    modelProvider: "github-models",
    modelName: "openai/gpt-4.1",
    enabled: true,
    color: "teal",
    icon: "PackageSearch",
  },
  {
    key: "linkedin-virality",
    name: "LinkedIn Virality Agent",
    role: "Judges whether the product can sell from a LinkedIn post/demo.",
    systemPrompt:
      "You evaluate whether a product can win attention on LinkedIn with a weirdly specific before/after demo. Prefer ideas where the workflow is instantly understood and feels new (not a generic AI wrapper). Reject crowded categories and demos that look like common SaaS tools.",
    modelProvider: "github-models",
    modelName: "openai/gpt-4o",
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
    modelProvider: "github-models",
    modelName: "openai/gpt-4.1",
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
    modelProvider: "github-models",
    modelName: "openai/gpt-4o-mini",
    enabled: true,
    color: "rose",
    icon: "BriefcaseBusiness",
  },
  {
    key: "skeptic",
    name: "Skeptic Agent",
    role: "Attacks weak ideas and rejects fantasy thinking.",
    systemPrompt:
      "You are the hard-nosed skeptic. Reject generic ideas, crowded categories, and copycat tools. If the actual tool already exists in many SaaS forms, or there are many templates/source-code kits already doing it, reject it. Attack vague AI wrappers, fake demand, slow builds, weak demos, and low willingness to pay. Be direct but constructive.",
    modelProvider: "github-models",
    modelName: "openai/gpt-4.1",
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
    modelProvider: "github-models",
    modelName: "openai/gpt-4.1",
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
    modelProvider: "github-models",
    modelName: "openai/gpt-4.1-nano",
    enabled: true,
    color: "violet",
    icon: "BadgeDollarSign",
  },
  {
    key: "judge",
    name: "Judge Agent",
    role: "Applies the Day-One Sale Probability build gate.",
    systemPrompt:
      'You are the final judge. Treat total_score as Day-One Sale Probability. Do not choose generic existing products. Enforce actual_tool_gap >= 7, hidden_workflow_specificity >= 7, and manual_workaround_pain >= 7 before an idea can even be validated. Choose "Build now" only when the selected product scores 85+ with strong buyer urgency and LinkedIn demo strength. If at least one idea clears the hidden-gap gates but is not build-ready, say "Validate first / Do not build yet" and do not select a winner. If all ideas fail actual_tool_gap or hidden_workflow_specificity, choose reject_all, do not invent a winner, do not validate weak generic ideas, and say clearly: "Reject all. Generate better hidden-gap ideas or add stronger market evidence."',
    modelProvider: "github-models",
    modelName: "openai/gpt-4.1",
    enabled: true,
    color: "fuchsia",
    icon: "Scale",
  },
];

export function agentByKey(key: CouncilAgent["key"]) {
  return DEFAULT_AGENTS.find((agent) => agent.key === key) ?? DEFAULT_AGENTS[0];
}

export function normalizeModelNameForProvider(modelName: string, provider: string) {
  const trimmed = modelName.trim();

  if (provider === "github-models") {
    return trimmed.startsWith("openai/") ? trimmed : `openai/${trimmed}`;
  }

  if (provider === "openai") {
    return trimmed.replace(/^openai\//, "");
  }

  return trimmed;
}

export function normalizeAgentForProvider(agent: CouncilAgent, provider: string): CouncilAgent {
  return {
    ...agent,
    modelProvider: provider,
    modelName: normalizeModelNameForProvider(agent.modelName, provider),
  };
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
      modelName: normalizeModelNameForProvider(row.model_name, row.model_provider),
      enabled: row.enabled,
    };
  });
}
