import crypto from "node:crypto";

export const DEFAULT_GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference";

export function normalizeEnvValue(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

export function getOptionalEnv(name: string) {
  return normalizeEnvValue(process.env[name]);
}

export function getRequiredEnv(name: string) {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getGitHubModelsToken() {
  return getOptionalEnv("GITHUB_MODELS_TOKEN");
}

export function getGitHubModelsBaseURL(baseURL?: string | null) {
  const value =
    normalizeEnvValue(baseURL ?? process.env.GITHUB_MODELS_BASE_URL) ||
    DEFAULT_GITHUB_MODELS_BASE_URL;

  return value.replace(/\/+$/g, "");
}

export function getGitHubModelsChatCompletionsURL(baseURL: string) {
  return `${getGitHubModelsBaseURL(baseURL)}/chat/completions`;
}

export function getGitHubModelsTokenDiagnostics(rawValue = process.env.GITHUB_MODELS_TOKEN) {
  const raw = rawValue ?? "";
  const normalized = normalizeEnvValue(rawValue);
  const trimmed = raw.trim();

  return {
    tokenPresent: Boolean(normalized),
    tokenLength: normalized.length,
    tokenPrefix: normalized.slice(0, 10),
    tokenFingerprint: normalized
      ? crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12)
      : "",
    tokenLooksLikeGithubPat: /^(github_pat_|gh[pousr]_)/.test(normalized),
    hasWhitespace: /\s/.test(raw),
    hasQuotes: /^["']|["']$/.test(trimmed),
  };
}

export function hasSupabaseEnv() {
  return Boolean(
    getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      getOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

export function hasSupabaseServiceEnv() {
  return Boolean(
    getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function hasOpenAIEnv() {
  return Boolean(getOptionalEnv("OPENAI_API_KEY"));
}


export function hasGitHubModelsEnv() {
  return Boolean(getGitHubModelsToken());
}
