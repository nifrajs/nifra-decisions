# Releasing Nifra Decisions

Nifra Decisions publishes three public npm packages from this repository:

- `@nifrajs/decision`
- `@nifrajs/decision-typesafe`
- `@nifrajs/decision-testing`

## First public release checklist

Before publishing anything:

1. Create the public GitHub repository at `nifrajs/nifra-decisions` and push `main`.
2. Enable GitHub private vulnerability reporting for the repository.
3. Confirm the npm account can publish the `@nifrajs` scope.
4. Review the generated package file list. It must not contain credentials, customer data, local paths, or `*.tsbuildinfo` files.
5. Run the complete release gate:

   ```sh
   bun install --frozen-lockfile
   bun run release:check
   ```

6. Run a dry-run publish for each package from its package directory:

   ```sh
   bun publish --dry-run
   ```

## Publish order

Publish the base contract package first, then the packages that depend on it:

1. `@nifrajs/decision`
2. `@nifrajs/decision-typesafe`
3. `@nifrajs/decision-testing`

Use public access and publish only from a clean, reviewed commit. After publishing, install the exact versions in a fresh temporary consumer and run the support-triage example without putting provider credentials in client-side or committed files.

## Security boundary

The packages do not persist prompts, application state, provider output, or API keys. The host application remains responsible for authorization, tenant isolation, consent, retention, provider data-processing terms, and human review. See [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md).
