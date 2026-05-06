export type HiddenWorkflowIdeaFields = {
  title: string;
  targetBuyer?: string;
  exactBuyer?: string;
  manualWorkaroundToday?: string;
  messyInput?: string;
  outputArtifact?: string;
  painfulMoment?: string;
  broadSaasNotEnoughReason?: string;
  beforeAfterDemo?: string;
  sourceCodeOwnershipAngle?: string;
  whyBuySourceCode?: string;
  initialSearchQueries?: string[];
  buildComplexity?: string;
};


export const REQUIRED_WORKFLOW_FIELDS = [
  "title",
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
] as const;

export type RequiredWorkflowField = (typeof REQUIRED_WORKFLOW_FIELDS)[number];

export type WorkflowFieldIssue = {
  field: RequiredWorkflowField;
  reason: string;
};

const GENERIC_FILLER_REGEX =
  /\b(helps?\s+(agencies|teams|businesses|buyers)\s+save\s+time|save\s+time|streamline\s+(workflows?|operations?|processes?)|automate\s+(workflows?|tasks?|processes?)|customize\s+and\s+resell\s+immediately|polished\s+client-facing\s+product)\b/i;

const CONCRETE_INPUT_REGEX =
  /\b(slack|email|gmail|outlook|screenshot|screenshots|loom|figma|doc|docs|google\s+doc|notion|spreadsheet|sheet|csv|pdf|contract|invoice|proposal|thread|transcript|meeting\s+notes|comments?|change\s+request|signoff|approval)\b/i;

const CONCRETE_ARTIFACT_REGEX =
  /\b(pack|proof|log|report|artifact|checklist|brief|summary|response|reply|template|audit|trail|evidence|ledger|packet|handoff|timeline|matrix|record|extract)\b/i;

const CONCRETE_EVENT_REGEX =
  /\b(client|customer|prospect|approv|signoff|change|request|scope|invoice|payment|overdue|dispute|revision|feedback|contract|clause|handoff|deadline|meeting|call|thread|message|screenshot)\b/i;

const BUILD_COMPLEXITIES = new Set(["low", "medium", "high"]);

export function validateRequiredWorkflowFields(idea: HiddenWorkflowIdeaFields) {
  const issues: WorkflowFieldIssue[] = [];
  const read = (field: RequiredWorkflowField) => workflowFieldValue(idea, field);

  for (const field of REQUIRED_WORKFLOW_FIELDS) {
    const value = read(field);
    if (field === "initialSearchQueries") {
      const queries = Array.isArray(idea.initialSearchQueries) ? idea.initialSearchQueries : [];
      if (queries.length < 5) {
        issues.push({ field, reason: "missing at least 5 concrete search queries" });
      } else if (queries.some((query) => GENERIC_FILLER_REGEX.test(query) || !CONCRETE_EVENT_REGEX.test(query))) {
        issues.push({ field, reason: "queries must name concrete workflow artifacts or events" });
      }
      continue;
    }

    if (field === "buildComplexity") {
      if (!BUILD_COMPLEXITIES.has(value.toLowerCase())) {
        issues.push({ field, reason: "missing low, medium, or high build complexity" });
      }
      continue;
    }

    if (!value) {
      issues.push({ field, reason: "empty" });
      continue;
    }

    if (GENERIC_FILLER_REGEX.test(value)) {
      issues.push({ field, reason: "generic filler" });
      continue;
    }

    const minWords = workflowFieldMinWords(field);
    if (countWords(value) < minWords) {
      issues.push({ field, reason: `under ${minWords} words` });
      continue;
    }

    if (field === "title" && isGenericProductTitle(value)) {
      issues.push({ field, reason: "generic product title" });
      continue;
    }

    if (["manualWorkaroundToday", "messyInput"].includes(field) && !CONCRETE_INPUT_REGEX.test(value)) {
      issues.push({ field, reason: "does not mention a concrete input" });
      continue;
    }

    if (["outputArtifact", "beforeAfterDemo"].includes(field) && !CONCRETE_ARTIFACT_REGEX.test(value)) {
      issues.push({ field, reason: "does not mention a concrete artifact" });
      continue;
    }

    if (["painfulMoment", "broadSaasNotEnoughReason"].includes(field) && !CONCRETE_EVENT_REGEX.test(value)) {
      issues.push({ field, reason: "does not mention a concrete event" });
      continue;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    missingFields: issues.map((issue) => issue.field),
  };
}

export function workflowFieldValue(idea: HiddenWorkflowIdeaFields, field: RequiredWorkflowField) {
  if (field === "exactBuyer") return normalizeTitle(idea.exactBuyer ?? idea.targetBuyer ?? "");
  if (field === "sourceCodeOwnershipAngle") {
    return normalizeTitle(idea.sourceCodeOwnershipAngle ?? idea.whyBuySourceCode ?? "");
  }
  if (field === "initialSearchQueries") return (idea.initialSearchQueries ?? []).join(" | ");
  return normalizeTitle(String(idea[field as keyof HiddenWorkflowIdeaFields] ?? ""));
}

function workflowFieldMinWords(field: RequiredWorkflowField) {
  switch (field) {
    case "title":
      return 1;
    case "exactBuyer":
      return 3;
    case "messyInput":
      return 5;
    case "outputArtifact":
      return 4;
    case "buildComplexity":
    case "initialSearchQueries":
      return 1;
    default:
      return 8;
  }
}

const GENERIC_TITLE_TERMS = [
  "tracker",
  "manager",
  "dashboard",
  "portal",
  "generator",
  "analyzer",
  "automation tool",
  "system",
  "assistant",
  "platform",
  "crm",
].map((term) => term.toLowerCase());

const TITLE_GENERIC_PHRASES = [
  "ai tool to",
  "ai tool for",
  "tool to",
  "tool for",
  "modern starter that",
  "starter that",
  "they want",
  "they need",
  "workflow automation",
  "automation tool",
  "software platform",
  "saas platform",
  "platform for",
  "system for",
].map((term) => term.toLowerCase());

const FINGERPRINT_GENERIC_WORDS = new Set([
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
  "automated",
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
  "they",
  "their",
  "client",
  "clients",
  "small",
  "niche",
]);

const GENERIC_CATEGORY_REGEX =
  /(crm|project management|task management|client portal|approval workflow|feedback tracker|decision log|risk tracker|communication tracker|analytics dashboard|workflow automation)/i;

function normalizeTitle(title: string) {
  return (title ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeProductTitle(title: string, buyer?: string) {
  const conciseBuyer = conciseBuyerNiche(buyer);
  let cleaned = normalizeTitle(title)
    .replace(/[()[\]{}]/g, " ")
    .replace(/[|:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const phrase of TITLE_GENERIC_PHRASES) {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"), " ");
  }

  cleaned = cleaned
    .replace(/^(an?|the)\s+/i, "")
    .replace(/^a\.?i\.?\s+/i, "")
    .replace(/\b(ai-powered|ai powered|powered by ai)\b/gi, "")
    .replace(/\b(app|software|saas|platform|system)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (buyer) {
    cleaned = removeRawBuyerSuffix(cleaned, buyer, conciseBuyer);
  }

  cleaned = collapseCommaSeparatedBuyerSuffix(cleaned, conciseBuyer);
  cleaned = cleaned.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\s+\b(for|to|with|and|of)\b\s*$/i, "").trim();

  if (!cleaned) {
    cleaned = conciseBuyer ? `Workflow Proof for ${conciseBuyer}` : "Workflow Proof Builder";
  }

  cleaned = limitTitleWords(cleaned, conciseBuyer);
  return titleCaseTitle(cleaned);
}

export function hasBadProductTitleQuality(title: string, buyer?: string) {
  const normalized = normalizeTitle(title);
  const wordCount = countWords(normalized);
  return wordCount > 8 || hasCommaSeparatedBuyerList(normalized, buyer);
}

export function getIdeaFingerprint(idea: HiddenWorkflowIdeaFields) {
  const title = normalizeProductTitle(idea.title, idea.targetBuyer);
  const parts = [
    title,
    idea.manualWorkaroundToday ?? "",
    idea.messyInput ?? "",
    idea.outputArtifact ?? "",
  ];
  return fingerprintTokens(parts.join(" ")).join(" ");
}

export function areSimilarIdeaFingerprints(left: string, right: string) {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) {
    return false;
  }

  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  const larger = Math.max(leftTokens.size, rightTokens.size);

  return overlap / smaller >= 0.8 || overlap / larger >= 0.72;
}

export function chooseStrongerIdea<T extends HiddenWorkflowIdeaFields>(left: T, right: T) {
  return ideaStrengthScore(right) > ideaStrengthScore(left) ? right : left;
}

export function isGenericProductTitle(title: string) {
  const normalized = normalizeTitle(title).toLowerCase();
  if (!normalized) {
    return true;
  }

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const isVeryShort = tokens.length <= 3;

  const containsGenericTerm = GENERIC_TITLE_TERMS.some((term) => normalized.includes(term));
  const matchesCategory = GENERIC_CATEGORY_REGEX.test(normalized);

  const lacksContextSignals = !/(for\s+|\b(agency|agencies|studio|shops?|teams?|firms?|law|legal|accounting|accountants|web|branding|design|dev|construction|real estate|recruit|sales)\b)/i.test(
    normalized,
  );

  if (matchesCategory) {
    return true;
  }

  if (isVeryShort && containsGenericTerm) {
    return true;
  }

  if (containsGenericTerm && lacksContextSignals) {
    return true;
  }

  return false;
}

export function hasHiddenWorkflowSpecificity(idea: HiddenWorkflowIdeaFields) {
  return validateRequiredWorkflowFields(idea).valid;
}

export function rewriteGenericIdeaToWorkflowGap(
  idea: HiddenWorkflowIdeaFields,
  buyerContext: string,
): HiddenWorkflowIdeaFields {
  const normalizedBuyer = (buyerContext || idea.targetBuyer || "").trim();
  const workflowObject = idea.outputArtifact?.trim() || "Proof Log";
  const painfulEvent = idea.painfulMoment?.trim() || "Approval Reversal";

  const baseBuyer = normalizedBuyer || "Niche teams";

  const rewrittenTitle = normalizeProductTitle(
    `${painfulEvent} ${workflowObject} for ${baseBuyer}`,
    baseBuyer,
  );

  return {
    ...idea,
    title: rewrittenTitle,
    targetBuyer: idea.targetBuyer || normalizedBuyer,
  };
}

function removeRawBuyerSuffix(title: string, buyer: string, conciseBuyer: string) {
  const rawBuyer = normalizeTitle(buyer);
  if (!rawBuyer) {
    return title;
  }

  const exactSuffix = new RegExp(`\\s+for\\s+${escapeRegExp(rawBuyer)}\\s*$`, "i");
  if (exactSuffix.test(title)) {
    return title.replace(exactSuffix, conciseBuyer ? ` for ${conciseBuyer}` : "").trim();
  }

  if (title.toLowerCase().includes(rawBuyer.toLowerCase())) {
    return title.replace(new RegExp(escapeRegExp(rawBuyer), "gi"), conciseBuyer).trim();
  }

  return title;
}

function collapseCommaSeparatedBuyerSuffix(title: string, conciseBuyer: string) {
  const match = title.match(/\bfor\s+(.+)$/i);
  if (!match) {
    return title;
  }

  const suffix = match[1].trim();
  if (!suffix.includes(",") && countWords(suffix) <= 3) {
    return title;
  }

  const prefix = title.slice(0, match.index).trim();
  const suffixBuyer = conciseBuyer || conciseBuyerNiche(suffix);
  return suffixBuyer ? `${prefix} for ${suffixBuyer}`.trim() : prefix;
}

function limitTitleWords(title: string, conciseBuyer: string) {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length <= 8) {
    return title;
  }

  const forIndex = words.findIndex((word) => /^for$/i.test(word));
  if (forIndex > 0) {
    const buyerWords = (conciseBuyer || words.slice(forIndex + 1).join(" "))
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    const prefixLimit = Math.max(3, 8 - buyerWords.length - 1);
    return [...words.slice(0, prefixLimit), "for", ...buyerWords].join(" ");
  }

  return words.slice(0, 8).join(" ");
}

function conciseBuyerNiche(buyer?: string) {
  const raw = normalizeTitle(buyer ?? "");
  if (!raw) {
    return "";
  }

  const lower = raw.toLowerCase();
  const known: Array<[RegExp, string]> = [
    [/\bweb\s+design\s+agenc/i, "Web Design Agencies"],
    [/\bdesign\s+agenc/i, "Design Agencies"],
    [/\bbranding\s+studio/i, "Branding Studios"],
    [/\bdev\s+shops?\b|\bdevelopment\s+shops?\b/i, "Dev Shops"],
    [/\btechnical\s+founders?\b/i, "Technical Founders"],
    [/\bproductized\s+service\b/i, "Productized Services"],
    [/\bsolo\s+service\s+providers?\b/i, "Service Providers"],
    [/\bconsultants?\b/i, "Consultants"],
    [/\bfreelancers?\b/i, "Freelancers"],
    [/\bagenc(?:y|ies)\b/i, "Agencies"],
    [/\bstudios?\b/i, "Studios"],
  ];

  const match = known.find(([pattern]) => pattern.test(lower));
  if (match) {
    return match[1];
  }

  const firstSegment = raw
    .split(/,|;|\/|\band\b/i)
    .map((segment) => normalizeTitle(segment))
    .find(Boolean);

  if (!firstSegment) {
    return "Niche Buyers";
  }

  return titleCaseTitle(firstSegment.split(/\s+/).slice(0, 3).join(" "));
}

function hasCommaSeparatedBuyerList(title: string, buyer?: string) {
  if (/\bfor\s+[^.]*,\s*[^.]+/i.test(title)) {
    return true;
  }

  const rawBuyer = normalizeTitle(buyer ?? "");
  return Boolean(rawBuyer.includes(",") && title.toLowerCase().includes(rawBuyer.toLowerCase()));
}

function fingerprintTokens(text: string) {
  return normalizeTitle(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !FINGERPRINT_GENERIC_WORDS.has(token))
    .sort();
}

function ideaStrengthScore(idea: HiddenWorkflowIdeaFields) {
  const title = normalizeProductTitle(idea.title, idea.targetBuyer);
  const titleWords = countWords(title);
  let score = 0;

  if (titleWords >= 3 && titleWords <= 8) score += 3;
  if (!hasBadProductTitleQuality(idea.title, idea.targetBuyer)) score += 2;
  if (!isGenericProductTitle(title)) score += 2;
  if ((idea.targetBuyer ?? "").trim()) score += 1;
  if ((idea.manualWorkaroundToday ?? "").trim().length >= 10) score += 2;
  if ((idea.messyInput ?? "").trim().length >= 4) score += 2;
  if ((idea.outputArtifact ?? "").trim().length >= 4) score += 2;
  if ((idea.painfulMoment ?? "").trim().length >= 6) score += 2;

  return score;
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function titleCaseTitle(text: string) {
  const preserve = new Map([
    ["ai", "AI"],
    ["api", "API"],
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
    .map((word) => {
      const lower = word.toLowerCase();
      return preserve.get(lower) ?? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
