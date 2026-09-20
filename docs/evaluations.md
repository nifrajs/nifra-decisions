# Evaluation contract

The initial evaluation corpus is a synthetic support-triage set. Every case should have a stable ID, sanitized state, expected answers, risk class, and expected policy outcome. Real customer data is opt-in only and must never be the default test source.

## Required gates

- Every accepted provider response satisfies the decision contract.
- Malformed responses never produce an actionable result.
- High-risk cases escalate.
- Low-confidence cases never auto-act.
- Probability distributions are complete, finite, and normalized.
- Timeout, cancellation, unauthorized, rate-limit, and provider-failure paths are covered.
- Replay fixtures are keyed by decision name and version.
- Evidence contains no raw state, API key, PII, or provider payload.

## Quality metrics

Track per-question accuracy, confusion matrices, weighted Score error, probability calibration, escalation recall, false-auto-action rate, latency, timeout rate, provider failure rate, and review volume. Quality thresholds should be set by the host application and reviewed when a model or rubric changes.
