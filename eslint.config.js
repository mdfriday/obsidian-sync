// @ts-check
/**
 * ESLint configuration — follows the official obsidianmd eslint-plugin README.
 * https://github.com/obsidianmd/eslint-plugin
 */
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
  // ── Ignore build output, tests, and vendored code ─────────────────────────
  {
    ignores: [
      "node_modules/**",
      "main.js",
      "**/*.test.ts",
      "src/sync/lib/**",
      // NOTE: src/i18n/locales/ is intentionally NOT ignored here.
      // The three description strings that previously mentioned `.obsidian` have
      // been rewritten to avoid hardcoded config paths (correct per the rule).
    ],
  },

  // ── Official Obsidian recommended rules ───────────────────────────────────
  // Bundles: @eslint/js, typescript-eslint recommended-type-checked,
  // Obsidian-specific rules, Microsoft SDL, eslint-plugin-import …
  ...obsidianmd.configs.recommended,



  // ── TypeScript parser + project-specific overrides ────────────────────────
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      // Node.js globals for Desktop (Electron) + shared code
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    rules: {
      // ── Downgrade unsafe-any to warn (gradual adoption) ───────────────────
      "@typescript-eslint/no-explicit-any":               "warn",
      "@typescript-eslint/no-unsafe-member-access":       "warn",
      "@typescript-eslint/no-unsafe-call":                "warn",
      "@typescript-eslint/no-unsafe-assignment":          "warn",
      "@typescript-eslint/no-unsafe-return":              "warn",
      "@typescript-eslint/no-unsafe-argument":            "warn",
      "@typescript-eslint/no-floating-promises":          "warn",
      // Unused variables — args:none avoids false positives on interface method param names
      "@typescript-eslint/no-unused-vars":            ["warn", {
        args: "none",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-unused-vars":                               ["warn", {
        args: "none",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],

      // ── Rules that don't fit this codebase (turn off) ────────────────────
      // console.* used throughout for debug logging
      "no-console":                                       "off",
      // async without await is used to satisfy interface contracts
      "@typescript-eslint/require-await":                 "off",
      // String(e) in catch blocks is intentional error formatting
      "@typescript-eslint/no-base-to-string":             "off",
      // @ts-expect-error (with description) is used for untyped Obsidian internal APIs.
      // Warn level allows @ts-expect-error with a description; @ts-ignore is still flagged.
      "@typescript-eslint/ban-ts-comment":                "warn",
      // TypeScript handles undefined references - no-undef is redundant for .ts files
      "no-undef":                                         "off",
      // getSettingDefinitions() refactor is tracked in docs/eslint-fix-plan.md (Step 13)
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      // Logger() passes unknown values into template literals
      "@typescript-eslint/restrict-template-expressions": "off",
      // void used to discard promises intentionally
      "no-void":                                          "off",
      // update() wraps display() by design — the rule fires inside the wrapper itself,
      // not at external call sites, so it's a false positive for this pattern.
      "obsidianmd/settings-tab/prefer-update-over-display": "off",
      // @typescript-eslint/no-deprecated is kept as a warn globally; specific instances
      // (e.g. setDestructive migration) are tracked in docs/eslint-fix-plan.md.
      "@typescript-eslint/no-deprecated":                 "warn",
    },
  },

  // ── Settings tab: display() inside update() is intentional ───────────────
  // update() is a backward-compatibility wrapper that calls display(). The
  // no-deprecated warning fires on the internal call, which is a false positive
  // for this design pattern. Tracked for proper refactor in eslint-fix-plan.md.
  {
    files: ["src/setting.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },

  // ── PouchDB CouchDB adapter: native fetch required ────────────────────────
  // Obsidian's requestUrl (RequestUrlParam) has no AbortSignal field, making it
  // impossible to cancel requests via timeout or PouchDB's internal controller.
  // Native fetch is the only Web API that supports both AbortSignal and streaming
  // responses, both of which are required for correct PouchDB CouchDB replication.
  // CouchDB server has CORS enabled, so fetch works on all platforms.
  {
    files: ["src/sync/FridayServiceHub.ts"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
]);
