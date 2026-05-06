import type { MarketSearchProvider, MarketSearchResult } from "@/lib/market-search/types";
import { getOptionalEnv } from "@/lib/env";
import { ExaSearchProvider } from "@/lib/market-search/exa-search";
import { WebSearchProvider } from "@/lib/market-search/web-search";

export type ActiveMarketSearchProvider = "brave" | "exa" | "manual";

export class ManualMarketSearchProvider implements MarketSearchProvider {
  name = "manual-fallback";

  async search(query: string): Promise<MarketSearchResult[]> {
    return [
      {
        title: "Manual market search required",
        url: "manual://market-search-required",
        snippet:
          "No web-search API is configured. Treat this as missing market evidence; do not mark any idea build_now until searched results are available.",
        source: this.name,
        query,
        foundAt: new Date().toISOString(),
      },
    ];
  }
}

export function getMarketSearchProviderDiagnostics(): {
  braveConfigured: boolean;
  exaConfigured: boolean;
  activeProvider: ActiveMarketSearchProvider;
} {
  const braveConfigured = Boolean(getOptionalEnv("BRAVE_SEARCH_API_KEY"));
  const exaConfigured = Boolean(getOptionalEnv("EXA_API_KEY"));

  return {
    braveConfigured,
    exaConfigured,
    activeProvider: braveConfigured ? "brave" : exaConfigured ? "exa" : "manual",
  };
}

export function createMarketSearchProvider(): MarketSearchProvider {
  const diagnostics = getMarketSearchProviderDiagnostics();

  if (diagnostics.activeProvider === "brave") {
    return new WebSearchProvider({
      apiKey: getOptionalEnv("BRAVE_SEARCH_API_KEY"),
    });
  }

  if (diagnostics.activeProvider === "exa") {
    return new ExaSearchProvider({
      apiKey: getOptionalEnv("EXA_API_KEY"),
    });
  }

  return new ManualMarketSearchProvider();
}
