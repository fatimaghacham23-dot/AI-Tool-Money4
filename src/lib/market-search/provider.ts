import type { MarketSearchProvider, MarketSearchResult } from "@/lib/market-search/types";
import { WebSearchProvider } from "@/lib/market-search/web-search";

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

export function createMarketSearchProvider(): MarketSearchProvider {
  if (process.env.BRAVE_SEARCH_API_KEY) {
    return new WebSearchProvider({
      apiKey: process.env.BRAVE_SEARCH_API_KEY,
    });
  }

  return new ManualMarketSearchProvider();
}
