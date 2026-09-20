import { expect, test } from "bun:test";
import { createFakeProvider } from "@nifrajs/decision-testing";
import { supportTriage } from "../src/triage.ts";

const state = {
  subject: "Duplicate charge",
  message: "I was charged twice and need help immediately.",
};

test("triage stays in review unless policy explicitly enables automation", async () => {
  const result = await supportTriage.evaluate(state, {
    provider: createFakeProvider({
      ok: true,
      answers: {
        answers: {
          department: {
            type: "choice",
            choice: "billing",
            probabilities: { billing: 0.98, technical: 0.01, sales: 0.01 },
            confidence: 0.98,
          },
          urgent: { type: "noul", noul: 0.99 },
          frustration: {
            type: "score",
            score: 1.5,
            probabilities: { "0": 0.01, "1": 0.97, "2": 0.02 },
            confidence: 0.97,
          },
        },
      },
    }),
  });

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.policy.outcome).toBe("review");
});

test("triage acts only when all explicit gates pass", async () => {
  const result = await supportTriage.evaluate(state, {
    provider: createFakeProvider({
      ok: true,
      answers: {
        answers: {
          department: {
            type: "choice",
            choice: "billing",
            probabilities: { billing: 0.98, technical: 0.01, sales: 0.01 },
            confidence: 0.98,
          },
          urgent: { type: "noul", noul: 0.99 },
          frustration: {
            type: "score",
            score: 1.5,
            probabilities: { "0": 0.01, "1": 0.97, "2": 0.02 },
            confidence: 0.97,
          },
        },
      },
    }),
    policy: {
      allowAct: true,
      minimumConfidence: 0.92,
      minimumNoulProbability: { urgent: 0.8 },
    },
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.policy.outcome).toBe("act");
    expect(result.answers.department.choice).toBe("billing");
  }
});
