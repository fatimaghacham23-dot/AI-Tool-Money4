import OpenAI from "openai";

import { parseJSONFromText } from "@/providers/json";
import type { AIProvider, GenerateJSONOptions, GenerateTextOptions } from "@/providers/types";

export class GitHubModelsProvider implements AIProvider {
  name = "github-models" as const;

  private client: OpenAI;

  constructor(token: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey: token,
      baseURL: baseURL ?? process.env.GITHUB_MODELS_BASE_URL ?? "https://models.github.ai/inference",
    });
  }

  async generateText({
    system,
    prompt,
    model = "openai/gpt-4o-mini",
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

  async generateJSON<T>({ fallback, ...options }: GenerateJSONOptions<T>): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: options.model ?? "openai/gpt-4o-mini",
      temperature: options.temperature ?? 0.25,
      max_tokens: options.maxTokens ?? 2200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.prompt },
      ],
    });

    const text = completion.choices[0]?.message.content ?? "";
    return parseJSONFromText<T>(text, fallback);
  }
}
