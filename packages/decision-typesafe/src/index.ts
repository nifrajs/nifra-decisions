import type {
  DecisionProvider,
  DecisionProviderRequest,
  DecisionProviderResult,
  DecisionUsage,
} from "@nifrajs/decision";

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const API_PATH = "v1/systemone";

export interface TypeSafeProviderOptions {
  readonly apiKey: string;
  /** Pin a production model identifier. Development may use `jev-latest`. */
  readonly model: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly maxResponseBytes?: number;
  /** Abort a provider call if it exceeds this duration. Defaults to 30 seconds. */
  readonly timeoutMs?: number;
  /** Only permits `http://localhost`, loopback, or `[::1]`. */
  readonly allowInsecureLocalhost?: boolean;
}

export interface TypeSafeProvider extends DecisionProvider {
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
}

export function createTypeSafeProvider(
  options: TypeSafeProviderOptions,
): TypeSafeProvider {
  validateOptions(options);
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ?? DEFAULT_BASE_URL,
    options.allowInsecureLocalhost === true,
  );
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function")
    throw new Error("typesafe provider: fetch is unavailable");
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new RangeError(
      "typesafe provider: maxResponseBytes must be a positive integer",
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError(
      "typesafe provider: timeoutMs must be a positive integer",
    );
  }

  const provider: TypeSafeProvider = {
    id: "typesafe",
    baseUrl,
    model: options.model,
    timeoutMs,
    evaluate: (request) =>
      evaluate(
        fetchImpl,
        options.apiKey,
        options.model,
        baseUrl,
        maxResponseBytes,
        timeoutMs,
        request,
      ),
  };
  return Object.freeze(provider);
}

async function evaluate(
  fetchImpl: typeof globalThis.fetch,
  apiKey: string,
  model: string,
  baseUrl: string,
  configuredMaxResponseBytes: number,
  timeoutMs: number,
  request: DecisionProviderRequest,
): Promise<DecisionProviderResult> {
  if (request.signal.aborted)
    return { ok: false, error: { code: "cancelled" } };
  const maxResponseBytes = Math.min(
    configuredMaxResponseBytes,
    request.maxResponseBytes,
  );
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    return { ok: false, error: { code: "provider_response_invalid" } };
  }
  const payload = {
    state: request.state,
    model,
    questions: Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => [
        id,
        serializeQuestion(question),
      ]),
    ),
  };

  const timeoutMarker = Symbol("typesafe-timeout");
  const cancellationMarker = Symbol("typesafe-cancelled");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCancellation: ((reason?: unknown) => void) | undefined;
  const onAbort = () => {
    controller.abort();
    rejectCancellation?.(cancellationMarker);
  };
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutMarker);
    }, timeoutMs);
  });
  const cancellationPromise = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  request.signal.addEventListener("abort", onAbort, { once: true });

  let response: Response;
  let body: unknown;
  try {
    response = await Promise.race([
      fetchImpl(`${baseUrl}${API_PATH}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }),
      timeoutPromise,
      cancellationPromise,
    ]);
    if (!response.ok)
      return { ok: false, error: { code: statusCode(response.status) } };
    body = JSON.parse(
      await Promise.race([
        readBoundedText(response, maxResponseBytes),
        timeoutPromise,
        cancellationPromise,
      ]),
    );
  } catch (error) {
    if (error === timeoutMarker)
      return { ok: false, error: { code: "provider_timeout" } };
    if (error === cancellationMarker)
      return { ok: false, error: { code: "cancelled" } };
    if (request.signal.aborted || isAbortError(error))
      return { ok: false, error: { code: "cancelled" } };
    return { ok: false, error: { code: "provider_unavailable" } };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
  }

  if (!isRecord(body) || !Object.hasOwn(body, "answers")) {
    return { ok: false, error: { code: "provider_response_invalid" } };
  }

  const usage = parseUsage(body.usage);
  return {
    ok: true,
    answers: body.answers,
    provider: "typesafe",
    model: typeof body.model === "string" ? body.model : model,
    ...(usage === undefined ? {} : { usage }),
  };
}

function serializeQuestion(
  question: DecisionProviderRequest["questions"][string],
): Record<string, unknown> {
  if (question.type === "choice") {
    return {
      type: "choice",
      instructions: question.instructions,
      criteria: question.criteria,
    };
  }
  if (question.type === "score") {
    return {
      type: "score",
      instructions: question.instructions,
      criteria: question.criteria,
    };
  }
  return {
    type: "noul",
    instructions: question.instructions,
    ...(question.criteria === undefined ? {} : { criteria: question.criteria }),
  };
}

function validateOptions(options: TypeSafeProviderOptions): void {
  if (typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
    throw new TypeError("typesafe provider: apiKey is required");
  }
  if (typeof options.model !== "string" || options.model.trim() === "") {
    throw new TypeError("typesafe provider: model is required");
  }
}

function normalizeBaseUrl(
  value: string,
  allowInsecureLocalhost: boolean,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("typesafe provider: baseUrl must be a valid URL");
  }
  const hostname = parsed.hostname.toLowerCase();
  const local =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";
  if (
    parsed.protocol !== "https:" &&
    !(allowInsecureLocalhost && local && parsed.protocol === "http:")
  ) {
    throw new TypeError("typesafe provider: baseUrl must use HTTPS");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError(
      "typesafe provider: baseUrl must not contain credentials or query data",
    );
  }
  return `${parsed.toString().replace(/\/$/, "")}/`;
}

function statusCode(
  status: number,
):
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unauthorized"
  | "provider_bad_request"
  | "provider_unavailable" {
  if (status === 408 || status === 504) return "provider_timeout";
  if (status === 429) return "provider_rate_limited";
  if (status === 401 || status === 403) return "provider_unauthorized";
  if (status >= 400 && status < 500) return "provider_bad_request";
  return "provider_unavailable";
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (response.body === null) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes)
      throw new RangeError("response too large");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RangeError("response too large");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function parseUsage(value: unknown): DecisionUsage | undefined {
  if (!isRecord(value)) return undefined;
  const usage: Record<string, number> = {};
  for (const [source, target] of [
    ["input_tokens", "inputTokens"],
    ["output_tokens", "outputTokens"],
    ["total_tokens", "totalTokens"],
  ] as const) {
    const item = value[source];
    if (typeof item === "number" && Number.isSafeInteger(item) && item >= 0)
      usage[target] = item;
  }
  return Object.keys(usage).length === 0 ? undefined : Object.freeze(usage);
}

function isAbortError(value: unknown): boolean {
  return isRecord(value) && value.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
