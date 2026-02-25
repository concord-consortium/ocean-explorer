import type { PlaywrightCoverageOptions } from "@bgotink/playwright-coverage";
import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import fs from "fs";
import path from "path";

// Playwright transpiles .ts configs to CJS, so __dirname is available.
const rootDir = __dirname;

// Load .env if present (used to override BONJOUR_SERVICE_NAME in worktrees)
try {
  const envFile = fs.readFileSync(path.join(rootDir, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim();
  }
} catch { /* .env is optional */ }

process.env.REPOSITORY_NAME = process.env.REPOSITORY_NAME || "ocean-explorer";
process.env.BONJOUR_SERVICE_NAME = process.env.BONJOUR_SERVICE_NAME || process.env.REPOSITORY_NAME;

const collectCoverage = !!process.env.CI;
const coverageReporter: ReporterDescription = [
  "@bgotink/playwright-coverage",
  /** @type {import('@bgotink/playwright-coverage').CoverageReporterOptions} */ {
    sourceRoot: rootDir,
    exclude: [],
    rewritePath: ({absolutePath}) => {
      return (absolutePath as string)
        .replace(`${process.env.REPOSITORY_NAME}/`, "")
        .replace(/\?[0-9a-z]+$/,"");
    },
    resultDir: path.join(rootDir, "test-results", "coverage"),
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
