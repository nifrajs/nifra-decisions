import { describe, expect, test } from "bun:test";
import { t } from "@nifrajs/schema";
import {
  choice,
  type DecisionProvider,
  defineDecision,
  noul,
  score,
} from "../src/index.ts";

const definition = defineDecision({
  name: "support.triage",
  version: "1.0.0",
  state: t.object({ message: t.string({ minLength: 1 }) }),
  questions: {
    department: choice({
      instructions: "Which team handles this?",
      criteria: { billing: "Payments", technical: "Bugs" },
    }),
    urgent: noul({ instructions: "Is this urgent?" }),
    frustration: score({
      instructions: "How frustrated?",
      criteria: ["calm", "angry"],
    }),
  },
});

function providerWith(answers: unknown): DecisionProvider {
  return {
    id: "fake",
    evaluate: async () => ({
      ok: true,
      answers,
      provider: "fake",
      model: "test",
    }),
  };
}

const validAnswers = {
  answers: {
    department: {
      type: "choice",
      choice: "technical",
      probabilities: { billing: 0.05, technical: 0.95 },
      confidence: 0.95,
    },
    urgent: { type: "noul", noul: 0.9 },
    frustration: {
      type: "score",
      score: 1,
      probabilities: { "0": 0.05, "1": 0.95 },
      confidence: 0.95,
    },
  },
};

describe("decision contracts", () => {
  test("validates state and returns typed answers", async () => {
    const result = await definition.evaluate(
      { message: "The integration is broken" },
      {
        provider: providerWith(validAnswers),
        policy: {
          allowAct: true,
          minimumConfidence: 0.9,
          minimumNoulProbability: { urgent: 0.8 },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const department: "billing" | "technical" =
        result.answers.department.choice;
      expect(department).toBe("technical");
      expect(result.answers.department.choice).toBe("technical");
      expect(result.policy.outcome).toBe("act");
      expect(result.metadata.provider).toBe("fake");
    }
  });

  test("defaults to review even for a confident provider response", async () => {
    const result = await definition.evaluate(
      { message: "hello" },
      { provider: providerWith(validAnswers) },
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.policy.reason).toBe("automatic_action_not_enabled");
  });

  test("fails closed on low confidence", async () => {
    const result = await definition.evaluate(
      { message: "hello" },
      {
        provider: providerWith({
          answers: {
            ...validAnswers.answers,
            department: { ...validAnswers.answers.department, confidence: 0.4 },
          },
        }),
        policy: { allowAct: true, minimumConfidence: 0.9 },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.policy.reason).toBe("confidence_below_threshold");
  });

  test("rejects undeclared choices and malformed probabilities", async () => {
    const result = await definition.evaluate(
      { message: "hello" },
      {
        provider: providerWith({
          answers: {
            ...validAnswers.answers,
            department: {
              ...validAnswers.answers.department,
              choice: "other",
              probabilities: { billing: 0.5, technical: 0.5 },
            },
          },
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("provider_response_invalid");
  });

  test("rejects unknown answer IDs", async () => {
    const result = await definition.evaluate(
      { message: "hello" },
      {
        provider: providerWith({
          answers: {
            ...validAnswers.answers,
            extra: { type: "noul", noul: 1 },
          },
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("provider_response_invalid");
  });

  test("cancels before calling the provider", async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const result = await definition.evaluate(
      { message: "hello" },
      {
        signal: controller.signal,
        provider: {
          id: "fake",
          evaluate: async () => {
            called = true;
            return { ok: true, answers: validAnswers };
          },
        },
      },
    );
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("cancelled");
  });

  test("rejects oversized state and provider responses before acting", async () => {
    let called = false;
    const stateResult = await definition.evaluate(
      { message: "hello" },
      {
        maxStateBytes: 1,
        provider: {
          id: "fake",
          evaluate: async () => {
            called = true;
            return { ok: true, answers: validAnswers };
          },
        },
      },
    );
    expect(called).toBe(false);
    expect(stateResult.ok).toBe(false);
    if (!stateResult.ok) expect(stateResult.error.code).toBe("input_invalid");

    const responseResult = await definition.evaluate(
      { message: "hello" },
      { maxResponseBytes: 8, provider: providerWith(validAnswers) },
    );
    expect(responseResult.ok).toBe(false);
    if (!responseResult.ok)
      expect(responseResult.error.code).toBe("provider_response_invalid");
  });

  test("fails closed on malformed provider contracts", async () => {
    const malformed = await definition.evaluate(
      { message: "hello" },
      {
        provider: {
          id: "fake",
          evaluate: async () => null as never,
        },
      },
    );
    expect(malformed.ok).toBe(false);
    if (!malformed.ok)
      expect(malformed.error.code).toBe("provider_response_invalid");

    const invalidError = await definition.evaluate(
      { message: "hello" },
      {
        provider: {
          id: "fake",
          evaluate: async () =>
            ({ ok: false, error: { code: "not-a-real-code" } }) as never,
        },
      },
    );
    expect(invalidError.ok).toBe(false);
    if (!invalidError.ok)
      expect(invalidError.error.code).toBe("provider_response_invalid");
  });

  test("fails closed on invalid policy configuration", async () => {
    const invalidThreshold = await definition.evaluate(
      { message: "hello" },
      {
        provider: providerWith(validAnswers),
        policy: { allowAct: true, minimumConfidence: 2 },
      },
    );
    expect(invalidThreshold.ok).toBe(false);
    if (!invalidThreshold.ok)
      expect(invalidThreshold.error.code).toBe("internal");

    const invalidDecision = await definition.evaluate(
      { message: "hello" },
      {
        provider: providerWith(validAnswers),
        policy: {
          allowAct: true,
          decide: () => "unexpected" as never,
        },
      },
    );
    expect(invalidDecision.ok).toBe(true);
    if (invalidDecision.ok)
      expect(invalidDecision.policy.outcome).toBe("review");
  });
});
