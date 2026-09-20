import type { StandardSchemaV1 } from "@nifrajs/core/schema";
import { choice, defineDecision, noul, score } from "@nifrajs/decision";
import { t } from "@nifrajs/schema";

export interface TicketState {
  readonly subject: string;
  readonly message: string;
}

export const ticketState: StandardSchemaV1<TicketState, TicketState> = t.object(
  {
    subject: t.string({ minLength: 1, maxLength: 500 }),
    message: t.string({ minLength: 1, maxLength: 20_000 }),
  },
);

export const supportTriage = defineDecision({
  name: "support.triage",
  version: "1.0.0",
  state: ticketState,
  questions: {
    department: choice({
      instructions: "Which team should handle this support ticket?",
      criteria: {
        billing: "Payment, invoice, or subscription issue",
        technical: "Bug, outage, or integration issue",
        sales: "Pricing, plan, or account question",
      },
    }),
    urgent: noul({
      instructions:
        "Does this ticket require immediate attention or contain a time-sensitive blocker?",
    }),
    frustration: score({
      instructions: "How frustrated is the customer?",
      criteria: [
        "Calm and factual",
        "Concerned but civil",
        "Very angry or using strong language",
      ],
    }),
  },
});
