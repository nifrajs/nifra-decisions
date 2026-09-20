# Contributing

Run the complete local gate before opening a pull request:

```sh
bun install
bun run check
bun run build
bun run pack:check
```

Changes to public decision contracts, provider response parsing, failure semantics, or evidence fields require focused tests and a changeset. Do not add real customer data, API keys, provider responses containing personal data, or unsupported claims about model quality.
