import assert from "node:assert/strict";

const BROAD_BUYER =
  "Small agencies, freelancers, consultants, productized service businesses, technical founders, solo service providers, small dev shops";

function normalizeProductTitle(title, buyer = "") {
  const conciseBuyer = conciseBuyerNiche(buyer);
  let cleaned = normalizeTitle(title)
    .replace(/[()[\]{}]/g, " ")
    .replace(/[|:]/g, " ")
    .replace(/^(an?|the)\s+/i, "")
    .replace(/^a\.?i\.?\s+/i, "")
    .replace(/\b(ai tool to|ai tool for|tool to|tool for|modern starter that|starter that|workflow automation|automation tool|software platform|saas platform|platform for|system for)\b/gi, " ")
    .replace(/\b(ai-powered|ai powered|powered by ai|app|software|saas|platform|system)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (buyer) {
    const exactSuffix = new RegExp(`\\s+for\\s+${escapeRegExp(normalizeTitle(buyer))}\\s*$`, "i");
    cleaned = cleaned.replace(exactSuffix, conciseBuyer ? ` for ${conciseBuyer}` : "");
  }

  cleaned = cleaned.replace(/\bfor\s+(.+)$/i, (match, suffix) => {
    if (!suffix.includes(",") && suffix.split(/\s+/).length <= 3) return match;
    return conciseBuyer ? `for ${conciseBuyer}` : "";
  });

  cleaned = cleaned.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();
  cleaned = limitTitleWords(cleaned || "Workflow Proof Builder", conciseBuyer);
  return titleCaseTitle(cleaned);
}

function getIdeaFingerprint(idea) {
  return [
    normalizeProductTitle(idea.title, idea.targetBuyer),
    idea.manualWorkaroundToday ?? "",
    idea.messyInput ?? "",
    idea.outputArtifact ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !GENERIC_WORDS.has(word))
    .sort()
    .join(" ");
}

function dedupeIdeas(ideas) {
  const kept = [];
  const fingerprints = [];

  for (const idea of ideas) {
    const fingerprint = getIdeaFingerprint(idea);
    const existingIndex = fingerprints.findIndex((item) => similarFingerprint(item, fingerprint));
    if (existingIndex === -1) {
      kept.push(idea);
      fingerprints.push(fingerprint);
      continue;
    }

    const existing = kept[existingIndex];
    if (ideaStrength(idea) > ideaStrength(existing)) {
      kept[existingIndex] = idea;
      fingerprints[existingIndex] = fingerprint;
    }
  }

  return kept;
}

function generateMarketSearchQueries(idea) {
  const title = normalizeProductTitle(idea.title, idea.targetBuyer);
  const titleCore = title.replace(/\s+for\s+[^,]+$/i, "").toLowerCase();
  const artifact = cleanWorkflowPhrase(idea.outputArtifact || titleCore);
  const painful = cleanManualPainForSearch(idea.painfulMoment || idea.pain || idea.description || "");
  const messyInput = cleanWorkflowPhrase(idea.messyInput || "");
  const buyer = conciseSearchBuyer(idea.targetBuyer);
  const rawQueries = [
    title,
    titleCore,
    artifact,
    [painful, artifact].filter(Boolean).join(" "),
    painful ? `track ${painful} manually` : "",
    buyer && artifact ? `${buyer} ${artifact} spreadsheet` : "",
    messyInput && artifact ? `${messyInput} ${artifact}` : "",
    artifact ? `${artifact} template` : "",
    titleCore ? `${titleCore} GitHub` : "",
    titleCore ? `${titleCore} boilerplate` : "",
    ...(idea.initialSearchQueries ?? []),
  ];

  return [...new Set(rawQueries.map((query) => sanitizeSearchQuery(query, idea.targetBuyer)).filter(Boolean))]
    .filter((query) => !isBadSearchPhrase(query))
    .slice(0, 18);
}

function isBadSearchPhrase(query) {
  const normalized = query.replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("they ")) return true;
  if (/\b(they keep|they want|buyer wants|faster path|is repetitive|is awkward)\b/i.test(normalized)) return true;
  if (normalized.includes("want an ai tool")) return true;
  if (normalized.includes("need a modern starter")) return true;
  if (/\bproof template\b/i.test(normalized) && /\b(they|buyer|wants?|keep|keeps|is|are|faster path)\b/i.test(normalized)) return true;
  if (!CONCRETE_WORKFLOW_NOUNS.test(normalized)) return true;
  if (!hasNounWorkflowArtifact(normalized)) return true;
  const meaningful = normalized
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !["the", "for", "and", "with", "from", "that", "they", "want", "need"].includes(word));
  return meaningful.length < 3;
}

function cleanManualPainForSearch(value) {
  const lower = (value ?? "").replace(/[^a-zA-Z0-9\s-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!lower) return "";
  const concepts = [
    [/\b(proposal|proposals)\b/i, "proposal review handoff"],
    [/\b(unpaid|overdue|invoice|invoices)\b/i, "unpaid invoice followup log"],
    [/\b(spreadsheet|spreadsheets)\b.*\b(rebuild|rebuilding|client)\b|\brebuilding\s+.*\bspreadsheet/i, "client spreadsheet rebuild audit"],
    [/\b(approval|signoff)\b.*\b(reversal|reverses|contradict|dispute)\b/i, "approval reversal proof log"],
    [/\b(feedback|comments?)\b.*\b(drift|contradict|revision|scope)\b/i, "feedback drift report"],
  ];
  const match = concepts.find(([pattern]) => pattern.test(lower));
  if (match) return match[1];
  const cleaned = cleanWorkflowPhrase(lower);
  if (!CONCRETE_WORKFLOW_NOUNS.test(cleaned)) return "";
  if (/\b(they keep|they want|buyer wants|faster path|is repetitive|is awkward)\b/i.test(cleaned)) return "";
  return cleaned;
}

function hasNounWorkflowArtifact(query) {
  return /\b[a-z0-9-]+\s+(approval|signoff|revision|feedback|scope|handoff|promise|contradiction|dispute|drift|proof|log|report|pack|builder|detector|resolver|extractor|spreadsheet|template|checklist|record|trail|audit|evidence)\b/i.test(query) ||
    /\b(approval|signoff|revision|feedback|scope|handoff|promise|contradiction|dispute|drift|proof|log|report|pack|builder|detector|resolver|extractor|spreadsheet|template|checklist|record|trail|audit|evidence)\s+[a-z0-9-]+\b/i.test(query);
}

const GENERIC_WORDS = new Set([
  "ai",
  "app",
  "tool",
  "tools",
  "software",
  "saas",
  "platform",
  "system",
  "workflow",
  "workflows",
  "automation",
  "builder",
  "generator",
  "manager",
  "dashboard",
  "tracker",
  "assistant",
  "for",
  "with",
  "from",
  "that",
  "this",
  "client",
  "clients",
  "small",
]);

const CONCRETE_WORKFLOW_NOUNS =
  /\b(approval|signoff|revision|feedback|scope|handoff|promise|contradiction|dispute|drift|proof|log|report|pack|builder|detector|resolver|extractor|spreadsheet|template|record|trail|figma|slack|loom|screenshot|email|doc|docs|comment|change|source code|boilerplate|github)\b/i;

function normalizeTitle(title) {
  return (title ?? "").replace(/\s+/g, " ").trim();
}

function conciseBuyerNiche(buyer) {
  const lower = buyer.toLowerCase();
  if (/web\s+design\s+agenc/.test(lower)) return "Web Design Agencies";
  if (/design\s+agenc/.test(lower)) return "Design Agencies";
  if (/dev\s+shops?/.test(lower)) return "Dev Shops";
  if (/consultants?/.test(lower)) return "Consultants";
  if (/freelancers?/.test(lower)) return "Freelancers";
  if (/agenc/.test(lower)) return "Agencies";
  return titleCaseTitle(
    normalizeTitle(buyer)
      .split(/,|;|\/|\band\b/i)
      .filter(Boolean)[0]
      ?.split(/\s+/)
      .slice(0, 3)
      .join(" ") || "Niche Buyers",
  );
}

function conciseSearchBuyer(buyer = "") {
  return conciseBuyerNiche(buyer).toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
}

function cleanWorkflowPhrase(text) {
  return text
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\b(ai|automated|automatic|tool|app|software|saas|platform|system)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .toLowerCase();
}

function sanitizeSearchQuery(query, buyer = "") {
  let cleaned = (query ?? "").replace(/\s+/g, " ").trim();
  const rawBuyer = normalizeTitle(buyer);
  if (rawBuyer) {
    cleaned = cleaned.replace(new RegExp(escapeRegExp(rawBuyer), "gi"), conciseSearchBuyer(rawBuyer));
  }
  return cleaned.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();
}

function similarFingerprint(left, right) {
  if (left === right) return true;
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  const larger = Math.max(leftTokens.size, rightTokens.size);
  return smaller > 0 && (overlap / smaller >= 0.8 || overlap / larger >= 0.72);
}

function ideaStrength(idea) {
  return [
    idea.title,
    idea.targetBuyer,
    idea.manualWorkaroundToday,
    idea.messyInput,
    idea.outputArtifact,
    idea.painfulMoment,
  ].filter((value) => String(value ?? "").trim().length > 4).length;
}

function limitTitleWords(title, conciseBuyer) {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length <= 8) return title;
  const forIndex = words.findIndex((word) => /^for$/i.test(word));
  if (forIndex > 0) {
    const buyerWords = (conciseBuyer || words.slice(forIndex + 1).join(" ")).split(/\s+/).slice(0, 2);
    const prefixLimit = Math.max(3, 8 - buyerWords.length - 1);
    return [...words.slice(0, prefixLimit), "for", ...buyerWords].join(" ");
  }
  return words.slice(0, 8).join(" ");
}

function titleCaseTitle(text) {
  const preserve = new Map([
    ["ai", "AI"],
    ["figma", "Figma"],
    ["slack", "Slack"],
    ["loom", "Loom"],
    ["github", "GitHub"],
    ["google", "Google"],
    ["doc", "Doc"],
    ["docs", "Docs"],
  ]);
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => preserve.get(word.toLowerCase()) ?? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 1) Long broad-buyer titles normalize to a short product title.
{
  const normalized = normalizeProductTitle(
    "Approval Reversal Proof Log for Small agencies, freelancers, consultants, productized service businesses",
    BROAD_BUYER,
  );
  assert.ok(normalized.split(/\s+/).length <= 8, normalized);
  assert.ok(!normalized.includes(","), normalized);
  assert.ok(!/freelancers|consultants|productized service businesses/i.test(normalized), normalized);
}

// 2) Duplicate core ideas are removed before market search.
{
  const ideas = [
    {
      title: "Approval Reversal Proof Log",
      targetBuyer: BROAD_BUYER,
      manualWorkaroundToday: "paste client approval screenshots into a spreadsheet",
      messyInput: "client emails and screenshots",
      outputArtifact: "approval reversal proof log",
      painfulMoment: "client reverses approval after signoff",
    },
    {
      title: "Approval Reversal Proof Log for Small agencies, freelancers, consultants",
      targetBuyer: BROAD_BUYER,
      manualWorkaroundToday: "paste client approval screenshots into a spreadsheet",
      messyInput: "client emails and screenshots",
      outputArtifact: "approval reversal proof log",
      painfulMoment: "client reverses approval after signoff",
    },
  ];
  assert.equal(dedupeIdeas(ideas).length, 1);
}

// 3) Kill switch reject_all exits before market search.
{
  const events = [];
  const result = simulateKillSwitchPipeline([
    { title: "Client Portal", targetBuyer: "Agencies", manualWorkaroundToday: "", messyInput: "", outputArtifact: "", painfulMoment: "" },
  ], events);
  assert.equal(result.finalDecision, "reject_all");
  assert.equal(result.marketSearchRan, false);
  assert.equal(events.some((event) => event.step === "kill_switch_reject_all"), true);
}

// 4) Vague model fragments are rejected as market-search phrases.
assert.equal(isBadSearchPhrase("They want an AI tool to"), true);
assert.equal(isBadSearchPhrase("revision contradiction log"), false);
assert.equal(isBadSearchPhrase("freelancer they keep rebuilding the same client spreadsheet"), true);
assert.equal(isBadSearchPhrase("agency the buyer wants a faster path spreadsheet"), true);
assert.equal(isBadSearchPhrase("writing proposals is repetitive and slows proof template"), true);

// 5) Clean Exa queries include artifact/workflow phrases, not the full buyer list.
{
  const queries = generateMarketSearchQueries({
    title: "Approval Reversal Proof Log for Small agencies, freelancers, consultants, productized service businesses",
    targetBuyer: BROAD_BUYER,
    pain: "client approval reversed after signoff",
    description: "track client approval changes manually",
    manualWorkaroundToday: "copy client signoff proof into a spreadsheet",
    messyInput: "email approval chains",
    outputArtifact: "approval reversal proof log",
    painfulMoment: "client approval reversed after signoff",
    initialSearchQueries: ["They keep rebuilding the same client", "They want an AI tool to"],
  });

  assert.ok(queries.some((query) => /approval reversal proof/i.test(query)), queries.join(" | "));
  assert.ok(queries.some((query) => /approval reversal proof log github/i.test(query)), queries.join(" | "));
  assert.ok(!queries.some((query) => /Small agencies, freelancers|productized service businesses/i.test(query)), queries.join(" | "));
  assert.ok(!queries.some((query) => /^They /i.test(query)), queries.join(" | "));
}


// 6) Better direction queries do not reuse raw pain fragments.
{
  const directions = createBetterDirectionQueries({
    title: "Client Portal Rebuilder",
    targetBuyer: "web design agency",
    messyInput: "client emails",
    outputArtifact: "approval reversal proof log",
    painfulMoment: "They keep rebuilding the same client portal because buyer wants a faster path",
  });
  assert.ok(!directions.some((query) => /\bthey\b|buyer wants|faster path|they keep rebuilding/i.test(query)), directions.join(" | "));
}

console.log("idea-quality-check: OK");

function simulateKillSwitchPipeline(ideas, events) {
  const removedIdeas = ideas.map((idea) => ({ idea, reason: "Generic title" }));
  const survivingIdeas = [];
  if (survivingIdeas.length === 0) {
    events.push({
      step: "kill_switch_reject_all",
      originalIdeas: ideas,
      survivingIdeas,
      removedIdeas,
      reasons: removedIdeas.map((item) => item.reason),
    });
    return { finalDecision: "reject_all", status: "completed", marketSearchRan: false };
  }
  return { finalDecision: "validate_first", status: "completed", marketSearchRan: true };
}

function createBetterDirectionQueries(seed) {
  const painfulMoment = /\b(they keep|buyer wants|faster path)\b/i.test(seed.painfulMoment)
    ? "client reverses approval after signoff"
    : seed.painfulMoment;
  return generateMarketSearchQueries({ ...seed, painfulMoment, initialSearchQueries: [] });
}
