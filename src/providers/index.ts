import { hasOpenAIEnv } from "@/lib/env";
import { MockProvider } from "@/providers/mock";
import { OpenAIProvider } from "@/providers/openai";
import type { AIProvider } from "@/providers/types";

export function getAIProvider(): AIProvider {
  if (hasOpenAIEnv()) {
    return new OpenAIProvider();
  }

  return new MockProvider();
}
