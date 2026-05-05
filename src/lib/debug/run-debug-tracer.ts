import type { Json } from "@/types/database";

export type DebugTraceEvent = {
  time: string;
  step: string;
  status: "start" | "ok" | "failed" | "event" | "fallback";
  round?: string;
  agent?: string;
  provider?: string;
  model?: string;
  details?: Json;
  error?: Json;
};

type SafeError = {
  name?: string;
  message?: string;
  status?: number | string;
  code?: string;
  type?: string;
  provider?: string;
  model?: string;
  stack?: string;
};

export function redactSecrets(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    let v = value;

    v = v.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]");
    v = v.replace(/github_pat_[A-Za-z0-9_\-]+/g, "github_pat_[REDACTED]");
    v = v.replace(/ghp_[A-Za-z0-9_\-]+/g, "ghp_[REDACTED]");
    v = v.replace(/sk-[A-Za-z0-9]{10,}/g, "sk-[REDACTED]");

    if (/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/.test(v)) {
      v = v.replace(
        /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
        "[REDACTED_JWT]",
      );
    }

    if (v.length > 40 && /[A-Za-z0-9_\-]{40,}/.test(v)) {
      v = v.replace(/[A-Za-z0-9_\-]{40,}/g, "[REDACTED_TOKEN]");
    }

    return v;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("authorization") ||
        key.toLowerCase().includes("cookie") ||
        key.toLowerCase().includes("apikey") ||
        key.toLowerCase().includes("api_key") ||
        key.toLowerCase().includes("service_role")
      ) {
        out[key] = "[REDACTED]";
        continue;
      }

      out[key] = redactSecrets(val);
    }

    return out;
  }

  return value;
}

function toJson(value: unknown): Json {
  const redacted = redactSecrets(value);

  if (
    redacted === null ||
    typeof redacted === "string" ||
    typeof redacted === "number" ||
    typeof redacted === "boolean"
  ) {
    return redacted;
  }

  if (Array.isArray(redacted)) {
    return redacted.map((item) => toJson(item));
  }

  if (typeof redacted === "object") {
    try {
      return JSON.parse(
        JSON.stringify(redacted, (_key, val) => {
          if (typeof val === "bigint") {
            return val.toString();
          }
          if (typeof val === "function") {
            return undefined;
          }
          if (typeof val === "symbol") {
            return undefined;
          }
          return val;
        }),
      ) as Json;
    } catch {
      return String(redacted);
    }
  }

  return String(redacted);
}

export class RunDebugTracer {
  private trace: DebugTraceEvent[] = [];

  constructor(private readonly verbose: boolean = process.env.DEBUG_COUNCIL_RUNS === "true") {}

  addEvent(
    event: Omit<DebugTraceEvent, "time" | "status" | "details" | "error"> & {
      status?: DebugTraceEvent["status"];
      details?: unknown;
      error?: unknown;
    },
  ) {
    const entry: DebugTraceEvent = {
      time: new Date().toISOString(),
      status: event.status ?? "event",
      step: event.step,
      round: event.round,
      agent: event.agent,
      provider: event.provider,
      model: event.model,
      details: event.details === undefined ? undefined : toJson(event.details),
      error: event.error === undefined ? undefined : toJson(event.error),
    };

    this.trace.push(entry);

    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log("COUNCIL_TRACE", JSON.stringify(entry));
    }
  }

  startStep(step: string, details?: unknown) {
    this.addEvent({ step, status: "start", details });
  }

  completeStep(step: string, details?: unknown) {
    this.addEvent({ step, status: "ok", details });
  }

  failStep(step: string, error: unknown, details?: unknown) {
    this.addEvent({ step, status: "failed", details, error: this.safeError(error) });
  }

  getTrace(): DebugTraceEvent[] {
    return this.trace;
  }

  safeError(error: unknown): SafeError {
    if (!error) {
      return { message: "Unknown error" };
    }

    if (error instanceof Error) {
      const stack = typeof error.stack === "string" ? error.stack.split("\n").slice(0, 3).join("\n") : undefined;
      const anyErr = error as unknown as Record<string, unknown>;

      return redactSecrets({
        name: error.name,
        message: error.message,
        status: anyErr.status as unknown,
        code: anyErr.code as unknown,
        type: anyErr.type as unknown,
        provider: anyErr.provider as unknown,
        model: anyErr.model as unknown,
        stack,
      }) as SafeError;
    }

    if (typeof error === "object") {
      const anyErr = error as Record<string, unknown>;
      return redactSecrets({
        name: typeof anyErr.name === "string" ? anyErr.name : "Error",
        message: typeof anyErr.message === "string" ? anyErr.message : JSON.stringify(anyErr),
        status: anyErr.status,
        code: anyErr.code,
        type: anyErr.type,
        provider: anyErr.provider,
        model: anyErr.model,
      }) as SafeError;
    }

    return { message: String(error) };
  }
}
