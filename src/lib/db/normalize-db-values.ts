export function bulletStringToArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s*/, ""))
    .filter(Boolean);
}

export function ensureTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    return bulletStringToArray(value);
  }

  if (value == null) {
    return [];
  }

  return [String(value)];
}

export function ensureString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.join("\n");
  }

  return JSON.stringify(value);
}
