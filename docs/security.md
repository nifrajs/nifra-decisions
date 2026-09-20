# Security and privacy

The TypeSafe adapter transmits the state supplied by the caller to the configured provider. The caller is responsible for deciding whether that data may leave its trust boundary. Minimize, redact, or tokenize sensitive fields before evaluation.

## Transport and secrets

- Non-local provider URLs must use HTTPS.
- URL credentials, query data, and fragments are rejected.
- Insecure HTTP is allowed only for an explicitly opted-in localhost endpoint.
- API keys belong in server-side secret storage and must never enter browser bundles, `PUBLIC_*` variables, logs, or fixtures.
- Calls support caller cancellation and have a bounded timeout by default.

## Untrusted provider output

Provider output is treated as hostile input. The core validates:

- exact answer IDs and question types;
- declared Choice values and Score ranges;
- complete probability keys, finite values, and near-unit sums;
- confidence and Noul values in `[0, 1]`;
- response byte limits and provider metadata.

Malformed output, provider failures, cancellation, timeouts, invalid policy configuration, and low-confidence results cannot produce an actionable result. The parser does not merge provider objects into application state, which avoids prototype-pollution-shaped answer keys.

## Application responsibilities

Applications still own authentication, authorization, tenant isolation, consent, retention, provider data-processing terms, audit policy, and human review. Do not put real customer payloads or credentials into public tests, replay fixtures, issues, or pull requests.
