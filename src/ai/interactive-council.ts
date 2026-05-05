import type { CouncilAgent, ProductIdeaDraft } from "@/ai/types";
import type { ToolExistenceCheck } from "@/lib/market-search/types";
import type { AIProvider } from "@/providers/types";

export type InteractiveClaimType = "evidence" | "objection" | "defense" | "refinement" | "decision";

export type InteractiveCouncilMessage = {
  agentName: string;
  agentKey: CouncilAgent["key"];
  model: string;
  provider: string;
  replyingToAgent?: string;
  claimType: InteractiveClaimType;
  referencedIdea?: string;
  message: string;
  evidenceLinks: string[];
};

type TurnSpec = {
  key: CouncilAgent["key"];
  claimType: InteractiveClaimType;
  instruction: string;
  replyingToAgent?: string;
};

type TurnResponse = {
  replyingToAgent?: string;
  claimType?: InteractiveClaimType;
  referencedIdea?: string;
  message: string;
  evidenceLinks?: string[];
};

const INTERACTIVE_TURNS: TurnSpec[] = [
  {
    key: "market-research",
    claimType: "evidence",
    instruction: "Present competitor findings, exact/similar tools, source-code kits, confidence, and which ideas are blocked by market evidence.",
  },
  {
    key: "skeptic",
    claimType: "objection",
    replyingToAgent: "Market Research Agent",
    instruction: "Attack the top ideas using the market findings. Say 'this already exists' when evidence supports it.",
  },
  {
    key: "builder",
    claimType: "refinement",
    replyingToAgent: "Skeptic Agent",
    instruction: "Defend only buildable ideas by narrowing to a hidden workflow. Reject anything too crowded.",
  },
  {
    key: "buyer-intent",
    claimType: "objection",
    replyingToAgent: "Builder Agent",
    instruction: "Challenge buyer urgency and existing purchase behavior. Do not accept market-gap claims without searched evidence.",
  },
  {
    key: "linkedin-virality",
    claimType: "defense",
    replyingToAgent: "Buyer Intent Agent",
    instruction: "Check demo strength and comment/DM likelihood while citing searched evidence if relevant.",
  },
  {
    key: "pricing",
    claimType: "objection",
    replyingToAgent: "LinkedIn Virality Agent",
    instruction: "Challenge price believability and source-code resale value. Penalize copycats and common kits.",
  },
  {
    key: "judge",
    claimType: "decision",
    replyingToAgent: "Pricing Agent",
    instruction: "Ask for final objections and identify the likely decision gate: build_now, validate_first, or reject_all.",
  },
  {
    key: "skeptic",
    claimType: "objection",
    replyingToAgent: "Judge Agent",
    instruction: "Give a final brutal objection. Block build_now if market search confidence is low or category risk is high.",
  },
  {
    key: "judge",
    claimType: "decision",
    replyingToAgent: "Skeptic Agent",
    instruction: "Make the conversation-level decision recommendation based on market evidence. Use cautious language: 'not found in searched market evidence'.",
  },
];

export async function runInteractiveCouncilChat({
  provider,
  agents,
  ideas,
  existenceChecks,
  compactContext,
  maxTurns = INTERACTIVE_TURNS.length,
}: {
  provider: AIProvider;
  agents: CouncilAgent[];
  ideas: ProductIdeaDraft[];
  existenceChecks: ToolExistenceCheck[];
  compactContext: string;
  maxTurns?: number;
}) {
  const messages: InteractiveCouncilMessage[] = [];
  const turnSpecs = INTERACTIVE_TURNS.slice(0, Math.max(1, maxTurns));

  for (const spec of turnSpecs) {
    const agent = findTurnAgent(agents, spec.key);
    const fallback = createFallbackTurn(spec, agent, ideas, existenceChecks, messages);
    const previousMessages = messages.slice(-5).map((message) => ({
      agentName: message.agentName,
      claimType: message.claimType,
      referencedIdea: message.referencedIdea,
      message: message.message.slice(0, 600),
    }));

    const response = await provider.generateJSON<TurnResponse>({
      system: `${agent.systemPrompt}\n\nYou are participating in interactive_council_chat. Reply to other agents directly. Be brutally honest and cite searched market evidence. Never claim a tool never exists; say "not found in searched market evidence."`,
      prompt: `
Interactive council turn instruction:
${spec.instruction}

Required response fields:
- replyingToAgent: optional agent name you are answering
- claimType: one of evidence, objection, defense, refinement, decision
- referencedIdea: idea title, if any
- message: concise conversational message addressed to the council
- evidenceLinks: URLs from searched market evidence when used

Shortlisted ideas:
${JSON.stringify(ideas.map((idea) => ({ title: idea.title, pain: idea.pain, description: idea.description })), null, 2)}

Market existence checks:
${JSON.stringify(summarizeExistenceChecks(existenceChecks), null, 2)}

Compact state:
${compactContext}

Previous interactive messages:
${JSON.stringify(previousMessages, null, 2)}

Return JSON only:
{
  "replyingToAgent": "string",
  "claimType": "evidence | objection | defense | refinement | decision",
  "referencedIdea": "string",
  "message": "string",
  "evidenceLinks": ["string"]
}
`,
      fallback,
      expectedSchema: "InteractiveCouncilTurn",
      temperature: 0.35,
      maxTokens: 1200,
    });

    messages.push({
      agentName: agent.name,
      agentKey: agent.key,
      model: agent.modelName,
      provider: provider.name,
      replyingToAgent: response.replyingToAgent || spec.replyingToAgent,
      claimType: response.claimType ?? spec.claimType,
      referencedIdea: response.referencedIdea || ideas[0]?.title,
      message: response.message || fallback.message,
      evidenceLinks: Array.isArray(response.evidenceLinks) ? response.evidenceLinks.slice(0, 5) : fallback.evidenceLinks ?? [],
    });
  }

  return messages;
}

function findTurnAgent(agents: CouncilAgent[], key: CouncilAgent["key"]) {
  return agents.find((agent) => agent.key === key) ?? agents.find((agent) => agent.key === "skeptic") ?? agents[0];
}

function summarizeExistenceChecks(checks: ToolExistenceCheck[]) {
  return checks.map((check) => ({
    ideaTitle: check.ideaTitle,
    exactToolExists: check.exactToolExists,
    similarToolCount: check.similarSaaSTools.length,
    similarSourceCodeKitCount: check.similarSourceCodeKits.length,
    commonCategoryRisk: check.commonCategoryRisk,
    actualToolGapScore: check.actualToolGapScore,
    sourceCodeGapScore: check.sourceCodeGapScore,
    confidence: check.confidence,
    marketSearchStatus: check.marketSearchStatus,
    notes: check.notes,
    topEvidenceLinks: [
      ...check.similarSaaSTools.slice(0, 3),
      ...check.similarSourceCodeKits.slice(0, 2),
    ].map((result) => result.url),
  }));
}

function createFallbackTurn(
  spec: TurnSpec,
  agent: CouncilAgent,
  ideas: ProductIdeaDraft[],
  checks: ToolExistenceCheck[],
  previousMessages: InteractiveCouncilMessage[],
): TurnResponse {
  const topCheck = checks[0];
  const topIdea = ideas.find((idea) => idea.title === topCheck?.ideaTitle) ?? ideas[0];
  const risky = checks.find(
    (check) => check.exactToolExists || check.commonCategoryRisk === "high" || check.confidence < 50,
  );
  const links = topCheck
    ? [...topCheck.similarSaaSTools, ...topCheck.similarSourceCodeKits].slice(0, 3).map((result) => result.url)
    : [];
  const prior = previousMessages.at(-1)?.agentName;

  return {
    replyingToAgent: spec.replyingToAgent ?? prior,
    claimType: spec.claimType,
    referencedIdea: risky?.ideaTitle ?? topIdea?.title,
    evidenceLinks: links,
    message:
      spec.claimType === "decision"
        ? `Based on searched market evidence, ${risky ? risky.ideaTitle : topIdea?.title} should not be build_now unless exact-tool risk, source-code-kit risk, and confidence gates clear. Use validate_first or reject_all when evidence is weak; say "not found in searched market evidence," not global non-existence.`
        : `${agent.name}: market evidence must control the gap score. ${risky ? `${risky.ideaTitle} has ${risky.commonCategoryRisk} category risk or low confidence, so build_now is blocked.` : `${topIdea?.title} needs searched evidence before scoring.`}`,
  };
}
