import OpenAI from "openai";

const token = process.env.GITHUB_MODELS_TOKEN;
if (!token) {
  console.warn("Missing GITHUB_MODELS_TOKEN. Skipping live GitHub Models test.");
  process.exit(0);
}

const baseURL = process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference";
const client = new OpenAI({ apiKey: token, baseURL });

const response = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  temperature: 0,
  max_tokens: 80,
  messages: [
    { role: "system", content: "Reply in JSON with key ok." },
    { role: "user", content: "Return {\"ok\":true}" },
  ],
  response_format: { type: "json_object" },
});

console.log(response.choices[0]?.message?.content || "");
