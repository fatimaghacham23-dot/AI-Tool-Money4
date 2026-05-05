import OpenAI from "openai";

import { getRequiredEnv } from "@/lib/env";
import { parseJSONFromText } from "@/providers/json";
import type { AIProvider, GenerateJSONOptions, GenerateTextOptions } from "@/providers/types";

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

export class OpenAIProvider implements AIProvider {
  name = "openai" as const;

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: getRequiredEnv("OPENAI_API_KEY"),
    });
  }

  async generateText({
    system,
    prompt,
    model = process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature = 0.4,
    maxTokens = 1800,
  }: GenerateTextOptions) {
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
  }

  async generateJSON<T>({
    fallback,
    ...options
  }: GenerateJSONOptions<T>): Promise<T> {
    const { messages, jsonInstructionInjected } = buildJSONMessages({
      system: options.system,
      prompt: options.prompt,
    });

    if (jsonInstructionInjected && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("OPENAI_JSON_INSTRUCTION_INJECTED", {
        model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      });
    }

    const completion = await this.client.chat.completions.create({
      model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: options.temperature ?? 0.25,
      max_tokens: options.maxTokens ?? 2200,
      response_format: { type: "json_object" },
      messages,
    });

    const text = completion.choices[0]?.message.content ?? "";
    return parseJSONFromText<T>(text, fallback, {
      expectedSchema: options.expectedSchema,
      onError: options.onParseError,
    });
  }
}
