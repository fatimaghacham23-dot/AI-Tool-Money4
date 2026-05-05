import type { MarketSearchProvider, MarketSearchResult } from "@/lib/market-search/types";

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

export class WebSearchProvider implements MarketSearchProvider {
  name = "brave-search";

  constructor(private readonly config: { apiKey: string }) {}

  async search(query: string, options: { limit?: number } = {}): Promise<MarketSearchResult[]> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(limit));
    url.searchParams.set("search_lang", "en");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.config.apiKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Market web search failed (${response.status}) for query: ${query}`);
    }

    const body = (await response.json()) as BraveSearchResponse;
    return (body.web?.results ?? [])
      .filter((item) => item.title && item.url)
      .slice(0, limit)
      .map((item) => ({
        title: item.title ?? "Untitled result",
        url: item.url ?? "",
        snippet: item.description ?? "",
        source: this.name,
        query,
        foundAt: new Date().toISOString(),
      }));
  }
}
