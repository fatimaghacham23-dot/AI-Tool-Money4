import crypto from "node:crypto";

import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const DEFAULT_GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference";
const testModel = "openai/gpt-4o-mini";
const testMessages = [
  { role: "system", content: "You are a concise test assistant." },
  { role: "user", content: "Reply with ok." },
];
const safeResponseHeaderNames = [
  "x-github-request-id",
  "x-accepted-github-permissions",
  "www-authenticate",
  "content-type",
];

function normalizeEnvValue(value) {
  return (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

function normalizeBaseURL(value) {
  return (normalizeEnvValue(value) || DEFAULT_GITHUB_MODELS_BASE_URL).replace(/\/+$/g, "");
}

function getSafeTokenDiagnostics(rawValue) {
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

function getSafeResponseHeaders(headers) {
  return safeResponseHeaderNames.reduce((safeHeaders, name) => {
    const value = headers.get(name);
    if (value) {
      safeHeaders[name] = value;
    }
    return safeHeaders;
  }, {});
}

function getHeaderValue(headers, name) {
  if (!headers) {
    return undefined;
  }

  if (typeof headers.get === "function") {
    return headers.get(name) ?? undefined;
  }

  if (typeof headers === "object") {
    const found = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return typeof found?.[1] === "string" ? found[1] : undefined;
  }

  return undefined;
}

function getSafeErrorHeaders(headers) {
  return safeResponseHeaderNames.reduce((safeHeaders, name) => {
    const value = getHeaderValue(headers, name);
    if (value) {
      safeHeaders[name] = value;
    }
    return safeHeaders;
  }, {});
}

function getErrorBodyExcerpt(error) {
  const body = error?.response?.data ?? error?.body ?? error?.error ?? error?.message;

  if (typeof body === "string") {
    return body.slice(0, 500);
  }

  if (typeof body === "object" && body !== null) {
    return JSON.stringify(body).slice(0, 500);
  }

  return undefined;
}

async function runRawFetchTest(token, finalUrl) {
  const started = Date.now();

  try {
    const response = await fetch(finalUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: testModel,
        messages: testMessages,
        temperature: 0,
        max_tokens: 20,
      }),
    });
    const responseBody = await response.text();

    return {
      ok: response.ok,
      latencyMs: Date.now() - started,
      status: response.status,
      statusText: response.statusText,
      bodyExcerpt: responseBody.slice(0, 500),
      headers: getSafeResponseHeaders(response.headers),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runSdkTest(token, baseURL) {
  const started = Date.now();
  const client = new OpenAI({ apiKey: token, baseURL });

  try {
    const response = await client.chat.completions.create({
      model: testModel,
      messages: testMessages,
      temperature: 0,
      max_tokens: 20,
    });

    return {
      ok: true,
      latencyMs: Date.now() - started,
      responseExcerpt: response.choices[0]?.message?.content?.slice(0, 100) ?? "",
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      status: typeof error?.status === "number" ? error.status : undefined,
      statusText:
        typeof error?.response?.statusText === "string"
          ? error.response.statusText
          : typeof error?.statusText === "string"
            ? error.statusText
            : undefined,
      error: error instanceof Error ? error.message : String(error),
      bodyExcerpt: getErrorBodyExcerpt(error),
      headers: getSafeErrorHeaders(error?.headers ?? error?.response?.headers),
    };
  }
}

const token = normalizeEnvValue(process.env.GITHUB_MODELS_TOKEN);
const baseUrl = normalizeBaseURL(process.env.GITHUB_MODELS_BASE_URL);
const finalUrl = `${baseUrl}/chat/completions`;
const envDiagnostics = {
  cwd: process.cwd(),
  pid: process.pid,
  ...getSafeTokenDiagnostics(process.env.GITHUB_MODELS_TOKEN),
  baseUrl,
  finalUrl,
  nodeEnv: process.env.NODE_ENV,
};

console.log("Env diagnostics:");
console.log(JSON.stringify(envDiagnostics, null, 2));

if (!token) {
  console.warn("Missing GITHUB_MODELS_TOKEN. Skipping live GitHub Models test.");
  process.exit(0);
}

console.log("\nRaw fetch result:");
console.log(JSON.stringify(await runRawFetchTest(token, finalUrl), null, 2));

console.log("\nSDK result:");
console.log(JSON.stringify(await runSdkTest(token, baseUrl), null, 2));
