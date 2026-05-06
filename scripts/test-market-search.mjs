import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const testQuery = "AI scope creep tracker software";

function normalizeEnvValue(value) {
  return (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

function getActiveProvider() {
  if (normalizeEnvValue(process.env.BRAVE_SEARCH_API_KEY)) {
    return "brave";
  }

  if (normalizeEnvValue(process.env.EXA_API_KEY)) {
    return "exa";
  }

  return "manual";
}

async function searchBrave(query, limit = 5) {
  const apiKey = normalizeEnvValue(process.env.BRAVE_SEARCH_API_KEY);
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));
  url.searchParams.set("search_lang", "en");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`Brave market search failed with status ${response.status}${statusText}.`);
  }

  const body = await response.json();
  return (body.web?.results ?? [])
    .filter((item) => item.title && item.url)
    .slice(0, limit)
    .map((item) => ({
      title: item.title ?? "Untitled result",
      url: item.url ?? "",
      snippet: normalizeText(item.description),
    }));
}

async function searchExa(query, limit = 5) {
  const apiKey = normalizeEnvValue(process.env.EXA_API_KEY);
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
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
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`Exa market search failed with status ${response.status}${statusText}.`);
  }

  const body = await response.json();
  return (body.results ?? [])
    .filter((item) => item.url)
    .slice(0, limit)
    .map((item) => ({
      title: normalizeText(item.title) || "Untitled result",
      url: item.url ?? "",
      snippet: getExaSnippet(item),
    }));
}

function getManualResult(query) {
  return [
    {
      title: "Manual market search required",
      url: "manual://market-search-required",
      snippet:
        "No web-search API is configured. Treat this as missing market evidence; do not mark any idea build_now until searched results are available.",
      query,
    },
  ];
}

function getExaSnippet(item) {
  const highlights = Array.isArray(item.highlights)
    ? item.highlights.map(normalizeText).filter(Boolean).join(" ")
    : "";

  return normalizeText(item.summary) || highlights || normalizeText(item.text).slice(0, 500);
}

function normalizeText(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function printResults(provider, results) {
  console.log(`Active provider: ${provider}`);
  console.log(`Result count: ${results.length}`);

  for (const [index, result] of results.slice(0, 3).entries()) {
    console.log(`\n${index + 1}. ${result.title}`);
    console.log(result.url);
    console.log(result.snippet ? result.snippet.slice(0, 240) : "(no snippet)");
  }
}

const activeProvider = getActiveProvider();

try {
  const results =
    activeProvider === "brave"
      ? await searchBrave(testQuery)
      : activeProvider === "exa"
        ? await searchExa(testQuery)
        : getManualResult(testQuery);

  printResults(activeProvider, results);
} catch (error) {
  console.log(`Active provider: ${activeProvider}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
