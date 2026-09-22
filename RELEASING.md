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

## npm trusted publishing

The repository includes `.github/workflows/publish.yml` for tokenless npm publishing
through GitHub Actions OIDC. It uses Node 24, npm 11+, `id-token: write`, and the
`npm-publish` GitHub environment. It does not use an `NPM_TOKEN` or other long-lived
publish secret. npm generates provenance automatically for this public repository
and public packages.

For each package on npm, add a GitHub Actions trusted publisher with these exact
values:

- Organization or user: `nifrajs`
- Repository: `nifra-decisions`
- Workflow filename: `publish.yml`
- Environment name: `npm-publish`
- Allowed action: `npm publish`

Create the `npm-publish` GitHub environment and require a maintainer reviewer for
the strongest release gate. After the first successful trusted publish, set npm
Publishing access to **Require two-factor authentication and disallow tokens**, and
revoke obsolete automation tokens. See the [npm trusted publishing
documentation](https://docs.npmjs.com/trusted-publishers).

New package names may require one interactive maintainer bootstrap publish before
the npm package settings page exists. Do not create a bypass-2FA automation token;
use an interactive, 2FA-protected publish only for that one-time bootstrap, then
configure trusted publishing and use the workflow for all subsequent versions.

## Security boundary

The packages do not persist prompts, application state, provider output, or API keys. The host application remains responsible for authorization, tenant isolation, consent, retention, provider data-processing terms, and human review. See [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md).
