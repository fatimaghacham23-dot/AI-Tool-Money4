import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DebateMessageDraft,
  DebatePersistence,
  DebateRoundDraft,
  FinalReportDraft,
  MarketEvidenceDraft,
  ProductIdeaDraft,
  ScoredProductIdea,
} from "@/ai/types";
import { DAY_ONE_BUILD_THRESHOLD } from "@/ai/scoring";
import {
  createMarketEvidenceInsertDiagnostic,
  normalizeStrengthScore,
} from "@/lib/db/market-evidence";
import { ensureTextArray } from "@/lib/db/normalize-db-values";
import type { Database, Json, ProductIdeaStatus } from "@/types/database";

function factoryStatusFromIdeaStatus(status: ProductIdeaStatus) {
  return status === "backup" ? "generated" : status;
}

export class SupabaseDebatePersistence implements DebatePersistence {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly councilRunId: string,
  ) {}

  async markRunStatus(status: "running" | "completed" | "failed") {
    await this.client
      .from("council_runs")
      .update({ status })
      .eq("id", this.councilRunId);
  }

  async updateRunProgress(progress: {
    currentRound?: string | null;
    currentAgent?: string | null;
    currentStep?: string | null;
    currentProvider?: string | null;
    currentModel?: string | null;
    progressPercent?: number | null;
  }) {
    const { error } = await this.client
      .from("council_runs")
      .update({
        current_round: progress.currentRound ?? null,
        current_agent: progress.currentAgent ?? null,
        current_step: progress.currentStep ?? null,
        current_provider: progress.currentProvider ?? null,
        current_model: progress.currentModel ?? null,
        progress_percent: progress.progressPercent ?? null,
      })
      .eq("id", this.councilRunId);

    if (error) {
      // Older local databases may not have the live-progress columns yet.
      // The schema file includes them; keep the run alive until the user applies it.
      console.warn("Could not update council live progress.", error.message);
    }
  }

  async createRound(round: DebateRoundDraft) {
    const { data, error } = await this.client
      .from("debate_rounds")
      .insert({
        council_run_id: this.councilRunId,
        round_number: round.roundNumber,
        round_type: round.roundType,
        title: round.title,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return { id: data.id };
  }

  async addMessage(message: DebateMessageDraft) {
    const payload = {
      council_run_id: this.councilRunId,
      debate_round_id: message.roundId,
      agent_id: message.agent.id ?? null,
      model_provider: message.provider ?? message.agent.modelProvider,
      model_name: message.model ?? message.agent.modelName,
      content: message.content,
    };

    const { error } = await this.client.from("agent_messages").insert(payload);

    if (error) {
      const { error: fallbackError } = await this.client.from("agent_messages").insert({
        council_run_id: payload.council_run_id,
        debate_round_id: payload.debate_round_id,
        agent_id: payload.agent_id,
        content: payload.content,
      });

      if (fallbackError) {
        throw fallbackError;
      }
    }
  }

  async saveIdeas(ideas: ProductIdeaDraft[]) {
    const { data, error } = await this.client
      .from("product_ideas")
      .insert(
        ideas.map((idea) => ({
          council_run_id: this.councilRunId,
          title: idea.title,
          description: idea.description,
          target_buyer: idea.targetBuyer,
          pain: idea.pain,
          why_buy_source_code: idea.whyBuySourceCode,
          mvp_features: ensureTextArray(idea.mvpFeatures),
          full_features: ensureTextArray(idea.fullFeatures),
          pricing_idea: idea.pricingIdea,
          risks: ensureTextArray(idea.risks),
          status: idea.status ?? "generated",
          factory_status: idea.status
            ? factoryStatusFromIdeaStatus(idea.status)
            : "generated",
        })),
      )
      .select("*");

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      targetBuyer: row.target_buyer ?? "",
      pain: row.pain ?? "",
      whyBuySourceCode: row.why_buy_source_code ?? "",
      mvpFeatures: row.mvp_features,
      fullFeatures: row.full_features,
      pricingIdea: row.pricing_idea ?? "",
      risks: row.risks,
      status: row.status,
    }));
  }

  async saveMarketEvidence(evidence: MarketEvidenceDraft[]) {
    if (!evidence.length) {
      return [];
    }

    const insertDiagnostics = evidence.map((item) =>
      createMarketEvidenceInsertDiagnostic({
        source: item.sourceName || item.sourceType,
        strengthScore: item.strengthScore,
      }),
    );
    console.log("MARKET_EVIDENCE_INSERT_DIAGNOSTIC", insertDiagnostics);

    const { data, error } = await this.client
      .from("market_evidence")
      .insert(
        evidence.map((item) => ({
          council_run_id: this.councilRunId,
          product_idea_id: item.productIdeaId ?? null,
          source_type: item.sourceType,
          source_name: item.sourceName,
          source_url: item.sourceUrl ?? null,
          title: item.title,
          content: item.content,
          signal_type: item.signalType,
          strength_score: normalizeStrengthScore(item.strengthScore),
        })),
      )
      .select("*");

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      councilRunId: row.council_run_id,
      productIdeaId: row.product_idea_id,
      sourceType: row.source_type,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      title: row.title,
      content: row.content,
      signalType: row.signal_type,
      strengthScore: row.strength_score,
      createdAt: row.created_at,
    }));
  }

  async updateIdeaStatuses(
    updates: Array<{ id?: string; title: string; status: ProductIdeaStatus }>,
  ) {
    await Promise.all(
      updates.map(async (update) => {
        const factoryStatus = factoryStatusFromIdeaStatus(update.status);
        const query = this.client
          .from("product_ideas")
          .update({ status: update.status, factory_status: factoryStatus });

        const { error } = update.id
          ? await query.eq("id", update.id)
          : await query
              .eq("council_run_id", this.councilRunId)
              .eq("title", update.title);

        if (error) {
          throw error;
        }
      }),
    );
  }

  async saveScores(scoredIdeas: ScoredProductIdea[]) {
    const payload = scoredIdeas
      .filter((idea) => idea.id)
      .map((idea) => ({
        product_idea_id: idea.id!,
        buyer_urgency: idea.score.buyer_urgency,
        existing_purchase_behavior: idea.score.existing_purchase_behavior,
        linkedin_demo_strength: idea.score.linkedin_demo_strength,
        comment_dm_likelihood: idea.score.comment_dm_likelihood,
        actual_tool_gap: idea.score.actual_tool_gap,
        source_code_gap: idea.score.source_code_gap,
        manual_workaround_pain: idea.score.manual_workaround_pain,
        hidden_workflow_specificity: idea.score.hidden_workflow_specificity,
        price_believability: idea.score.price_believability,
        build_speed: idea.score.build_speed,
        total_score: idea.score.total_score,
        score_explanations: (idea.scoreExplanations ?? {}) as Json,
      }));

    if (!payload.length) {
      return;
    }

    const { error } = await this.client.from("product_scores").insert(payload);

    if (error) {
      throw error;
    }
  }

  async saveFinalReport(report: FinalReportDraft, winner: ScoredProductIdea) {
    const finalDecision = report.finalDecision ?? "validate_first";
    if (!winner.id && finalDecision !== "reject_all") {
      throw new Error("Cannot save final report without a persisted product idea id.");
    }

    const canBuildNow =
      finalDecision === "build_now" &&
      (report.dayOneSaleProbability ?? winner.score.total_score) >= DAY_ONE_BUILD_THRESHOLD;
    const persistedWinnerId = canBuildNow ? winner.id : null;

    const { error: reportError } = await this.client.from("final_reports").insert({
      council_run_id: this.councilRunId,
      winner_product_id: persistedWinnerId,
      final_decision: canBuildNow ? "build_now" : finalDecision,
      day_one_sale_probability: report.dayOneSaleProbability ?? winner.score.total_score,
      report_markdown: report.reportMarkdown,
      linkedin_post: report.linkedinPost,
      dm_script: report.dmScript,
      demo_video_script: report.demoVideoScript,
      build_plan: report.buildPlan as Json,
      packaging_checklist: ensureTextArray(report.packagingChecklist),
      pre_sell_pack: (report.preSellPack ?? {}) as Json,
    });

    if (reportError) {
      throw reportError;
    }

    const { error: runError } = await this.client
      .from("council_runs")
      .update({
        winner_product_id: persistedWinnerId,
        status: "completed",
      })
      .eq("id", this.councilRunId);

    if (runError) {
      throw runError;
    }

    if (winner.id) {
      const nextFactoryStatus =
        canBuildNow
          ? "winner"
          : finalDecision === "reject_all"
            ? "rejected"
            : "validating";
      const { error: winnerError } = await this.client
        .from("product_ideas")
        .update({
          factory_status: nextFactoryStatus,
          rejected_reason:
            nextFactoryStatus === "rejected"
              ? "Rejected by Day-One Sale Probability judge."
              : null,
        })
        .eq("id", winner.id);

      if (winnerError) {
        throw winnerError;
      }
    }
  }
}

export async function resetCouncilRunArtifacts(
  client: SupabaseClient<Database>,
  councilRunId: string,
) {
  await client
    .from("council_runs")
    .update({
      winner_product_id: null,
      status: "running",
      error_message: null,
      failed_step: null,
      failed_round: null,
      failed_agent: null,
      failed_provider: null,
      failed_model: null,
      current_round: null,
      current_agent: null,
      current_step: "Preparing council debate",
      current_provider: null,
      current_model: null,
      progress_percent: 0,
      started_at: null,
      completed_at: null,
      failed_at: null,
      debug_trace: null,
    })
    .eq("id", councilRunId);

  await client.from("final_reports").delete().eq("council_run_id", councilRunId);
  await client.from("market_evidence").delete().eq("council_run_id", councilRunId);
  await client.from("debate_rounds").delete().eq("council_run_id", councilRunId);
  await client.from("product_ideas").delete().eq("council_run_id", councilRunId);
}
