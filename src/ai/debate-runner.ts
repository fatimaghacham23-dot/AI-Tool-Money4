import { agentByKey, DEFAULT_AGENTS } from "@/ai/agents";
import { expandMockIdeas } from "@/ai/mock-data";
import {
  buildReportPrompt,
  createDeterministicReport,
  type ReportContext,
} from "@/ai/report-generator";
import {
  explainScoresLocally,
  normalizeScore,
  normalizeScoreExplanations,
  scoreIdeasLocally,
  sortByScore,
} from "@/ai/scoring";
import type {
  CouncilAgent,
  CouncilRunInput,
  DebateArtifacts,
  DebatePersistence,
  DebateRoundDraft,
  MarketEvidenceDraft,
  ProductIdeaDraft,
  ProductScore,
  ProductScoreExplanations,
  ScoredProductIdea,
} from "@/ai/types";
import type { AIProvider } from "@/providers/types";

type CouncilMessage = {
  roundNumber: number;
  roundTitle: string;
  agentName: string;
  agentRole: string;
  content: string;
};

type RejectedIdea = {
  title: string;
  reason: string;
  risks: string[];
};

type Criticism = {
  agentName: string;
  title: string;
  criticism: string;
  riskLevel: "low" | "medium" | "high";
  roundNumber: number;
};

type Refinement = {
  agentName: string;
  title: string;
  refinement: string;
  roundNumber: number;
};

type ScoreHistoryEntry = {
  title: string;
  totalScore: number;
  score: ProductScore;
  explanations: ProductScoreExplanations;
  reason: string;
};

type DebateState = {
  run: CouncilRunInput;
  messages: CouncilMessage[];
  ideas: ProductIdeaDraft[];
  rejectedIdeas: RejectedIdea[];
  criticisms: Criticism[];
  refinements: Refinement[];
  shortlist: ProductIdeaDraft[];
  marketEvidence: MarketEvidenceDraft[];
  scoreHistory: ScoreHistoryEntry[];
  whyOthersLost: Array<{ title: string; reason: string }>;
  finalDecisionReason?: string;
};

type RoundRecord = DebateRoundDraft & { id: string };

type IdeasResponse = {
  ideas: ProductIdeaDraft[];
};

type TopIdeasResponse = {
  topIdeas: Array<{ title: string; reason: string; requiredFix?: string }>;
  rejectedIdeas: RejectedIdea[];
};

type ShortlistResponse = {
  message: string;
  topIdeas: Array<{ title: string; reason: string; requiredFix: string }>;
};

type DebateResponse = {
  message: string;
  referencedAgentOrIdea: string;
  strongestIdea: string;
  weakestIdea: string;
  demoHook?: string;
  commentSignal?: "price" | "send me" | "code" | "none";
  developerSavings?: string;
  agencyNiches?: string[];
  buildComplexity?: string;
  mvpScope?: string[];
  doNotBuild?: string[];
  pricingTiers?: {
    lite: string;
    pro: string;
    agency: string;
  };
  criticisms: Array<{
    title: string;
    criticism: string;
    riskLevel: "low" | "medium" | "high";
  }>;
  ideaRisks?: Array<{ title: string; risks: string[] }>;
  refinements: Array<{ title: string; refinement: string }>;
};

type ScoreResponseItem = Partial<ProductScore> & {
  title: string;
  reason?: string;
  explanations?: Partial<ProductScoreExplanations>;
  score_explanations?: Partial<ProductScoreExplanations>;
};

type ScoresResponse = {
  scores: ScoreResponseItem[];
};

type JudgeResponse = {
  winnerTitle: string;
  reason: string;
  whyOthersLost: Array<{ title: string; reason: string }>;
};

const ROUND_DEFINITIONS = [
  {
    roundNumber: 1,
    roundType: "idea_generation",
    title: "Round 1: Generate 20 Product Ideas",
  },
  {
    roundNumber: 2,
    roundType: "skeptic_filter",
    title: "Round 2: Skeptic Rejects Weak Ideas",
  },
  {
    roundNumber: 3,
    roundType: "shortlist",
    title: "Round 3: Keep Top 5 Ideas",
  },
  {
    roundNumber: 4,
    roundType: "agent_debate",
    title: "Round 4: Agents Debate Each Idea",
  },
  {
    roundNumber: 5,
    roundType: "scoring",
    title: "Round 5: Score Each Idea",
  },
  {
    roundNumber: 6,
    roundType: "judge",
    title: "Round 6: Judge Picks One Winner",
  },
  {
    roundNumber: 7,
    roundType: "final_report",
    title: "Round 7: Generate Complete Final Report",
  },
] satisfies DebateRoundDraft[];

const UNIVERSAL_DEBATE_RULES = `
Council debate rules:
- Do not simply agree.
- Reference at least one previous agent or product idea. If no agent has spoken yet, reference the original goal and at least one product idea.
- Add new reasoning, constraints, or tradeoffs.
- If an idea is weak, say why clearly.
- Prefer products sold as full source code, not SaaS subscriptions.
- Prefer products that can be shown in a strong LinkedIn demo.
- Prefer products one software engineer can build in 7-21 days.
- If market evidence exists, cite it in reasoning.
- If no market evidence exists, clearly say assumptions are unverified.
- Be direct, practical, and buyer-aware.
`;

export async function runCouncilDebate({
  run,
  provider,
  agents = DEFAULT_AGENTS,
  persistence,
}: {
  run: CouncilRunInput;
  provider: AIProvider;
  agents?: CouncilAgent[];
  persistence?: DebatePersistence;
}): Promise<DebateArtifacts> {
  const enabledAgents = agents.filter((agent) => agent.enabled);
  const sourceAgent = findAgent(enabledAgents, "source-code-market");
  const skepticAgent = findAgent(enabledAgents, "skeptic");
  const builderAgent = findAgent(enabledAgents, "builder");
  const pricingAgent = findAgent(enabledAgents, "pricing");
  const judgeAgent = findAgent(enabledAgents, "judge");
  const state: DebateState = {
    run,
    messages: [],
    ideas: [],
    rejectedIdeas: [],
    criticisms: [],
    refinements: [],
    shortlist: [],
    marketEvidence: [],
    scoreHistory: [],
    whyOthersLost: [],
  };

  await persistence?.markRunStatus?.("running");
  const initialEvidence = createInitialMarketEvidence(run);
  state.marketEvidence =
    (await persistence?.saveMarketEvidence?.(initialEvidence)) ?? initialEvidence;

  const round1 = await createRound(0, persistence);
  const generatedIdeas = await generateIdeas(state, provider, sourceAgent);
  const ideas = (await persistence?.saveIdeas(generatedIdeas)) ?? generatedIdeas;
  state.ideas = ideas;
  await recordMessage(
    state,
    persistence,
    round1,
    sourceAgent,
    renderGeneratedIdeasMessage(ideas),
  );

  const round2 = await createRound(1, persistence);
  const topResponse = await chooseTopIdeas(state, provider, skepticAgent);
  state.rejectedIdeas = topResponse.rejectedIdeas;
  const rejectedTitles = new Set(topResponse.rejectedIdeas.map((idea) => idea.title));
  const topTitles = new Set(topResponse.topIdeas.map((idea) => idea.title));

  await persistence?.updateIdeaStatuses(
    ideas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: rejectedTitles.has(idea.title) ? "rejected" : "generated",
    })),
  );

  await recordMessage(
    state,
    persistence,
    round2,
    skepticAgent,
    renderSkepticFilterMessage(topResponse),
  );

  const round3 = await createRound(2, persistence);
  const shortlistedIdeas = ideas
    .filter((idea) => topTitles.has(idea.title))
    .slice(0, 5);
  state.shortlist = shortlistedIdeas.length ? shortlistedIdeas : ideas.slice(0, 5);
  await persistence?.updateIdeaStatuses(
    state.shortlist.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: "shortlisted",
    })),
  );
  const shortlistResponse = await confirmShortlist(state, provider, builderAgent);
  applyShortlistRefinements(state, shortlistResponse, round3, builderAgent);
  await recordMessage(
    state,
    persistence,
    round3,
    builderAgent,
    renderShortlistMessage(shortlistResponse),
  );

  const round4 = await createRound(3, persistence);
  await debateShortlist(state, provider, enabledAgents, round4, persistence);

  const round5 = await createRound(4, persistence);
  let scoredIdeas = await scoreShortlist(state, provider, judgeAgent);
  await persistence?.saveScores(scoredIdeas);
  await recordMessage(
    state,
    persistence,
    round5,
    pricingAgent,
    renderScoreMessage(scoredIdeas),
  );

  const round6 = await createRound(5, persistence);
  const judgeDecision = await chooseWinner(state, provider, judgeAgent, scoredIdeas);
  state.finalDecisionReason = judgeDecision.reason;
  state.whyOthersLost = judgeDecision.whyOthersLost;
  scoredIdeas = scoredIdeas.map((idea) => ({
    ...idea,
    lostReason: judgeDecision.whyOthersLost.find((lost) => lost.title === idea.title)
      ?.reason,
  }));
  const winner =
    scoredIdeas.find((idea) => idea.title === judgeDecision.winner.title) ??
    judgeDecision.winner;

  await persistence?.updateIdeaStatuses(
    scoredIdeas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: idea.title === winner.title ? "winner" : "backup",
    })),
  );
  await recordMessage(
    state,
    persistence,
    round6,
    judgeAgent,
    renderJudgeMessage(winner, judgeDecision),
  );

  const round7 = await createRound(6, persistence);
  const report = await generateReport(state, provider, judgeAgent, winner, scoredIdeas);
  await persistence?.saveFinalReport(report, winner);
  await recordMessage(
    state,
    persistence,
    round7,
    judgeAgent,
    `The final report is ready for ${winner.title}. It includes the Build This First decision, score rationale, launch assets, architecture, pricing tiers, packaging checklist, and why the other top ideas lost.`,
  );

  await persistence?.markRunStatus?.("completed");

  return {
    run,
    agents: enabledAgents,
    ideas,
    marketEvidence: state.marketEvidence,
    shortlistedIdeas: state.shortlist,
    scoredIdeas,
    winner,
    report,
  };
}

async function createRound(
  index: number,
  persistence?: DebatePersistence,
): Promise<RoundRecord> {
  const definition = ROUND_DEFINITIONS[index];
  const saved = await persistence?.createRound(definition);

  return {
    ...definition,
    id: saved?.id ?? crypto.randomUUID(),
  };
}

async function recordMessage(
  state: DebateState,
  persistence: DebatePersistence | undefined,
  round: RoundRecord,
  agent: CouncilAgent,
  content: string,
) {
  await persistence?.addMessage({
    roundId: round.id,
    agent,
    content,
  });

  state.messages.push({
    roundNumber: round.roundNumber,
    roundTitle: round.title,
    agentName: agent.name,
    agentRole: agent.role,
    content,
  });
}

async function generateIdeas(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
) {
  const fallback = { ideas: expandMockIdeas() };
  const response = await provider.generateJSON<IdeasResponse>({
    system: buildAgentSystem(agent),
    prompt: `
You are opening the council. Generate exactly 20 full-source-code product ideas Ahmad can build and sell on LinkedIn.
Use the provided market evidence when it exists. If it does not exist, label demand assumptions as unverified.

Source Code Market Agent requirements:
- Suggest products developers, agencies, freelancers, or founders would actually buy.
- Explain why the source code itself has resale value.
- Avoid SaaS-only ideas and generic dashboards without a sharp buyer reason.

Full council context:
${contextSnapshot(state)}

Return JSON only:
{
  "ideas": [
    {
      "title": "string",
      "description": "string",
      "targetBuyer": "string",
      "pain": "string",
      "whyBuySourceCode": "string",
      "mvpFeatures": ["string"],
      "fullFeatures": ["string"],
      "pricingIdea": "string",
      "risks": ["string"]
    }
  ]
}
`,
    fallback,
    temperature: 0.55,
    maxTokens: 5500,
  });

  return normalizeIdeas(response.ideas).slice(0, 20);
}

async function chooseTopIdeas(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
) {
  const fallback = buildTopIdeasFallback(state.ideas);
  const response = await provider.generateJSON<TopIdeasResponse>({
    system: buildAgentSystem(agent),
    prompt: `
Filter the generated ideas. Reject generic ideas and fantasy thinking.
Use market evidence as a constraint, not decoration.

Skeptic Agent requirements:
- Reject weak or generic ideas clearly.
- Call out fantasy thinking, fake demand, weak demos, and low source-code resale value.
- Penalize ideas with no supporting evidence or only weak assumptions.
- Keep exactly 5 ideas.
- For every rejected idea, include at least one concrete risk.

Full council context:
${contextSnapshot(state)}

Return JSON only:
{
  "topIdeas": [
    {"title": "string", "reason": "string", "requiredFix": "string"}
  ],
  "rejectedIdeas": [
    {"title": "string", "reason": "string", "risks": ["string"]}
  ]
}
`,
    fallback,
    temperature: 0.25,
    maxTokens: 4200,
  });

  return normalizeTopIdeasResponse(response, state.ideas);
}

async function confirmShortlist(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
) {
  const fallback = {
    message:
      "Skeptic Agent filtered the board correctly: keep the products with concrete buyers, visible demos, and source-code resale value. The shortlist still needs tight MVP boundaries before scoring.",
    topIdeas: state.shortlist.map((idea) => ({
      title: idea.title,
      reason: "Strongest fit after rejection pass.",
      requiredFix: "Keep the MVP narrow and make the source-code package obvious in the demo.",
    })),
  };

  const response = await provider.generateJSON<ShortlistResponse>({
    system: buildAgentSystem(agent),
    prompt: `
Confirm the final shortlist and refine it before the council debate.

Builder/Judge shortlist requirements:
- Reference what the Skeptic Agent rejected.
- Reference market evidence if it exists, or state that assumptions remain unverified.
- Explain why each shortlisted idea survived.
- Add one required fix for each idea before scoring.
- Keep exactly 5 ideas and do not introduce new products.

Full council context:
${contextSnapshot(state)}

Return JSON only:
{
  "message": "string",
  "topIdeas": [
    {"title": "string", "reason": "string", "requiredFix": "string"}
  ]
}
`,
    fallback,
    temperature: 0.25,
    maxTokens: 2200,
  });

  return {
    message: safeText(response.message, fallback.message),
    topIdeas: state.shortlist.map((idea, index) => {
      const match = response.topIdeas?.find((item) => item.title === idea.title);
      return {
        title: idea.title,
        reason: safeText(match?.reason, fallback.topIdeas[index]?.reason ?? ""),
        requiredFix: safeText(
          match?.requiredFix,
          fallback.topIdeas[index]?.requiredFix ?? "",
        ),
      };
    }),
  };
}

async function debateShortlist(
  state: DebateState,
  provider: AIProvider,
  agents: CouncilAgent[],
  round: RoundRecord,
  persistence?: DebatePersistence,
) {
  const debatingAgents = agents.filter((agent) =>
    [
      "linkedin-virality",
      "developer-buyer",
      "agency-buyer",
      "skeptic",
      "builder",
      "pricing",
    ].includes(agent.key),
  );

  for (const agent of debatingAgents) {
    const fallback = localDebateResponse(agent, state.shortlist, state.marketEvidence);
    const response = await provider.generateJSON<DebateResponse>({
      system: buildAgentSystem(agent),
      prompt: `
Respond inside the council-room debate. You must read the previous agent messages and challenge or refine them.
Use market evidence when available. If there is no evidence for an idea, say that directly.

Agent-specific requirements:
${agentSpecificRequirements(agent)}

Full council context:
${contextSnapshot(state)}

Return JSON only:
{
  "message": "string",
  "referencedAgentOrIdea": "string",
  "strongestIdea": "string",
  "weakestIdea": "string",
  "demoHook": "string",
  "commentSignal": "price | send me | code | none",
  "developerSavings": "string",
  "agencyNiches": ["string"],
  "buildComplexity": "string",
  "mvpScope": ["string"],
  "doNotBuild": ["string"],
  "pricingTiers": {"lite": "string", "pro": "string", "agency": "string"},
  "criticisms": [
    {"title": "string", "criticism": "string", "riskLevel": "low | medium | high"}
  ],
  "ideaRisks": [
    {"title": "string", "risks": ["string", "string", "string"]}
  ],
  "refinements": [
    {"title": "string", "refinement": "string"}
  ]
}
`,
      fallback,
      model: agent.modelName,
      temperature: 0.45,
      maxTokens: agent.key === "skeptic" ? 2600 : 1700,
    });

    const normalized = normalizeDebateResponse(response, agent, state.shortlist);
    applyDebateResponse(state, agent, round, normalized);
    await recordMessage(
      state,
      persistence,
      round,
      agent,
      renderDebateResponse(agent, normalized),
    );
  }
}

async function scoreShortlist(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
) {
  const localScores = scoreIdeasLocally(state.shortlist, state.marketEvidence);
  const localExplanations = explainScoresLocally(
    state.shortlist,
    state.marketEvidence,
  );
  const response = await provider.generateJSON<ScoresResponse>({
    system: buildAgentSystem(agent),
    prompt: `
Score each shortlisted product idea from 1-10 using the exact rubric keys below.
You must use previous debate messages, criticisms, refinements, rejected ideas, market evidence, and the final shortlist.
Add a short explanation for every individual score.
Reward evidence-backed ideas. Penalize ideas where buyer demand, LinkedIn virality, or competitor weakness is unverified.

Rubric keys:
- buyer_demand
- linkedin_virality
- source_code_resale_value
- build_speed
- demo_quality
- ai_value
- customization_potential
- competition_weakness
- price_potential
- ahmad_founder_fit

Full council context:
${contextSnapshot(state)}

Return JSON only:
{
  "scores": [
    {
      "title": "string",
      "buyer_demand": 1,
      "linkedin_virality": 1,
      "source_code_resale_value": 1,
      "build_speed": 1,
      "demo_quality": 1,
      "ai_value": 1,
      "customization_potential": 1,
      "competition_weakness": 1,
      "price_potential": 1,
      "ahmad_founder_fit": 1,
      "explanations": {
        "buyer_demand": "string",
        "linkedin_virality": "string",
        "source_code_resale_value": "string",
        "build_speed": "string",
        "demo_quality": "string",
        "ai_value": "string",
        "customization_potential": "string",
        "competition_weakness": "string",
        "price_potential": "string",
        "ahmad_founder_fit": "string"
      },
      "reason": "string"
    }
  ]
}
`,
    fallback: {
      scores: state.shortlist.map((idea, index) => ({
        title: idea.title,
        ...localScores[index],
        explanations: localExplanations[index],
        reason:
          "Local deterministic score based on buyer fit, demo clarity, build speed, and source-code resale value.",
      })),
    },
    temperature: 0.2,
    maxTokens: 5200,
  });

  const scoredIdeas = state.shortlist.map((idea, index) => {
    const scoreCandidate =
      response.scores?.find((candidate) => candidate.title === idea.title) ??
      response.scores?.[index];
    const fallbackScore = localScores[index];
    const score = normalizeScore({
      ...fallbackScore,
      ...scoreCandidate,
      productIdeaId: idea.id,
    });
    const explanations = normalizeScoreExplanations(
      scoreCandidate?.explanations ??
        scoreCandidate?.score_explanations ??
        localExplanations[index],
    );
    const scoreReason = safeText(
      scoreCandidate?.reason,
      "Weighted against debate criticisms, buyer willingness to pay, and build realism.",
    );

    return {
      ...idea,
      score,
      scoreExplanations: explanations,
      scoreReason,
    };
  });

  state.scoreHistory = scoredIdeas.map((idea) => ({
    title: idea.title,
    totalScore: idea.score.total_score,
    score: idea.score,
    explanations:
      idea.scoreExplanations ?? normalizeScoreExplanations(localExplanations[0]),
    reason: idea.scoreReason ?? "",
  }));

  return scoredIdeas;
}

async function chooseWinner(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  scoredIdeas: ScoredProductIdea[],
) {
  const sorted = sortByScore(scoredIdeas);
  const fallback = {
    winnerTitle: sorted[0]?.title ?? scoredIdeas[0].title,
    reason:
      "Highest total score, strongest LinkedIn demo, and best source-code resale value for Ahmad.",
    whyOthersLost: sorted.slice(1).map((idea) => ({
      title: idea.title,
      reason: "Lower combined probability after scoring and council criticism.",
    })),
  };
  const response = await provider.generateJSON<JudgeResponse>({
    system: buildAgentSystem(agent),
    prompt: `
Choose exactly one winner. You must force a decision.

Judge Agent requirements:
- Say which one product Ahmad should build first.
- Clearly support complete source-code sales, not SaaS subscriptions.
- Include why the other top ideas lost.
- Explain what market evidence supported the winner.
- If evidence is thin, say what Ahmad must verify manually before building.
- The final message must include the exact phrase: "Build this first."

Full council context:
${contextSnapshot(state)}

Scored ideas:
${JSON.stringify(sorted, null, 2)}

Return JSON only:
{
  "winnerTitle": "string",
  "reason": "string",
  "whyOthersLost": [
    {"title": "string", "reason": "string"}
  ]
}
`,
    fallback,
    temperature: 0.15,
    maxTokens: 2200,
  });

  const winner =
    scoredIdeas.find((idea) => idea.title === response.winnerTitle) ??
    sorted[0] ??
    scoredIdeas[0];

  return {
    winner,
    reason: safeText(response.reason, fallback.reason),
    whyOthersLost: scoredIdeas
      .filter((idea) => idea.title !== winner.title)
      .map((idea) => {
        const match = response.whyOthersLost?.find(
          (lost) => lost.title === idea.title,
        );
        return {
          title: idea.title,
          reason: safeText(
            match?.reason,
            "It lost to the winner on combined buyer demand, demo quality, build speed, or source-code resale value.",
          ),
        };
      }),
  };
}

async function generateReport(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  winner: ScoredProductIdea,
  scoredIdeas: ScoredProductIdea[],
) {
  const reportContext = createReportContext(state, scoredIdeas);
  const fallback = createDeterministicReport(state.run, winner, reportContext);
  const response = await provider.generateJSON<typeof fallback>({
    system: buildAgentSystem(agent),
    prompt: buildReportPrompt(state.run, winner, reportContext),
    fallback,
    temperature: 0.25,
    maxTokens: 6500,
  });

  if (
    !/build this first/i.test(response.reportMarkdown ?? "") ||
    !/#\s*Market Evidence Used/i.test(response.reportMarkdown ?? "") ||
    !/#\s*Codex Build Blueprint/i.test(response.reportMarkdown ?? "")
  ) {
    return fallback;
  }

  return {
    ...fallback,
    ...response,
    winnerProductId: winner.id,
    packagingChecklist: response.packagingChecklist?.length
      ? response.packagingChecklist
      : fallback.packagingChecklist,
    buildPlan: response.buildPlan?.length ? response.buildPlan : fallback.buildPlan,
  };
}

function buildAgentSystem(agent: CouncilAgent) {
  return `${agent.systemPrompt}

${UNIVERSAL_DEBATE_RULES}

${agentSpecificRequirements(agent)}`;
}

function agentSpecificRequirements(agent: CouncilAgent) {
  switch (agent.key) {
    case "source-code-market":
      return `
Source Code Market Agent:
- Suggest source-code products developers, agencies, freelancers, or founders would actually buy.
- Explain why the source code itself has resale value.
- Prefer implementation shortcuts, client-ready portals, and reusable business workflows.`;
    case "linkedin-virality":
      return `
LinkedIn Virality Agent:
- Judge whether the product can stop scrolling on LinkedIn.
- Propose a concrete demo hook.
- Say whether people would comment "price", "send me", or "code".`;
    case "developer-buyer":
      return `
Developer Buyer Agent:
- Answer: "Would a developer pay for this to save time?"
- Estimate how many hours or weeks it saves.
- Identify the repo/docs/prompts needed to justify the purchase.`;
    case "agency-buyer":
      return `
Agency Buyer Agent:
- Answer: "Can an agency customize or resell this to clients?"
- Suggest possible client niches.
- Prefer white-label and repeatable client-delivery value.`;
    case "skeptic":
      return `
Skeptic Agent:
- Identify at least 3 risks for each shortlisted idea.
- Reject generic ideas.
- Call out fantasy thinking, weak demos, fake demand, and scope creep.
- Penalize ideas with no evidence or only assumption-heavy support.`;
    case "builder":
      return `
Builder Agent:
- Estimate build complexity.
- Suggest exact MVP scope.
- Say what NOT to build.
- Keep the build realistic for one software engineer in 7-21 days.`;
    case "pricing":
      return `
Pricing Agent:
- Propose Lite, Pro, and Agency license pricing.
- Explain what each license includes.
- Tie price to saved engineering time, resale rights, docs, and customization.`;
    case "judge":
      return `
Judge Agent:
- Choose only one winner.
- Clearly say: "Build this first."
- Include why the other top ideas lost.
- Explain what evidence supported the winner and what Ahmad still needs to verify.
- Do not hedge or split the recommendation.`;
  }
}

function contextSnapshot(state: DebateState) {
  return JSON.stringify(
    {
      originalUserGoal: state.run.goal,
      councilRunInputs: {
        title: state.run.title,
        targetBuyer: state.run.targetBuyer,
        productCategory: state.run.productCategory,
        buildTimeLimit: state.run.buildTimeLimit,
        preferredStack: state.run.preferredStack,
        minimumPrice: state.run.minimumPrice,
        linkedinAudience: state.run.linkedinAudience,
        notes: state.run.notes,
        marketEvidenceNotes: state.run.marketEvidenceNotes,
      },
      marketEvidenceSummary: summarizeMarketEvidence(state.marketEvidence),
      marketEvidence: state.marketEvidence,
      evidenceByProductIdea: state.shortlist.map((idea) => ({
        title: idea.title,
        evidence: evidenceForIdea(idea, state.marketEvidence),
      })),
      allPreviousAgentMessages: state.messages,
      currentProductIdeas: state.ideas.map(slimIdea),
      rejectedIdeas: state.rejectedIdeas,
      criticisms: state.criticisms,
      refinements: state.refinements,
      scoreHistory: state.scoreHistory,
      finalShortlist: state.shortlist.map(slimIdea),
      whyOtherTopIdeasLost: state.whyOthersLost,
      finalDecisionReason: state.finalDecisionReason,
    },
    null,
    2,
  );
}

function createReportContext(
  state: DebateState,
  scoredIdeas: ScoredProductIdea[],
): ReportContext {
  return {
    previousMessages: state.messages,
    shortlistedIdeas: state.shortlist,
    rejectedIdeas: state.rejectedIdeas,
    criticisms: state.criticisms,
    refinements: state.refinements,
    scoredIdeas,
    scoreHistory: state.scoreHistory,
    marketEvidence: state.marketEvidence,
    whyOthersLost: state.whyOthersLost,
    finalDecisionReason: state.finalDecisionReason,
  };
}

function slimIdea(idea: ProductIdeaDraft) {
  return {
    title: idea.title,
    description: idea.description,
    targetBuyer: idea.targetBuyer,
    pain: idea.pain,
    whyBuySourceCode: idea.whyBuySourceCode,
    mvpFeatures: idea.mvpFeatures,
    fullFeatures: idea.fullFeatures,
    pricingIdea: idea.pricingIdea,
    risks: idea.risks,
    status: idea.status,
  };
}

function buildTopIdeasFallback(ideas: ProductIdeaDraft[]): TopIdeasResponse {
  const topIdeas = ideas.slice(0, 5).map((idea) => ({
    title: idea.title,
    reason: "Strong balance of source-code resale value, build speed, and demo clarity.",
    requiredFix:
      "Narrow the MVP to one buyer workflow and make the code package visible in the launch demo.",
  }));
  const rejectedIdeas = ideas.slice(5).map((idea) => ({
    title: idea.title,
    reason:
      "Lower probability than the top five for Ahmad's LinkedIn source-code strategy.",
    risks: [
      "Less urgent buyer pain.",
      "Weaker LinkedIn demo hook.",
      "Harder to justify source-code license pricing.",
    ],
  }));

  return { topIdeas, rejectedIdeas };
}

function normalizeTopIdeasResponse(
  response: TopIdeasResponse,
  ideas: ProductIdeaDraft[],
): TopIdeasResponse {
  const fallback = buildTopIdeasFallback(ideas);
  const knownTitles = new Set(ideas.map((idea) => idea.title));
  const topIdeas: Array<{ title: string; reason: string; requiredFix: string }> =
    uniqueByTitle(response.topIdeas ?? [])
    .filter((idea) => knownTitles.has(idea.title))
    .slice(0, 5)
    .map((idea) => ({
      title: idea.title,
      reason: safeText(idea.reason, "Strongest product-market fit in this run."),
      requiredFix: safeText(
        idea.requiredFix,
        "Keep the MVP narrow and show the source-code package clearly.",
      ),
    }));

  for (const fallbackIdea of fallback.topIdeas) {
    if (topIdeas.length >= 5) {
      break;
    }

    if (!topIdeas.some((idea) => idea.title === fallbackIdea.title)) {
      topIdeas.push({
        title: fallbackIdea.title,
        reason: fallbackIdea.reason,
        requiredFix: safeText(
          fallbackIdea.requiredFix,
          "Keep the MVP narrow and show the source-code package clearly.",
        ),
      });
    }
  }

  const topTitles = new Set(topIdeas.map((idea) => idea.title));
  const rejectedIdeas = ideas
    .filter((idea) => !topTitles.has(idea.title))
    .map((idea) => {
      const match = response.rejectedIdeas?.find((rejected) => rejected.title === idea.title);
      return {
        title: idea.title,
        reason: safeText(
          match?.reason,
          "It lost to stronger ideas on demand, demo clarity, or source-code resale value.",
        ),
        risks: ensureAtLeastThreeRisks(match?.risks ?? idea.risks, idea),
      };
    });

  return { topIdeas, rejectedIdeas };
}

function applyShortlistRefinements(
  state: DebateState,
  response: ShortlistResponse,
  round: RoundRecord,
  agent: CouncilAgent,
) {
  for (const item of response.topIdeas) {
    state.refinements.push({
      agentName: agent.name,
      title: item.title,
      refinement: item.requiredFix,
      roundNumber: round.roundNumber,
    });
  }
}

function normalizeDebateResponse(
  response: DebateResponse,
  agent: CouncilAgent,
  shortlist: ProductIdeaDraft[],
): DebateResponse {
  const fallback = localDebateResponse(agent, shortlist);
  const ideaTitles = new Set(shortlist.map((idea) => idea.title));
  const criticisms = (response.criticisms ?? fallback.criticisms)
    .filter((item) => ideaTitles.has(item.title))
    .map((item) => ({
      title: item.title,
      criticism: safeText(item.criticism, "This needs sharper buyer proof."),
      riskLevel: normalizeRiskLevel(item.riskLevel),
    }));
  const refinements = (response.refinements ?? fallback.refinements)
    .filter((item) => ideaTitles.has(item.title))
    .map((item) => ({
      title: item.title,
      refinement: safeText(
        item.refinement,
        "Narrow the product to one buyer workflow and one demoable output.",
      ),
    }));
  const ideaRisks =
    agent.key === "skeptic"
      ? shortlist.map((idea) => {
          const match = response.ideaRisks?.find((risk) => risk.title === idea.title);
          return {
            title: idea.title,
            risks: ensureAtLeastThreeRisks(match?.risks ?? idea.risks, idea),
          };
        })
      : response.ideaRisks?.filter((item) => ideaTitles.has(item.title));

  return {
    ...fallback,
    ...response,
    message: safeText(response.message, fallback.message),
    referencedAgentOrIdea: safeText(
      response.referencedAgentOrIdea,
      fallback.referencedAgentOrIdea,
    ),
    strongestIdea: ideaTitles.has(response.strongestIdea)
      ? response.strongestIdea
      : fallback.strongestIdea,
    weakestIdea: ideaTitles.has(response.weakestIdea)
      ? response.weakestIdea
      : fallback.weakestIdea,
    commentSignal: normalizeCommentSignal(response.commentSignal ?? fallback.commentSignal),
    agencyNiches: safeList(response.agencyNiches ?? fallback.agencyNiches),
    mvpScope: safeList(response.mvpScope ?? fallback.mvpScope),
    doNotBuild: safeList(response.doNotBuild ?? fallback.doNotBuild),
    pricingTiers: response.pricingTiers ?? fallback.pricingTiers,
    criticisms,
    refinements,
    ideaRisks,
  };
}

function applyDebateResponse(
  state: DebateState,
  agent: CouncilAgent,
  round: RoundRecord,
  response: DebateResponse,
) {
  for (const item of response.criticisms) {
    state.criticisms.push({
      agentName: agent.name,
      title: item.title,
      criticism: item.criticism,
      riskLevel: item.riskLevel,
      roundNumber: round.roundNumber,
    });
  }

  for (const item of response.ideaRisks ?? []) {
    for (const risk of item.risks) {
      state.criticisms.push({
        agentName: agent.name,
        title: item.title,
        criticism: risk,
        riskLevel: "high",
        roundNumber: round.roundNumber,
      });
    }
  }

  for (const item of response.refinements) {
    state.refinements.push({
      agentName: agent.name,
      title: item.title,
      refinement: item.refinement,
      roundNumber: round.roundNumber,
    });
  }
}

function renderGeneratedIdeasMessage(ideas: ProductIdeaDraft[]) {
  return [
    `Generated ${ideas.length} complete source-code product candidates.`,
    "I am prioritizing products developers, agencies, freelancers, and founders can buy as code ownership, not as another subscription.",
    "Early strongest source-code resale patterns:",
    ...ideas.slice(0, 5).map((idea) => `- ${idea.title}: ${idea.whyBuySourceCode}`),
  ].join("\n");
}

function renderSkepticFilterMessage(response: TopIdeasResponse) {
  return [
    "I rejected weaker ideas instead of spreading attention across fantasy demand.",
    "",
    "Top 5 kept:",
    ...response.topIdeas.map(
      (idea) => `- ${idea.title}: ${idea.reason} Fix before scoring: ${idea.requiredFix}`,
    ),
    "",
    "Rejected:",
    ...response.rejectedIdeas
      .slice(0, 10)
      .map((idea) => `- ${idea.title}: ${idea.reason} Risks: ${idea.risks.join("; ")}`),
  ].join("\n");
}

function renderShortlistMessage(response: ShortlistResponse) {
  return [
    response.message,
    "",
    "Shortlist fixes before debate:",
    ...response.topIdeas.map(
      (idea) => `- ${idea.title}: ${idea.requiredFix} (${idea.reason})`,
    ),
  ].join("\n");
}

function renderDebateResponse(agent: CouncilAgent, response: DebateResponse) {
  const lines = [
    response.message,
    "",
    `Reference: ${response.referencedAgentOrIdea}`,
    `Strongest idea: ${response.strongestIdea}`,
    `Weakest idea: ${response.weakestIdea}`,
  ];

  if (response.demoHook) {
    lines.push(`Demo hook: ${response.demoHook}`);
  }

  if (response.commentSignal) {
    lines.push(`Likely LinkedIn comment signal: "${response.commentSignal}"`);
  }

  if (response.developerSavings) {
    lines.push(`Developer savings: ${response.developerSavings}`);
  }

  if (response.agencyNiches?.length) {
    lines.push(`Agency niches: ${response.agencyNiches.join(", ")}`);
  }

  if (response.buildComplexity) {
    lines.push(`Build complexity: ${response.buildComplexity}`);
  }

  if (response.mvpScope?.length) {
    lines.push("", "Exact MVP scope:", ...response.mvpScope.map((item) => `- ${item}`));
  }

  if (response.doNotBuild?.length) {
    lines.push("", "Do not build yet:", ...response.doNotBuild.map((item) => `- ${item}`));
  }

  if (response.pricingTiers && agent.key === "pricing") {
    lines.push(
      "",
      "License pricing:",
      `- Lite: ${response.pricingTiers.lite}`,
      `- Pro: ${response.pricingTiers.pro}`,
      `- Agency: ${response.pricingTiers.agency}`,
    );
  }

  if (response.ideaRisks?.length) {
    lines.push("");
    lines.push("Risks by idea:");
    for (const item of response.ideaRisks) {
      lines.push(`- ${item.title}: ${item.risks.join("; ")}`);
    }
  }

  if (response.criticisms.length) {
    lines.push("");
    lines.push("Criticisms:");
    lines.push(
      ...response.criticisms.map(
        (item) => `- [${item.riskLevel}] ${item.title}: ${item.criticism}`,
      ),
    );
  }

  if (response.refinements.length) {
    lines.push("");
    lines.push("Refinements:");
    lines.push(
      ...response.refinements.map((item) => `- ${item.title}: ${item.refinement}`),
    );
  }

  return lines.join("\n");
}

function renderScoreMessage(scoredIdeas: ScoredProductIdea[]) {
  return [
    "Scored each idea out of 100 using the council rubric, with rationale for every category.",
    ...sortByScore(scoredIdeas).map((idea) => {
      const explanations = idea.scoreExplanations
        ? Object.values(idea.scoreExplanations).slice(0, 2).join(" ")
        : idea.scoreReason;
      return `- ${idea.title}: ${idea.score.total_score}/100. ${explanations}`;
    }),
  ].join("\n");
}

function renderJudgeMessage(
  winner: ScoredProductIdea,
  decision: { reason: string; whyOthersLost: Array<{ title: string; reason: string }> },
) {
  return [
    "Build this first.",
    "",
    `Winner: ${winner.title}`,
    decision.reason,
    "",
    "Why the other top ideas lost:",
    ...decision.whyOthersLost.map((idea) => `- ${idea.title}: ${idea.reason}`),
  ].join("\n");
}

function normalizeIdeas(ideas: ProductIdeaDraft[] | undefined): ProductIdeaDraft[] {
  const fallback = expandMockIdeas();
  const source: ProductIdeaDraft[] =
    Array.isArray(ideas) && ideas.length ? ideas : fallback;

  return source.map((idea, index) => ({
    id: idea.id,
    title: safeText(idea.title, fallback[index]?.title ?? `Product Idea ${index + 1}`),
    description: safeText(
      idea.description,
      fallback[index]?.description ?? "A practical full-source-code product.",
    ),
    targetBuyer: safeText(idea.targetBuyer, "Agencies and technical founders"),
    pain: safeText(idea.pain, "The buyer wants to save implementation time."),
    whyBuySourceCode: safeText(
      idea.whyBuySourceCode,
      "The source code can be customized, rebranded, and resold as a service foundation.",
    ),
    mvpFeatures: safeList(idea.mvpFeatures),
    fullFeatures: safeList(idea.fullFeatures),
    pricingIdea: safeText(idea.pricingIdea, "$149-$499 source-code license"),
    risks: safeList(idea.risks),
    status: "generated" as const,
  }));
}

function localDebateResponse(
  agent: CouncilAgent,
  ideas: ProductIdeaDraft[],
  evidence: MarketEvidenceDraft[] = [],
): DebateResponse {
  const top = ideas[0];
  const weakest = ideas[ideas.length - 1] ?? top;
  const evidenceLine = evidence.length
    ? `Market evidence exists (${evidence.length} item(s)); the strongest signal is "${[...evidence].sort((a, b) => b.strengthScore - a.strengthScore)[0].title}".`
    : "No market evidence was provided, so demand assumptions are unverified.";
  const base = {
    referencedAgentOrIdea: top.title,
    strongestIdea: top.title,
    weakestIdea: weakest.title,
    demoHook: `Show a messy buyer workflow turning into a polished ${top.title} output, then reveal the complete source-code package.`,
    commentSignal: "code" as const,
    developerSavings: "Saves roughly 40-80 hours versus rebuilding auth, schema, UI, prompts, and docs.",
    agencyNiches: ["software agencies", "freelance dev shops", "B2B consultants"],
    buildComplexity: "Medium complexity if scoped to one workflow and one admin surface.",
    mvpScope: top.mvpFeatures.slice(0, 4),
    doNotBuild: ["Native mobile app", "Marketplace", "Deep third-party integrations"],
    pricingTiers: {
      lite: "$149 - single project source license with setup docs",
      pro: "$299 - commercial license with prompt guide and seed data",
      agency: "$599 - client-use license with white-label rights",
    },
    criticisms: [
      {
        title: weakest.title,
        criticism:
          "This loses if the buyer cannot see saved implementation time within the first demo minute.",
        riskLevel: "medium" as const,
      },
    ],
    refinements: [
      {
        title: top.title,
        refinement:
          "Make the MVP prove one painful workflow and package the source code with docs, seed data, and prompt notes.",
      },
    ],
  };

  if (agent.key === "skeptic") {
    return {
      ...base,
      message: `${top.title} is strongest only if the demo proves real saved work. ${evidenceLine} I disagree with any blanket optimism: every shortlisted idea needs source-code resale proof, not just AI sparkle.`,
      ideaRisks: ideas.map((idea) => ({
        title: idea.title,
        risks: ensureAtLeastThreeRisks(idea.risks, idea),
      })),
    };
  }

  if (agent.key === "pricing") {
    return {
      ...base,
      message: `${top.title} can support Lite, Pro, and Agency licenses, but the price only works if the package includes clean source code, docs, seed data, prompt customization, and license clarity. ${evidenceLine}`,
    };
  }

  if (agent.key === "builder") {
    return {
      ...base,
      message: `${top.title} is buildable in 7-21 days if the V1 keeps one core workflow, one admin view, and one AI output. Do not build billing, mobile, or integrations before validation. ${evidenceLine}`,
    };
  }

  if (agent.key === "developer-buyer") {
    return {
      ...base,
      message: `A developer would pay for ${top.title} if it saves at least a week of setup. I would challenge the shortlist on code quality: messy architecture kills source-code resale value. ${evidenceLine}`,
    };
  }

  if (agent.key === "agency-buyer") {
    return {
      ...base,
      message: `An agency can resell ${top.title} if it is white-label and nicheable. The strongest client niches are teams with recurring reporting, approvals, proposals, or admin workflows. ${evidenceLine}`,
    };
  }

  return {
    ...base,
    message: `${top.title} has the strongest scroll-stopping demo if the post shows the problem, the AI-generated output, and the code package. I would expect comments like "code" or "send me". ${evidenceLine}`,
  };
}

function ensureAtLeastThreeRisks(risks: string[] | undefined, idea: ProductIdeaDraft) {
  const merged = safeList(risks);
  const defaults = [
    `${idea.title} may feel generic unless the buyer niche is explicit.`,
    "The LinkedIn demo may underperform if it does not show a strong before-and-after.",
    "The source-code price is weak unless docs, seed data, and customization paths are included.",
  ];

  for (const risk of defaults) {
    if (merged.length >= 3) {
      break;
    }
    merged.push(risk);
  }

  return merged.slice(0, Math.max(3, merged.length));
}

function uniqueByTitle<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.title)) {
      return false;
    }
    seen.add(item.title);
    return true;
  });
}

function safeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeRiskLevel(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "medium";
}

function normalizeCommentSignal(value: unknown) {
  return value === "price" ||
    value === "send me" ||
    value === "code" ||
    value === "none"
    ? value
    : "code";
}

function findAgent(agents: CouncilAgent[], key: CouncilAgent["key"]) {
  return agents.find((agent) => agent.key === key) ?? agentByKey(key);
}

function createInitialMarketEvidence(run: CouncilRunInput): MarketEvidenceDraft[] {
  const provided = run.marketEvidence ?? [];
  const notes = run.marketEvidenceNotes?.trim();

  if (!notes) {
    return provided;
  }

  const manualEvidence: MarketEvidenceDraft = {
    councilRunId: run.id,
    productIdeaId: null,
    sourceType: "manual",
    sourceName: "Ahmad pasted market evidence",
    sourceUrl: null,
    title: "Manual market evidence / observations",
    content: notes,
    signalType: inferSignalType(notes),
    strengthScore: inferEvidenceStrength(notes),
  };

  return [...provided, manualEvidence];
}

function inferSignalType(content: string) {
  const text = content.toLowerCase();

  if (/pay|paid|price|pricing|budget|bought|purchase/.test(text)) {
    return "willingness_to_pay";
  }

  if (/competitor|alternative|too expensive|subscription|tool|product/.test(text)) {
    return "competitor_weakness";
  }

  if (/linkedin|comment|dm|send me|code|price/.test(text)) {
    return "buyer_comment";
  }

  if (/complain|pain|problem|struggle|hate|annoying|manual/.test(text)) {
    return "pain";
  }

  return "demand";
}

function inferEvidenceStrength(content: string) {
  const text = content.toLowerCase();
  let score = 5;

  if (/pay|paid|bought|purchase|budget|price/.test(text)) {
    score += 2;
  }

  if (/dm|comment|quote|review|complain|reddit|linkedin/.test(text)) {
    score += 1;
  }

  if (/http|www\.|competitor|alternative/.test(text)) {
    score += 1;
  }

  if (content.length > 600) {
    score += 1;
  }

  return Math.min(10, Math.max(1, score));
}

function summarizeMarketEvidence(evidence: MarketEvidenceDraft[]) {
  if (!evidence.length) {
    return {
      status: "assumption-heavy",
      strongestEvidence: null,
      message:
        "No market evidence was provided. Agents must treat demand and willingness-to-pay as unverified assumptions.",
    };
  }

  const strongestEvidence = [...evidence].sort(
    (a, b) => b.strengthScore - a.strengthScore,
  )[0];

  return {
    status: "evidence-backed",
    evidenceCount: evidence.length,
    strongestEvidence,
    averageStrength:
      evidence.reduce((total, item) => total + item.strengthScore, 0) /
      evidence.length,
  };
}

function evidenceForIdea(
  idea: ProductIdeaDraft,
  evidence: MarketEvidenceDraft[],
) {
  const ideaText = `${idea.title} ${idea.description} ${idea.targetBuyer}`.toLowerCase();
  const titleWords = idea.title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);

  return evidence.filter((item) => {
    if (item.productIdeaId && idea.id) {
      return item.productIdeaId === idea.id;
    }

    const evidenceText = `${item.title} ${item.content} ${item.sourceName}`.toLowerCase();
    return (
      titleWords.some((word) => evidenceText.includes(word)) ||
      evidenceText.includes(ideaText)
    );
  });
}
