# Architecture

Nifra Decisions has three boundaries:

1. `@nifrajs/decision` declares a decision contract, validates state, parses untrusted answers, and evaluates an explicit policy.
2. A provider adapter translates that contract into a model-service request and returns an untrusted provider result.
3. The host application decides what to do. Any side effect remains behind the host's own identity, tenant, capability, approval, and idempotency checks.

The decision layer is intentionally side-effect free. It does not write databases, send messages, approve payments, mutate browser state, or persist prompts, state, model output, or provider payloads.

## Contract versioning

The decision name, semantic version, question IDs, question types, and choice/score criteria are part of the contract. Treat changes to any of these as a new decision version and keep replay fixtures versioned with it.

`@nifrajs/decision-testing` uses `name@version` as the replay key. This makes a changed rubric fail closed instead of silently reusing an old fixture.

## Policy model

The default policy outcome is `review`. Automation requires `allowAct: true`, confidence thresholds for Choice/Score answers, and explicit probability thresholds for Noul answers. A custom policy runs only after those built-in gates pass.

Confidence is evidence about the provider response. It is never an authorization primitive. A host must re-check authorization immediately before any action.

## TypeSafe adapter boundary

`@nifrajs/decision-typesafe` is a server-side transport adapter for `POST https://api.typesafe.ai/v1/systemone`. It sends the validated state and question definitions, authenticates with a bearer token, bounds the response, maps HTTP/provider failures to stable error codes, and propagates cancellation and timeout.

The core package does not import TypeSafe or any model vendor. Additional providers can implement `DecisionProvider` without changing the decision contract.
