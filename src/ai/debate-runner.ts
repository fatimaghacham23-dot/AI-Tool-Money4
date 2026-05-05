import { agentByKey, DEFAULT_AGENTS, normalizeAgentForProvider } from "@/ai/agents";
import { expandMockIdeas } from "@/ai/mock-data";
import {
  createDeterministicReport,
  type ReportContext,
} from "@/ai/report-generator";
import {
  DAY_ONE_BUILD_THRESHOLD,
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
  FinalDecision,
  MarketEvidenceDraft,
  ProductIdeaDraft,
  ProductScore,
  ProductScoreExplanations,
  ScoredProductIdea,
} from "@/ai/types";
import type { RunDebugTracer } from "@/lib/debug/run-debug-tracer";
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
  finalDecision?: FinalDecision;
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
  finalDecision?: FinalDecision;
  winnerTitle?: string | null;
  candidateTitle?: string | null;
  reason: string;
  whyOthersLost: Array<{ title: string; reason: string }>;
};

type JudgeDecision = {
  winner: ScoredProductIdea;
  finalDecision: FinalDecision;
  dayOneSaleProbability: number;
  reason: string;
  whyOthersLost: Array<{ title: string; reason: string }>;
};

const ROUND_DEFINITIONS = [
  {
    roundNumber: 1,
    roundType: "idea_generation",
    title: "Round 1: Generate 12 Product Ideas",
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
    title: "Round 6: Judge Makes Build Gate Decision",
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

type CompactContextMode =
  | "idea_generation"
  | "skeptic_filter"
  | "shortlist"
  | "agent_debate"
  | "scoring"
  | "judge"
  | "final_report";

type PromptMetrics = {
  beforeChars: number;
  afterChars: number;
  droppedMessages: number;
  droppedIdeas: number;
  maxPromptChars: number;
  contextCompressed: boolean;
};

type PreparedPrompt = {
  prompt: string;
  retryPrompt: string;
  metrics: PromptMetrics;
};

export async function runCouncilDebate({
  run,
  provider,
  agents = DEFAULT_AGENTS,
  persistence,
  tracer,
}: {
  run: CouncilRunInput;
  provider: AIProvider;
  agents?: CouncilAgent[];
  persistence?: DebatePersistence;
  tracer?: RunDebugTracer;
}): Promise<DebateArtifacts> {
  const enabledAgents = agents
    .filter((agent) => agent.enabled)
    .map((agent) => normalizeAgentForProvider(agent, provider.name));
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

  tracer?.startStep("start_debate_runner", {
    provider: provider.name,
    agentCount: enabledAgents.length,
  });
  await persistence?.markRunStatus?.("running");
  await persistence?.updateRunProgress?.({
    currentStep: "Preparing market evidence",
    progressPercent: 2,
  });
  const hasPersistedEvidence = Boolean(run.marketEvidence?.some((item) => item.id));
  const initialEvidence = run.marketEvidence?.length
    ? run.marketEvidence
    : createInitialMarketEvidence(run);
  tracer?.startStep("insert_market_evidence", { count: initialEvidence.length });
  state.marketEvidence =
    hasPersistedEvidence
      ? initialEvidence
      : (await persistence?.saveMarketEvidence?.(initialEvidence)) ?? initialEvidence;
  tracer?.completeStep("insert_market_evidence", { count: state.marketEvidence.length });

  const round1 = await createRound(0, persistence);
  const generatedIdeas = await generateIdeas(state, provider, sourceAgent, tracer, round1, persistence);
  const ideas = (await persistence?.saveIdeas(generatedIdeas)) ?? generatedIdeas;
  state.ideas = ideas;
  await recordMessage(
    state,
    persistence,
    round1,
    sourceAgent,
    renderGeneratedIdeasMessage(ideas),
    modelForRound(sourceAgent, provider, round1),
    provider.name,
  );

  const round2 = await createRound(1, persistence);
  const topResponse = await chooseTopIdeas(state, provider, skepticAgent, tracer, round2, persistence);
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
    modelForRound(skepticAgent, provider, round2),
    provider.name,
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
  const shortlistResponse = await confirmShortlist(state, provider, builderAgent, tracer, round3, persistence);
  applyShortlistRefinements(state, shortlistResponse, round3, builderAgent);
  await recordMessage(
    state,
    persistence,
    round3,
    builderAgent,
    renderShortlistMessage(shortlistResponse),
    modelForRound(builderAgent, provider, round3),
    provider.name,
  );

  const round4 = await createRound(3, persistence);
  await debateShortlist(state, provider, enabledAgents, round4, persistence, tracer);

  const round5 = await createRound(4, persistence);
  let scoredIdeas = await scoreShortlist(state, provider, judgeAgent, tracer, round5, persistence);
  await persistence?.saveScores(scoredIdeas);
  await recordMessage(
    state,
    persistence,
    round5,
    pricingAgent,
    renderScoreMessage(scoredIdeas),
    modelForRound(pricingAgent, provider, round5),
    provider.name,
  );

  const round6 = await createRound(5, persistence);
  const judgeDecision = await chooseWinner(state, provider, judgeAgent, scoredIdeas, tracer, round6, persistence);
  state.finalDecision = judgeDecision.finalDecision;
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
  const canBuildNow = judgeDecision.finalDecision === "build_now";

  await persistence?.updateIdeaStatuses(
    scoredIdeas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: judgeDecision.finalDecision === "reject_all"
        ? "rejected"
        : canBuildNow && idea.title === winner.title
        ? "winner"
        : idea.title === winner.title
          ? "shortlisted"
          : "backup",
    })),
  );
  await recordMessage(
    state,
    persistence,
    round6,
    judgeAgent,
    renderJudgeMessage(winner, judgeDecision),
    modelForRound(judgeAgent, provider, round6),
    provider.name,
  );

  const round7 = await createRound(6, persistence);
  const report = await generateReport(state, provider, judgeAgent, winner, scoredIdeas, tracer, round7, persistence);
  await persistence?.saveFinalReport(report, winner);
  const finalReportMessage =
    judgeDecision.finalDecision === "build_now"
      ? `The final report is ready for ${winner.title}. It includes the Build Now decision, Day-One Sale Probability, score rationale, launch assets, architecture, pricing tiers, packaging checklist, and why the other top ideas lost.`
      : judgeDecision.finalDecision === "reject_all"
        ? `The final report rejects all shortlisted ideas. It explains which hidden-gap hard gates failed, what evidence Ahmad should collect next, and how to prompt the next council run.`
      : `The final report is ready for ${winner.title}. It says "Validate first / Do not build yet" and includes the Pre-Sell Pack, Day-One Sale Probability, validation threshold, and why no idea cleared ${DAY_ONE_BUILD_THRESHOLD}.`;
  await recordMessage(
    state,
    persistence,
    round7,
    judgeAgent,
    finalReportMessage,
    modelForRound(judgeAgent, provider, round7),
    provider.name,
  );

  await persistence?.updateRunProgress?.({
    currentRound: round7.title,
    currentAgent: judgeAgent.name,
    currentStep: "Council completed",
    currentProvider: provider.name,
    currentModel: modelForRound(judgeAgent, provider, round7),
    progressPercent: 100,
  });
  await persistence?.markRunStatus?.("completed");
  tracer?.completeStep("update_run_completed", { status: "completed" });
  tracer?.completeStep("start_debate_runner", { status: "completed" });

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

function attachFailureMetadata(
  error: unknown,
  meta: {
    failedStep: string;
    failedRound?: string;
    failedAgent?: string;
    failedProvider?: string;
    failedModel?: string;
  },
) {
  if (!error || typeof error !== "object") {
    return;
  }

  const anyError = error as Record<string, unknown>;
  anyError.failedStep = meta.failedStep;
  if (meta.failedRound) anyError.failedRound = meta.failedRound;
  if (meta.failedAgent) anyError.failedAgent = meta.failedAgent;
  if (meta.failedProvider) anyError.failedProvider = meta.failedProvider;
  if (meta.failedModel) anyError.failedModel = meta.failedModel;
}

function estimatePromptSize(text: string) {
  return {
    chars: text.length,
    approxTokens: Math.ceil(text.length / 4),
  };
}

function getMaxPromptChars(provider: AIProvider, model: string) {
  if (provider.name === "github-models" && model === "openai/gpt-4.1-nano") {
    return 8000;
  }

  if (provider.name === "github-models" && model === "openai/gpt-4o-mini") {
    return 10000;
  }

  return 12000;
}

function modelForRound(agent: CouncilAgent, provider: AIProvider, round?: RoundRecord) {
  if (provider.name !== "github-models") {
    return agent.modelName;
  }

  if (round?.roundNumber === 1) {
    return "openai/gpt-4o-mini";
  }

  if (round?.roundNumber === 2) {
    return "openai/gpt-4o-mini";
  }

  if ([3, 5, 6, 7].includes(round?.roundNumber ?? 0)) {
    return "openai/gpt-4.1";
  }

  return agent.modelName;
}

function isTokenLimitError(error: unknown) {
  const value = error as {
    status?: number;
    code?: string;
    message?: string;
    bodyExcerpt?: string;
  };
  const text = `${value?.code ?? ""} ${value?.message ?? ""} ${value?.bodyExcerpt ?? ""}`.toLowerCase();

  return (
    value?.status === 413 ||
    text.includes("tokens_limit_reached") ||
    text.includes("request body too large") ||
    text.includes("max size")
  );
}

function preparePrompt({
  state,
  provider,
  model,
  mode,
  build,
}: {
  state: DebateState;
  provider: AIProvider;
  model: string;
  mode: CompactContextMode;
  build: (context: string) => string;
}): PreparedPrompt {
  const maxPromptChars = getMaxPromptChars(provider, model);
  const normalContext = buildCompactDebateContext(state, { mode });
  const firstPrompt = build(normalContext.text);
  const beforeChars = firstPrompt.length;
  let prompt = firstPrompt;
  let droppedMessages = normalContext.droppedMessages;
  let droppedIdeas = normalContext.droppedIdeas;

  if (prompt.length > maxPromptChars) {
    const aggressiveContext = buildCompactDebateContext(state, {
      mode,
      maxMessages: 2,
      maxIdeas: mode === "skeptic_filter" ? 8 : 5,
      maxEvidence: 3,
      maxText: Math.max(1800, Math.floor(maxPromptChars * 0.45)),
      aggressive: true,
    });
    prompt = build(aggressiveContext.text);
    droppedMessages = aggressiveContext.droppedMessages;
    droppedIdeas = aggressiveContext.droppedIdeas;
  }

  if (prompt.length > maxPromptChars) {
    prompt = `${prompt.slice(0, maxPromptChars - 500)}\n\n[Context truncated to fit ${maxPromptChars} characters for ${model}.]`;
  }

  const retryContext = buildCompactDebateContext(state, {
    mode,
    maxMessages: 1,
    maxIdeas: 5,
    maxEvidence: 2,
    maxText: 1600,
    aggressive: true,
  });
  let retryPrompt = build(retryContext.text);

  if (retryPrompt.length > maxPromptChars) {
    retryPrompt = `${retryPrompt.slice(0, maxPromptChars - 500)}\n\n[Context aggressively truncated to fit ${maxPromptChars} characters for ${model}.]`;
  }

  const metrics = {
    beforeChars,
    afterChars: prompt.length,
    droppedMessages,
    droppedIdeas,
    maxPromptChars,
    contextCompressed: prompt.length !== beforeChars || droppedMessages > 0 || droppedIdeas > 0,
  };

  return { prompt, retryPrompt, metrics };
}

async function callModelJSON<T>({
  state,
  provider,
  agent,
  round,
  tracer,
  persistence,
  mode,
  buildPrompt,
  fallback,
  expectedSchema,
  temperature,
  maxTokens,
  okDetails,
}: {
  state: DebateState;
  provider: AIProvider;
  agent: CouncilAgent;
  round?: RoundRecord;
  tracer?: RunDebugTracer;
  persistence?: DebatePersistence;
  mode: CompactContextMode;
  buildPrompt: (context: string) => string;
  fallback: T;
  expectedSchema: string;
  temperature: number;
  maxTokens: number;
  okDetails?: (response: T) => Record<string, unknown>;
}) {
  const model = modelForRound(agent, provider, round);
  const prepared = preparePrompt({
    state,
    provider,
    model,
    mode,
    build: buildPrompt,
  });
  const baseDetails = {
    roundNumber: round?.roundNumber,
    roundType: round?.roundType,
    promptSize: estimatePromptSize(prepared.prompt),
    promptCharsBeforeCompression: prepared.metrics.beforeChars,
    promptCharsAfterCompression: prepared.metrics.afterChars,
    maxPromptChars: prepared.metrics.maxPromptChars,
    contextCompressed: prepared.metrics.contextCompressed,
    droppedMessages: prepared.metrics.droppedMessages,
    droppedIdeas: prepared.metrics.droppedIdeas,
    previousMessages: state.messages.length,
    ideasCount: mode === "skeptic_filter" ? state.ideas.length : state.shortlist.length || state.ideas.length,
    evidenceCount: state.marketEvidence.length,
  };

  if (prepared.metrics.contextCompressed) {
    tracer?.addEvent({
      step: "context_compressed",
      status: "ok",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      details: baseDetails,
    });
  }

  await persistence?.updateRunProgress?.({
    currentRound: round?.title ?? null,
    currentAgent: agent.name,
    currentStep: "Calling model",
    currentProvider: provider.name,
    currentModel: model,
    progressPercent: progressForRound(round?.roundNumber ?? 1, "model_call"),
  });

  tracer?.addEvent({
    step: "model_call",
    status: "start",
    round: round?.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: baseDetails,
  });

  let retryHappened = false;
  let modelUsed = model;
  let promptUsed = prepared.prompt;

  const call = async (callPrompt: string, callModel: string) =>
    provider.generateJSON<T>({
      system: buildAgentSystem(agent),
      prompt: callPrompt,
      fallback,
      model: callModel,
      expectedSchema,
      onParseError: (info) => {
        tracer?.addEvent({
          step: "json_parse",
          status: "fallback",
          round: round?.title,
          agent: agent.name,
          provider: provider.name,
          model: callModel,
          details: info,
        });
      },
      temperature,
      maxTokens,
    });

  try {
    const response = await call(promptUsed, modelUsed);
    tracer?.addEvent({
      step: "model_call",
      status: "ok",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model: modelUsed,
      details: {
        ...baseDetails,
        retryHappened,
        modelUsed,
        ...(okDetails?.(response) ?? {}),
      },
    });
    return { response, modelUsed, retryHappened, metrics: prepared.metrics };
  } catch (firstError) {
    if (!isTokenLimitError(firstError)) {
      throw firstError;
    }

    retryHappened = true;
    promptUsed = prepared.retryPrompt;
    tracer?.addEvent({
      step: "model_call_retry",
      status: "start",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model: modelUsed,
      details: {
        reason: "tokens_limit_reached",
        retry: "aggressive_context",
        promptSize: estimatePromptSize(promptUsed),
      },
    });

    try {
      const response = await call(promptUsed, modelUsed);
      tracer?.addEvent({
        step: "model_call",
        status: "ok",
        round: round?.title,
        agent: agent.name,
        provider: provider.name,
        model: modelUsed,
        details: {
          ...baseDetails,
          retryHappened,
          modelUsed,
          promptCharsAfterCompression: promptUsed.length,
          ...(okDetails?.(response) ?? {}),
        },
      });
      return { response, modelUsed, retryHappened, metrics: prepared.metrics };
    } catch (secondError) {
      if (
        provider.name === "github-models" &&
        modelUsed !== "openai/gpt-4.1" &&
        isTokenLimitError(secondError)
      ) {
        modelUsed = "openai/gpt-4.1";
        tracer?.addEvent({
          step: "model_call_retry",
          status: "start",
          round: round?.title,
          agent: agent.name,
          provider: provider.name,
          model: modelUsed,
          details: {
            reason: "tokens_limit_reached",
            retry: "fallback_model",
            promptSize: estimatePromptSize(promptUsed),
          },
        });

        const response = await call(promptUsed, modelUsed);
        tracer?.addEvent({
          step: "model_call",
          status: "ok",
          round: round?.title,
          agent: agent.name,
          provider: provider.name,
          model: modelUsed,
          details: {
            ...baseDetails,
            retryHappened,
            modelUsed,
            promptCharsAfterCompression: promptUsed.length,
            ...(okDetails?.(response) ?? {}),
          },
        });
        return { response, modelUsed, retryHappened, metrics: prepared.metrics };
      }

      throw secondError;
    }
  }
}

function progressForRound(roundNumber: number, step: "model_call" | "message_saved") {
  const base = Math.max(0, roundNumber - 1) * 13;
  return Math.min(99, base + (step === "message_saved" ? 12 : 6));
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
  model = agent.modelName,
  provider = agent.modelProvider,
) {
  await persistence?.addMessage({
    roundId: round.id,
    agent,
    content,
    provider,
    model,
  });
  await persistence?.updateRunProgress?.({
    currentRound: round.title,
    currentAgent: agent.name,
    currentStep: "Saved agent message",
    currentProvider: provider,
    currentModel: model,
    progressPercent: progressForRound(round.roundNumber, "message_saved"),
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
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
) {
  const fallback = { ideas: expandMockIdeas() };
  const model = modelForRound(agent, provider, round);

  try {
    const { response } = await callModelJSON<IdeasResponse>({
      state,
      provider,
      agent,
      round,
      tracer,
      persistence,
      mode: "idea_generation",
      buildPrompt: (context) => `
You are opening the council. Generate exactly 12 full-source-code product ideas Ahmad can build and sell on LinkedIn.
Use the provided market evidence when it exists. If it does not exist, label demand assumptions as unverified.

Source Code Market Agent requirements:
- Suggest hidden, unsolved workflow problems (not broad app categories).
- The pain must be real, time-wasting, and currently handled via manual workarounds.
- Explicitly avoid obvious categories: proposal generator, chatbot, content generator, meeting summarizer, invoice generator, resume builder, social media calendar, email assistant, website audit tool, generic AI dashboard starter kits.
- Each idea must include: the specific workflow, what people do manually today, and why existing tools are not enough.
- Explain why buyers would buy the source code (ownership, customization, faster delivery) instead of just using a SaaS.
- Keep each idea compact. No long feature lists in Round 1.

Compact council context:
${context}

Return JSON only:
{
  "ideas": [
    {
      "title": "string",
      "target_buyer": "string",
      "one_sentence": "string",
      "why_buy_source_code": "string",
      "demo_hook": "string",
      "build_complexity": "low | medium | high"
    }
  ]
}
`,
      fallback,
      expectedSchema: "IdeasResponse",
      temperature: 0.55,
      maxTokens: 2800,
      okDetails: (response) => ({
        ideasExtracted: Array.isArray(response.ideas) ? response.ideas.length : 0,
      }),
    });

    return normalizeIdeas(response.ideas).slice(0, 12);
  } catch (error) {
    attachFailureMetadata(error, {
      failedStep: "model_call",
      failedRound: round?.title,
      failedAgent: agent.name,
      failedProvider: provider.name,
      failedModel: model,
    });
    tracer?.addEvent({
      step: "model_call",
      status: "failed",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      error,
    });
    throw error;
  }
}

async function chooseTopIdeas(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
) {
  const fallback = buildTopIdeasFallback(state.ideas);
  const model = modelForRound(agent, provider, round);

  try {
    const { response } = await callModelJSON<TopIdeasResponse>({
      state,
      provider,
      agent,
      round,
      tracer,
      persistence,
      mode: "skeptic_filter",
      buildPrompt: (context) => `
Filter the generated ideas. Reject generic ideas and fantasy thinking.
Use market evidence as a constraint, not decoration.

Skeptic Agent requirements:
- Reject weak or generic ideas clearly.
- Reject ideas when the actual tool already exists as a common SaaS or a common template/source-code kit.
- Call out fantasy thinking, fake demand, weak demos, and generic AI wrappers.
- Penalize ideas with no supporting evidence or only weak assumptions.
- Return a shortlist of max 5 ideas.
- Return rejected ideas max 6, with short reasons.

Compact council context:
${context}

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
      expectedSchema: "TopIdeasResponse",
      temperature: 0.25,
      maxTokens: 2600,
      okDetails: (response) => ({
        topIdeas: Array.isArray(response.topIdeas) ? response.topIdeas.length : 0,
        rejectedIdeas: Array.isArray(response.rejectedIdeas) ? response.rejectedIdeas.length : 0,
      }),
    });

    return normalizeTopIdeasResponse(response, state.ideas);
  } catch (error) {
    attachFailureMetadata(error, {
      failedStep: "model_call",
      failedRound: round?.title,
      failedAgent: agent.name,
      failedProvider: provider.name,
      failedModel: model,
    });
    tracer?.addEvent({
      step: "model_call",
      status: "failed",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      error,
    });
    throw error;
  }
}

async function confirmShortlist(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
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

  const model = modelForRound(agent, provider, round);

  let response: ShortlistResponse;
  try {
    ({ response } = await callModelJSON<ShortlistResponse>({
      state,
      provider,
      agent,
      round,
      tracer,
      persistence,
      mode: "shortlist",
      buildPrompt: (context) => `
Confirm the final shortlist and refine it before the council debate.

Builder shortlist requirements:
- Use only the shortlisted ideas in the context.
- Reference what the Skeptic Agent rejected in one compact sentence.
- Reference market evidence if it exists, or state that assumptions remain unverified.
- Add one required fix for each shortlisted idea before scoring.
- Keep max 5 ideas and do not introduce new products.

Compact council context:
${context}

Return JSON only:
{
  "message": "string",
  "topIdeas": [
    {"title": "string", "reason": "string", "requiredFix": "string"}
  ]
}
`,
      fallback,
      expectedSchema: "ShortlistResponse",
      temperature: 0.25,
      maxTokens: 2200,
      okDetails: (response) => ({
        topIdeas: Array.isArray(response.topIdeas) ? response.topIdeas.length : 0,
      }),
    }));
  } catch (error) {
    attachFailureMetadata(error, {
      failedStep: "model_call",
      failedRound: round?.title,
      failedAgent: agent.name,
      failedProvider: provider.name,
      failedModel: model,
    });
    tracer?.addEvent({
      step: "model_call",
      status: "failed",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      error,
    });
    throw error;
  }

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
  tracer?: RunDebugTracer,
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
    const model = modelForRound(agent, provider, round);

    let response: DebateResponse;
    try {
      ({ response } = await callModelJSON<DebateResponse>({
        state,
        provider,
        agent,
        round,
        tracer,
        persistence,
        mode: "agent_debate",
        buildPrompt: (context) => `
Respond inside the council-room debate. Challenge or refine the current shortlist.
Use market evidence when available. If there is no evidence for an idea, say that directly.

Agent-specific requirements:
${agentSpecificRequirements(agent)}

Compact council context:
${context}

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
        expectedSchema: "DebateResponse",
        temperature: 0.45,
        maxTokens: agent.key === "skeptic" ? 2600 : 1700,
        okDetails: (response) => ({
          messageLength: typeof response.message === "string" ? response.message.length : 0,
          criticisms: Array.isArray(response.criticisms) ? response.criticisms.length : 0,
          refinements: Array.isArray(response.refinements) ? response.refinements.length : 0,
        }),
      }));
    } catch (error) {
      attachFailureMetadata(error, {
        failedStep: "model_call",
        failedRound: round.title,
        failedAgent: agent.name,
        failedProvider: provider.name,
        failedModel: model,
      });
      tracer?.addEvent({
        step: "model_call",
        status: "failed",
        round: round.title,
        agent: agent.name,
        provider: provider.name,
        model,
        error,
      });
      throw error;
    }

    const normalized = normalizeDebateResponse(response, agent, state.shortlist);
    applyDebateResponse(state, agent, round, normalized);
    await recordMessage(
      state,
      persistence,
      round,
      agent,
      renderDebateResponse(agent, normalized),
      model,
      provider.name,
    );
  }
}

async function scoreShortlist(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
) {
  const localScores = scoreIdeasLocally(state.shortlist, state.marketEvidence);
  const localExplanations = explainScoresLocally(
    state.shortlist,
    state.marketEvidence,
  );
  const model = modelForRound(agent, provider, round);

  let response: ScoresResponse;
  try {
    ({ response } = await callModelJSON<ScoresResponse>({
      state,
      provider,
      agent,
      round,
      tracer,
      persistence,
      mode: "scoring",
      buildPrompt: (context) => `
Score each shortlisted product idea from 0-10 using the exact Day-One Sale Probability rubric keys below.
Use compact criticisms, refinements, rejected ideas, market evidence, and the final shortlist.
Add a short explanation for every individual score.
Reward evidence-backed fast buyer signal. Penalize ideas where urgency, purchase behavior, comment/DM likelihood, or price believability is unverified.

Hard rules:
- If actual_tool_gap < 7, the product cannot win.
- If hidden_workflow_specificity < 7, the product cannot win.
- Penalize obvious common categories (proposal generator, chatbot, content generator, meeting summarizer, invoice generator, resume builder, social media calendar, email assistant, website audit tool) unless the workflow is clearly weirdly specific and not common.

Rubric keys:
- buyer_urgency
- existing_purchase_behavior
- linkedin_demo_strength
- comment_dm_likelihood
- actual_tool_gap
- source_code_gap
- manual_workaround_pain
- hidden_workflow_specificity
- price_believability
- build_speed

Compact council context:
${context}

Return JSON only:
{
  "scores": [
    {
      "title": "string",
      "buyer_urgency": 0,
      "existing_purchase_behavior": 0,
      "linkedin_demo_strength": 0,
      "comment_dm_likelihood": 0,
      "actual_tool_gap": 0,
      "source_code_gap": 0,
      "manual_workaround_pain": 0,
      "hidden_workflow_specificity": 0,
      "price_believability": 0,
      "build_speed": 0,
      "explanations": {
        "buyer_urgency": "string",
        "existing_purchase_behavior": "string",
        "linkedin_demo_strength": "string",
        "comment_dm_likelihood": "string",
        "actual_tool_gap": "string",
        "source_code_gap": "string",
        "manual_workaround_pain": "string",
        "hidden_workflow_specificity": "string",
        "price_believability": "string",
        "build_speed": "string"
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
            "Local deterministic Day-One Sale Probability based on urgency, purchase behavior, LinkedIn demo strength, DMs, price believability, and build speed.",
        })),
      },
      expectedSchema: "ScoresResponse",
      temperature: 0.2,
      maxTokens: 3600,
      okDetails: (response) => ({
        scores: Array.isArray(response.scores) ? response.scores.length : 0,
      }),
    }));
  } catch (error) {
    attachFailureMetadata(error, {
      failedStep: "model_call",
      failedRound: round?.title,
      failedAgent: agent.name,
      failedProvider: provider.name,
      failedModel: model,
    });
    tracer?.addEvent({
      step: "model_call",
      status: "failed",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      error,
    });
    throw error;
  }

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
      "Weighted against debate criticisms, fast buyer signal, willingness to pay, and build realism.",
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
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
): Promise<JudgeDecision> {
  const sorted = sortByScore(scoredIdeas);
  const thresholdDecision = inferFinalDecision(sorted);
  const topCandidate = selectDecisionCandidate(sorted, thresholdDecision);
  const fallback = {
    finalDecision: thresholdDecision,
    winnerTitle: thresholdDecision === "build_now" ? topCandidate.title : null,
    candidateTitle: thresholdDecision === "reject_all" ? null : topCandidate.title,
    reason: defaultJudgeReason(topCandidate, thresholdDecision),
    whyOthersLost: sorted.slice(1).map((idea) => ({
      title: idea.title,
      reason: "Lower Day-One Sale Probability after scoring and council criticism.",
    })),
  };
  const model = modelForRound(agent, provider, round);

  let response: JudgeResponse;
  try {
    ({ response } = await callModelJSON<JudgeResponse>({
      state,
      provider,
      agent,
      round,
      tracer,
      persistence,
      mode: "judge",
      buildPrompt: (context) => `
Make the final Day-One Sale Probability decision.

Judge Agent requirements:
- product_scores.total_score is Day-One Sale Probability (0-100).
- Only return finalDecision "build_now" if the selected product scores ${DAY_ONE_BUILD_THRESHOLD}+ and has buyer_urgency >= 7, linkedin_demo_strength >= 7, actual_tool_gap >= 7, hidden_workflow_specificity >= 7, and manual_workaround_pain >= 7.
- If at least one product clears actual_tool_gap >= 7, hidden_workflow_specificity >= 7, and manual_workaround_pain >= 7 but does not clear the build-now gate, finalDecision must be "validate_first" and the reason must include the exact phrase: "Validate first / Do not build yet."
- If all ideas fail actual_tool_gap, hidden_workflow_specificity, or manual_workaround_pain, finalDecision must be "reject_all" and the reason must include the exact phrase: "Reject all. Generate better hidden-gap ideas or add stronger market evidence."
- Do not invent a winner. Do not validate weak generic ideas.
- Do not select a winner when finalDecision is "validate_first" or "reject_all"; use candidateTitle only for the best validation candidate and null when finalDecision is "reject_all".
- Clearly support complete source-code sales, not SaaS subscriptions.
- Include why the other top ideas lost.
- Explain what market evidence supported the decision.
- If evidence is thin, say what Ahmad must verify manually before building.
- finalDecision values: "build_now", "validate_first", or "reject_all".

Compact council context:
${context}

Scored ideas:
${JSON.stringify(sorted.map((idea) => ({
  title: idea.title,
  totalScore: idea.score.total_score,
  score: idea.score,
  scoreReason: idea.scoreReason,
  explanations: idea.scoreExplanations,
})), null, 2)}

Return JSON only:
{
  "finalDecision": "build_now",
  "winnerTitle": "string or null",
  "candidateTitle": "string or null",
  "reason": "string",
  "whyOthersLost": [
    {"title": "string", "reason": "string"}
  ]
}
`,
      fallback,
      expectedSchema: "JudgeResponse",
      temperature: 0.15,
      maxTokens: 2200,
      okDetails: (response) => ({
        finalDecision: response.finalDecision,
        winnerTitle: response.winnerTitle,
        candidateTitle: response.candidateTitle,
      }),
    }));
  } catch (error) {
    attachFailureMetadata(error, {
      failedStep: "model_call",
      failedRound: round?.title,
      failedAgent: agent.name,
      failedProvider: provider.name,
      failedModel: model,
    });
    tracer?.addEvent({
      step: "model_call",
      status: "failed",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      error,
    });
    throw error;
  }

  const normalizedWhyOthersLost = ensureArray<unknown>(response.whyOthersLost)
    .map((item) => {
      if (item && typeof item === "object") {
        const candidate = item as { title?: unknown; reason?: unknown };
        return {
          title: ensureString(candidate.title).trim(),
          reason: ensureString(candidate.reason).trim(),
        };
      }

      if (typeof item === "string") {
        const [titlePart, ...rest] = item.split(":");
        const title = (titlePart ?? "").trim();
        const reason = rest.join(":").trim();
        return {
          title,
          reason,
        };
      }

      return {
        title: "",
        reason: ensureString(item).trim(),
      };
    })
    .filter((item) => Boolean(item.title));

  if (!Array.isArray(response.whyOthersLost)) {
    tracer?.addEvent({
      step: "judge_response_normalized",
      status: "ok",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      details: {
        whyOthersLostType: typeof response.whyOthersLost,
        whyOthersLostIsArray: Array.isArray(response.whyOthersLost),
        preSellPackType: typeof (response as { preSellPack?: unknown }).preSellPack,
      },
    });
  }

  const finalDecision = inferFinalDecision(sorted);
  const winner = selectDecisionCandidate(sorted, finalDecision);
  const reason = enforceDecisionReason(
    safeText(response.reason, fallback.reason),
    winner,
    finalDecision,
  );

  return {
    winner,
    finalDecision,
    dayOneSaleProbability: winner.score.total_score,
    reason,
    whyOthersLost: scoredIdeas
      .filter((idea) => idea.title !== winner.title)
      .map((idea) => {
        const match = normalizedWhyOthersLost.find(
          (lost) => lost.title === idea.title,
        );
        return {
          title: idea.title,
          reason: safeText(
            match?.reason,
            "It lost on Day-One Sale Probability: weaker urgency, demo signal, price believability, or pre-sell confidence.",
          ),
        };
      }),
  };
}

function inferFinalDecision(scores: ScoredProductIdea[]): FinalDecision {
  const eligibleIdeas = scores.filter((idea) => isGapEligible(idea.score));
  const buildableIdeas = eligibleIdeas.filter((idea) => isBuildReady(idea.score));

  if (buildableIdeas.length > 0) {
    return "build_now";
  }

  if (eligibleIdeas.length > 0) {
    return "validate_first";
  }

  return "reject_all";
}

function selectDecisionCandidate(
  scores: ScoredProductIdea[],
  decision: FinalDecision,
) {
  if (decision === "build_now") {
    return scores.find((idea) => isBuildReady(idea.score)) ?? scores[0];
  }

  if (decision === "validate_first") {
    return scores.find((idea) => isGapEligible(idea.score)) ?? scores[0];
  }

  return scores[0];
}

function isGapEligible(score: ProductScore) {
  return (
    score.actual_tool_gap >= 7 &&
    score.hidden_workflow_specificity >= 7 &&
    score.manual_workaround_pain >= 7
  );
}

function isBuildReady(score: ProductScore) {
  return (
    isGapEligible(score) &&
    score.total_score >= DAY_ONE_BUILD_THRESHOLD &&
    score.buyer_urgency >= 7 &&
    score.linkedin_demo_strength >= 7
  );
}

function defaultJudgeReason(candidate: ScoredProductIdea, decision: FinalDecision) {
  if (decision === "build_now") {
    return `${candidate.title} clears ${DAY_ONE_BUILD_THRESHOLD}/100 Day-One Sale Probability. Build now: this is the strongest fast-sale signal in the shortlist.`;
  }

  if (decision === "reject_all") {
    return `Reject all. Generate better hidden-gap ideas or add stronger market evidence. ${candidate.title} is only the highest-scored rejected idea; it failed the build gate because ${formatFailedHardGates(candidate)}.`;
  }

  return `Validate first / Do not build yet. ${candidate.title} is the best candidate, but ${candidate.score.total_score}/100 is below the ${DAY_ONE_BUILD_THRESHOLD}+ build-now threshold.`;
}

function enforceDecisionReason(
  reason: string,
  candidate: ScoredProductIdea,
  decision: FinalDecision,
) {
  if (decision === "validate_first" && !/Validate first \/ Do not build yet/i.test(reason)) {
    return `Validate first / Do not build yet. ${reason}`;
  }

  if (decision === "build_now" && !/Build now/i.test(reason)) {
    return `Build now. ${reason || defaultJudgeReason(candidate, decision)}`;
  }

  if (
    decision === "reject_all" &&
    !/Reject all\. Generate better hidden-gap ideas or add stronger market evidence\./i.test(reason)
  ) {
    return `Reject all. Generate better hidden-gap ideas or add stronger market evidence. ${reason || defaultJudgeReason(candidate, decision)}`;
  }

  return reason || defaultJudgeReason(candidate, decision);
}

function formatFailedHardGates(candidate: ScoredProductIdea) {
  const failed = [
    candidate.score.actual_tool_gap < 7
      ? `actual_tool_gap ${candidate.score.actual_tool_gap}/10`
      : null,
    candidate.score.hidden_workflow_specificity < 7
      ? `hidden_workflow_specificity ${candidate.score.hidden_workflow_specificity}/10`
      : null,
    candidate.score.manual_workaround_pain < 7
      ? `manual_workaround_pain ${candidate.score.manual_workaround_pain}/10`
      : null,
    candidate.score.buyer_urgency < 7
      ? `buyer_urgency ${candidate.score.buyer_urgency}/10`
      : null,
    candidate.score.linkedin_demo_strength < 7
      ? `linkedin_demo_strength ${candidate.score.linkedin_demo_strength}/10`
      : null,
  ].filter(Boolean);

  return failed.length ? failed.join(", ") : "it did not clear the full build-now threshold";
}

async function generateReport(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  winner: ScoredProductIdea,
  scoredIdeas: ScoredProductIdea[],
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
) {
  const reportContext = createReportContext(state, scoredIdeas);
  const fallback = createDeterministicReport(state.run, winner, reportContext);
  const fallbackFinalDecision = fallback.finalDecision ?? "validate_first";
  const model = modelForRound(agent, provider, round);

  let response: typeof fallback;
  try {
    ({ response } = await callModelJSON<typeof fallback>({
      state,
      provider,
      agent,
      round,
      tracer,
      persistence,
      mode: "final_report",
      buildPrompt: (context) => `
Create the final private council report for Ahmad.

Goal:
${state.run.goal}

Top candidate:
${JSON.stringify({
  title: winner.title,
  targetBuyer: winner.targetBuyer,
  pain: winner.pain,
  whyBuySourceCode: winner.whyBuySourceCode,
  mvpFeatures: winner.mvpFeatures,
  fullFeatures: winner.fullFeatures.slice(0, 5),
  risks: winner.risks.slice(0, 5),
  score: winner.score,
  scoreExplanations: winner.scoreExplanations,
}, null, 2)}

Compact council context:
${context}

Rules:
- Use finalDecision exactly as provided by the Judge: ${fallbackFinalDecision}.
- Use dayOneSaleProbability exactly as provided by the score: ${fallback.dayOneSaleProbability}.
- If finalDecision is "build_now", include the phrase: "Build now." and "Build this first."
- If finalDecision is "validate_first", include the exact phrase: "Validate first / Do not build yet."
- If finalDecision is "reject_all", include the exact phrase: "Reject all. Generate better hidden-gap ideas or add stronger market evidence." and make reportMarkdown start with "# Reject All".
- For reject_all, do not write launch assets or a build plan for the rejected idea. Explain why no idea passed, which hard gates failed, what hidden workflow Ahmad should search for next, what market evidence he should collect, and a better prompt for the next council run.
- Do not describe a product as the winner unless finalDecision is "build_now".
- Optimize for a complete source-code package sold from LinkedIn, not a SaaS subscription.
- Include why the other top ideas lost.
- Include the Pre-Sell Pack: LinkedIn validation post, teaser post, DM reply, follow-up DM, payment link message, screenshot checklist, 30-second demo script, and go/no-go threshold.
- Use concrete architecture, schema, routes, UI pages, pricing, launch/validation post, DM script, demo video script, and packaging checklist.
- Return JSON with keys: finalDecision, dayOneSaleProbability, reportMarkdown, linkedinPost, dmScript, demoVideoScript, buildPlan, packagingChecklist, preSellPack, codexBuildBlueprint, codexPrompt.
- The reportMarkdown must include # Market Evidence Used and # Codex Build Blueprint sections.
- The Codex Prompt must start exactly with: "You are my senior full-stack engineer. Build this full-source-code product..."
`,
      fallback,
      expectedSchema: "FinalReport",
      temperature: 0.25,
      maxTokens: 6500,
      okDetails: (response) => ({
        reportMarkdownLength:
          typeof response.reportMarkdown === "string" ? response.reportMarkdown.length : 0,
      }),
    }));
  } catch (error) {
    attachFailureMetadata(error, {
      failedStep: "model_call",
      failedRound: round?.title,
      failedAgent: agent.name,
      failedProvider: provider.name,
      failedModel: model,
    });
    tracer?.addEvent({
      step: "model_call",
      status: "failed",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      error,
    });
    throw error;
  }

  response = {
    ...response,
    reportMarkdown: ensureString(response.reportMarkdown),
    linkedinPost: ensureString(response.linkedinPost),
    dmScript: ensureString(response.dmScript),
    demoVideoScript: ensureString(response.demoVideoScript),
    buildPlan: normalizeBuildPlan((response as { buildPlan?: unknown }).buildPlan),
    packagingChecklist: ensureArray<string>(response.packagingChecklist),
    codexBuildBlueprint: ensureString(response.codexBuildBlueprint),
    codexPrompt: ensureString(response.codexPrompt),
    preSellPack: normalizePreSellPack((response as { preSellPack?: unknown }).preSellPack),
  };

  const reportMarkdown = response.reportMarkdown ?? "";
  const hasDecisionPhrase = hasRequiredDecisionPhrase(
    reportMarkdown,
    fallbackFinalDecision,
  );

  if (
    !hasDecisionPhrase ||
    !/#\s*Market Evidence Used/i.test(reportMarkdown) ||
    !/#\s*Codex Build Blueprint/i.test(reportMarkdown)
  ) {
    return fallback;
  }

  return {
    ...fallback,
    ...response,
    finalDecision: fallbackFinalDecision,
    dayOneSaleProbability: fallback.dayOneSaleProbability,
    winnerProductId: winner.id,
    packagingChecklist: response.packagingChecklist?.length
      ? response.packagingChecklist
      : fallback.packagingChecklist,
    buildPlan: response.buildPlan?.length ? response.buildPlan : fallback.buildPlan,
    preSellPack: response.preSellPack ?? fallback.preSellPack,
  };
}

function hasRequiredDecisionPhrase(reportMarkdown: string, decision: FinalDecision) {
  if (decision === "build_now") {
    return /build this first/i.test(reportMarkdown);
  }

  if (decision === "reject_all") {
    return (
      /Reject all\. Generate better hidden-gap ideas or add stronger market evidence\./i.test(
        reportMarkdown,
      ) && /#\s*Reject All/i.test(reportMarkdown)
    );
  }

  return /Validate first \/ Do not build yet/i.test(reportMarkdown);
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
- Treat product_scores.total_score as Day-One Sale Probability.
- Only choose a winner when the score is ${DAY_ONE_BUILD_THRESHOLD}+.
- If no product scores ${DAY_ONE_BUILD_THRESHOLD}+, clearly say: "Validate first / Do not build yet."
- Include why the other top ideas lost.
- Explain what evidence supported the final decision and what Ahmad still needs to verify.
- Do not hedge around the build threshold.`;
  }
}

function summarizeIdeasForPrompt(ideas: ProductIdeaDraft[], limit: number) {
  return ideas.slice(0, limit).map((idea) => ({
    title: idea.title,
    buyer: idea.targetBuyer,
    oneLine: idea.description,
    whyBuySourceCode: truncateText(idea.whyBuySourceCode, 180),
    demoHook: idea.mvpFeatures[0] ?? idea.pain,
    buildComplexity: inferIdeaBuildComplexity(idea),
    status: idea.status,
  }));
}

function summarizeMessagesForPrompt(messages: CouncilMessage[], limit: number) {
  return messages.slice(-limit).map((message) => ({
    round: message.roundTitle,
    agent: message.agentName,
    role: message.agentRole,
    summary: truncateText(message.content, 320),
  }));
}

function summarizeEvidenceForPrompt(evidence: MarketEvidenceDraft[], limit: number) {
  return [...evidence]
    .sort((a, b) => b.strengthScore - a.strengthScore)
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      source: item.sourceName,
      signalType: item.signalType,
      strengthScore: item.strengthScore,
      content: truncateText(item.content, 260),
    }));
}

function buildCompactDebateContext(
  state: DebateState,
  options: {
    mode: CompactContextMode;
    maxMessages?: number;
    maxIdeas?: number;
    maxEvidence?: number;
    maxText?: number;
    aggressive?: boolean;
  },
) {
  const maxEvidence =
    options.maxEvidence ?? (options.mode === "idea_generation" ? 5 : 4);
  const maxMessages =
    options.maxMessages ??
    (options.mode === "idea_generation" || options.mode === "skeptic_filter"
      ? 0
      : options.mode === "shortlist"
        ? 1
        : options.aggressive
          ? 2
          : 5);
  const maxIdeas =
    options.maxIdeas ??
    (options.mode === "skeptic_filter"
      ? 12
      : options.mode === "shortlist"
        ? 5
        : 5);
  const maxText = options.maxText ?? (options.aggressive ? 2200 : 4200);
  const goalSummary = truncateText(state.run.goal, options.aggressive ? 500 : 900);
  const constraints = {
    targetBuyer: state.run.targetBuyer,
    productCategory: state.run.productCategory,
    buildTimeLimit: state.run.buildTimeLimit,
    preferredStack: state.run.preferredStack,
    minimumPrice: state.run.minimumPrice,
    linkedinAudience: state.run.linkedinAudience,
    notes: truncateText(state.run.notes ?? "", 420),
  };
  const sourceIdeas =
    options.mode === "skeptic_filter" ? state.ideas : state.shortlist.length ? state.shortlist : state.ideas;
  const compact = {
    goalSummary,
    constraints,
    evidenceStatus: summarizeMarketEvidence(state.marketEvidence),
    evidenceSummary: summarizeEvidenceForPrompt(state.marketEvidence, maxEvidence),
    generatedIdeas:
      options.mode === "skeptic_filter"
        ? summarizeIdeasForPrompt(state.ideas, maxIdeas)
        : undefined,
    shortlistedIdeas:
      options.mode === "idea_generation" || options.mode === "skeptic_filter"
        ? undefined
        : summarizeIdeasForPrompt(sourceIdeas, maxIdeas),
    rejectedIdeas:
      options.mode === "idea_generation"
        ? undefined
        : state.rejectedIdeas.slice(0, options.aggressive ? 3 : 6).map((idea) => ({
            title: idea.title,
            reason: truncateText(idea.reason, 180),
          })),
    criticisms:
      options.mode === "idea_generation" || options.mode === "skeptic_filter"
        ? undefined
        : state.criticisms.slice(options.aggressive ? -6 : -12).map((item) => ({
            agent: item.agentName,
            title: item.title,
            criticism: truncateText(item.criticism, 220),
            riskLevel: item.riskLevel,
          })),
    refinements:
      options.mode === "idea_generation" || options.mode === "skeptic_filter"
        ? undefined
        : state.refinements.slice(options.aggressive ? -6 : -12).map((item) => ({
            agent: item.agentName,
            title: item.title,
            refinement: truncateText(item.refinement, 220),
          })),
    recentMessages: summarizeMessagesForPrompt(state.messages, maxMessages),
    scoreHistory:
      options.mode === "judge" || options.mode === "final_report"
        ? state.scoreHistory.map((score) => ({
            title: score.title,
            totalScore: score.totalScore,
            reason: truncateText(score.reason, 180),
          }))
        : undefined,
  };
  let text = JSON.stringify(compact, null, 2);

  if (text.length > maxText) {
    text = `${text.slice(0, maxText)}\n[Compact context truncated.]`;
  }

  const includedIdeas =
    (compact.generatedIdeas?.length ?? 0) + (compact.shortlistedIdeas?.length ?? 0);
  const consideredIdeas =
    options.mode === "skeptic_filter"
      ? state.ideas.length
      : state.shortlist.length || state.ideas.length;

  return {
    text,
    droppedMessages: Math.max(0, state.messages.length - maxMessages),
    droppedIdeas: Math.max(0, consideredIdeas - includedIdeas),
  };
}

function createReportContext(
  state: DebateState,
  scoredIdeas: ScoredProductIdea[],
): ReportContext {
  return {
    previousMessages: summarizeMessagesForPrompt(state.messages, 6).map((message, index) => ({
      roundNumber: index + 1,
      roundTitle: message.round,
      agentName: message.agent,
      agentRole: message.role,
      content: message.summary,
    })),
    shortlistedIdeas: state.shortlist.map((idea) => ({
      ...idea,
      description: truncateText(idea.description, 220),
      pain: truncateText(idea.pain, 180),
      whyBuySourceCode: truncateText(idea.whyBuySourceCode, 220),
      mvpFeatures: idea.mvpFeatures.slice(0, 4),
      fullFeatures: idea.fullFeatures.slice(0, 5),
      risks: idea.risks.slice(0, 4),
    })),
    rejectedIdeas: state.rejectedIdeas.slice(0, 6).map((idea) => ({
      title: idea.title,
      reason: truncateText(idea.reason, 180),
      risks: idea.risks.slice(0, 3).map((risk) => truncateText(risk, 140)),
    })),
    criticisms: state.criticisms.slice(-12).map((criticism) => ({
      ...criticism,
      criticism: truncateText(criticism.criticism, 180),
    })),
    refinements: state.refinements.slice(-12).map((refinement) => ({
      ...refinement,
      refinement: truncateText(refinement.refinement, 180),
    })),
    scoredIdeas,
    scoreHistory: state.scoreHistory,
    marketEvidence: state.marketEvidence.slice(0, 5).map((item) => ({
      ...item,
      content: truncateText(item.content, 260),
    })),
    whyOthersLost: state.whyOthersLost,
    finalDecision: state.finalDecision,
    finalDecisionReason: state.finalDecisionReason,
  };
}

function buildTopIdeasFallback(ideas: ProductIdeaDraft[]): TopIdeasResponse {
  const topIdeas = ideas.slice(0, 5).map((idea) => ({
    title: idea.title,
    reason: "Strong balance of source-code resale value, build speed, and demo clarity.",
    requiredFix:
      "Narrow the MVP to one buyer workflow and make the code package visible in the launch demo.",
  }));
  const rejectedIdeas = ideas.slice(5, 11).map((idea) => ({
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
    .slice(0, 6)
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
    "Scored each idea out of 100 using the Day-One Sale Probability rubric, with rationale for every category.",
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
  decision: {
    finalDecision: FinalDecision;
    dayOneSaleProbability: number;
    reason: string;
    whyOthersLost: Array<{ title: string; reason: string }>;
  },
) {
  const headline =
    decision.finalDecision === "build_now"
      ? "Build now. Build this first."
      : decision.finalDecision === "reject_all"
        ? "Reject all. Generate better hidden-gap ideas or add stronger market evidence."
        : "Validate first / Do not build yet.";

  return [
    headline,
    "",
    `${decision.finalDecision === "build_now" ? "Winner" : decision.finalDecision === "reject_all" ? "Highest-scored rejected idea" : "Top candidate"}: ${winner.title}`,
    `Day-One Sale Probability: ${decision.dayOneSaleProbability}/100`,
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

  return source.map((idea, index) => {
    const raw = idea as ProductIdeaDraft & {
      target_buyer?: string;
      one_sentence?: string;
      why_buy_source_code?: string;
      demo_hook?: string;
      build_complexity?: string;
    };

    return {
    id: idea.id,
    title: safeText(idea.title, fallback[index]?.title ?? `Product Idea ${index + 1}`),
    description: safeText(
      idea.description ?? raw.one_sentence,
      fallback[index]?.description ?? "A practical full-source-code product.",
    ),
    targetBuyer: safeText(idea.targetBuyer ?? raw.target_buyer, "Agencies and technical founders"),
    pain: safeText(idea.pain, raw.one_sentence ?? "The buyer wants to save implementation time."),
    whyBuySourceCode: safeText(
      idea.whyBuySourceCode ?? raw.why_buy_source_code,
      "The source code can be customized, rebranded, and resold as a service foundation.",
    ),
    mvpFeatures: safeList(idea.mvpFeatures).length
      ? safeList(idea.mvpFeatures)
      : [safeText(raw.demo_hook, "Demo the core buyer workflow end to end.")],
    fullFeatures: safeList(idea.fullFeatures),
    pricingIdea: safeText(idea.pricingIdea, "$149-$499 source-code license"),
    risks: safeList(idea.risks).length
      ? safeList(idea.risks)
      : [`Build complexity: ${safeText(raw.build_complexity, "medium")}`],
    status: "generated" as const,
  };
  });
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

function ensureArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value == null) {
    return [];
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .map((line) => line.replace(/^[-*]\s*/, ""))
      .filter(Boolean) as T[];
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>) as T[];
  }
  return [value as T];
}

function ensureString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(ensureString).join("\n");
  }
  return JSON.stringify(value);
}

function normalizePreSellPack(value: unknown) {
  const empty = {
    validationPost: "",
    teaserPost: "",
    dmReply: "",
    followUpDm: "",
    paymentLinkMessage: "",
    screenshotChecklist: [] as string[],
    demoScript30s: "",
    goNoGoRule: "",
  };

  if (!value || typeof value === "string") {
    return empty;
  }

  if (typeof value !== "object") {
    return empty;
  }

  const pack = value as Record<string, unknown>;
  return {
    validationPost: ensureString(pack.validationPost),
    teaserPost: ensureString(pack.teaserPost),
    dmReply: ensureString(pack.dmReply),
    followUpDm: ensureString(pack.followUpDm),
    paymentLinkMessage: ensureString(pack.paymentLinkMessage),
    screenshotChecklist: ensureArray<string>(pack.screenshotChecklist),
    demoScript30s: ensureString(pack.demoScript30s),
    goNoGoRule: ensureString(pack.goNoGoRule),
  };
}

function normalizeBuildPlan(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as { day?: unknown; focus?: unknown; deliverable?: unknown };
      return {
        day: ensureString(candidate.day).trim(),
        focus: ensureString(candidate.focus).trim(),
        deliverable: ensureString(candidate.deliverable).trim(),
      };
    })
    .filter(
      (item): item is { day: string; focus: string; deliverable: string } =>
        Boolean(item && item.day && item.focus && item.deliverable),
    );
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const text = (value ?? "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 18)).trim()}... [truncated]`;
}

function inferIdeaBuildComplexity(idea: ProductIdeaDraft) {
  const text = `${idea.title} ${idea.description} ${idea.mvpFeatures.join(" ")}`.toLowerCase();

  if (/marketplace|integration|mobile|multi-tenant|enterprise|analytics/.test(text)) {
    return "medium-high";
  }

  if (/dashboard|portal|workflow|generator|analyzer/.test(text)) {
    return "medium";
  }

  return "low-medium";
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

export function createInitialMarketEvidence(run: CouncilRunInput): MarketEvidenceDraft[] {
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
