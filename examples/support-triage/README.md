# Support triage example

This example shows the intended boundary:

1. Nifra validates the request body.
2. Nifra Decisions asks focused TypeSafe questions.
3. The policy decides whether the result is reviewable or eligible for automation.
4. A real action would still require a separate host authorization and capability check.

The example performs no external side effect.

Set `TYPESAFE_API_KEY` and optionally `TYPESAFE_MODEL` in the server environment before making a real request. Keep the key server-side.

```sh
bun run build
bun test
```
