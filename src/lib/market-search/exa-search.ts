import type { MarketSearchProvider, MarketSearchResult } from "@/lib/market-search/types";

type ExaSearchResult = {
  title?: string | null;
  url?: string | null;
  text?: string | null;
  summary?: string | null;
  highlights?: string[] | null;
};

type ExaSearchResponse = {
  results?: ExaSearchResult[];
};

export class ExaSearchProvider implements MarketSearchProvider {
  name = "exa";

  constructor(private readonly config: { apiKey: string }) {}

  async search(query: string, options: { limit?: number } = {}): Promise<MarketSearchResult[]> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: limit,
        contents: {
          highlights: {
            maxCharacters: 500,
          },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const statusText = response.statusText ? ` ${response.statusText}` : "";
      throw new Error(`Exa market search failed with status ${response.status}${statusText}.`);
    }

    const body = (await response.json()) as ExaSearchResponse;
    const foundAt = new Date().toISOString();

    return (body.results ?? [])
      .filter((item) => Boolean(item.url))
      .slice(0, limit)
      .map((item) => ({
        title: normalizeText(item.title) || "Untitled result",
        url: item.url ?? "",
        snippet: getSnippet(item),
        source: "exa",
        query,
        foundAt,
      }));
  }
}

function getSnippet(item: ExaSearchResult) {
  const highlights = Array.isArray(item.highlights)
    ? item.highlights.map(normalizeText).filter(Boolean).join(" ")
    : "";

  return normalizeText(item.summary) || highlights || normalizeText(item.text).slice(0, 500);
}

function normalizeText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
