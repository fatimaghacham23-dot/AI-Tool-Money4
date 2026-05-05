export type AIProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "deepseek"
  | "grok"
  | "local"
  | "github-models";

export type GenerateTextOptions = {
  system: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateJSONOptions<T> = GenerateTextOptions & {
  fallback: T;
};

export interface AIProvider {
  name: AIProviderName;
  generateText(options: GenerateTextOptions): Promise<string>;
  generateJSON<T>(options: GenerateJSONOptions<T>): Promise<T>;
}
