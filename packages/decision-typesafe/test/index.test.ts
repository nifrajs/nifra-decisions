import { describe, expect, test } from "bun:test";
import {
  choice,
  type DecisionProviderRequest,
  defineDecision,
} from "@nifrajs/decision";
import { createTypeSafeProvider } from "../src/index.ts";

const question = choice({
  instructions: "Which team?",
  criteria: { billing: "Billing", technical: "Technical" },
});

function request(
  overrides: Partial<DecisionProviderRequest> = {},
): DecisionProviderRequest {
  return {
    name: "support.triage",
    version: "1.0.0",
    state: { message: "broken" },
    questions: { department: question },
    signal: new AbortController().signal,
    maxResponseBytes: 1024,
    ...overrides,
  };
}

describe("TypeSafe provider", () => {
  test("serializes a decision request and parses the response", async () => {
    let received: Request | undefined;
    const provider = createTypeSafeProvider({
      apiKey: "secret",
      model: "jev-1.0.0",
      fetch: async (input, init) => {
        received = new Request(input, init);
        return Response.json({
          model: "jev-1.0.0",
          answers: {
            department: {
              type: "choice",
              choice: "technical",
              probabilities: { billing: 0.1, technical: 0.9 },
              confidence: 0.9,
            },
          },
          usage: { input_tokens: 12, output_tokens: 4 },
        });
      },
    });

    const result = await provider.evaluate(request());
    expect(result.ok).toBe(true);
    expect(provider.timeoutMs).toBe(30_000);
    expect(received?.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(received?.headers.get("authorization")).toBe("Bearer secret");
    expect(await received?.json()).toEqual({
      state: { message: "broken" },
      model: "jev-1.0.0",
      questions: {
        department: {
          type: "choice",
          instructions: "Which team?",
          criteria: { billing: "Billing", technical: "Technical" },
        },
      },
    });
  });

  test("maps provider HTTP failures without exposing response bodies", async () => {
    const provider = createTypeSafeProvider({
      apiKey: "secret",
      model: "jev-1.0.0",
      fetch: async () =>
        new Response("private provider error", { status: 429 }),
    });
    const result = await provider.evaluate(request());
    expect(result).toEqual({
      ok: false,
      error: { code: "provider_rate_limited" },
    });
  });

  test("rejects insecure non-local endpoints and URL credentials", () => {
    expect(() =>
      createTypeSafeProvider({
        apiKey: "secret",
        model: "jev",
        baseUrl: "http://example.com",
      }),
    ).toThrow();
    expect(() =>
      createTypeSafeProvider({
        apiKey: "secret",
        model: "jev",
        baseUrl: "https://user:pass@example.com",
      }),
    ).toThrow();
  });

  test("allows explicitly opted-in localhost development", () => {
    const provider = createTypeSafeProvider({
      apiKey: "secret",
      model: "jev",
      baseUrl: "http://localhost:8787",
      allowInsecureLocalhost: true,
      fetch: async () => Response.json({ answers: {} }),
    });
    expect(provider.baseUrl).toBe("http://localhost:8787/");
  });

  test("maps an aborted request to cancellation", async () => {
    const controller = new AbortController();
    const provider = createTypeSafeProvider({
      apiKey: "secret",
      model: "jev",
      fetch: async () => {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      },
    });
    const result = await provider.evaluate(
      request({ signal: controller.signal }),
    );
    expect(result).toEqual({ ok: false, error: { code: "cancelled" } });
  });

  test("fails with a provider timeout when fetch never settles", async () => {
    const provider = createTypeSafeProvider({
      apiKey: "secret",
      model: "jev-1.0.0",
      timeoutMs: 5,
      fetch: async () => new Promise<Response>(() => {}),
    });
    const result = await provider.evaluate(request());
    expect(result).toEqual({
      ok: false,
      error: { code: "provider_timeout" },
    });
  });

  test("rejects invalid timeout configuration", () => {
    expect(() =>
      createTypeSafeProvider({
        apiKey: "secret",
        model: "jev-1.0.0",
        timeoutMs: 0,
      }),
    ).toThrow();
  });
});

void defineDecision;
