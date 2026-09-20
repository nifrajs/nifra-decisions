import { server } from "@nifrajs/core/server";
import { createTypeSafeProvider } from "@nifrajs/decision-typesafe";
import { supportTriage, ticketState } from "./triage.js";

interface Env {
  readonly TYPESAFE_API_KEY: string;
  readonly TYPESAFE_MODEL?: string;
}

export const app = server<Env>().post(
  "/tickets/triage",
  {
    body: ticketState,
    capabilities: ["support.triage"],
    classification: "pii",
  },
  async (c) => {
    const provider = createTypeSafeProvider({
      apiKey: c.env.TYPESAFE_API_KEY,
      model: c.env.TYPESAFE_MODEL ?? "jev-latest",
    });
    const result = await supportTriage.evaluate(c.body, {
      provider,
      signal: c.signal,
      policy: {
        allowAct: true,
        minimumConfidence: 0.92,
        minimumNoulProbability: { urgent: 0.8 },
      },
    });

    if (!result.ok) {
      c.set.status = 503;
      return {
        ok: false,
        outcome: "review" as const,
        error: result.error.code,
      };
    }

    return {
      ok: true,
      outcome: result.policy.outcome,
      reason: result.policy.reason,
      department: result.answers.department.choice,
      urgentProbability: result.answers.urgent.noul,
      frustration: result.answers.frustration.score,
      confidence: result.answers.department.confidence,
    };
  },
);
