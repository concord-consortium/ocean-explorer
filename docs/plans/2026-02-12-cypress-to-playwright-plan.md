# Cypress to Playwright Conversion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Cypress e2e tests with Playwright, add Bonjour port discovery for local dev, and upload Playwright reports to S3 via OIDC.

**Architecture:** Playwright tests live in `playwright/` with a custom test fixture (`playwright/lib/base-url.ts`) that discovers the dev server port via Bonjour when running locally. On CI, Playwright starts the dev server itself at a fixed port. The HTML report is uploaded to S3 using the same OIDC role as the existing deploy job.

**Tech Stack:** Playwright, bonjour-service, @bgotink/playwright-coverage, webpack-dev-server Bonjour support, GitHub Actions with OIDC

---

### Task 1: Install Playwright and Bonjour dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Playwright, bonjour-service, and coverage plugin**

Run:
```bash
npm install --save-dev @playwright/test bonjour-service @bgotink/playwright-coverage
```

**Step 2: Install Playwright browsers**

Run:
```bash
npx playwright install chromium
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Playwright, bonjour-service, and coverage dependencies"
```

---

### Task 2: Add Bonjour to webpack dev server

**Files:**
- Modify: `webpack.config.js:21-38`

**Step 1: Add bonjour config to devServer**

In `webpack.config.js`, add the `bonjour` property to the `devServer` object (after the `client` block, around line 38):

```js
      bonjour: {
        name: 'ocean-explorer',
      },
```

The full `devServer` block should look like:
```js
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
      },
      hot: true,
      server: {
        type: 'https',
        options: {
          key: path.resolve(os.homedir(), '.localhost-ssl/localhost.key'),
          cert: path.resolve(os.homedir(), '.localhost-ssl/localhost.pem'),
        },
      },
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
      bonjour: {
        name: 'ocean-explorer',
      },
    },
```

**Step 2: Verify dev server still starts**

Run:
```bash
npm start
```

Expected: dev server starts and you see a Bonjour service advertised (no errors). Stop it with Ctrl+C.

**Step 3: Commit**

```bash
git add webpack.config.js
git commit -m "feat: add Bonjour service advertising to webpack dev server"
```

---

### Task 3: Create Bonjour port discovery fixture

**Files:**
- Create: `playwright/lib/base-url.ts`

**Step 1: Create the base-url fixture**

Create `playwright/lib/base-url.ts`:

```ts
import { test as base } from "@playwright/test";
import { Bonjour, Service } from "bonjour-service";

async function findDevServerPort(): Promise<string> {
  const bonjour = new Bonjour();
  const service = await new Promise<Service | null>((resolve) => {
    // eslint-disable-next-line prefer-const
    let timer: NodeJS.Timeout;
    const browser = bonjour.find({type: "http"}, _service => {
      if (_service.name === process.env.REPOSITORY_NAME) {
        if (timer !== undefined) clearTimeout(timer);
        browser.stop();
        resolve(_service);
      }
    });
    timer = setTimeout(() => {
      browser.stop();
      resolve(null);
    }, 1000);
  });

  if (!service) {
    throw new Error("No http dev server found. Run `npm start` to start the dev server.");
  }

  return service.port.toString();
}

async function getBaseUrl() {
  let port = process.env.DEV_SERVER_PORT;
  if (!port) {
    port = await findDevServerPort();
    process.env.DEV_SERVER_PORT = port;
  }
  return `http://localhost:${port}`;
}

export const test = base.extend({
  baseURL: async ({ baseURL }, use) => {
    if (!baseURL) {
      if (process.env.CI) {
        throw new Error("baseURL must be set in CI environment");
      }
      baseURL = await getBaseUrl();
    }
    await use(baseURL);
  },
});
```

**Step 2: Commit**

```bash
git add playwright/lib/base-url.ts
git commit -m "feat: add Bonjour-based port discovery fixture for Playwright"
```

---

### Task 4: Create Bonjour debug script

**Files:**
- Create: `scripts/list-bonjour-services.mjs`
- Modify: `package.json` (add npm script)

**Step 1: Create the debug script**

Create `scripts/list-bonjour-services.mjs`:

```js
#!/usr/bin/env node
/* eslint-env node */

import { Bonjour } from "bonjour-service";

const bonjour = new Bonjour();

console.log("Discovering Bonjour/Zeroconf HTTP services on the local network...");
console.log("Press Ctrl+C to exit.\n");

const browser = bonjour.find({type: "http"});

browser.on("up", service => {
  console.log("Service found:");
  console.log(`  Name: ${service.name}`);
  console.log(`  Host: ${service.host}`);
  console.log(`  Port: ${service.port}`);
  console.log(`  IP Address: ${service.addresses ? service.addresses.join(", ") : "Unknown"}`);
  console.log("-----------------------------------");
});

browser.on("down", service => {
  console.log(`Service down: ${service.name} (${service.type})`);
});

process.on("SIGINT", () => {
  console.log("\nStopping service discovery...");
  bonjour.destroy();
  process.exit();
});
```

**Step 2: Add npm script to package.json**

In `package.json` scripts section, add:
```json
"discover-services": "node scripts/list-bonjour-services.mjs"
```

Note: This script uses ES module `import` syntax. The project's `package.json` does not have `"type": "module"`, so the `.mjs` extension is required to use ESM.

**Step 3: Commit**

```bash
git add scripts/list-bonjour-services.mjs package.json
git commit -m "feat: add Bonjour service discovery debug script"
```

---

### Task 5: Create Playwright config

**Files:**
- Create: `playwright.config.ts`

**Step 1: Create playwright.config.ts**

```ts
import type { PlaywrightCoverageOptions } from "@bgotink/playwright-coverage";
import type { ReporterDescription } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.REPOSITORY_NAME = "ocean-explorer";

const collectCoverage = !!process.env.CI;
const coverageReporter: ReporterDescription = [
  "@bgotink/playwright-coverage",
  /** @type {import('@bgotink/playwright-coverage').CoverageReporterOptions} */ {
    sourceRoot: __dirname,
    exclude: [],
    rewritePath: ({absolutePath}) => {
      return (absolutePath as string)
        .replace(`${process.env.REPOSITORY_NAME}/`, "")
        .replace(/\?[0-9a-z]+$/,"");
    },
    resultDir: path.join(__dirname, "test-results", "coverage"),
    reports: [
      ["html"],
      [
        "lcovonly",
        {
          file: "coverage.lcov",
        },
      ],
      [
        "text-summary",
        {
          file: null,
        },
      ],
    ],
  },
];

const reportJson = !!process.env.CI;
const jsonReporter: ReporterDescription = ["json", { outputFile: path.join("test-results", "results.json") }];

export default defineConfig<PlaywrightCoverageOptions>({
  testDir: "./playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ...(collectCoverage ? [coverageReporter] : []),
    ...(reportJson ? [jsonReporter] : []),
  ],
  use: {
    baseURL: process.env.CI ? "http://localhost:8080" : undefined,
    trace: process.env.CI ? "on" : "off",
    collectCoverage,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI ? {
    command: "npm start",
    url: "http://localhost:8080/",
    reuseExistingServer: true,
    timeout: 120_000,
  } : undefined,
});
```

**Step 2: Commit**

```bash
git add playwright.config.ts
git commit -m "feat: add Playwright configuration with coverage and CI support"
```

---

### Task 6: Write the Playwright test

**Files:**
- Create: `playwright/workspace.test.ts`

**Step 1: Write the test**

Create `playwright/workspace.test.ts`:

```ts
import { test } from "./lib/base-url";
import { expect } from "@playwright/test";

test("renders the simulation controls and canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rotation rate")).toBeVisible();
  await expect(page.getByText("Temp gradient")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});
```

**Step 2: Run the test locally to verify it passes**

Make sure the dev server is running (`npm start`), then:

```bash
npx playwright test
```

Expected: 1 test passing in Chromium.

**Step 3: Commit**

```bash
git add playwright/workspace.test.ts
git commit -m "feat: add Playwright e2e test for simulation workspace"
```

---

### Task 7: Create Playwright CI workflow

**Files:**
- Create: `.github/workflows/playwright.yml`

**Step 1: Create the workflow file**

Create `.github/workflows/playwright.yml`:

```yaml
name: Playwright Tests
on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps chromium
      - name: Run Playwright tests
        run: npx playwright test
        env:
          CI: "true"
      - name: Upload coverage to Codecov
        if: always()
        uses: codecov/codecov-action@v5
        with:
          flags: playwright
          token: ${{ secrets.CODECOV_TOKEN }}
      - uses: concord-consortium/s3-deploy-action/deploy-path@v1
        if: always()
        id: s3-deploy-path
      - uses: aws-actions/configure-aws-credentials@v4
        if: always()
        with:
          role-to-assume: arn:aws:iam::612297603577:role/ocean-explorer
          aws-region: us-east-1
      - name: Upload Playwright Report
        if: always()
        run: aws s3 sync ./playwright-report s3://models-resources/ocean-explorer/playwright-report/${{ steps.s3-deploy-path.outputs.deployPath }} --delete --cache-control "no-cache, max-age=0"
      - uses: daun/playwright-report-summary@v3
        if: always()
        with:
          report-file: test-results/results.json
          report-url: https://models-resources.concord.org/ocean-explorer/playwright-report/${{ steps.s3-deploy-path.outputs.deployPath }}/
```

**Step 2: Commit**

```bash
git add .github/workflows/playwright.yml
git commit -m "ci: add Playwright test workflow with S3 report upload via OIDC"
```

---

### Task 8: Remove Cypress and update CI

**Files:**
- Delete: `cypress/` directory
- Delete: `cypress.config.ts`
- Modify: `.github/workflows/ci.yml:23-67` (remove cypress job, update s3-deploy needs)
- Modify: `package.json` (remove Cypress scripts, nyc config, Cypress deps)
- Modify: `eslint.config.mjs:16,131-143,166-178` (remove Cypress plugin import and config blocks)
- Modify: `.gitignore:2,8` (remove coverage-cypress and .nyc_output)

**Step 1: Delete Cypress files**

Run:
```bash
rm -rf cypress/ cypress.config.ts
```

**Step 2: Remove Cypress job from ci.yml**

Edit `.github/workflows/ci.yml`:
- Remove the entire `cypress` job (lines 23-62)
- In the `s3-deploy` job, change `needs` from `[build_test, cypress]` to `[build_test]`
- Remove the `CYPRESS_INSTALL_BINARY: 0` env var from the s3-deploy install step (lines 78-81)

The resulting `ci.yml` should be:

```yaml
name: Continuous Integration

on: push

jobs:
  build_test:
    name: Build and Run Jest Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - name: Install Dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Run Tests
        run: npm run test:coverage -- --runInBand
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          flags: jest
          token: ${{ secrets.CODECOV_TOKEN }}
  s3-deploy:
    name: S3 Deploy
    needs:
      - build_test
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - name: Install Dependencies
        run: npm ci
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::612297603577:role/ocean-explorer
          aws-region: us-east-1
      - uses: concord-consortium/s3-deploy-action@v1
        id: s3-deploy
        with:
          bucket: models-resources
          prefix: ocean-explorer
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          deployRunUrl: https://models-resources.concord.org/ocean-explorer/__deployPath__/index.html
          topBranches: |
            ["main"]
```

**Step 3: Remove Cypress from package.json**

In `package.json`:

Remove these scripts:
- `"test:cypress": "cypress run"`
- `"test:cypress:open": "cypress open"`
- `"test:coverage:cypress:open": "cypress open --env coverage=true"`

Update `test:full` to:
```json
"test:full": "npm-run-all test test:playwright"
```

Add Playwright scripts:
```json
"test:playwright": "playwright test",
"test:playwright:open": "playwright test --ui"
```

Remove the entire `"nyc"` block (lines 71-75).

Remove the `testPathIgnorePatterns` entry for `/cypress/` in the `jest` config. Change:
```json
"testPathIgnorePatterns": [
  "/node_modules/",
  "/cypress/"
]
```
to:
```json
"testPathIgnorePatterns": [
  "/node_modules/",
  "/playwright/"
]
```

**Step 4: Uninstall Cypress dependencies**

Run:
```bash
npm uninstall cypress @cypress/code-coverage @cypress/webpack-preprocessor eslint-plugin-cypress @istanbuljs/nyc-config-typescript istanbul-lib-coverage
```

Note: Check if `@jsdevtools/coverage-istanbul-loader` is still needed. It's used in `webpack.config.js` when `CODE_COVERAGE` env is set. Since Playwright uses `@bgotink/playwright-coverage` (which uses V8 coverage, not Istanbul instrumentation), the Istanbul loader is no longer needed for e2e coverage. However, keep it if there's any other use. Since the only use was Cypress coverage, remove it:

```bash
npm uninstall @jsdevtools/coverage-istanbul-loader
```

Then remove the `CODE_COVERAGE` loader rule from `webpack.config.js` (lines 56-62). Change:

```js
        process.env.CODE_COVERAGE ? {
          test: /\.[tj]sx?$/,
          loader: '@jsdevtools/coverage-istanbul-loader',
          options: { esModules: true },
          enforce: 'post',
          exclude: path.join(__dirname, 'node_modules'),
        } : {},
```

to nothing (remove the entire ternary rule entry from the `rules` array).

**Step 5: Update eslint config**

Edit `eslint.config.mjs`:

Remove the import on line 16:
```js
import pluginCypress from "eslint-plugin-cypress/flat";
```

Remove the Cypress eslint block (lines 166-178):
```js
  {
    name: "rules specific to Cypress tests",
    files: ["cypress/**"],
    extends: [
      pluginCypress.configs.recommended
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-var-requires": "off",
      "cypress/no-unnecessary-waiting": "off"
    }
  },
```

Update the projectService block (lines 132-143) to replace `cypress` with `playwright`:

Change:
```js
  {
    name: "rules only for project and cypress typescript files",
    files: ["src/**/*.ts", "src/**/*.tsx", "cypress/**/*.ts", "cypress/**/*.tsx"],
```

to:
```js
  {
    name: "rules only for project and playwright typescript files",
    files: ["src/**/*.ts", "src/**/*.tsx", "playwright/**/*.ts"],
```

**Step 6: Update .gitignore**

Edit `.gitignore`:
- Remove `coverage-cypress`
- Remove `.nyc_output`
- Add `test-results/`
- Add `playwright-report/`

**Step 7: Clean up old directories**

Run:
```bash
rm -rf .nyc_output coverage-cypress
```

**Step 8: Run Jest tests to make sure nothing broke**

Run:
```bash
npm test
```

Expected: All Jest tests pass.

**Step 9: Run lint to make sure eslint config is valid**

Run:
```bash
npm run lint
```

Expected: No errors (warnings are OK).

**Step 10: Run Playwright test to make sure it still passes**

With dev server running (`npm start`):

```bash
npx playwright test
```

Expected: 1 test passing.

**Step 11: Commit**

```bash
git add -A
git commit -m "chore: remove Cypress, update CI and eslint for Playwright"
```

---

### Task 9: Final verification

**Step 1: Run full test suite**

```bash
npm run test:full
```

Expected: Jest tests pass, Playwright test passes.

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 3: Verify lint**

```bash
npm run lint
```

Expected: No errors.
