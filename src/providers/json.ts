export type ModelJSONParseErrorInfo = {
  parse_error: string;
  raw_excerpt: string;
  raw_length: number;
  expected_schema?: string;
};

export function parseJSONFromText<T>(
  text: string,
  fallback: T,
  options?: {
    expectedSchema?: string;
    onError?: (info: ModelJSONParseErrorInfo) => void;
  },
): T {
  const trimmed = text.trim();

  const emitError = (parseError: unknown) => {
    options?.onError?.({
      parse_error: parseError instanceof Error ? parseError.message : String(parseError),
      raw_excerpt: trimmed.slice(0, 1000),
      raw_length: trimmed.length,
      expected_schema: options?.expectedSchema,
    });
  };

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as T;
      } catch (inner) {
        emitError(inner);
        return fallback;
      }
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
      } catch (inner) {
        emitError(inner);
        return fallback;
      }
    }

    const firstBracket = trimmed.indexOf("[");
    const lastBracket = trimmed.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1)) as T;
      } catch (inner) {
        emitError(inner);
        return fallback;
      }
    }

    emitError(error);
    return fallback;
  }
}
