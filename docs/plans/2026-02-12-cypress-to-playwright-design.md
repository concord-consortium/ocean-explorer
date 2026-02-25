# Cypress to Playwright Conversion

## Goal

Replace Cypress with Playwright for e2e testing. Add Bonjour-based port discovery so local
tests find the dev server automatically regardless of which port it runs on. Upload Playwright
HTML reports to S3 using OIDC (not explicit AWS keys).

## Webpack changes

Add Bonjour advertising to `webpack.config.js` devServer config:

```js
bonjour: {
  name: 'ocean-explorer',
}
```

HTTP-only — no certs needed. The existing `npm start` command already runs HTTP.

## Playwright configuration

**`playwright.config.ts`:**

- Test directory: `./playwright`
- Single project: Chromium
- CI: `baseURL: http://localhost:8080`, `webServer` block starts `npm start` and waits
- Local: `baseURL: undefined` — triggers Bonjour discovery in the custom test fixture
- Coverage: `@bgotink/playwright-coverage` with Istanbul reports (html, lcovonly, text-summary)
- JSON reporter on CI for PR summary via `daun/playwright-report-summary`
- Traces recorded on CI only

**`playwright/lib/base-url.ts`:**

Custom Playwright test fixture that extends `@playwright/test`. When `baseURL` is unset
(local dev), uses `bonjour-service` to discover an HTTP service named `ocean-explorer`,
extracts the port, and sets `baseURL` to `http://localhost:<port>`. Caches the port in
`process.env.DEV_SERVER_PORT` for the duration of the test run. Throws on CI if `baseURL`
is missing (safety check).

**`scripts/list-bonjour-services.mjs`:**

Debug script that continuously lists Bonjour HTTP services on the local network. Run via
`npm run discover-services`.

## Test conversion

Single Cypress test converts to:

```ts
// playwright/workspace.test.ts
import { test } from "./lib/base-url";
import { expect } from "@playwright/test";

test("renders the simulation controls and canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rotation rate")).toBeVisible();
  await expect(page.getByText("Temp gradient")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});
```

## CI workflow

New `.github/workflows/playwright.yml`:

- **Triggers:** push to main/master, pull requests
- **Steps:** checkout, setup-node, npm ci, install Playwright chromium, run tests
- **S3 upload:** Uses OIDC via `aws-actions/configure-aws-credentials@v4` with
  `role-to-assume: arn:aws:iam::612297603577:role/ocean-explorer` (same role as deploy).
  Uploads HTML report to `s3://models-resources/ocean-explorer/playwright-report/<deployPath>/`.
- **PR comment:** `daun/playwright-report-summary@v3` posts test results on PRs
- **Coverage:** Uploaded to Codecov with `playwright` flag

## Removals

- `cypress/` directory, `cypress.config.ts`
- Dependencies: `cypress`, `@cypress/code-coverage`, `@cypress/webpack-preprocessor`,
  `eslint-plugin-cypress`
- `cypress` job from `.github/workflows/ci.yml`
- npm scripts: `test:cypress`, `test:cypress:open`, `test:coverage:cypress:open`
- `nyc` config from `package.json`
- `.nyc_output/`, `coverage-cypress/` directories

## New dependencies

- `@playwright/test`
- `bonjour-service`
- `@bgotink/playwright-coverage`

## Unchanged

- Jest unit tests
- `build_test` and `s3-deploy` jobs in `ci.yml` (except `s3-deploy` drops the `cypress`
  dependency from its `needs` list)
- `npm start` script
