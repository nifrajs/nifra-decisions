# Nifra Decisions

Typed, confidence-aware semantic decisions for production TypeScript applications.

Nifra Decisions turns a small set of declared questions into validated values that ordinary application code can branch on. The core is provider-neutral; TypeSafe System One is the first adapter.

## Packages

- `@nifrajs/decision` - decision contracts, runtime validation, typed answers, and fail-closed policies.
- `@nifrajs/decision-typesafe` - server-only TypeSafe System One adapter with HTTPS enforcement, bounded responses, cancellation, and a timeout.
- `@nifrajs/decision-testing` - deterministic fake and replay providers for tests and evaluations.

## Quick start

```sh
bun add @nifrajs/decision @nifrajs/decision-typesafe @nifrajs/schema
```

```ts
import { t } from "@nifrajs/schema";
import { choice, defineDecision, noul, score } from "@nifrajs/decision";
import { createTypeSafeProvider } from "@nifrajs/decision-typesafe";

const triage = defineDecision({
  name: "support.triage",
  version: "1.0.0",
  state: t.object({
    subject: t.string({ minLength: 1, maxLength: 500 }),
    message: t.string({ minLength: 1, maxLength: 20_000 }),
  }),
  questions: {
    department: choice({
      instructions: "Which team should handle this ticket?",
      criteria: {
        billing: "Payment or subscription issue",
        technical: "Bug or integration issue",
        sales: "Pricing or account question",
      },
    }),
    urgent: noul({
      instructions: "Does this ticket require immediate attention?",
    }),
    frustration: score({
      instructions: "How frustrated is the customer?",
      criteria: ["Calm", "Concerned but civil", "Very angry"],
    }),
  },
});

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) throw new Error("TYPESAFE_API_KEY is required");

const provider = createTypeSafeProvider({
  apiKey,
  model: "jev-1.13.0", // Pin a tested production model identifier.
  timeoutMs: 15_000,
});

const result = await triage.evaluate(
  { subject: "Duplicate charge", message: "I was charged twice." },
  {
    provider,
    policy: {
      // Omit allowAct, or set it to false, while routing to human review.
      minimumConfidence: 0.92,
      minimumNoulProbability: { urgent: 0.8 },
    },
  },
);

if (result.ok && result.policy.outcome === "act") {
  console.log(result.answers.department.choice);
} else {
  console.log("Send to human review");
}
```

The adapter call belongs on the server. A decision is advisory evidence, not authorization and never performs a side effect. If an application enables `allowAct: true`, it must still perform its own identity, tenant, capability, approval, and idempotency checks before acting.

The initial public contract uses string instructions and rubrics. It matches the common TypeSafe request shape and validates the complete answer contract, including probabilities, scores, confidence, and question IDs.

## Safety defaults

- State and provider responses are runtime-validated and size-bounded.
- Invalid, unavailable, timed-out, cancelled, or low-confidence evaluations fail closed.
- Automatic action is opt-in through `allowAct: true`.
- Confidence and Noul probabilities are policy inputs, never authorization.
- The packages do not persist prompts, state, PII, model output, or provider payloads.
- API keys must remain in server-side secret storage; never expose them through `PUBLIC_*` browser variables.
- Production deployments should pin model IDs and define a human-review path.

## TypeSafe references

- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [TypeSafe primitives](https://docs.typesafe.ai/primitives)
- [TypeSafe confidence guidance](https://docs.typesafe.ai/confidence)

## Development

```sh
bun install
bun run check
bun run build
bun run pack:check
```

See [architecture](docs/architecture.md), [security](docs/security.md), and [evaluations](docs/evaluations.md) before sending sensitive data to a provider.

## License

MIT. The TypeSafe adapter contains no TypeSafe model weights or service implementation.
