// @ts-check
/**
 * ESLint configuration using the official Obsidian plugin.
 * https://github.com/obsidianmd/eslint-plugin
 */
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  // ── Ignore build output, tests, and third-party code ─────────────────────
  {
    ignores: [
      "node_modules/**",
      "main.js",
      "**/*.test.ts",
      "src/sync/lib/**",
    ],
  },

  // ── Point the TypeScript parser at our tsconfig (must come FIRST) ─────────
  // This single block sets parserOptions for ALL subsequent configs.
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── Official Obsidian recommended config ──────────────────────────────────
  // Bundles: @eslint/js, typescript-eslint recommended-type-checked
  //          (no-unsafe-*, no-explicit-any, no-floating-promises, …),
  //          Obsidian-specific rules, Microsoft SDL, eslint-plugin-import
  ...obsidianmd.configs.recommended,

  // ── Project-specific overrides ────────────────────────────────────────────
  {
    files: ["src/**/*.ts"],

    rules: {
      // Downgrade to warn for gradual adoption (don't block CI immediately)
      "@typescript-eslint/no-explicit-any":               "warn",
      "@typescript-eslint/no-unsafe-member-access":       "warn",
      "@typescript-eslint/no-unsafe-call":                "warn",
      "@typescript-eslint/no-unsafe-assignment":          "warn",
      "@typescript-eslint/no-unsafe-return":              "warn",
      "@typescript-eslint/no-unsafe-argument":            "warn",
      "@typescript-eslint/no-unused-vars":                "warn",
      "no-unused-vars":                                   "warn",
      "@typescript-eslint/no-floating-promises":          "warn",

      // ── Rules turned off — don't fit this codebase ───────────────────────
      // console.* is used throughout for debugging
      "no-console":                                       "off",
      // async functions without await satisfy interface contracts
      "@typescript-eslint/require-await":                 "off",
      // String(e) in error-handling is intentional
      "@typescript-eslint/no-base-to-string":             "off",
      // {} return type used for legacy compat
      "@typescript-eslint/no-empty-object-type":          "off",
      // @ts-ignore used for untyped Obsidian internal APIs
      "@typescript-eslint/ban-ts-comment":                "off",
      // Unnecessary assertions are low-priority cleanup
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      // Node.js http/https modules are intentionally used in the LLM client
      "obsidianmd/no-nodejs-modules":                     "off",
      // Logger() calls pass unknown values into template literals
      "@typescript-eslint/restrict-template-expressions": "off",
      // void operator used to discard promises deliberately
      "no-void":                                          "off",
    },
  },
];
