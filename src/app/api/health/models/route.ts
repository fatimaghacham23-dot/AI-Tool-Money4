import { NextResponse } from "next/server";

import {
  getGitHubModelsBaseURL,
  getGitHubModelsChatCompletionsURL,
  getGitHubModelsToken,
  getGitHubModelsTokenDiagnostics,
  hasOpenAIEnv,
} from "@/lib/env";
import { GitHubModelsProvider, ProviderError } from "@/providers/github-models";

export const runtime = "nodejs";

const loadedAt = new Date().toISOString();
const testModel = "openai/gpt-4o-mini";
const testMessages = [
  { role: "system", content: "You are a concise test assistant." },
  { role: "user", content: "Reply with ok." },
] as const;

const safeResponseHeaderNames = [
  "x-github-request-id",
  "x-accepted-github-permissions",
  "www-authenticate",
  "content-type",
] as const;

type SafeResponseHeaderName = (typeof safeResponseHeaderNames)[number];

let hasLoggedEnvDiagnostic = false;

function getSafeResponseHeaders(headers: Headers) {
  return safeResponseHeaderNames.reduce<Partial<Record<SafeResponseHeaderName, string>>>(
    (safeHeaders, name) => {
      const value = headers.get(name);
      if (value) {
        safeHeaders[name] = value;
      }
      return safeHeaders;
    },
    {},
  );
}

async function runSdkTest(token: string, baseUrl: string) {
  const started = Date.now();
  const provider = new GitHubModelsProvider(token, baseUrl);

  try {
    const text = await provider.generateText({
      system: testMessages[0].content,
      prompt: testMessages[1].content,
      model: testModel,
      temperature: 0,
      maxTokens: 20,
    });

    return {
      ok: true,
      latencyMs: Date.now() - started,
      responseExcerpt: text.slice(0, 100),
    };
  } catch (error) {
    const latencyMs = Date.now() - started;

    if (error instanceof ProviderError) {
      return {
        ok: false,
        latencyMs,
        status: error.status,
        statusText: error.statusText,
        error: error.message,
        hint: error.hint,
        bodyExcerpt: error.bodyExcerpt,
        headers: error.headers,
      };
    }

    return {
      ok: false,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runRawFetchTest(token: string, finalUrl: string) {
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

function getPortFromEnvOrRequest(request: Request) {
  const requestPort = new URL(request.url).port;
  return process.env.PORT || process.env.npm_config_port || requestPort || null;
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const token = getGitHubModelsToken();
  const githubConfigured = Boolean(token);
  const tokenDiagnostics = getGitHubModelsTokenDiagnostics();
  const baseUrl = getGitHubModelsBaseURL();
  const finalUrl = getGitHubModelsChatCompletionsURL(baseUrl);
  const cwd = process.cwd();
  const pid = process.pid;
  const port = getPortFromEnvOrRequest(request);

  if (!hasLoggedEnvDiagnostic) {
    console.log("GITHUB_MODELS_ENV_DIAGNOSTIC", {
      cwd,
      pid,
      tokenPresent: tokenDiagnostics.tokenPresent,
      tokenLength: tokenDiagnostics.tokenLength,
      tokenPrefix: tokenDiagnostics.tokenPrefix,
      tokenFingerprint: tokenDiagnostics.tokenFingerprint,
      baseUrl,
    });
    hasLoggedEnvDiagnostic = true;
  }

  const openAIConfigured = hasOpenAIEnv();
  const demoModeFallback = !githubConfigured && !openAIConfigured;
  const githubModelsBase = {
    configured: githubConfigured,
    ...tokenDiagnostics,
    baseUrl,
    finalUrl,
    cwd,
    pid,
    nodeEnv: process.env.NODE_ENV,
    loadedAt,
    port,
    runtime,
    testModel,
  };

  if (!githubConfigured) {
    return jsonNoStore({
      githubModels: {
        ...githubModelsBase,
        ok: false,
        sdkTest: {
          ok: false,
          hint: "GITHUB_MODELS_TOKEN is missing.",
        },
        rawFetchTest: {
          ok: false,
          hint: "GITHUB_MODELS_TOKEN is missing.",
        },
        hint: "GITHUB_MODELS_TOKEN is missing.",
      },
      openAIConfigured,
      demoModeFallback,
    });
  }

  const [sdkTest, rawFetchTest] = await Promise.all([
    runSdkTest(token, baseUrl),
    runRawFetchTest(token, finalUrl),
  ]);

  return jsonNoStore(
    {
      githubModels: {
        ...githubModelsBase,
        ok: sdkTest.ok && rawFetchTest.ok,
        sdkTest,
        rawFetchTest,
      },
      openAIConfigured,
      demoModeFallback,
    },
  );
}
