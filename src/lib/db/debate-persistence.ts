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
    const { error } = await this.client.from("agent_messages").insert({
      council_run_id: this.councilRunId,
      debate_round_id: message.roundId,
      agent_id: message.agent.id ?? null,
      content: message.content,
    });

    if (error) {
      throw error;
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
          mvp_features: idea.mvpFeatures,
          full_features: idea.fullFeatures,
          pricing_idea: idea.pricingIdea,
          risks: idea.risks,
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
          strength_score: item.strengthScore,
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
        buyer_demand: idea.score.buyer_demand,
        linkedin_virality: idea.score.linkedin_virality,
        source_code_resale_value: idea.score.source_code_resale_value,
        build_speed: idea.score.build_speed,
        demo_quality: idea.score.demo_quality,
        ai_value: idea.score.ai_value,
        customization_potential: idea.score.customization_potential,
        competition_weakness: idea.score.competition_weakness,
        price_potential: idea.score.price_potential,
        ahmad_founder_fit: idea.score.ahmad_founder_fit,
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
    if (!winner.id) {
      throw new Error("Cannot save final report without a persisted winner id.");
    }

    const { error: reportError } = await this.client.from("final_reports").insert({
      council_run_id: this.councilRunId,
      winner_product_id: winner.id,
      report_markdown: report.reportMarkdown,
      linkedin_post: report.linkedinPost,
      dm_script: report.dmScript,
      demo_video_script: report.demoVideoScript,
      build_plan: report.buildPlan as Json,
      packaging_checklist: report.packagingChecklist,
    });

    if (reportError) {
      throw reportError;
    }

    const { error: runError } = await this.client
      .from("council_runs")
      .update({
        winner_product_id: winner.id,
        status: "completed",
      })
      .eq("id", this.councilRunId);

    if (runError) {
      throw runError;
    }

    const { error: winnerError } = await this.client
      .from("product_ideas")
      .update({ factory_status: "winner" })
      .eq("id", winner.id);

    if (winnerError) {
      throw winnerError;
    }
  }
}

export async function resetCouncilRunArtifacts(
  client: SupabaseClient<Database>,
  councilRunId: string,
) {
  await client
    .from("council_runs")
    .update({ winner_product_id: null, status: "draft" })
    .eq("id", councilRunId);

  await client.from("final_reports").delete().eq("council_run_id", councilRunId);
  await client.from("market_evidence").delete().eq("council_run_id", councilRunId);
  await client.from("debate_rounds").delete().eq("council_run_id", councilRunId);
  await client.from("product_ideas").delete().eq("council_run_id", councilRunId);
}
