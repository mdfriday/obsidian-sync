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

  // ── Desktop-only foundry module ───────────────────────────────────────────
  // foundry/index.ts is a Node.js-only module dynamically imported exclusively
  // inside an `if (Platform.isDesktop)` guard in main.ts. It is never evaluated
  // on mobile. The `fs` built-in is intentional here; `path` is imported from
  // path-browserify for cross-platform hygiene. The per-file override below
  // (config-level, not an inline eslint-disable comment) is required because
  // eslint-comments/no-restricted-disable prevents suppressing this rule inline.
  {
    files: ["src/foundry/index.ts"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
    },
  },

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
      // {} return type used for legacy compatibility
      "@typescript-eslint/no-empty-object-type":          "off",
      // @ts-expect-error (with description) is used for untyped Obsidian internal APIs.
      // Warn level allows @ts-expect-error with a description; @ts-ignore is still flagged.
      "@typescript-eslint/ban-ts-comment":                "warn",
      // Low-priority cleanup items
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      // TypeScript handles undefined references - no-undef is redundant for .ts files
      "no-undef":                                         "off",
      // getSettingDefinitions() refactor is tracked in docs/eslint-fix-plan.md (Step 13)
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      // Logger() passes unknown values into template literals
      "@typescript-eslint/restrict-template-expressions": "off",
      // void used to discard promises intentionally
      "no-void":                                          "off",
    },
  },
]);
