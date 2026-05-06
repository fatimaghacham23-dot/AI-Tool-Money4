import {
  agentByKey,
  DEFAULT_AGENTS,
  normalizeAgentForProvider,
} from "@/ai/agents";
import { runInteractiveCouncilChat } from "@/ai/interactive-council";
import {
  applyMarketGapRules,
  canBuildNowWithMarketEvidence,
  generateMarketSearchQueries,
  runMarketExistenceCheck,
} from "@/ai/market-gap-scoring";
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
import {
  areSimilarIdeaFingerprints,
  chooseStrongerIdea,
  getIdeaFingerprint,
  hasBadProductTitleQuality,
  hasHiddenWorkflowSpecificity,
  isGenericProductTitle,
  normalizeInitialSearchQueries,
  normalizeProductTitle,
  REQUIRED_WORKFLOW_FIELDS,
  rewriteGenericIdeaToWorkflowGap,
  validateRequiredWorkflowFields,
  workflowFieldValue,
  type WorkflowFieldIssue,
} from "@/ai/idea-quality";
import type { RunDebugTracer } from "@/lib/debug/run-debug-tracer";
import { normalizeStrengthScore } from "@/lib/db/market-evidence";
import { createMarketSearchProvider } from "@/lib/market-search/provider";
import type { ToolExistenceCheck } from "@/lib/market-search/types";
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
  toolExistenceChecks: ToolExistenceCheck[];
  marketSearchStatus: "pending" | "completed" | "failed";
  scoreHistory: ScoreHistoryEntry[];
  whyOthersLost: Array<{ title: string; reason: string }>;
  finalDecision?: FinalDecision;
  finalDecisionReason?: string;
  workflowDiscoveryBrief?: string;
  round1RawIdeaCount?: number;
  round1ExtractionRemoved?: Round1RemovedIdea[];
};

type RoundRecord = DebateRoundDraft & { id: string };

type Round1RemovedIdea = {
  title: string;
  idea: ProductIdeaDraft;
  reason: string;
  missingFields: string[];
  invalidFields: string[];
  invalidReasons: string[];
  rawKeys: string[];
  suggestedRepairDirection: string;
  issues?: WorkflowFieldIssue[];
};

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

type KillSwitchResult = {
  originalIdeas: ProductIdeaDraft[];
  survivingIdeas: ProductIdeaDraft[];
  removedIdeas: Array<{ idea: ProductIdeaDraft; reason: string }>;
};

const ROUND_DEFINITIONS = [
  {
    roundNumber: 1,
    roundType: "idea_generation",
    title: "Round 1: Generate Hidden Workflow Candidates",
  },
  {
    roundNumber: 2,
    roundType: "generic_kill_switch",
    title: "Round 1.5: Generic Idea Kill Switch",
  },
  {
    roundNumber: 3,
    roundType: "skeptic_filter",
    title: "Round 2: Skeptic Rejects Generic/Crowded Ideas",
  },
  {
    roundNumber: 4,
    roundType: "shortlist",
    title: "Round 3: Keep Top 5 Ideas",
  },
  {
    roundNumber: 5,
    roundType: "market_search",
    title: "Round 4: Market Search / Existence Check",
  },
  {
    roundNumber: 6,
    roundType: "interactive_council_chat",
    title: "Round 5: Interactive Council Chat",
  },
  {
    roundNumber: 7,
    roundType: "scoring",
    title: "Round 6: Score Each Idea With Evidence",
  },
  {
    roundNumber: 8,
    roundType: "judge",
    title: "Round 7: Judge Makes Build Gate Decision",
  },
  {
    roundNumber: 9,
    roundType: "final_report",
    title: "Round 8: Final Report + Validation Pack",
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
    toolExistenceChecks: [],
    marketSearchStatus: "pending",
    scoreHistory: [],
    whyOthersLost: [],
    round1RawIdeaCount: undefined,
    round1ExtractionRemoved: [],
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
  const hasPersistedEvidence = Boolean(
    run.marketEvidence?.some((item) => item.id),
  );
  const initialEvidence = run.marketEvidence?.length
    ? run.marketEvidence
    : createInitialMarketEvidence(run);
  tracer?.startStep("insert_market_evidence", {
    count: initialEvidence.length,
  });
  state.marketEvidence = hasPersistedEvidence
    ? initialEvidence
    : ((await persistence?.saveMarketEvidence?.(initialEvidence)) ??
      initialEvidence);
  tracer?.completeStep("insert_market_evidence", {
    count: state.marketEvidence.length,
  });

  const round1 = await createRound(0, persistence);
  const generatedIdeas = await generateIdeas(
    state,
    provider,
    sourceAgent,
    tracer,
    round1,
    persistence,
  );
  const ideas: ProductIdeaDraft[] =
    (await persistence?.saveIdeas(generatedIdeas)) ?? generatedIdeas;
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

  const round15 = await createRound(1, persistence);
  const killSwitchResult = await runGenericIdeaKillSwitch(
    state,
    provider,
    sourceAgent,
    tracer,
    round15,
    persistence,
  );

  if (killSwitchResult.survivingIdeas.length === 0) {
    return finishRejectAllAfterKillSwitch({
      state,
      provider,
      enabledAgents,
      judgeAgent,
      killSwitchResult,
      persistence,
      tracer,
    });
  }

  const round2 = await createRound(2, persistence);
  const topResponse = await chooseTopIdeas(
    state,
    provider,
    skepticAgent,
    tracer,
    round2,
    persistence,
  );
  state.rejectedIdeas = topResponse.rejectedIdeas;
  const rejectedTitles = new Set(
    topResponse.rejectedIdeas.map((idea) => idea.title),
  );
  const topTitles = new Set(topResponse.topIdeas.map((idea) => idea.title));

  await persistence?.updateIdeaStatuses(
    state.ideas.map((idea) => ({
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

  const round3 = await createRound(3, persistence);
  const shortlistedIdeas = state.ideas
    .filter((idea) => topTitles.has(idea.title))
    .slice(0, 5);
  state.shortlist = shortlistedIdeas.length
    ? shortlistedIdeas
    : state.ideas.slice(0, 5);

  await persistence?.updateIdeaStatuses(
    state.shortlist.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: "shortlisted",
    })),
  );

  const shortlistResponse = await confirmShortlist(
    state,
    provider,
    builderAgent,
    tracer,
    round3,
    persistence,
  );
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

  const round4 = await createRound(4, persistence);
  await runMarketSearchRound(state, round4, persistence, tracer);
  const gateResult = await applyPostMarketSearchGate(
    state,
    round4,
    persistence,
    tracer,
  );

  if (gateResult.decision === "reject_all") {
    return finishRejectAllAfterMarketGate({
      state,
      provider,
      enabledAgents,
      judgeAgent,
      scoredIdeas: gateResult.scoredIdeas,
      persistence,
      tracer,
    });
  }

  const round5 = await createRound(5, persistence);
  await runInteractiveDebateRound(
    state,
    provider,
    enabledAgents,
    round5,
    persistence,
    tracer,
  );

  const round6 = await createRound(6, persistence);
  let scoredIdeas = await scoreShortlist(
    state,
    provider,
    judgeAgent,
    tracer,
    round6,
    persistence,
  );

  await persistence?.saveScores(scoredIdeas);
  await recordMessage(
    state,
    persistence,
    round6,
    pricingAgent,
    renderScoreMessage(scoredIdeas),
    modelForRound(pricingAgent, provider, round6),
    provider.name,
  );

  const round7 = await createRound(7, persistence);
  const judgeDecision = await chooseWinner(
    state,
    provider,
    judgeAgent,
    scoredIdeas,
    tracer,
    round7,
    persistence,
  );

  state.finalDecision = judgeDecision.finalDecision;
  state.finalDecisionReason = judgeDecision.reason;
  state.whyOthersLost = judgeDecision.whyOthersLost;
  scoredIdeas = scoredIdeas.map((idea) => ({
    ...idea,
    lostReason: judgeDecision.whyOthersLost.find(
      (lost) => lost.title === idea.title,
    )?.reason,
  }));
  const winner =
    scoredIdeas.find((idea) => idea.title === judgeDecision.winner.title) ??
    judgeDecision.winner;
  const canBuildNow = judgeDecision.finalDecision === "build_now";

  await persistence?.updateIdeaStatuses(
    scoredIdeas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status:
        judgeDecision.finalDecision === "reject_all"
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
    round7,
    judgeAgent,
    renderJudgeMessage(winner, judgeDecision),
    modelForRound(judgeAgent, provider, round7),
    provider.name,
  );

  const round8 = await createRound(8, persistence);
  const report = await generateReport(
    state,
    provider,
    judgeAgent,
    winner,
    scoredIdeas,
    tracer,
    round8,
    persistence,
  );

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
    round8,
    judgeAgent,
    finalReportMessage,
    modelForRound(judgeAgent, provider, round8),
    provider.name,
  );

  await persistence?.updateRunProgress?.({
    currentRound: round8.title,
    currentAgent: judgeAgent.name,
    currentStep: "Council completed",
    currentProvider: provider.name,
    currentModel: modelForRound(judgeAgent, provider, round8),
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
    toolExistenceChecks: state.toolExistenceChecks,
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

function modelForRound(
  agent: CouncilAgent,
  provider: AIProvider,
  round?: RoundRecord,
) {
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
  const text =
    `${value?.code ?? ""} ${value?.message ?? ""} ${value?.bodyExcerpt ?? ""}`.toLowerCase();

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
    contextCompressed:
      prompt.length !== beforeChars || droppedMessages > 0 || droppedIdeas > 0,
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
    ideasCount:
      mode === "skeptic_filter"
        ? state.ideas.length
        : state.shortlist.length || state.ideas.length,
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
        return {
          response,
          modelUsed,
          retryHappened,
          metrics: prepared.metrics,
        };
      }

      throw secondError;
    }
  }
}

function buildWorkflowDiscoveryBrief(
  run: CouncilRunInput,
  evidence: MarketEvidenceDraft[],
) {
  const buyer = (run.targetBuyer ?? "").trim() || "Unknown buyer";
  const category =
    (run.productCategory ?? "").trim() || "No preferred category";
  const notes = (run.notes ?? "").trim();
  const evidenceNotes = (run.marketEvidenceNotes ?? "").trim();
  const evidenceSummary = summarizeMarketEvidence(evidence);

  const messyInputs = [
    "Slack messages",
    "email threads",
    "screenshots",
    "Loom videos",
    "Google Docs",
    "Notion pages",
    "spreadsheets",
    "meeting notes",
    "call transcripts",
    "client comments",
    "invoices",
    "proposals",
    "contracts",
    "approvals",
    "delivery checklists",
  ];
  const outputArtifacts = [
    "risk log",
    "exception report",
    "client-ready response",
    "approval proof",
    "change request record",
    "decision trail",
    "contradiction report",
    "handoff summary",
    "revenue leak warning",
    "implementation checklist",
  ];

  return [
    "# Workflow Discovery Brief",
    `- user_goal: ${run.goal}`,
    `- target_buyer: ${buyer}`,
    `- preferred_category: ${category}`,
    notes ? `- notes: ${notes}` : null,
    evidenceNotes ? `- market_evidence_notes: ${evidenceNotes}` : null,
    evidenceSummary?.strongestEvidence
      ? `- strongest_market_evidence: ${evidenceSummary.strongestEvidence.title} (${evidenceSummary.strongestEvidence.signalType}, ${evidenceSummary.strongestEvidence.strengthScore}/10)`
      : "- strongest_market_evidence: none provided",
    "",
    "Extract and fill these fields before naming products:",
    "- buyer_type (niche, role, context)",
    "- messy_inputs used today",
    "- manual_workarounds (exact steps)",
    "- painful_moments (where it breaks / risk happens)",
    "- repeated_handoffs (who hands off to whom)",
    "- hidden_cost_or_risk (money leak, rework, disputes, delays)",
    "- artifact_produced (the output they need to show someone)",
    "- validation_angle (how to validate fast on LinkedIn)",
    "",
    `Messy input examples: ${messyInputs.join(", ")}.`,
    `Output artifact examples: ${outputArtifacts.join(", ")}.`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function applyIdeaQualityRewrites(
  ideas: ProductIdeaDraft[],
  state: DebateState,
  tracer: RunDebugTracer | undefined,
  round: RoundRecord | undefined,
  agent: CouncilAgent,
  provider: AIProvider,
  model: string,
) {
  const buyerContext = (state.run.targetBuyer ?? "").trim();

  return ideas.map((idea) => {
    const buyer = idea.targetBuyer || buyerContext;
    const originalTitle = idea.title;
    const originalHadTitleRisk = hasBadProductTitleQuality(
      originalTitle,
      buyer,
    );
    let nextTitle = normalizeProductTitle(originalTitle, buyer);
    const generic =
      isGenericProductTitle(originalTitle) || isGenericProductTitle(nextTitle);
    let genericRiskReason = idea.genericRiskReason;

    if (generic) {
      const rewritten = rewriteGenericIdeaToWorkflowGap(
        {
          title: nextTitle,
          targetBuyer: idea.targetBuyer,
          manualWorkaroundToday: idea.manualWorkaroundToday,
          messyInput: idea.messyInput,
          outputArtifact: idea.outputArtifact,
          painfulMoment: idea.painfulMoment,
        },
        buyerContext,
      );
      nextTitle = normalizeProductTitle(rewritten.title, buyer);
      genericRiskReason = originalHadTitleRisk
        ? "title stuffed with broad buyer list"
        : "Generic title rewritten into workflow artifact + painful event form.";
    } else if (originalHadTitleRisk) {
      genericRiskReason = "title stuffed with broad buyer list";
    }

    if (nextTitle !== originalTitle) {
      tracer?.addEvent({
        step: "product_title_normalized",
        status: "ok",
        round: round?.title,
        agent: agent.name,
        provider: provider.name,
        model,
        details: {
          originalTitle: truncateText(originalTitle, 160),
          normalizedTitle: truncateText(nextTitle, 120),
          titleRisk: originalHadTitleRisk,
        },
      });
    }

    if (generic) {
      tracer?.addEvent({
        step: "generic_idea_rewritten",
        status: "ok",
        round: round?.title,
        agent: agent.name,
        provider: provider.name,
        model,
        details: {
          originalTitle: truncateText(originalTitle, 120),
          rewrittenTitle: truncateText(nextTitle, 120),
        },
      });
    }

    return {
      ...idea,
      title: nextTitle,
      targetBuyer: idea.targetBuyer || buyerContext,
      genericRiskReason,
    };
  });
}

function dedupeIdeaCandidates(
  ideas: ProductIdeaDraft[],
  tracer: RunDebugTracer | undefined,
  round: RoundRecord | undefined,
  agent: CouncilAgent,
  providerName: string,
  stage: string,
) {
  const kept: ProductIdeaDraft[] = [];
  const fingerprints: string[] = [];
  const removed: Array<{
    removed: ProductIdeaDraft;
    kept: ProductIdeaDraft;
    fingerprint: string;
  }> = [];

  for (const idea of ideas) {
    const fingerprint = getIdeaFingerprint(idea);
    const existingIndex = fingerprints.findIndex((existing) =>
      areSimilarIdeaFingerprints(existing, fingerprint),
    );

    if (existingIndex === -1) {
      kept.push(idea);
      fingerprints.push(fingerprint);
      continue;
    }

    const existing = kept[existingIndex];
    const stronger = chooseStrongerIdea(existing, idea);
    const weaker = stronger === existing ? idea : existing;
    kept[existingIndex] = stronger;
    fingerprints[existingIndex] = getIdeaFingerprint(stronger);
    removed.push({ removed: weaker, kept: stronger, fingerprint });

    tracer?.addEvent({
      step: "duplicate_idea_removed",
      status: "ok",
      round: round?.title,
      agent: agent.name,
      provider: providerName,
      details: {
        stage,
        removedTitle: truncateText(weaker.title, 140),
        keptTitle: truncateText(stronger.title, 140),
        fingerprint: truncateText(fingerprint, 220),
      },
    });
  }

  return { ideas: kept, removed };
}

async function runGenericIdeaKillSwitch(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
): Promise<KillSwitchResult> {
  const original = state.ideas;
  const round1Removed = state.round1ExtractionRemoved ?? [];
  const rejected: Array<{ title: string; reason: string }> = [];
  const removedIdeas: Array<{ idea: ProductIdeaDraft; reason: string }> = [];

  const reject = (idea: ProductIdeaDraft, reason: string, code: string) => {
    rejected.push({ title: idea.title, reason });
    removedIdeas.push({ idea, reason });
    tracer?.addEvent({
      step: "generic_idea_rejected",
      status: "ok",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model: modelForRound(agent, provider, round),
      details: { title: truncateText(idea.title, 140), reason: code },
    });
  };

  const survivors = original.filter((idea) => {
    if (isGenericProductTitle(idea.title)) {
      reject(idea, "Generic title", "generic_title");
      return false;
    }

    if (!hasHiddenWorkflowSpecificity(idea)) {
      reject(
        idea,
        "Missing manual workaround / messy input / output artifact / painful moment",
        "missing_structured_fields",
      );
      return false;
    }

    const demo = (idea.beforeAfterDemo ?? "").trim();
    if (
      demo.length < 18 ||
      /save time|automate|streamline|manage/i.test(demo)
    ) {
      reject(idea, "Vague before/after demo", "vague_demo");
      return false;
    }

    return true;
  });

  state.ideas = survivors;
  state.rejectedIdeas.push(
    ...removedIdeas.map((item) => ({
      title: item.idea.title,
      reason: item.reason,
      risks: uniqueStrings([item.reason, ...(item.idea.risks ?? [])]),
    })),
  );
  await persistence?.updateIdeaStatuses(
    rejected.map((item) => ({
      title: item.title,
      status: "rejected" as const,
    })),
  );

  if (round) {
    await recordMessage(
      state,
      persistence,
      round,
      agent,
      renderGenericKillSwitchMessage(original, survivors, rejected),
      modelForRound(agent, provider, round),
      provider.name,
    );
  }

  if (survivors.length < 5) {
    tracer?.addEvent({
      step: "kill_switch_reject_all",
      status: "ok",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model: modelForRound(agent, provider, round),
      details: {
        originalIdeas: original.map((idea) => idea.title),
        survivingIdeas: survivors.map((idea) => idea.title),
        removedIdeas: removedIdeas.map((item) => item.idea.title),
        round1ExtractionRemoved: round1Removed.map((item) => item.idea.title),
        reasons: removedIdeas.map((item) => ({
          title: item.idea.title,
          reason: item.reason,
        })),
      },
    });
    return {
      originalIdeas: original,
      survivingIdeas: [],
      removedIdeas: [
        ...removedIdeas,
        ...round1Removed.map((item) => ({
          idea: item.idea,
          reason: item.reason,
        })),
      ],
    };
  }

  if (survivors.length >= 5 || !round) {
    return {
      originalIdeas: original,
      survivingIdeas: state.ideas,
      removedIdeas,
    };
  }

  const model = modelForRound(agent, provider, round);
  const { response } = await callModelJSON<IdeasResponse>({
    state,
    provider,
    agent,
    round,
    tracer,
    persistence,
    mode: "idea_generation",
    buildPrompt: (context) => `
We removed too many generic ideas.

Generate replacement ideas ONLY for the failed reasons below. Do not repeat rejected titles.

Rejected reasons:
${rejected
  .slice(0, 12)
  .map((item) => `- ${item.title}: ${item.reason}`)
  .join("\n")}

Requirements for replacements:
- Weirdly specific hidden manual workflow.
- Product title max 8 words. Use workflow artifact + painful event + niche buyer. Never paste a comma-separated buyer list into the title.
- Must include exact buyer, manual workaround today, messy input, output artifact, painful moment.
- Must include a sharp 30-second before/after demo.
- Must include why broad SaaS is not enough.
- Provide initial Exa search queries as concrete workflow/artifact phrases only, not raw goal fragments or full buyer lists.

Workflow discovery brief:
${state.workflowDiscoveryBrief ?? buildWorkflowDiscoveryBrief(state.run, state.marketEvidence)}

Compact council context:
${context}

Return JSON only with up to ${Math.max(0, 5 - survivors.length)} ideas:
{
  "ideas": [
    {
      "title": "string",
      "exactBuyer": "string",
      "manualWorkaroundToday": "string",
      "messyInput": "string",
      "outputArtifact": "string",
      "painfulMoment": "string",
      "broadSaasNotEnoughReason": "string",
      "beforeAfterDemo": "string",
      "sourceCodeOwnershipAngle": "string",
      "initialSearchQueries": ["...", "...", "...", "..."],
      "buildComplexity": "low|medium|high"
    }
  ]
}
`,
    fallback: { ideas: [] },
    expectedSchema: "IdeasResponse",
    temperature: 0.45,
    maxTokens: 2000,
    okDetails: (response) => ({
      ideasExtracted: Array.isArray(response.ideas) ? response.ideas.length : 0,
    }),
  });

  tracer?.addEvent({
    step: "model_call",
    status: "ok",
    round: round?.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: {
      replacementCount: Array.isArray(response.ideas)
        ? response.ideas.length
        : 0,
    },
  });

  const replacements = applyIdeaQualityRewrites(
    normalizeIdeas(response.ideas),
    state,
    tracer,
    round,
    agent,
    provider,
    model,
  ).filter((idea) => hasHiddenWorkflowSpecificity(idea));

  state.ideas = dedupeIdeaCandidates(
    uniqueByTitle([...state.ideas, ...replacements]),
    tracer,
    round,
    agent,
    provider.name,
    "replacement_generation",
  ).ideas.slice(0, 12);

  return { originalIdeas: original, survivingIdeas: state.ideas, removedIdeas };
}

function renderGenericKillSwitchMessage(
  original: ProductIdeaDraft[],
  survivors: ProductIdeaDraft[],
  rejected: Array<{ title: string; reason: string }>,
) {
  return [
    "# Round 1.5: Generic Idea Kill Switch",
    "",
    `Original ideas: ${original.length}`,
    `Surviving ideas: ${survivors.length}`,
    `Removed ideas: ${rejected.length}`,
    "",
    "Removed (deterministic reasons):",
    ...rejected.slice(0, 12).map((item) => `- ${item.title}: ${item.reason}`),
    "",
    "Remaining:",
    ...survivors.map((idea) => `- ${idea.title}`),
  ].join("\n");
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function deterministicNicheDownIdea(
  idea: ProductIdeaDraft,
  buyerContext: string,
): ProductIdeaDraft {
  const seed = titleHash(idea.title);
  const buyer = chooseDifferent(
    deriveBuyerNiches(idea.targetBuyer || buyerContext),
    idea.targetBuyer,
    seed,
  );
  const messyInput = chooseDifferent(
    [
      "Figma comments",
      "Slack approval threads",
      "Loom feedback videos",
      "Google Doc scope notes",
      "screenshot markups",
      "email approval chains",
    ],
    idea.messyInput,
    seed + 1,
  );
  const outputArtifact = chooseDifferent(
    [
      "contradiction log",
      "approval reversal proof builder",
      "feedback drift report",
      "scope promise extractor",
      "revision dispute pack",
      "handoff assumption gap report",
    ],
    idea.outputArtifact,
    seed + 2,
  );
  const painfulMoment = chooseDifferent(
    [
      "client reverses approval after signoff",
      "feedback contradicts signed approval",
      "hidden scope promise resurfaces",
      "handoff assumption breaks delivery",
      "screenshot revision dispute escalates",
    ],
    idea.painfulMoment || idea.pain,
    seed + 3,
  );
  const narrowedTitle = normalizeProductTitle(
    `${singularInputLabel(messyInput)} ${outputArtifact} for ${buyer}`,
    buyer,
  );
  const changedFields = [
    isMeaningfullyDifferent(idea.targetBuyer, buyer) ? "buyer_niche" : "",
    isMeaningfullyDifferent(idea.messyInput, messyInput) ? "messy_input" : "",
    isMeaningfullyDifferent(idea.outputArtifact, outputArtifact)
      ? "output_artifact"
      : "",
    isMeaningfullyDifferent(idea.painfulMoment || idea.pain, painfulMoment)
      ? "painful_event"
      : "",
  ].filter(Boolean);

  const attempts = uniqueStrings([
    narrowedTitle,
    normalizeProductTitle(
      `${singularInputLabel(messyInput)} ${painfulMoment} for ${buyer}`,
      buyer,
    ),
    normalizeProductTitle(`${outputArtifact} for ${buyer}`, buyer),
  ]).slice(0, 3);

  return {
    ...idea,
    targetBuyer: buyer,
    messyInput,
    outputArtifact,
    painfulMoment,
    title: narrowedTitle,
    nicheDownAttempts: attempts,
    initialSearchQueries: generateMarketSearchQueries({
      ...idea,
      title: narrowedTitle,
      targetBuyer: buyer,
      messyInput,
      outputArtifact,
      painfulMoment,
    }).slice(0, 12),
    genericRiskReason: "Niche-down pass applied after market gate rejection.",
    risks: uniqueStrings([
      ...idea.risks,
      `Niche-down changed ${changedFields.length} fields: ${changedFields.join(", ")}.`,
    ]),
  };
}

function deriveBuyerNiches(buyer: string) {
  const lower = buyer.toLowerCase();
  const niches = [
    /web\s+design|design|agenc/.test(lower) ? "Web Design Agencies" : "",
    /dev|developer|technical|code|software/.test(lower) ? "Dev Shops" : "",
    /brand|studio/.test(lower) ? "Branding Studios" : "",
    /consult/.test(lower) ? "Consultants" : "",
    /freelance|solo/.test(lower) ? "Freelancers" : "",
    "Web Design Agencies",
    "Dev Shops",
    "Branding Studios",
    "Consultants",
    "Freelancers",
  ].filter(Boolean);

  return uniqueStrings(niches);
}

function chooseDifferent(
  options: string[],
  current: string | undefined,
  seed: number,
) {
  const normalizedCurrent = normalizeComparable(current ?? "");
  const available = options.filter(
    (option) => normalizeComparable(option) !== normalizedCurrent,
  );
  const pool = available.length ? available : options;
  return pool[Math.abs(seed) % pool.length] ?? options[0] ?? "Niche Buyers";
}

function singularInputLabel(input: string) {
  return input
    .replace(/\bcomments\b/i, "Comment")
    .replace(/\bthreads\b/i, "Thread")
    .replace(/\bvideos\b/i, "Video")
    .replace(/\bnotes\b/i, "Note")
    .replace(/\bmarkups\b/i, "Markup")
    .replace(/\bchains\b/i, "Chain")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfullyDifferent(left: string | undefined, right: string) {
  return normalizeComparable(left ?? "") !== normalizeComparable(right);
}

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleHash(value: string) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function progressForRound(
  roundNumber: number,
  step: "model_call" | "message_saved",
) {
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

function validateRound1IdeaExtraction(
  ideas: ProductIdeaDraft[],
  tracer: RunDebugTracer | undefined,
  round: RoundRecord | undefined,
  agent: CouncilAgent,
  provider: AIProvider,
  model: string,
) {
  const valid: ProductIdeaDraft[] = [];
  const removed: Round1RemovedIdea[] = [];
  const fieldCounts = new Map<string, number>();

  for (const idea of ideas) {
    const validation = validateRequiredWorkflowFields(idea);
    if (validation.valid) {
      valid.push(idea);
      continue;
    }

    const missingFields = validation.missingFields;
    const invalidFields = [
      ...new Set(validation.issues.map((issue) => issue.field)),
    ];
    const invalidReasons = validation.issues.map(
      (issue) => `${issue.field}: ${issue.reason}`,
    );
    for (const field of invalidFields) {
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    }
    const suggestedRepairDirection = createRound1RepairDirection(
      idea,
      missingFields,
    );
    removed.push({
      title: idea.title || "Untitled Round 1 draft",
      idea,
      reason: "Round 1 failed to produce valid hidden workflow object.",
      missingFields,
      invalidFields,
      invalidReasons,
      rawKeys: rawIdeaKeys(idea),
      suggestedRepairDirection,
      issues: validation.issues,
    });
  }

  if (removed.length > 0) {
    tracer?.addEvent({
      step: "required_workflow_fields_missing",
      status: "ok",
      round: round?.title,
      agent: agent.name,
      provider: provider.name,
      model,
      details: {
        rejectedCount: removed.length,
        validCount: valid.length,
        fieldCounts: Object.fromEntries(fieldCounts),
        fieldNames: [...fieldCounts.keys()],
        rejectedDrafts: removed.slice(0, 12).map((item) => ({
          title: truncateText(item.title, 140),
          missingFields: item.missingFields,
          invalidFields: item.invalidFields,
          invalidReasons: item.invalidReasons,
          rawKeys: item.rawKeys,
        })),
      },
    });
  }

  return { valid, removed };
}

function rawIdeaKeys(idea: ProductIdeaDraft) {
  const rawKeys = (idea as ProductIdeaDraft & { __rawKeys?: string[] })
    .__rawKeys;
  return Array.isArray(rawKeys) ? rawKeys : Object.keys(idea).sort();
}

function getIdeasArrayFromResponse(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    Array.isArray((response as { ideas?: unknown }).ideas)
  ) {
    return (response as { ideas: unknown[] }).ideas;
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
}

function logRound1RawOutputReceived(
  response: unknown,
  tracer: RunDebugTracer | undefined,
  round: RoundRecord | undefined,
  agent: CouncilAgent,
  provider: AIProvider,
  model: string,
) {
  const keys =
    response && typeof response === "object" && !Array.isArray(response)
      ? Object.keys(response).sort()
      : [];
  const ideas = getIdeasArrayFromResponse(response);
  const firstIdea =
    ideas[0] && typeof ideas[0] === "object"
      ? (ideas[0] as Record<string, unknown>)
      : undefined;
  const firstIdeaKeys = firstIdea ? Object.keys(firstIdea).sort() : [];
  const firstIdeaTitle =
    typeof firstIdea?.title === "string" ? firstIdea.title : "";
  const snakeCaseFields = [
    "exact_buyer",
    "manual_workaround_today",
    "messy_input",
    "output_artifact",
    "painful_moment",
    "broad_saas_not_enough_reason",
    "before_after_demo",
    "source_code_ownership_angle",
    "initial_search_queries",
    "build_complexity",
  ];
  const camelCaseFields = [
    "exactBuyer",
    "manualWorkaroundToday",
    "messyInput",
    "outputArtifact",
    "painfulMoment",
    "broadSaasNotEnoughReason",
    "beforeAfterDemo",
    "sourceCodeOwnershipAngle",
    "initialSearchQueries",
    "buildComplexity",
  ];

  tracer?.addEvent({
    step: "round1_raw_output_received",
    status: "ok",
    round: round?.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: {
      responseType: Array.isArray(response)
        ? "array"
        : response === null
          ? "null"
          : typeof response,
      keys,
      ideasArrayLength: ideas.length,
      firstIdeaKeys,
      firstIdeaTitle: truncateText(firstIdeaTitle, 140),
      hasSnakeCaseFields: snakeCaseFields.some((field) =>
        firstIdeaKeys.includes(field),
      ),
      hasCamelCaseFields: camelCaseFields.some((field) =>
        firstIdeaKeys.includes(field),
      ),
    },
  });
}

function createRound1RepairDirection(
  idea: ProductIdeaDraft,
  missingFields: string[],
) {
  const title = idea.title || "untitled idea";
  const fieldList = missingFields.join(", ");
  return `Repair ${title} by grounding ${fieldList} in a named buyer, their current Slack/email/docs/spreadsheet input, the manual steps they take today, the client event that hurts, and the exact proof/report/pack artifact generated.`;
}

function renderRound1RepairInput(removed: Round1RemovedIdea[]) {
  return removed.slice(0, 12).map((item) => ({
    title: item.idea.title,
    exactBuyer: workflowFieldValue(item.idea, "exactBuyer"),
    missingFields: item.missingFields,
    invalidValues: Object.fromEntries(
      REQUIRED_WORKFLOW_FIELDS.map((field) => [
        field,
        workflowFieldValue(item.idea, field),
      ]),
    ),
    suggestedRepairDirection: item.suggestedRepairDirection,
  }));
}

async function generateRound1ReplacementIdeas({
  state,
  provider,
  agent,
  round,
  tracer,
  persistence,
  model,
}: {
  state: DebateState;
  provider: AIProvider;
  agent: CouncilAgent;
  round?: RoundRecord;
  tracer?: RunDebugTracer;
  persistence?: DebatePersistence;
  model: string;
}) {
  if (!round) {
    return [];
  }

  tracer?.addEvent({
    step: "round1_replacement_attempted",
    status: "start",
    round: round.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: { requestedIdeas: 8 },
  });

  const { response } = await callModelJSON<IdeasResponse>({
    state,
    provider,
    agent,
    round,
    tracer,
    persistence,
    mode: "idea_generation",
    buildPrompt: (context) => `
Round 1 returned no parseable ideas.

Generate exactly 8 fully valid hidden workflow JSON objects from the buyer evidence. Do not repair previous output because there were no parseable drafts.

Hard requirements:
- No markdown. No prose. JSON only.
- Return exactly 8 objects in the ideas array.
- Every object must include title, exactBuyer, manualWorkaroundToday, messyInput, outputArtifact, painfulMoment, broadSaasNotEnoughReason, beforeAfterDemo, sourceCodeOwnershipAngle, initialSearchQueries, and buildComplexity.
- Use camelCase field names exactly as shown.
- manualWorkaroundToday must mention a manual tool/process like Slack, email, Google Doc, Notion, spreadsheet, screenshot, call, Loom, or checklist.
- initialSearchQueries must include at least 4 concrete workflow/artifact/event phrases and no phrases like "They want" or "They need".
- Reject generic SaaS categories. Titles must be weirdly specific hidden workflow artifacts.

Workflow discovery brief:
${state.workflowDiscoveryBrief ?? buildWorkflowDiscoveryBrief(state.run, state.marketEvidence)}

Compact council context:
${context}

Return exactly this JSON shape:
{
  "ideas": [
    {
      "title": "...",
      "exactBuyer": "...",
      "manualWorkaroundToday": "...",
      "messyInput": "...",
      "outputArtifact": "...",
      "painfulMoment": "...",
      "broadSaasNotEnoughReason": "...",
      "beforeAfterDemo": "...",
      "sourceCodeOwnershipAngle": "...",
      "initialSearchQueries": ["...", "...", "...", "..."],
      "buildComplexity": "low|medium|high"
    }
  ]
}
`,
    fallback: { ideas: [] },
    expectedSchema: "IdeasResponse",
    temperature: 0.35,
    maxTokens: 2600,
    okDetails: (replacementResponse) => ({
      replacementIdeasExtracted: Array.isArray(replacementResponse.ideas)
        ? replacementResponse.ideas.length
        : 0,
    }),
  });

  logRound1RawOutputReceived(response, tracer, round, agent, provider, model);
  const normalized = normalizeIdeas(response.ideas, {
    useFallback: false,
  }).slice(0, 8);
  const succeeded = normalized.length > 0;
  tracer?.addEvent({
    step: succeeded
      ? "round1_replacement_succeeded"
      : "round1_replacement_failed",
    status: succeeded ? "ok" : "failed",
    round: round.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: { replacementIdeas: normalized.length },
  });
  return normalized;
}

function createDeterministicRound1FallbackIdeas(
  state: DebateState,
): ProductIdeaDraft[] {
  const buyer = state.run.targetBuyer?.trim() || "small service agencies";
  const seeds = [
    {
      title: "Approval Reversal Proof Pack",
      input:
        "Slack approval thread, client email change request, screenshot of original signoff",
      artifact: "client-ready approval reversal proof pack",
      event:
        "client claims a changed request was included after approving the original scope",
    },
    {
      title: "Revision Contradiction Log",
      input: "Figma comments, Loom feedback, and Google Doc revision notes",
      artifact: "revision contradiction log with evidence snippets",
      event:
        "client feedback contradicts an earlier signed revision during a deadline call",
    },
    {
      title: "Client Promise Drift Report",
      input:
        "sales call transcript, proposal email, and Notion delivery checklist",
      artifact: "client promise drift report for scope conversations",
      event: "a prospect references an old sales promise after project kickoff",
    },
    {
      title: "Handoff Assumption Gap Finder",
      input: "handoff email, kickoff call notes, and project checklist rows",
      artifact: "handoff assumption gap report with owner questions",
      event:
        "delivery team discovers an unstated assumption after client handoff",
    },
    {
      title: "Screenshot Feedback Conflict Resolver",
      input: "screenshot markups, Slack replies, and Figma comment threads",
      artifact: "screenshot feedback conflict resolution packet",
      event:
        "client screenshot feedback conflicts with the approved design direction",
    },
  ];

  return seeds.map((seed) => ({
    title: normalizeProductTitle(`${seed.title} for ${buyer}`, buyer),
    description: `Source-code product that turns ${seed.input} into a ${seed.artifact}.`,
    targetBuyer: buyer,
    exactBuyer: buyer,
    pain: seed.event,
    whyBuySourceCode:
      "Buyers can customize evidence rules, templates, and exports for their client process.",
    sourceCodeOwnershipAngle:
      "buyers can customize proof rules and templates for their exact client workflow",
    manualWorkaroundToday: `They paste ${seed.input} into a Google Doc checklist before a client call`,
    messyInput: seed.input,
    outputArtifact: seed.artifact,
    painfulMoment: seed.event,
    broadSaasNotEnoughReason:
      "broad project tools store messages but do not assemble evidence for this client event",
    beforeAfterDemo: `paste ${seed.input}, then generate a ${seed.artifact} with evidence and reply`,
    initialSearchQueries: normalizeInitialSearchQueries([
      seed.title,
      seed.artifact,
      seed.event,
      `${seed.input.split(",")[0]} proof pack`,
      `${seed.title} source code`,
    ]),
    buildComplexity: "medium",
    mvpFeatures: [
      "Paste messy workflow inputs",
      "Extract evidence",
      "Generate client-ready artifact",
    ],
    fullFeatures: [],
    pricingIdea: "$149-$499 source-code license",
    risks: [
      "Deterministic fallback candidate; must be validated before build.",
    ],
    fallbackGenerated: true,
    status: "generated" as const,
  }));
}

async function repairRound1Ideas({
  state,
  provider,
  agent,
  round,
  tracer,
  persistence,
  validIdeas,
  removedIdeas,
  model,
}: {
  state: DebateState;
  provider: AIProvider;
  agent: CouncilAgent;
  round?: RoundRecord;
  tracer?: RunDebugTracer;
  persistence?: DebatePersistence;
  validIdeas: ProductIdeaDraft[];
  removedIdeas: Round1RemovedIdea[];
  model: string;
}) {
  if (!round || validIdeas.length >= 5 || removedIdeas.length === 0) {
    return { valid: validIdeas, removed: removedIdeas };
  }

  tracer?.addEvent({
    step: "round1_repair_attempted",
    status: "start",
    round: round.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: {
      validIdeas: validIdeas.length,
      removedIdeas: removedIdeas.length,
    },
  });

  const repairInput = renderRound1RepairInput(removedIdeas);
  const { response } = await callModelJSON<IdeasResponse>({
    state,
    provider,
    agent,
    round,
    tracer,
    persistence,
    mode: "idea_generation",
    buildPrompt: (context) => `
Round 1 produced incomplete hidden-workflow objects.

Repair ONLY the missing/invalid fields for the removed ideas below. Do not invent broad SaaS categories. Do not return product-name-only ideas. Preserve each original title unless the title itself is listed as missing/invalid. Require concrete values for manualWorkaroundToday, messyInput, outputArtifact, and painfulMoment.

Removed ideas with exact missing fields:
${JSON.stringify(repairInput, null, 2)}

Hard requirements:
- JSON only.
- Return only fully repaired ideas that satisfy every required field.
- manualWorkaroundToday, messyInput, outputArtifact, painfulMoment, broadSaasNotEnoughReason, beforeAfterDemo, and sourceCodeOwnershipAngle must be concrete, not generic filler.
- Do not use phrases like "helps agencies save time", "customize and resell immediately", or "polished client-facing product".
- Do not create broad SaaS categories like proposal generator, invoice tool, support inbox, dashboard, portal, tracker, or manager unless the title includes the weird exact workflow artifact and painful event.
- initialSearchQueries must contain at least 5 concrete artifact/workflow search phrases.

Compact council context:
${context}

No markdown. No prose. JSON only. Return exactly this JSON shape:
{
  "ideas": [
    {
      "title": "string",
      "exactBuyer": "string",
      "manualWorkaroundToday": "string",
      "messyInput": "string",
      "outputArtifact": "string",
      "painfulMoment": "string",
      "broadSaasNotEnoughReason": "string",
      "beforeAfterDemo": "string",
      "sourceCodeOwnershipAngle": "string",
      "initialSearchQueries": ["...", "...", "...", "..."],
      "buildComplexity": "low|medium|high"
    }
  ]
}
`,
    fallback: { ideas: [] },
    expectedSchema: "IdeasResponse",
    temperature: 0.25,
    maxTokens: 2200,
    okDetails: (response) => ({
      repairedIdeasExtracted: Array.isArray(response.ideas)
        ? response.ideas.length
        : 0,
    }),
  });

  const repaired = applyIdeaQualityRewrites(
    normalizeIdeas(response.ideas),
    state,
    tracer,
    round,
    agent,
    provider,
    model,
  );
  const repairValidation = validateRound1IdeaExtraction(
    repaired,
    tracer,
    round,
    agent,
    provider,
    model,
  );
  const mergedValid = dedupeIdeaCandidates(
    uniqueByTitle([...validIdeas, ...repairValidation.valid]),
    tracer,
    round,
    agent,
    provider.name,
    "round1_repair",
  ).ideas;
  const mergedRemoved = [...removedIdeas, ...repairValidation.removed];
  const succeeded = mergedValid.length >= 5;

  tracer?.addEvent({
    step: succeeded ? "round1_repair_succeeded" : "round1_repair_failed",
    status: succeeded ? "ok" : "failed",
    round: round.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: {
      validIdeas: mergedValid.length,
      repairedReturned: repaired.length,
      repairedValid: repairValidation.valid.length,
    },
  });

  return { valid: mergedValid, removed: mergedRemoved };
}

async function generateIdeas(
  state: DebateState,
  provider: AIProvider,
  agent: CouncilAgent,
  tracer?: RunDebugTracer,
  round?: RoundRecord,
  persistence?: DebatePersistence,
) {
  const fallback = { ideas: [] };
  const model = modelForRound(agent, provider, round);

  const workflowDiscoveryBrief =
    state.workflowDiscoveryBrief ??
    buildWorkflowDiscoveryBrief(state.run, state.marketEvidence);
  state.workflowDiscoveryBrief = workflowDiscoveryBrief;
  tracer?.addEvent({
    step: "workflow_discovery_brief_created",
    status: "ok",
    round: round?.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: {
      buyer: truncateText(state.run.targetBuyer ?? "", 120),
      preferredCategory: truncateText(state.run.productCategory ?? "", 80),
      briefChars: workflowDiscoveryBrief.length,
    },
  });

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
You are opening the council.

Do NOT start by naming products.

Step 1 (discovery): identify exactly 20 hidden manual workflows (not products) that match the buyer context.
Each workflow MUST include:
- exact buyer niche
- messy input they deal with today (Slack/email/screenshots/Loom/Docs/Notion/spreadsheets/meeting notes/transcripts/etc)
- exact manual workaround today
- painful moment (where it breaks)
- output artifact produced (risk log / proof / client-ready response / contradiction report / handoff summary / etc)
- why broad SaaS is not enough
- validation angle (how to validate quickly on LinkedIn)

Step 2 (conversion): convert ONLY the best 12 workflows into product candidates.

Hard bans:
- Do not output generic titles like: Tracker, Manager, Dashboard, Portal, Generator, Analyzer, Automation Tool, System, Assistant.
- If you use any banned word, the title MUST include a very specific workflow object AND buyer context.
- If the title could be a common SaaS category, rewrite it until it is weirdly specific.
- Product title max 8 words. Use workflow artifact + painful event + niche buyer. Never paste a comma-separated buyer list into the title.
- Initial Exa search queries must be concrete artifact/workflow phrases. Do not include "They want...", "They need...", broad goals, or the full target buyer list.
- Round 1 will discard any object missing title, exactBuyer, manualWorkaroundToday, messyInput, outputArtifact, painfulMoment, broadSaasNotEnoughReason, beforeAfterDemo, sourceCodeOwnershipAngle, initialSearchQueries, or buildComplexity.
- Required narrative fields must name a concrete input/artifact/event, not generic filler.

Bad idea (will be rejected):
{
  "title": "Proposal Generator For Agencies",
  "manualWorkaroundToday": "",
  "messyInput": "",
  "outputArtifact": "",
  "painfulMoment": ""
}

Good idea:
{
  "title": "Slack Approval Reversal Proof Pack",
  "exactBuyer": "small web design agencies",
  "manualWorkaroundToday": "paste Slack approval messages into a Google Doc to prove the client changed direction after approval",
  "messyInput": "Slack approval thread, later change request, screenshot of original signoff",
  "outputArtifact": "client-ready approval reversal proof pack",
  "painfulMoment": "client says the new request was already included after previously approving the scope",
  "broadSaasNotEnoughReason": "project management tools store messages but do not assemble approval-change proof for uncomfortable client conversations",
  "beforeAfterDemo": "paste Slack thread and change request, then generate a proof pack with original approval, changed request, and suggested reply",
  "sourceCodeOwnershipAngle": "agencies can customize proof templates, client wording, and evidence rules for their niche",
  "initialSearchQueries": [
    "Slack approval reversal proof pack",
    "client changed request after approval proof",
    "track approval reversal manually",
    "approval change proof template agency",
    "Slack approval proof source code"
  ],
  "buildComplexity": "medium"
}

Workflow discovery brief (authoritative):
${workflowDiscoveryBrief}

Compact council context:
${context}

No markdown. No prose. JSON only. Return exactly this JSON shape:
{
  "ideas": [
    {
      "title": "string",
      "exactBuyer": "string",
      "manualWorkaroundToday": "string",
      "messyInput": "string",
      "outputArtifact": "string",
      "painfulMoment": "string",
      "broadSaasNotEnoughReason": "string",
      "beforeAfterDemo": "string",
      "sourceCodeOwnershipAngle": "string",
      "initialSearchQueries": ["...", "...", "...", "..."],
      "buildComplexity": "low|medium|high"
    }
  ]
}
`,
      fallback,
      expectedSchema: "IdeasResponse",
      temperature: 0.55,
      maxTokens: 2800,
      okDetails: (response) => ({
        ideasExtracted: Array.isArray(response.ideas)
          ? response.ideas.length
          : 0,
      }),
    });

    logRound1RawOutputReceived(response, tracer, round, agent, provider, model);
    const rawIdeaCount = Array.isArray(response.ideas)
      ? response.ideas.length
      : 0;
    state.round1RawIdeaCount = rawIdeaCount;
    let normalized = normalizeIdeas(response.ideas, {
      useFallback: false,
    }).slice(0, 12);

    if (normalized.length === 0) {
      normalized = await generateRound1ReplacementIdeas({
        state,
        provider,
        agent,
        round,
        tracer,
        persistence,
        model,
      });
    }

    let usedDeterministicFallback = false;
    if (rawIdeaCount === 0 && normalized.length === 0) {
      normalized = createDeterministicRound1FallbackIdeas(state);
      usedDeterministicFallback = true;
      tracer?.addEvent({
        step: "round1_deterministic_fallback_created",
        status: "ok",
        round: round?.title,
        agent: agent.name,
        provider: provider.name,
        model,
        details: { fallbackIdeas: normalized.length },
      });
    }

    const rewritten = applyIdeaQualityRewrites(
      normalized,
      state,
      tracer,
      round,
      agent,
      provider,
      model,
    );
    const deduped = dedupeIdeaCandidates(
      rewritten,
      tracer,
      round,
      agent,
      provider.name,
      usedDeterministicFallback
        ? "round1_deterministic_fallback"
        : "initial_generation",
    ).ideas;
    const initialValidation = validateRound1IdeaExtraction(
      deduped,
      tracer,
      round,
      agent,
      provider,
      model,
    );
    const repaired = await repairRound1Ideas({
      state,
      provider,
      agent,
      round,
      tracer,
      persistence,
      validIdeas: initialValidation.valid,
      removedIdeas: initialValidation.removed,
      model,
    });
    state.round1ExtractionRemoved = repaired.removed;
    return repaired.valid.slice(0, 12);
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
- Reject ideas that do not include: exact buyer, exact messy input, exact manual workaround today, exact output artifact, exact painful moment, and why broad SaaS is not enough.
- Reject ideas when the actual tool already exists as a common SaaS or a common template/source-code kit.
- Call out fantasy thinking, fake demand, weak demos, and generic AI wrappers.
- Penalize ideas with no supporting evidence or only weak assumptions.
- Return a shortlist of max 5 ideas.
- Return rejected ideas max 6, with short reasons.
- Do not use generic praise (no "strong balance"); every kept idea must have a concrete workflow reason.

Compact council context:
${context}

No markdown. No prose. JSON only. Return exactly this JSON shape:
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
        topIdeas: Array.isArray(response.topIdeas)
          ? response.topIdeas.length
          : 0,
        rejectedIdeas: Array.isArray(response.rejectedIdeas)
          ? response.rejectedIdeas.length
          : 0,
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
      requiredFix:
        "Keep the MVP narrow and make the source-code package obvious in the demo.",
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
- Do not make the ideas broader. Narrow them to exactly one workflow step, one artifact, one failure moment.
- If a title sounds like a common SaaS category, rewrite it into workflow artifact + painful event + niche buyer form.
- Keep every product title to 8 words or fewer and do not include comma-separated buyer lists.
- Keep max 5 ideas and do not introduce new products.

Compact council context:
${context}

No markdown. No prose. JSON only. Return exactly this JSON shape:
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
        topIdeas: Array.isArray(response.topIdeas)
          ? response.topIdeas.length
          : 0,
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
      const match = response.topIdeas?.find(
        (item) => item.title === idea.title,
      );
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

async function runMarketSearchRound(
  state: DebateState,
  round: RoundRecord,
  persistence?: DebatePersistence,
  tracer?: RunDebugTracer,
) {
  const marketAgent = agentByKey("market-research");
  const provider = createMarketSearchProvider();
  const deduped = dedupeIdeaCandidates(
    state.shortlist,
    tracer,
    round,
    marketAgent,
    provider.name,
    "before_market_search",
  );
  state.shortlist = deduped.ideas;
  if (deduped.removed.length) {
    state.rejectedIdeas.push(
      ...deduped.removed.map(({ removed, kept }) => ({
        title: removed.title,
        reason: `Duplicate hidden workflow removed before market search. Kept stronger idea: ${kept.title}.`,
        risks: [
          "Duplicate normalized title/core workflow would pollute market evidence.",
          "Do not score repeated copies of the same workflow.",
        ],
      })),
    );
    await persistence?.updateIdeaStatuses?.(
      deduped.removed.map(({ removed }) => ({
        id: removed.id,
        title: removed.title,
        status: "rejected" as const,
      })),
    );
  }
  state.marketSearchStatus = "pending";
  tracer?.addEvent({
    step: "market_search_start",
    status: "start",
    round: round.title,
    agent: marketAgent.name,
    provider: provider.name,
    details: { ideas: state.shortlist.map((idea) => idea.title) },
  });
  await persistence?.updateRunProgress?.({
    currentRound: round.title,
    currentAgent: marketAgent.name,
    currentStep: "Searching real market evidence before scoring",
    currentProvider: provider.name,
    currentModel: "market-search-provider",
    progressPercent: progressForRound(round.roundNumber, "model_call"),
  });

  const checks: ToolExistenceCheck[] = [];
  for (const idea of state.shortlist) {
    const check = await runMarketExistenceCheck(idea, provider, (event) => {
      tracer?.addEvent({
        step: event.step,
        status: "ok",
        round: round.title,
        agent: marketAgent.name,
        provider: provider.name,
        details: event.details,
      });
    });
    checks.push(check);
    tracer?.addEvent({
      step: "market_search_result",
      status: check.marketSearchStatus === "completed" ? "ok" : "failed",
      round: round.title,
      agent: marketAgent.name,
      provider: provider.name,
      details: summarizeToolExistenceCheck(check),
    });
    if (provider.name === "exa" && check.marketSearchStatus === "failed") {
      tracer?.addEvent({
        step: "market_search_provider_failed",
        status: "failed",
        round: round.title,
        agent: marketAgent.name,
        provider: "exa",
        details: {
          status: check.marketSearchStatus,
          message: check.notes,
        },
      });
    }
  }

  state.toolExistenceChecks = checks;
  const marketSearchEvidence = marketChecksAsEvidenceDrafts(checks).map(
    (item) => ({
      ...item,
      productIdeaId:
        state.shortlist.find(
          (idea) =>
            idea.title ===
            item.title.replace("Market Search Reality Check: ", ""),
        )?.id ?? null,
    }),
  );
  const savedMarketSearchEvidence =
    (await persistence?.saveMarketEvidence?.(marketSearchEvidence)) ??
    marketSearchEvidence;
  state.marketEvidence = [
    ...state.marketEvidence,
    ...savedMarketSearchEvidence,
  ];
  state.marketSearchStatus = checks.some(
    (check) => check.marketSearchStatus === "failed",
  )
    ? "failed"
    : "completed";
  tracer?.addEvent({
    step: "existence_check_completed",
    status: state.marketSearchStatus === "completed" ? "ok" : "failed",
    round: round.title,
    agent: marketAgent.name,
    provider: provider.name,
    details: {
      status: state.marketSearchStatus,
      checks: checks.map(summarizeToolExistenceCheck),
    },
  });

  await recordMessage(
    state,
    persistence,
    round,
    marketAgent,
    renderMarketSearchRoundMessage(checks),
    "market-search-provider",
    provider.name,
  );
}

async function applyPostMarketSearchGate(
  state: DebateState,
  round: RoundRecord,
  persistence?: DebatePersistence,
  tracer?: RunDebugTracer,
): Promise<
  | { decision: "continue"; scoredIdeas?: undefined }
  | { decision: "reject_all"; scoredIdeas: ScoredProductIdea[] }
> {
  const marketAgent = agentByKey("market-research");
  const originalShortlist = state.shortlist;
  const initialEligible = originalShortlist.filter((idea) =>
    marketGapPasses(findExistenceCheck(state, idea.title)),
  );
  const initialRejected = originalShortlist.filter(
    (idea) =>
      !initialEligible.some((eligible) => eligible.title === idea.title),
  );

  const provider = createMarketSearchProvider();
  const eligibleIdeas: ProductIdeaDraft[] = [...initialEligible];
  const rejectedIdeas: ProductIdeaDraft[] = [];

  for (const idea of initialRejected) {
    const check = findExistenceCheck(state, idea.title);
    if (!check) {
      rejectedIdeas.push(idea);
      continue;
    }

    const narrowed = deterministicNicheDownIdea(
      idea,
      state.run.targetBuyer ?? "",
    );
    tracer?.addEvent({
      step: "niche_down_attempted",
      status: "ok",
      round: round.title,
      agent: marketAgent.name,
      provider: provider.name,
      details: {
        originalTitle: truncateText(idea.title, 140),
        narrowedTitle: truncateText(narrowed.title, 140),
        changedBuyerNiche: narrowed.targetBuyer,
        changedMessyInput: narrowed.messyInput,
        changedOutputArtifact: narrowed.outputArtifact,
        changedPainfulEvent: narrowed.painfulMoment,
      },
    });

    tracer?.addEvent({
      step: "niche_down_market_search_started",
      status: "start",
      round: round.title,
      agent: marketAgent.name,
      provider: provider.name,
      details: { title: truncateText(narrowed.title, 140) },
    });

    const narrowedCheck = await runMarketExistenceCheck(
      narrowed,
      provider,
      (event) => {
        tracer?.addEvent({
          step: event.step,
          status: "ok",
          round: round.title,
          agent: marketAgent.name,
          provider: provider.name,
          details: event.details,
        });
      },
    );
    state.toolExistenceChecks.push(narrowedCheck);

    tracer?.addEvent({
      step: "niche_down_market_search_result",
      status: marketGapPasses(narrowedCheck) ? "ok" : "failed",
      round: round.title,
      agent: marketAgent.name,
      provider: provider.name,
      details: summarizeToolExistenceCheck(narrowedCheck) ?? {},
    });

    if (marketGapPasses(narrowedCheck)) {
      eligibleIdeas.push(narrowed);
      continue;
    }

    tracer?.addEvent({
      step: "market_gate_rejected_after_niche_down",
      status: "ok",
      round: round.title,
      agent: marketAgent.name,
      provider: provider.name,
      details: {
        originalTitle: truncateText(idea.title, 140),
        narrowedTitle: truncateText(narrowed.title, 140),
        reason: marketGateRejectedReason(narrowedCheck),
      },
    });

    rejectedIdeas.push(idea);
  }

  tracer?.addEvent({
    step: "post_market_search_gate",
    status: eligibleIdeas.length ? "ok" : "failed",
    round: round.title,
    agent: marketAgent.name,
    provider: "market-search-gate",
    details: {
      originalShortlistCount: originalShortlist.length,
      survivingIdeaCount: eligibleIdeas.length,
      rejectedIdeaCount: rejectedIdeas.length,
      rejectedIdeas: rejectedIdeas.map((idea) => ({
        title: idea.title,
        existenceCheck: summarizeToolExistenceCheck(
          findExistenceCheck(state, idea.title),
        ),
      })),
    },
  });

  if (rejectedIdeas.length) {
    state.rejectedIdeas.push(
      ...rejectedIdeas.map((idea) => ({
        title: idea.title,
        reason: marketGateRejectedReason(findExistenceCheck(state, idea.title)),
        risks: [
          "Searched evidence found obvious similar tools or source-code kits.",
          "The actual tool gap or source-code gap failed the 7/10 hard gate.",
          "Do not continue this idea into scoring without a narrower hidden workflow.",
        ],
      })),
    );
  }

  await persistence?.updateIdeaStatuses?.([
    ...eligibleIdeas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: "shortlisted" as const,
    })),
    ...rejectedIdeas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: "rejected" as const,
    })),
  ]);

  state.shortlist = eligibleIdeas;

  if (eligibleIdeas.length) {
    if (rejectedIdeas.length) {
      await recordMessage(
        state,
        persistence,
        round,
        marketAgent,
        renderPostMarketGateMessage(eligibleIdeas, rejectedIdeas, false),
        "market-search-gate",
        "market-search-gate",
      );
    }

    return { decision: "continue" };
  }

  const scoredIdeas = createMarketGateRejectedScores(originalShortlist, state);
  state.scoreHistory = scoredIdeas.map((idea) => ({
    title: idea.title,
    totalScore: idea.score.total_score,
    score: idea.score,
    explanations:
      idea.scoreExplanations ?? normalizeScoreExplanations(undefined),
    reason: idea.scoreReason ?? "",
  }));
  state.finalDecision = "reject_all";
  state.finalDecisionReason =
    "Reject all. Generate better hidden-gap ideas or add stronger market evidence. Searched market evidence found obvious similar tools or source-code kits for every shortlisted idea.";
  state.whyOthersLost = scoredIdeas.map((idea) => ({
    title: idea.title,
    reason: marketGateRejectedReason(findExistenceCheck(state, idea.title)),
  }));

  await recordMessage(
    state,
    persistence,
    round,
    marketAgent,
    renderPostMarketGateMessage([], rejectedIdeas, true),
    "market-search-gate",
    "market-search-gate",
  );

  return { decision: "reject_all", scoredIdeas };
}

async function finishRejectAllAfterKillSwitch({
  state,
  provider,
  enabledAgents,
  judgeAgent,
  killSwitchResult,
  persistence,
  tracer,
}: {
  state: DebateState;
  provider: AIProvider;
  enabledAgents: CouncilAgent[];
  judgeAgent: CouncilAgent;
  killSwitchResult: KillSwitchResult;
  persistence?: DebatePersistence;
  tracer?: RunDebugTracer;
}): Promise<DebateArtifacts> {
  state.finalDecision = "reject_all";
  state.finalDecisionReason =
    (state.round1RawIdeaCount ?? 0) === 0
      ? "Round 1 model returned no parseable ideas."
      : "Round 1 returned ideas, but none passed required hidden-workflow fields.";
  state.shortlist = [];
  state.toolExistenceChecks = [];
  state.marketSearchStatus = "completed";

  const removedWorkflowIdeas = buildKillSwitchRemovedIdeaRows(
    state,
    killSwitchResult,
  );
  const placeholderWinner = createKillSwitchPlaceholderWinner(
    state,
    removedWorkflowIdeas[0]?.title,
  );
  const scoredIdeas: ScoredProductIdea[] = [];

  await persistence?.updateIdeaStatuses(
    [
      ...killSwitchResult.originalIdeas,
      ...(state.round1ExtractionRemoved ?? []).map((item) => item.idea),
    ].map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: "rejected",
    })),
  );

  const round8 = await createRound(7, persistence);
  const report = createDeterministicReport(
    state.run,
    placeholderWinner,
    {
      ...createReportContext(state, scoredIdeas),
      shortlistedIdeas: [],
      scoredIdeas: [],
      scoreHistory: [],
      finalDecision: "reject_all",
      finalDecisionReason: state.finalDecisionReason,
      killSwitchRejectAll: true,
      marketSearchRan: false,
      removedWorkflowIdeas,
    },
    {
      onBetterDirectionGenerated: (direction) => {
        tracer?.addEvent({
          step: "better_direction_generated",
          status: "ok",
          round: round8.title,
          agent: judgeAgent.name,
          provider: provider.name,
          details: {
            title: direction.title,
            queries: direction.queries,
          },
        });
      },
    },
  );
  await persistence?.saveFinalReport(report, placeholderWinner);

  await recordMessage(
    state,
    persistence,
    round8,
    judgeAgent,
    "Round 1 failed to produce valid hidden workflow objects. Market search was not run.",
    modelForRound(judgeAgent, provider, round8),
    provider.name,
  );

  await persistence?.updateRunProgress?.({
    currentRound: round8.title,
    currentAgent: judgeAgent.name,
    currentStep: "Council rejected all at Round 1.5 kill switch",
    currentProvider: provider.name,
    currentModel: modelForRound(judgeAgent, provider, round8),
    progressPercent: 100,
  });
  await persistence?.markRunStatus?.("completed");
  tracer?.completeStep("update_run_completed", {
    status: "completed",
    finalDecision: "reject_all",
    reason: "kill_switch_reject_all",
  });
  tracer?.completeStep("start_debate_runner", { status: "completed" });

  return {
    run: state.run,
    agents: enabledAgents,
    ideas: state.ideas,
    marketEvidence: state.marketEvidence,
    toolExistenceChecks: state.toolExistenceChecks,
    shortlistedIdeas: state.shortlist,
    scoredIdeas,
    winner: placeholderWinner,
    report,
  };
}

function buildKillSwitchRemovedIdeaRows(
  state: DebateState,
  killSwitchResult: KillSwitchResult,
) {
  const round1Removed = state.round1ExtractionRemoved ?? [];
  const byTitle = new Map<
    string,
    {
      title: string;
      reason: string;
      missingFields?: string[];
      suggestedRepairDirection?: string;
    }
  >();

  for (const item of round1Removed) {
    byTitle.set(item.idea.title, {
      title: item.idea.title,
      reason: item.reason,
      missingFields: item.missingFields,
      suggestedRepairDirection: item.suggestedRepairDirection,
    });
  }

  for (const item of killSwitchResult.removedIdeas) {
    if (byTitle.has(item.idea.title)) continue;
    const validation = validateRequiredWorkflowFields(item.idea);
    byTitle.set(item.idea.title, {
      title: item.idea.title,
      reason: item.reason,
      missingFields: validation.missingFields,
      suggestedRepairDirection: createRound1RepairDirection(
        item.idea,
        validation.missingFields,
      ),
    });
  }

  return [...byTitle.values()];
}

function createKillSwitchPlaceholderWinner(
  state: DebateState,
  title?: string,
): ScoredProductIdea {
  const score = normalizeScore({ total_score: 0 });
  return {
    title: title ?? "No Valid Hidden Workflow Object",
    description:
      "Placeholder only; no idea survived Round 1 hidden-workflow validation.",
    targetBuyer: state.run.targetBuyer ?? "Unknown buyer",
    pain: "Round 1 did not provide enough structured workflow detail to score.",
    whyBuySourceCode:
      "Not evaluated because the pipeline stopped before scoring.",
    mvpFeatures: [],
    fullFeatures: [],
    pricingIdea: "Not evaluated",
    risks: ["Round 1 failed to produce valid hidden workflow objects."],
    status: "rejected",
    score,
    scoreReason: "Not scored. Market search was not run.",
    lostReason: "Round 1 failed to produce valid hidden workflow objects.",
  };
}

async function finishRejectAllAfterMarketGate({
  state,
  provider,
  enabledAgents,
  judgeAgent,
  scoredIdeas,
  persistence,
  tracer,
}: {
  state: DebateState;
  provider: AIProvider;
  enabledAgents: CouncilAgent[];
  judgeAgent: CouncilAgent;
  scoredIdeas: ScoredProductIdea[];
  persistence?: DebatePersistence;
  tracer?: RunDebugTracer;
}): Promise<DebateArtifacts> {
  const sorted = sortByScore(scoredIdeas);
  const highestRejected = sorted[0];

  await persistence?.saveScores(scoredIdeas);
  await persistence?.updateIdeaStatuses(
    scoredIdeas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      status: "rejected",
    })),
  );

  const round8 = await createRound(7, persistence);
  const report = createDeterministicReport(
    state.run,
    highestRejected,
    createReportContext(state, scoredIdeas),
    {
      onBetterDirectionGenerated: (direction) => {
        tracer?.addEvent({
          step: "better_direction_generated",
          status: "ok",
          round: round8.title,
          agent: judgeAgent.name,
          provider: provider.name,
          details: {
            title: direction.title,
            queries: direction.queries,
          },
        });
      },
    },
  );
  await persistence?.saveFinalReport(report, highestRejected);

  await recordMessage(
    state,
    persistence,
    round8,
    judgeAgent,
    "Reject all. Generate better hidden-gap ideas or add stronger market evidence. The final report explains that searched market evidence found obvious similar tools or source-code kits for every shortlisted idea, so the council stopped before interactive debate and scoring.",
    modelForRound(judgeAgent, provider, round8),
    provider.name,
  );

  await persistence?.updateRunProgress?.({
    currentRound: round8.title,
    currentAgent: judgeAgent.name,
    currentStep: "Council rejected all after market search",
    currentProvider: provider.name,
    currentModel: modelForRound(judgeAgent, provider, round8),
    progressPercent: 100,
  });
  await persistence?.markRunStatus?.("completed");
  tracer?.completeStep("update_run_completed", {
    status: "completed",
    finalDecision: "reject_all",
    reason: "post_market_search_gate",
  });
  tracer?.completeStep("start_debate_runner", { status: "completed" });

  return {
    run: state.run,
    agents: enabledAgents,
    ideas: state.ideas,
    marketEvidence: state.marketEvidence,
    toolExistenceChecks: state.toolExistenceChecks,
    shortlistedIdeas: state.shortlist,
    scoredIdeas,
    winner: highestRejected,
    report,
  };
}

function marketGapPasses(check?: ToolExistenceCheck) {
  return Boolean(
    check &&
    check.marketSearchStatus === "completed" &&
    check.actualToolGapScore >= 7 &&
    check.sourceCodeGapScore >= 7,
  );
}

function marketGateRejectedReason(check?: ToolExistenceCheck) {
  if (!check) {
    return "No completed market search check was available, so the idea failed the market evidence gate.";
  }

  return [
    `Market search status: ${check.marketSearchStatus}.`,
    `Common category risk: ${check.commonCategoryRisk}.`,
    `Actual tool gap: ${check.actualToolGapScore}/10.`,
    `Source-code gap: ${check.sourceCodeGapScore}/10.`,
    `Similar tools found: ${check.similarSaaSTools.length}.`,
    `Similar source-code kits found: ${check.similarSourceCodeKits.length}.`,
  ].join(" ");
}

function createMarketGateRejectedScores(
  ideas: ProductIdeaDraft[],
  state: DebateState,
): ScoredProductIdea[] {
  const localScores = scoreIdeasLocally(ideas, state.marketEvidence);
  const localExplanations = explainScoresLocally(ideas, state.marketEvidence);

  return ideas.map((idea, index) => {
    const check = findExistenceCheck(state, idea.title);
    const localScore = localScores[index];
    const actualToolGap = check
      ? Math.min(localScore.actual_tool_gap, check.actualToolGapScore)
      : Math.min(localScore.actual_tool_gap, 4);
    const sourceCodeGap = check
      ? Math.min(localScore.source_code_gap, check.sourceCodeGapScore)
      : Math.min(localScore.source_code_gap, 4);
    const titleQualityBad =
      hasBadProductTitleQuality(idea.title, idea.targetBuyer) ||
      idea.genericRiskReason === "title stuffed with broad buyer list";
    const hiddenWorkflowSpecificity = titleQualityBad
      ? Math.min(localScore.hidden_workflow_specificity, 5)
      : check?.commonCategoryRisk === "high"
        ? Math.min(localScore.hidden_workflow_specificity, 5)
        : localScore.hidden_workflow_specificity;
    const score = normalizeScore({
      ...localScore,
      productIdeaId: idea.id,
      actual_tool_gap: actualToolGap,
      source_code_gap: sourceCodeGap,
      linkedin_demo_strength: titleQualityBad
        ? Math.min(localScore.linkedin_demo_strength, 6)
        : localScore.linkedin_demo_strength,
      hidden_workflow_specificity: hiddenWorkflowSpecificity,
      price_believability: Math.min(localScore.price_believability, 6),
    });
    const scoreExplanations = normalizeScoreExplanations({
      ...localExplanations[index],
      actual_tool_gap: `Failed the post-market-search gate. ${marketGateRejectedReason(check)}`,
      source_code_gap: `Failed the source-code-kit gate. ${marketGateRejectedReason(check)}`,
      hidden_workflow_specificity: titleQualityBad
        ? "Title was stuffed with a broad buyer list, so hidden workflow specificity is capped until the title is narrowed."
        : check?.commonCategoryRisk === "high"
          ? "Searched evidence shows a crowded/common category, so this is not specific enough to continue."
          : localExplanations[index]?.hidden_workflow_specificity,
    });

    return {
      ...idea,
      genericRiskReason: titleQualityBad
        ? "title stuffed with broad buyer list"
        : idea.genericRiskReason,
      score,
      scoreExplanations,
      scoreReason:
        "Rejected immediately after market search because the searched evidence did not clear actual_tool_gap and source_code_gap hard gates.",
      lostReason: marketGateRejectedReason(check),
    };
  });
}

function renderPostMarketGateMessage(
  eligibleIdeas: ProductIdeaDraft[],
  rejectedIdeas: ProductIdeaDraft[],
  rejectedAll: boolean,
) {
  const headline = rejectedAll
    ? "Reject all. Generate better hidden-gap ideas or add stronger market evidence."
    : "Market search gate removed crowded ideas before scoring.";

  return [
    `# Post-Market-Search Gate`,
    "",
    headline,
    "",
    `Rejected by market gate: ${rejectedIdeas.length}`,
    ...rejectedIdeas.map((idea) => `- ${idea.title}`),
    "",
    `Remaining shortlist: ${eligibleIdeas.length}`,
    ...eligibleIdeas.map((idea) => `- ${idea.title}`),
    "",
    rejectedAll
      ? "The council stopped before interactive debate and model scoring because every shortlisted idea failed actual_tool_gap or source_code_gap after searched evidence."
      : "Only ideas that cleared actual_tool_gap >= 7 and source_code_gap >= 7 continue.",
  ].join("\n");
}

async function runInteractiveDebateRound(
  state: DebateState,
  provider: AIProvider,
  agents: CouncilAgent[],
  round: RoundRecord,
  persistence?: DebatePersistence,
  tracer?: RunDebugTracer,
) {
  await persistence?.updateRunProgress?.({
    currentRound: round.title,
    currentAgent: "Interactive Council",
    currentStep: "Agents are replying to each other with market evidence",
    currentProvider: provider.name,
    currentModel: "interactive_council_chat",
    progressPercent: progressForRound(round.roundNumber, "model_call"),
  });

  const compactContext = buildCompactDebateContext(state, {
    mode: "agent_debate",
    maxMessages: 4,
    maxIdeas: 5,
    maxEvidence: 4,
    maxText: 5000,
  }).text;
  const messages = await runInteractiveCouncilChat({
    provider,
    agents,
    ideas: state.shortlist,
    existenceChecks: state.toolExistenceChecks,
    compactContext,
  });

  for (const message of messages) {
    const agent =
      agents.find((item) => item.key === message.agentKey) ??
      agentByKey(message.agentKey);
    tracer?.addEvent({
      step: "interactive_debate_turn",
      status: "ok",
      round: round.title,
      agent: message.agentName,
      provider: message.provider,
      model: message.model,
      details: {
        replyingToAgent: message.replyingToAgent,
        claimType: message.claimType,
        referencedIdea: message.referencedIdea,
        evidenceLinks: message.evidenceLinks,
      },
    });
    await recordMessage(
      state,
      persistence,
      round,
      agent,
      renderInteractiveCouncilMessage(message),
      message.model,
      message.provider,
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
  const localScores = scoreIdeasLocally(
    state.shortlist,
    state.marketEvidence,
  ).map((score, index) =>
    applyMarketGapRules(
      state.shortlist[index],
      score,
      findExistenceCheck(state, state.shortlist[index].title),
    ),
  );
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
You must use market search evidence. You are not allowed to guess actual_tool_gap or source_code_gap from model opinion.
If market search found similar products, reduce actual_tool_gap. If source-code kits/templates exist, reduce source_code_gap.
If a product already exists in many forms, reject or niche down. If no evidence is available, do not give high gap scores.
Use cautious language: say "not found in searched market evidence," never "does not exist in the world."

Hard rules:
- If actual_tool_gap < 7, the product cannot win.
- If source_code_gap < 7, the product cannot win build_now.
- If hidden_workflow_specificity < 7, the product cannot win.
- If market_search_status is not completed, build_now is forbidden.
- If exactToolExists = true and similarToolCount >= 3, actual_tool_gap cannot exceed 6.
- If similarSourceCodeKits >= 2, source_code_gap cannot exceed 6.
- If common_category_risk is high, the idea cannot be build_now.
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

No markdown. No prose. JSON only. Return exactly this JSON shape:
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
    const modelScore = normalizeScore({
      ...fallbackScore,
      ...scoreCandidate,
      productIdeaId: idea.id,
    });
    const score = applyMarketGapRules(
      idea,
      modelScore,
      findExistenceCheck(state, idea.title),
    );
    if (
      score.actual_tool_gap !== modelScore.actual_tool_gap ||
      score.source_code_gap !== modelScore.source_code_gap
    ) {
      tracer?.addEvent({
        step: "gap_score_adjusted",
        status: "ok",
        round: round?.title,
        agent: agent.name,
        provider: provider.name,
        model,
        details: {
          ideaTitle: idea.title,
          modelActualToolGap: modelScore.actual_tool_gap,
          adjustedActualToolGap: score.actual_tool_gap,
          modelSourceCodeGap: modelScore.source_code_gap,
          adjustedSourceCodeGap: score.source_code_gap,
          existenceCheck: summarizeToolExistenceCheck(
            findExistenceCheck(state, idea.title),
          ),
        },
      });
    }
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
      idea.scoreExplanations ??
      normalizeScoreExplanations(localExplanations[0]),
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
    candidateTitle:
      thresholdDecision === "reject_all" ? null : topCandidate.title,
    reason: defaultJudgeReason(topCandidate, thresholdDecision),
    whyOthersLost: sorted.slice(1).map((idea) => ({
      title: idea.title,
      reason:
        "Lower Day-One Sale Probability after scoring and council criticism.",
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
- Only return finalDecision "build_now" if the selected product scores ${DAY_ONE_BUILD_THRESHOLD}+ and has buyer_urgency >= 7, linkedin_demo_strength >= 7, actual_tool_gap >= 7, source_code_gap >= 7, hidden_workflow_specificity >= 7, manual_workaround_pain >= 7, market_search_status = completed, and no obvious exact tool was found.
- If market search failed, confidence is low, exact tools were found, or common_category_risk is high, finalDecision cannot be "build_now".
- If at least one product clears actual_tool_gap >= 7, source_code_gap >= 7, hidden_workflow_specificity >= 7, and manual_workaround_pain >= 7 but does not clear the build-now gate, finalDecision must be "validate_first" and the reason must include the exact phrase: "Validate first / Do not build yet."
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
${JSON.stringify(
  sorted.map((idea) => ({
    title: idea.title,
    totalScore: idea.score.total_score,
    score: idea.score,
    scoreReason: idea.scoreReason,
    explanations: idea.scoreExplanations,
  })),
  null,
  2,
)}

No markdown. No prose. JSON only. Return exactly this JSON shape:
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
        preSellPackType: typeof (response as { preSellPack?: unknown })
          .preSellPack,
      },
    });
  }

  const inferredDecision = inferFinalDecision(sorted);
  const initialWinner = selectDecisionCandidate(sorted, inferredDecision);
  const finalDecision = enforceMarketFinalDecision(
    state,
    initialWinner,
    inferredDecision,
    tracer,
    round,
    agent,
    provider,
    model,
  );
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
  const buildableIdeas = eligibleIdeas.filter((idea) =>
    isBuildReady(idea.score),
  );

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
    score.source_code_gap >= 7 &&
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

function enforceMarketFinalDecision(
  state: DebateState,
  candidate: ScoredProductIdea,
  decision: FinalDecision,
  tracer: RunDebugTracer | undefined,
  round: RoundRecord | undefined,
  agent: CouncilAgent,
  provider: AIProvider,
  model: string,
): FinalDecision {
  if (decision !== "build_now") {
    return decision;
  }

  const check = findExistenceCheck(state, candidate.title);
  if (canBuildNowWithMarketEvidence(candidate.score, check)) {
    return "build_now";
  }

  const fallbackDecision = isGapEligible(candidate.score)
    ? "validate_first"
    : "reject_all";
  tracer?.addEvent({
    step: "build_now_blocked_by_market_search",
    status: "ok",
    round: round?.title,
    agent: agent.name,
    provider: provider.name,
    model,
    details: {
      candidateTitle: candidate.title,
      fallbackDecision,
      marketSearchStatus: state.marketSearchStatus,
      existenceCheck: summarizeToolExistenceCheck(check),
    },
  });
  return fallbackDecision;
}

function defaultJudgeReason(
  candidate: ScoredProductIdea,
  decision: FinalDecision,
) {
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
  if (
    decision === "validate_first" &&
    !/Validate first \/ Do not build yet/i.test(reason)
  ) {
    return `Validate first / Do not build yet. ${reason}`;
  }

  if (decision === "build_now" && !/Build now/i.test(reason)) {
    return `Build now. ${reason || defaultJudgeReason(candidate, decision)}`;
  }

  if (
    decision === "reject_all" &&
    !/Reject all\. Generate better hidden-gap ideas or add stronger market evidence\./i.test(
      reason,
    )
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

  return failed.length
    ? failed.join(", ")
    : "it did not clear the full build-now threshold";
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
  const fallback = createDeterministicReport(state.run, winner, reportContext, {
    onBetterDirectionGenerated: (direction) => {
      tracer?.addEvent({
        step: "better_direction_generated",
        status: "ok",
        round: round?.title,
        agent: agent.name,
        provider: provider.name,
        details: {
          title: direction.title,
          queries: direction.queries,
        },
      });
    },
  });
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
${JSON.stringify(
  {
    title: winner.title,
    targetBuyer: winner.targetBuyer,
    pain: winner.pain,
    whyBuySourceCode: winner.whyBuySourceCode,
    mvpFeatures: winner.mvpFeatures,
    fullFeatures: winner.fullFeatures.slice(0, 5),
    risks: winner.risks.slice(0, 5),
    score: winner.score,
    scoreExplanations: winner.scoreExplanations,
  },
  null,
  2,
)}

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
- The reportMarkdown must include # Market Search Reality Check, # Existing Tool Check, # Hidden Workflow Gap, # Why this is not a copycat, # Better Niche Down, # Market Evidence Used, and # Codex Build Blueprint sections.
- The Market Search Reality Check must list exact queries used, similar tools found, source-code kits found, exact-tool status, confidence, actual_tool_gap evidence, and source_code_gap evidence.
- If the idea is too close to existing tools, finalDecision must remain validate_first or reject_all and the report must say why.
- The Codex Prompt must start exactly with: "You are my senior full-stack engineer. Build this full-source-code product..."
`,
      fallback,
      expectedSchema: "FinalReport",
      temperature: 0.25,
      maxTokens: 6500,
      okDetails: (response) => ({
        reportMarkdownLength:
          typeof response.reportMarkdown === "string"
            ? response.reportMarkdown.length
            : 0,
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
    buildPlan: normalizeBuildPlan(
      (response as { buildPlan?: unknown }).buildPlan,
    ),
    packagingChecklist: ensureArray<string>(response.packagingChecklist),
    codexBuildBlueprint: ensureString(response.codexBuildBlueprint),
    codexPrompt: ensureString(response.codexPrompt),
    preSellPack: normalizePreSellPack(
      (response as { preSellPack?: unknown }).preSellPack,
    ),
  };

  const reportMarkdown = response.reportMarkdown ?? "";
  const hasDecisionPhrase = hasRequiredDecisionPhrase(
    reportMarkdown,
    fallbackFinalDecision,
  );

  if (
    !hasDecisionPhrase ||
    !/#\s*Market Search Reality Check/i.test(reportMarkdown) ||
    !/#\s*Existing Tool Check/i.test(reportMarkdown) ||
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
    buildPlan: response.buildPlan?.length
      ? response.buildPlan
      : fallback.buildPlan,
    preSellPack: response.preSellPack ?? fallback.preSellPack,
  };
}

function hasRequiredDecisionPhrase(
  reportMarkdown: string,
  decision: FinalDecision,
) {
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
    case "market-research":
      return `
Market Research Agent:
- You are the market reality checker.
- Prove whether this product already exists in searched evidence.
- Name competitors, alternatives, and source-code kits when present.
- Lower actual_tool_gap and source_code_gap when searched evidence shows similar products.
- Classify the searched evidence into:
  - exact same workflow
  - adjacent broad SaaS
  - source-code/template exists
  - manual workaround content exists (spreadsheets/SOP/templates/blog posts)
  - no close result found in searched evidence
- Explain whether the idea is: copycat, too broad, niche-down possible, or hidden-gap candidate.
- Do not let the council choose copycat ideas.`;
    case "buyer-intent":
      return `
Buyer Intent Agent:
- Challenge buyer urgency and existing purchase behavior.
- Ask whether LinkedIn can validate the pain fast.
- Do not accept high gap scores without market search evidence.`;
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

function summarizeEvidenceForPrompt(
  evidence: MarketEvidenceDraft[],
  limit: number,
) {
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
  const goalSummary = truncateText(
    state.run.goal,
    options.aggressive ? 500 : 900,
  );
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
    options.mode === "skeptic_filter"
      ? state.ideas
      : state.shortlist.length
        ? state.shortlist
        : state.ideas;
  const compact = {
    goalSummary,
    constraints,
    evidenceStatus: summarizeMarketEvidence(state.marketEvidence),
    evidenceSummary: summarizeEvidenceForPrompt(
      state.marketEvidence,
      maxEvidence,
    ),
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
        : state.rejectedIdeas
            .slice(0, options.aggressive ? 3 : 6)
            .map((idea) => ({
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
        : state.refinements
            .slice(options.aggressive ? -6 : -12)
            .map((item) => ({
              agent: item.agentName,
              title: item.title,
              refinement: truncateText(item.refinement, 220),
            })),
    recentMessages: summarizeMessagesForPrompt(state.messages, maxMessages),
    marketSearchStatus: state.marketSearchStatus,
    toolExistenceChecks: summarizeExistenceChecksForPrompt(
      state.toolExistenceChecks,
      options.aggressive ? 3 : 5,
    ),
    scoreHistory:
      options.mode === "judge" || options.mode === "final_report"
        ? state.scoreHistory.map((score) => ({
            title: score.title,
            totalScore: score.totalScore,
            actualToolGap: score.score.actual_tool_gap,
            sourceCodeGap: score.score.source_code_gap,
            reason: truncateText(score.reason, 180),
          }))
        : undefined,
  };
  let text = JSON.stringify(compact, null, 2);

  if (text.length > maxText) {
    text = `${text.slice(0, maxText)}\n[Compact context truncated.]`;
  }

  const includedIdeas =
    (compact.generatedIdeas?.length ?? 0) +
    (compact.shortlistedIdeas?.length ?? 0);
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
    previousMessages: summarizeMessagesForPrompt(state.messages, 6).map(
      (message, index) => ({
        roundNumber: index + 1,
        roundTitle: message.round,
        agentName: message.agent,
        agentRole: message.role,
        content: message.summary,
      }),
    ),
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
    marketEvidence: [
      ...state.marketEvidence.slice(0, 5).map((item) => ({
        ...item,
        content: truncateText(item.content, 260),
      })),
      ...marketChecksAsEvidenceDrafts(state.toolExistenceChecks),
    ],
    whyOthersLost: state.whyOthersLost,
    finalDecision: state.finalDecision,
    finalDecisionReason: state.finalDecisionReason,
  };
}

function buildTopIdeasFallback(ideas: ProductIdeaDraft[]): TopIdeasResponse {
  const topIdeas = ideas.slice(0, 5).map((idea) => ({
    title: idea.title,
    reason:
      "Strong balance of source-code resale value, build speed, and demo clarity.",
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
  const topIdeas: Array<{
    title: string;
    reason: string;
    requiredFix: string;
  }> = uniqueByTitle(response.topIdeas ?? [])
    .filter((idea) => knownTitles.has(idea.title))
    .slice(0, 5)
    .map((idea) => ({
      title: idea.title,
      reason: safeText(
        idea.reason,
        "Strongest product-market fit in this run.",
      ),
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
      const match = response.rejectedIdeas?.find(
        (rejected) => rejected.title === idea.title,
      );
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

function renderGeneratedIdeasMessage(ideas: ProductIdeaDraft[]) {
  return [
    `Generated ${ideas.length} complete source-code product candidates.`,
    "I am prioritizing products developers, agencies, freelancers, and founders can buy as code ownership, not as another subscription.",
    "Early strongest source-code resale patterns:",
    ...ideas
      .slice(0, 5)
      .map((idea) => `- ${idea.title}: ${idea.whyBuySourceCode}`),
  ].join("\n");
}

function renderSkepticFilterMessage(response: TopIdeasResponse) {
  return [
    "I rejected weaker ideas instead of spreading attention across fantasy demand.",
    "",
    "Top 5 kept:",
    ...response.topIdeas.map(
      (idea) =>
        `- ${idea.title}: ${idea.reason} Fix before scoring: ${idea.requiredFix}`,
    ),
    "",
    "Rejected:",
    ...response.rejectedIdeas
      .slice(0, 10)
      .map(
        (idea) =>
          `- ${idea.title}: ${idea.reason} Risks: ${idea.risks.join("; ")}`,
      ),
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

function normalizeIdeas(
  ideas: ProductIdeaDraft[] | undefined,
  options: { useFallback?: boolean } = {},
): ProductIdeaDraft[] {
  const fallback = expandMockIdeas();
  const source: ProductIdeaDraft[] =
    Array.isArray(ideas) && ideas.length
      ? ideas
      : options.useFallback === false
        ? []
        : fallback;

  return source.map((idea, index) => {
    const raw = idea as ProductIdeaDraft & {
      buyer?: string;
      target_buyer?: string;
      exact_buyer?: string;
      one_sentence?: string;
      why_buy_source_code?: string;
      demo?: string;
      demo_hook?: string;
      build_complexity?: string;
      buildComplexity?: string;
      complexity?: string;
      exactBuyer?: string;
      sourceCodeOwnershipAngle?: string;
      source_code_ownership_angle?: string;
      source_code_angle?: string;
      resale_angle?: string;
      manualWorkaroundToday?: string;
      manual_workaround_today?: string;
      manual_workaround?: string;
      workaround?: string;
      messyInput?: string;
      messy_input?: string;
      input?: string;
      messy_inputs?: string;
      outputArtifact?: string;
      output_artifact?: string;
      artifact?: string;
      useful_output?: string;
      painfulMoment?: string;
      painful_moment?: string;
      pain_point?: string;
      painful_event?: string;
      broadSaasNotEnoughReason?: string;
      broad_saas_not_enough_reason?: string;
      why_broad_saas_not_enough?: string;
      why_existing_tools_fail?: string;
      beforeAfterDemo?: string;
      before_after_demo?: string;
      initialSearchQueries?: string[];
      initial_search_queries?: string[];
      search_queries?: string[];
      exa_queries?: string[];
      fallbackGenerated?: boolean;
    };
    const initialQueries = normalizeInitialSearchQueries(
      raw.initialSearchQueries ??
        raw.initial_search_queries ??
        raw.search_queries ??
        raw.exa_queries,
    );
    const normalized: ProductIdeaDraft & { __rawKeys?: string[] } = {
      id: idea.id,
      title: safeText(
        idea.title,
        fallback[index]?.title ?? `Product Idea ${index + 1}`,
      ),
      description: safeText(
        idea.description ?? raw.one_sentence,
        fallback[index]?.description ?? "A practical full-source-code product.",
      ),
      exactBuyer: safeText(
        (idea as ProductIdeaDraft).exactBuyer ??
          raw.exactBuyer ??
          raw.exact_buyer ??
          raw.buyer ??
          raw.target_buyer ??
          idea.targetBuyer,
        "Agencies and technical founders",
      ),
      targetBuyer: safeText(
        idea.targetBuyer ??
          raw.target_buyer ??
          raw.exactBuyer ??
          raw.exact_buyer ??
          raw.buyer,
        "Agencies and technical founders",
      ),
      pain: safeText(
        idea.pain ??
          raw.painfulMoment ??
          raw.painful_moment ??
          raw.pain_point ??
          raw.painful_event,
        raw.one_sentence ?? "The buyer wants to save implementation time.",
      ),
      sourceCodeOwnershipAngle: safeText(
        (idea as ProductIdeaDraft).sourceCodeOwnershipAngle ??
          raw.sourceCodeOwnershipAngle ??
          raw.source_code_ownership_angle ??
          raw.source_code_angle ??
          raw.resale_angle ??
          idea.whyBuySourceCode ??
          raw.why_buy_source_code,
        "",
      ),
      whyBuySourceCode: safeText(
        idea.whyBuySourceCode ??
          raw.why_buy_source_code ??
          raw.sourceCodeOwnershipAngle ??
          raw.source_code_ownership_angle ??
          raw.source_code_angle ??
          raw.resale_angle,
        "The buyer can adapt evidence templates, workflow rules, and exports for their exact client process.",
      ),
      manualWorkaroundToday: safeText(
        (idea as ProductIdeaDraft).manualWorkaroundToday ??
          raw.manualWorkaroundToday ??
          raw.manual_workaround_today ??
          raw.manual_workaround ??
          raw.workaround,
        "",
      ),
      messyInput: safeText(
        (idea as ProductIdeaDraft).messyInput ??
          raw.messyInput ??
          raw.messy_input ??
          raw.input ??
          raw.messy_inputs,
        "",
      ),
      outputArtifact: safeText(
        (idea as ProductIdeaDraft).outputArtifact ??
          raw.outputArtifact ??
          raw.output_artifact ??
          raw.artifact ??
          raw.useful_output,
        "",
      ),
      painfulMoment: safeText(
        (idea as ProductIdeaDraft).painfulMoment ??
          raw.painfulMoment ??
          raw.painful_moment ??
          raw.pain_point ??
          raw.painful_event,
        "",
      ),
      broadSaasNotEnoughReason: safeText(
        (idea as ProductIdeaDraft).broadSaasNotEnoughReason ??
          raw.broadSaasNotEnoughReason ??
          raw.broad_saas_not_enough_reason ??
          raw.why_broad_saas_not_enough ??
          raw.why_existing_tools_fail,
        "",
      ),
      beforeAfterDemo: safeText(
        (idea as ProductIdeaDraft).beforeAfterDemo ??
          raw.beforeAfterDemo ??
          raw.before_after_demo ??
          raw.demo ??
          raw.demo_hook,
        "",
      ),
      initialSearchQueries: initialQueries,
      mvpFeatures: safeList(idea.mvpFeatures).length
        ? safeList(idea.mvpFeatures)
        : [
            safeText(
              raw.demo_hook ?? raw.demo,
              "Demo the core buyer workflow end to end.",
            ),
          ],
      fullFeatures: safeList(idea.fullFeatures),
      pricingIdea: safeText(idea.pricingIdea, "$149-$499 source-code license"),
      buildComplexity: safeText(
        (idea as ProductIdeaDraft).buildComplexity ??
          raw.buildComplexity ??
          raw.build_complexity ??
          raw.complexity,
        "medium",
      ),
      risks: safeList(idea.risks).length
        ? safeList(idea.risks)
        : [
            `Build complexity: ${safeText((idea as ProductIdeaDraft).buildComplexity ?? raw.buildComplexity ?? raw.build_complexity ?? raw.complexity, "medium")}`,
          ],
      fallbackGenerated: raw.fallbackGenerated,
      status: "generated" as const,
    };
    normalized.__rawKeys = Object.keys(raw).sort();
    return normalized;
  });
}

function findExistenceCheck(state: DebateState, title: string) {
  return state.toolExistenceChecks.find((check) => check.ideaTitle === title);
}

function summarizeToolExistenceCheck(check?: ToolExistenceCheck) {
  if (!check) {
    return null;
  }

  return {
    ideaTitle: check.ideaTitle,
    marketSearchStatus: check.marketSearchStatus,
    exactToolExists: check.exactToolExists,
    similarToolCount: check.similarSaaSTools.length,
    similarSourceCodeKitCount: check.similarSourceCodeKits.length,
    commonCategoryRisk: check.commonCategoryRisk,
    actualToolGapScore: check.actualToolGapScore,
    sourceCodeGapScore: check.sourceCodeGapScore,
    confidence: check.confidence,
    notes: truncateText(check.notes, 260),
    queries: check.evidence.map((item) => item.query),
    similarTools: check.similarSaaSTools.slice(0, 5).map((result) => ({
      title: result.title,
      url: result.url,
      query: result.query,
    })),
    sourceCodeKits: check.similarSourceCodeKits.slice(0, 5).map((result) => ({
      title: result.title,
      url: result.url,
      query: result.query,
    })),
  };
}

function summarizeExistenceChecksForPrompt(
  checks: ToolExistenceCheck[],
  limit: number,
) {
  return checks.slice(0, limit).map(summarizeToolExistenceCheck);
}

function marketChecksAsEvidenceDrafts(
  checks: ToolExistenceCheck[],
): MarketEvidenceDraft[] {
  return checks.slice(0, 5).map((check) => ({
    productIdeaId: null,
    sourceType: "market_search",
    sourceName: "Market Search Reality Check",
    sourceUrl:
      check.similarSaaSTools[0]?.url ??
      check.similarSourceCodeKits[0]?.url ??
      null,
    title: `Market Search Reality Check: ${check.ideaTitle}`,
    content: renderMarketSearchSummary(check),
    signalType:
      check.exactToolExists || check.commonCategoryRisk === "high"
        ? "competitor"
        : "market_gap_check",
    strengthScore: normalizeStrengthScore(check.confidence),
  }));
}

function renderMarketSearchSummary(check: ToolExistenceCheck) {
  const classified = classifyMarketResults(check);
  return [
    `market_search_status: ${check.marketSearchStatus}`,
    `exact_tool_exists_in_searched_results: ${check.exactToolExists ? "yes" : "no/uncertain"}`,
    `similar_saas_tools: ${check.similarSaaSTools.length}`,
    `similar_source_code_kits: ${check.similarSourceCodeKits.length}`,
    `competitor_classification: exact_same_workflow=${classified.exactSameWorkflow}; adjacent_broad_saas=${classified.adjacentBroadSaaS}; source_code_or_template=${classified.sourceCodeOrTemplate}; manual_workaround_content=${classified.manualWorkaroundContent}; no_close_result=${classified.noCloseResult}`,
    `common_category_risk: ${check.commonCategoryRisk}`,
    `actual_tool_gap_score: ${check.actualToolGapScore}/10`,
    `source_code_gap_score: ${check.sourceCodeGapScore}/10`,
    `confidence: ${check.confidence}/100`,
    `queries_used: ${check.evidence.map((item) => item.query).join("; ")}`,
    `similar_tools_found: ${
      check.similarSaaSTools
        .slice(0, 5)
        .map((result) => `${result.title} (${result.url})`)
        .join("; ") || "none in searched results"
    }`,
    `source_code_kits_found: ${
      check.similarSourceCodeKits
        .slice(0, 5)
        .map((result) => `${result.title} (${result.url})`)
        .join("; ") || "none in searched results"
    }`,
    check.notes,
  ].join("\n");
}

function classifyMarketResults(check: ToolExistenceCheck) {
  const hasResults =
    check.similarSaaSTools.length > 0 ||
    check.similarSourceCodeKits.length > 0 ||
    check.evidence.some((item) => item.results?.length);

  const manualContent = check.evidence
    .flatMap((item) => item.results)
    .filter(Boolean)
    .some((result) =>
      /template|spreadsheet|google\s*sheets|notion|sop|checklist|download|pdf|doc\b|\bforms?\b/i.test(
        `${result.title} ${result.url} ${result.snippet}`,
      ),
    );

  const adjacentBroad =
    check.commonCategoryRisk !== "low" ||
    check.evidence
      .flatMap((item) => item.results)
      .filter(Boolean)
      .some((result) =>
        /(crm|project management|task management|client portal|approval workflow|feedback tracker|decision log|risk tracker|communication tracker|helpdesk|ticketing)/i.test(
          `${result.title} ${result.snippet}`,
        ),
      );

  const exactSameWorkflow = Boolean(check.exactToolExists);
  const sourceCodeOrTemplate = check.similarSourceCodeKits.length > 0;
  const noCloseResult = !hasResults;

  return {
    exactSameWorkflow,
    adjacentBroadSaaS: adjacentBroad,
    sourceCodeOrTemplate,
    manualWorkaroundContent: manualContent && !exactSameWorkflow,
    noCloseResult,
  };
}

function renderMarketSearchRoundMessage(checks: ToolExistenceCheck[]) {
  return `# Market Search / Existence Check\n\n${checks
    .map((check) => {
      const classified = classifyMarketResults(check);
      return `## ${check.ideaTitle}\n- Market search status: ${check.marketSearchStatus}\n- Evidence classification: exact_same_workflow=${classified.exactSameWorkflow ? "yes" : "no"}; adjacent_broad_saas=${classified.adjacentBroadSaaS ? "yes" : "no"}; source_code_or_template=${classified.sourceCodeOrTemplate ? "yes" : "no"}; manual_workaround_content=${classified.manualWorkaroundContent ? "yes" : "no"}; no_close_result=${classified.noCloseResult ? "yes" : "no"}\n- Exact tool exists in searched results: ${check.exactToolExists ? "yes" : "no/uncertain"}\n- Similar SaaS/tools found: ${check.similarSaaSTools.length}\n- Similar source-code kits/templates found: ${check.similarSourceCodeKits.length}\n- Common category risk: ${check.commonCategoryRisk}\n- Actual tool gap cap: ${check.actualToolGapScore}/10\n- Source-code gap cap: ${check.sourceCodeGapScore}/10\n- Confidence: ${check.confidence}/100\n- Queries used: ${check.evidence.map((item) => `"${item.query}"`).join(", ")}\n- Top similar tools: ${
        check.similarSaaSTools
          .slice(0, 5)
          .map((result) => `${result.title} — ${result.url}`)
          .join("; ") || "No obvious tools found in searched results."
      }\n- Top source-code kits: ${
        check.similarSourceCodeKits
          .slice(0, 5)
          .map((result) => `${result.title} — ${result.url}`)
          .join("; ") ||
        "No obvious source-code kits found in searched results."
      }\n- Notes: ${check.notes}`;
    })
    .join(
      "\n\n",
    )}\n\nSafety language: these checks mean "not found in searched market evidence," not "does not exist in the world." Build now is blocked when market search fails, confidence is low, exact tools are obvious, or category risk is high.`;
}

function renderInteractiveCouncilMessage(message: {
  replyingToAgent?: string;
  claimType: string;
  referencedIdea?: string;
  message: string;
  evidenceLinks: string[];
}) {
  return [
    `Claim type: ${message.claimType}`,
    message.replyingToAgent ? `Replying to: ${message.replyingToAgent}` : null,
    message.referencedIdea
      ? `Referenced idea: ${message.referencedIdea}`
      : null,
    "",
    message.message,
    "",
    message.evidenceLinks.length
      ? `Evidence links: ${message.evidenceLinks.join(", ")}`
      : "Evidence links: none cited",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function ensureAtLeastThreeRisks(
  risks: string[] | undefined,
  idea: ProductIdeaDraft,
) {
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
      const candidate = item as {
        day?: unknown;
        focus?: unknown;
        deliverable?: unknown;
      };
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
  const text =
    `${idea.title} ${idea.description} ${idea.mvpFeatures.join(" ")}`.toLowerCase();

  if (
    /marketplace|integration|mobile|multi-tenant|enterprise|analytics/.test(
      text,
    )
  ) {
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
    .filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    .map((item) => item.trim());
}

function findAgent(agents: CouncilAgent[], key: CouncilAgent["key"]) {
  return agents.find((agent) => agent.key === key) ?? agentByKey(key);
}

export function createInitialMarketEvidence(
  run: CouncilRunInput,
): MarketEvidenceDraft[] {
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

  if (
    /competitor|alternative|too expensive|subscription|tool|product/.test(text)
  ) {
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
