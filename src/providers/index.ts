import { hasGitHubModelsEnv, hasOpenAIEnv } from "@/lib/env";
import { GitHubModelsProvider } from "@/providers/github-models";
import { MockProvider } from "@/providers/mock";
import { OpenAIProvider } from "@/providers/openai";
import type { AIProvider } from "@/providers/types";

let hasWarnedMissingGitHubToken = false;

export function getAIProvider(): AIProvider {
  if (hasGitHubModelsEnv()) {
    return new GitHubModelsProvider(process.env.GITHUB_MODELS_TOKEN!);
  }

  if (!hasWarnedMissingGitHubToken) {
    console.warn(
      "GitHub Models token missing (GITHUB_MODELS_TOKEN). Falling back to OpenAI or mock provider.",
    );
    hasWarnedMissingGitHubToken = true;
  }

  if (hasOpenAIEnv()) {
    return new OpenAIProvider();
  }

  return new MockProvider();
}
