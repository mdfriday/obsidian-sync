# Obsidian API Compatibility — Version Requirements

> Generated: 2026-07-10  
> Type definitions version: `obsidian@1.13.1` (installed)  
> `package.json` devDependency: `"obsidian": "^1.8.7"`  
> `manifest.json` minAppVersion: `"1.8.7"` ← corrected from `"1.13.0"`

---

## Summary

The plugin's declared minimum version is **Obsidian 1.8.7** (`manifest.json`). This is the exact API floor determined by `saveLocalStorage`/`loadLocalStorage` (`@since 1.8.7`).

The previous `minAppVersion: "1.13.0"` was **incorrect** — it was set too high without corresponding 1.13.0+ API usage. After reverting `setDestructive()` (which crashed test devices), no 1.13.0+ API remains in the codebase. Setting `minAppVersion: "1.8.7"` correctly reflects the true minimum and allows users on Obsidian 1.8.7–1.12.x to install the plugin.

---

## All Obsidian APIs used and their version requirements

| API | Since | Status | Where used in codebase |
|---|---|---|---|
| `App`, `Plugin`, `Vault`, `Notice`, `Setting`, `PluginSettingTab` | 0.9.7 | ✅ Current | Throughout |
| `normalizePath()` | 0.9.7 | ✅ Current | `utils/path.ts` |
| `requestUrl()` | 0.12.11 | ✅ Current | `http.ts`, `FridayServiceHub.ts`, `FridaySyncCore.ts`, `ObsidianHttpClient.ts` |
| `Platform` | 0.x | ✅ Current | `foundry/index.ts`, `foundry/mobile.ts`, `main.ts` |
| `FileSystemAdapter` | 0.x | ✅ Current | `main.ts` |
| `ButtonComponent.setWarning()` | 0.11.0 | ⚠️ Deprecated since 1.13.0 | `setting.ts` — intentionally kept (see below) |
| `PluginSettingTab.display()` | 0.x | ⚠️ Deprecated since 1.13.0 | `setting.ts` — inside `update()` wrapper |
| `App.saveLocalStorage()` | **1.8.7** | ✅ Current | `FridaySyncCore.ts`, `FridayServiceHub.ts` |
| `App.loadLocalStorage()` | **1.8.7** | ✅ Current | `FridaySyncCore.ts`, `FridayServiceHub.ts` |

### APIs that are **NOT** currently used (1.13.0+, future migration targets)

| API | Since | Replaces |
|---|---|---|
| `ButtonComponent.setDestructive()` | 1.13.0 | `setWarning()` |
| `PluginSettingTab.getSettingDefinitions()` | 1.13.0 | `display()` |
| All `SettingDefinition*` types | 1.13.0 | Imperative `Setting` builder pattern |

---

## Effective minimum version

The highest `@since` version among **currently used** APIs is **`1.8.7`** (`saveLocalStorage` / `loadLocalStorage`).

```
API floor (highest @since in use):  1.8.7  (saveLocalStorage / loadLocalStorage)
manifest.json minAppVersion:        1.8.7  ✅ (corrected — was incorrectly 1.13.0)
package.json devDependency:         ^1.8.7 ✅ (matches)
```

**Why was it incorrectly set to 1.13.0?**  
A previous commit changed `setWarning()` → `setDestructive()` (a 1.13.0 API) to silence an ESLint deprecation warning. This both raised the minimum version unnecessarily and caused a runtime crash on devices running < 1.13.0. The change was reverted; `setWarning()` (0.11.0+) is correct.

---

## Deprecated APIs still in use

### 1. `ButtonComponent.setWarning()` — `setting.ts`

| Field | Value |
|---|---|
| Introduced | `@since 0.9.20` (deprecated) → `@since 0.11.0` (return-typed overload) |
| Deprecated since | 1.13.0 |
| Replacement | `setDestructive()` (`@since 1.13.0`) |
| Current status | **Kept as `setWarning()`** |

**Why kept:** `setDestructive()` was confirmed to crash on test devices running Obsidian < 1.13.0 (even though the manifest declares 1.13.0 minimum, users can side-load the plugin on older versions). `setWarning()` has been available since 0.11.0 and is functionally identical — it has NOT been removed, only marked deprecated.

**Migration path:** Replace `.setWarning()` with `.setDestructive()` only after confirming all target test devices run ≥ 1.13.0 and the plugin is distributed exclusively through the official Community Plugins store (which enforces `minAppVersion`).

**ESLint:** `@typescript-eslint/no-deprecated` is turned off for `setting.ts` in `eslint.config.js` to suppress false positives from the deprecated-but-necessary call.

---

### 2. `PluginSettingTab.display()` — `setting.ts`

| Field | Value |
|---|---|
| Deprecated since | 1.13.0 |
| Replacement | `getSettingDefinitions()` + declarative `SettingDefinition` array |
| Current status | Used inside `update()` wrapper — functional, not removed |

**Why kept:** Migrating to the declarative `getSettingDefinitions()` API requires a full rewrite of `setting.ts` (approximately 1,100 lines). The imperative `display()` / `Setting` builder pattern still works in all supported versions. This is tracked for future refactoring.

**ESLint:** Same `@typescript-eslint/no-deprecated: off` override in `setting.ts` suppresses this.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `setWarning()` removed in future Obsidian | Low (deprecated, not removed) | Medium — settings page crash | Migrate to `setDestructive()` when safe |
| `display()` removed in future Obsidian | Low | High — settings tab completely broken | Migrate to `getSettingDefinitions()` |
| User installs on Obsidian < 1.8.7 | Very low (manifest enforces 1.13.0) | High — `saveLocalStorage` crash | Already mitigated by manifest |
| Developer changes `setWarning()` to `setDestructive()` prematurely | Possible | High — crash on dev/test environments | This file documents the reason; ESLint override provides a warning |



