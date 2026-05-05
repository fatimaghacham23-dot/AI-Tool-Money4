import OpenAI from "openai";

import { getGitHubModelsBaseURL, normalizeEnvValue } from "@/lib/env";
import { parseJSONFromText } from "@/providers/json";
import type { AIProvider, GenerateJSONOptions, GenerateTextOptions } from "@/providers/types";

const SAFE_RESPONSE_HEADER_NAMES = [
  "x-github-request-id",
  "x-accepted-github-permissions",
  "www-authenticate",
  "content-type",
] as const;

export class ProviderError extends Error {
  provider: string;
  model?: string;
  status?: number;
  statusText?: string;
  code?: string;
  type?: string;
  baseURL?: string;
  bodyExcerpt?: string;
  hint?: string;
  headers?: Partial<Record<(typeof SAFE_RESPONSE_HEADER_NAMES)[number], string>>;

  constructor(message: string, init: Omit<ProviderError, "name" | "message" | "stack">) {
    super(message);
    this.name = "ProviderError";
    this.provider = init.provider;
    this.model = init.model;
    this.status = init.status;
    this.statusText = init.statusText;
    this.code = init.code;
    this.type = init.type;
    this.baseURL = init.baseURL;
    this.bodyExcerpt = init.bodyExcerpt;
    this.hint = init.hint;
    this.headers = init.headers;
  }
}

function hasJsonInstruction(text: unknown) {
  return typeof text === "string" && text.toLowerCase().includes("json");
}

const JSON_ONLY_SYSTEM_INSTRUCTION =
  "You must respond with valid JSON only. Do not include markdown, prose, comments, or trailing commas.";

function buildJSONMessages(options: { system: string; prompt: string }) {
  const messages = [
    { role: "system" as const, content: options.system },
    { role: "user" as const, content: options.prompt },
  ];

  const hasInstruction = messages.some((message) => hasJsonInstruction(message.content));
  if (hasInstruction) {
    return { messages, jsonInstructionInjected: false };
  }

  return {
    messages: [{ role: "system" as const, content: JSON_ONLY_SYSTEM_INSTRUCTION }, ...messages],
    jsonInstructionInjected: true,
  };
}

function isMissingJsonWordError(error: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyError = error as any;
  const status = typeof anyError?.status === "number" ? anyError.status : undefined;
  if (status !== 400) {
    return false;
  }

  const bodyExcerpt = getErrorBodyExcerpt(error);
  if (!bodyExcerpt) {
    return false;
  }

  const normalized = bodyExcerpt.toLowerCase();
  return (
    normalized.includes("messages") &&
    normalized.includes("must contain") &&
    normalized.includes("json") &&
    normalized.includes("response_format")
  );
}

function getHeaderValue(headers: unknown, name: string) {
  if (!headers) {
    return undefined;
  }

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }

  if (typeof headers === "object") {
    const headerEntries = Object.entries(headers as Record<string, unknown>);
    const found = headerEntries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    const value = found?.[1];
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

function getSafeResponseHeaders(headers: unknown) {
  return SAFE_RESPONSE_HEADER_NAMES.reduce<
    Partial<Record<(typeof SAFE_RESPONSE_HEADER_NAMES)[number], string>>
  >((safeHeaders, name) => {
    const value = getHeaderValue(headers, name);
    if (value) {
      safeHeaders[name] = value;
    }
    return safeHeaders;
  }, {});
}

function getErrorBodyExcerpt(error: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyError = error as any;
  const body =
    anyError?.response?.data ??
    anyError?.body ??
    anyError?.error ??
    anyError?.message;

  if (typeof body === "string") {
    return body.slice(0, 800);
  }

  if (typeof body === "object" && body !== null) {
    return JSON.stringify(body).slice(0, 800);
  }

  return undefined;
}

function toProviderError(error: unknown, model: string, baseURL: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyError = error as any;
  const status = typeof anyError?.status === "number" ? anyError.status : undefined;
  const statusText =
    typeof anyError?.response?.statusText === "string"
      ? anyError.response.statusText
      : typeof anyError?.statusText === "string"
        ? anyError.statusText
        : undefined;
  const headers = getSafeResponseHeaders(anyError?.headers ?? anyError?.response?.headers);

  return new ProviderError(
    status ? `${status} GitHub Models request failed` : "GitHub Models request failed",
    {
      provider: "github-models",
      model,
      status,
      statusText,
      code: typeof anyError?.code === "string" ? anyError.code : undefined,
      type: typeof anyError?.type === "string" ? anyError.type : undefined,
      baseURL,
      bodyExcerpt: getErrorBodyExcerpt(error),
      hint: hintFromStatus(status),
      headers,
    },
  );
}

function hintFromStatus(status?: number) {
  if (!status) {
    return undefined;
  }

  if (status === 401) {
    return "GitHub Models token missing, expired, revoked, or lacks models:read.";
  }

  if (status === 403) {
    return "Token does not have access to GitHub Models or selected model.";
  }

  if (status === 404) {
    return "Model ID may be unavailable or incorrect.";
  }

  if (status === 429) {
    return "Rate limit or quota exceeded.";
  }

  if (status >= 500) {
    return "GitHub Models service error.";
  }

  return undefined;
}

export class GitHubModelsProvider implements AIProvider {
  name = "github-models" as const;

  private client: OpenAI;
  private baseURL: string;

  constructor(token: string, baseURL?: string) {
    this.baseURL = getGitHubModelsBaseURL(baseURL);
    this.client = new OpenAI({
      apiKey: normalizeEnvValue(token),
      baseURL: this.baseURL,
    });
  }

  async generateText({
    system,
    prompt,
    model = "openai/gpt-4o-mini",
    temperature = 0.4,
    maxTokens = 1800,
  }: GenerateTextOptions) {
    try {
      const completion = await this.client.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });

      return completion.choices[0]?.message.content?.trim() ?? "";
    } catch (error) {
      throw toProviderError(error, model, this.baseURL);
    }
  }

  async generateJSON<T>({ fallback, ...options }: GenerateJSONOptions<T>): Promise<T> {
    const model = options.model ?? "openai/gpt-4o-mini";

    const { messages, jsonInstructionInjected } = buildJSONMessages({
      system: options.system,
      prompt: options.prompt,
    });

    if (jsonInstructionInjected && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("GITHUB_MODELS_JSON_INSTRUCTION_INJECTED", { model });
    }

    const run = async (overrideMessages = messages) => {
      const completion = await this.client.chat.completions.create({
        model,
        temperature: options.temperature ?? 0.25,
        max_tokens: options.maxTokens ?? 2200,
        response_format: { type: "json_object" },
        messages: overrideMessages,
      });

      const text = completion.choices[0]?.message.content ?? "";
      return parseJSONFromText<T>(text, fallback, {
        expectedSchema: options.expectedSchema,
        onError: options.onParseError,
      });
    };

    try {
      return await run();
    } catch (error) {
      if (isMissingJsonWordError(error)) {
        const forced = buildJSONMessages({
          system: `${JSON_ONLY_SYSTEM_INSTRUCTION}\n\n${options.system}`,
          prompt: options.prompt,
        });

        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log("GITHUB_MODELS_JSON_INSTRUCTION_RETRY", { model });
        }

        try {
          return await run(forced.messages);
        } catch (retryError) {
          throw toProviderError(retryError, model, this.baseURL);
        }
      }

      throw toProviderError(error, model, this.baseURL);
    }
  }
}
