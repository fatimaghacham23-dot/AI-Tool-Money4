import type { AIProvider, GenerateJSONOptions, GenerateTextOptions } from "@/providers/types";

export class MockProvider implements AIProvider {
  name = "local" as const;

  async generateText({ prompt }: GenerateTextOptions) {
    return [
      "Local preview mode: no OpenAI key is configured.",
      "The council can still produce deterministic demo artifacts so the app remains usable while setup is incomplete.",
      prompt.slice(0, 220),
    ].join("\n\n");
  }

  async generateJSON<T>({ fallback }: GenerateJSONOptions<T>) {
    return fallback;
  }
}
