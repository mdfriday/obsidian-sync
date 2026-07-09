# MDFriday Sync — Release Notes v26.7.10

> Released: July 9, 2026  发布日期：2026 年 7 月 9 日

---

## 📋 Overview / 概述

This is a **code quality & official review compliance** release. All changes are developer-facing: no new user-visible features are introduced. The key improvements are migrating internal sync state storage to Obsidian's vault-scoped API, eliminating 30+ redundant TypeScript type assertions, and fixing two remaining type precision issues flagged by the Obsidian official review scanner.

本版本为**代码质量与官方审查合规**版本，无新增用户可见功能。主要改进包括：将内部同步状态存储迁移至 Obsidian vault 级别 API、消除 30+ 处多余 TypeScript 类型断言，以及修复官方 review 扫描器标记的两处类型精度问题。

---

## 🐛 Bug Fixes / 错误修复

### 1. Sync State Storage: Per-Vault Isolation / 同步状态 Vault 级别隔离

**Problem / 问题：** `SimpleKeyValueDB` (used internally for sync checkpoints and key-value state) called `window.localStorage.getItem/setItem/removeItem` directly, using a shared browser namespace. Data from one vault could interfere with another if multiple Obsidian vaults were open simultaneously.

**问题说明：** 内部用于同步状态的 `SimpleKeyValueDB`（存储 checkpoint 和 key-value 状态）直接调用 `window.localStorage.getItem/setItem/removeItem`，使用浏览器共享命名空间。多个 vault 同时打开时，数据可能相互干扰。

**Fix / 修复：** Migrated `SimpleKeyValueDB` to Obsidian's vault-scoped storage API:

```typescript
// Before / 修复前 — shared browser localStorage
window.localStorage.getItem(key)
window.localStorage.setItem(key, JSON.stringify(value))
window.localStorage.removeItem(key)

// After / 修复后 — vault-scoped Obsidian API
app.loadLocalStorage(key)
app.saveLocalStorage(key, value)
app.saveLocalStorage(key, undefined)  // delete
```

`FridaySimpleStore` (checkpoint storage) is also updated to use the vault-scoped API via the same mechanism.

Note: `window.localStorage` is still used in read-only key-enumeration calls (for `keys()` and `destroy()`) because `app.loadLocalStorage` does not expose a key-listing API — this is an Obsidian API limitation documented in the codebase.

注：key 枚举操作（`keys()` / `destroy()`）仍使用 `window.localStorage` 只读遍历，因为 Obsidian 的 `app.loadLocalStorage` 没有提供 key 列举 API，已在代码中注明。

---

## 🔧 Type Safety Improvements / 类型安全改进

### 2. Removed 30 Redundant Type Assertions / 移除 30 处多余类型断言

The Obsidian official review scanner flagged `@typescript-eslint/no-unnecessary-type-assertion` violations in multiple files. The rule was re-enabled and all 30 violations were auto-fixed.

**Files affected / 受影响文件：**

| File | Assertions removed |
|------|--------------------|
| `sync/FridaySyncCore.ts` | `as DatabaseConnectingStatus` (×3), `as string` (×2), `!` (×2), others |
| `sync/FridayServiceHub.ts` | `as Record<string, string>`, `as MetaEntry & {...}`, `as string`, `as unknown as FetchHttpHandler` |
| `sync/FridayStorageEventManager.ts` | `!` non-null assertion on `eventQueue.shift()`, `as FilePathWithPrefix` (×3) |
| `sync/adapters/ObsidianHttpClient.ts` | `as Parameters<...>[0]`, `as Record<string, string>` |
| `sync/utils/hiddenFileUtils.ts` | `as { mtime?: number }` |
| `foundry/index.ts` | `as ActivationApiResponse` (×2) |
| `foundry/mobile.ts` | `as ActivationApiResponse` (×2), `as unknown as MobileServiceConfig` (×4) |
| `utils/common.ts` | `as Record<string, unknown>` |

As a side effect, `DatabaseConnectingStatus` import in `FridaySyncCore.ts` became unused after removing the type assertions and was removed.

### 3. Fixed `{}` Empty Object Type Violations / 修复 `{}` 空对象类型

**Problem / 问题：** `{}` in TypeScript means "any non-null value" (including numbers and strings) — not "any object type".

**Fix / 修复：**

| File | Before | After |
|------|--------|-------|
| `src/foundry/index.ts` | `ObsidianLicenseResult<{}>` | `ObsidianLicenseResult<object>` |
| `src/foundry/mobile.ts` | `ObsidianLicenseResult<{}>` | `ObsidianLicenseResult<object>` |
| `src/i18n/types.ts` | `commands: {}` | `commands: Record<string, string>` |

---

## 🔧 Developer Tooling / 开发工具链

### 4. ESLint: Two Rules Re-enabled / 重新启用两条规则

The following rules were previously set to `"off"` in `eslint.config.js` and have been re-enabled:

| Rule | Status | Notes |
|------|--------|-------|
| `@typescript-eslint/no-unnecessary-type-assertion` | Now active (default `warn`) | 30 violations fixed |
| `@typescript-eslint/no-empty-object-type` | Now active (default `warn`) | 3 violations fixed |

### 5. `globals` Added to devDependencies / `globals` 加入 devDependencies

`globals` was used in `eslint.config.js` but not listed as an explicit `devDependency`. It is now declared:

```json
"devDependencies": {
  "globals": "^17.7.0"
}
```

---

## 📊 Official Review Compliance Progress / 官方 review 合规进展

| Issue from Review | Status |
|-------------------|--------|
| `fs` module (Direct Filesystem Access) | ⏳ Documented — config-level ESLint override; working analysis in `docs/fs-to-vault-api-analysis.md` |
| Vault Enumeration | ✅ Documented — inherent to sync plugin; analysis in `docs/vault-enumeration-analysis.md` |
| `{}` empty object type | ✅ Fixed in this release |
| Unnecessary type assertions | ✅ Fixed in this release (30 sites) |
| `globals` missing from devDependencies | ✅ Fixed in this release |
| localStorage usage | ✅ Migrated get/set/delete to `app.saveLocalStorage/loadLocalStorage` |

---

## 🔄 Version Compatibility Matrix / 版本兼容矩阵

| Obsidian version / Obsidian 版本 | Plugin version received / 获得的插件版本 |
|---|---|
| < 1.0.0 | Not installable / 无法安装 |
| 1.0.0 – 1.3.x | v26.7.1 |
| 1.4.0 – 1.7.1 | v26.7.2 |
| 1.7.2 – 1.12.x | v26.7.3 |
| ≥ 1.13.0 | v26.7.10 (latest / 最新) |

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Sync core package** / 同步核心包：[npmjs.com/package/@mdfriday/sync-core](https://www.npmjs.com/package/@mdfriday/sync-core)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

