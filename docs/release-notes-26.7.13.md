# MDFriday Sync — Release Notes v26.7.13

> Released: July 11, 2026  发布日期：2026 年 7 月 11 日

---

## 📋 Overview / 概述

This release fixes a cold-start synchronisation timeout, corrects the plugin's declared minimum Obsidian version, adds full network-request disclosure to the README (per the Obsidian plugin review process), and cleans up ESLint compliance.

本版本修复了冷启动同步超时问题，更正了插件声明的最低 Obsidian 版本，根据 Obsidian 插件 review 流程在 README 中添加了完整的网络请求披露，并完善了 ESLint 合规性。

---

## 🐛 Bug Fixes / 错误修复

### 1. Cold-start sync timeout eliminated / 消除冷启动同步超时

**Problem / 问题：** On desktop, the first activation of the sync plugin after Obsidian cold-starts occasionally produced:

```
[Friday Sync] Request error: Error: Request timeout after 30000ms
```

This interrupted the initial CouchDB replication and prevented sync from starting until the plugin was reloaded.

**问题说明：** 在桌面端，Obsidian 冷启动后首次激活同步插件偶发超时错误，导致初始 CouchDB 复制中断，需重新加载插件才能同步。

**Root cause / 根本原因：** The PouchDB CouchDB adapter was using Obsidian's `requestUrl` API, which routes through Electron IPC. On cold start the IPC channel may not yet be fully ready, adding latency that exceeded the 30-second `Promise.race` timeout. `requestUrl` also buffers the entire HTTP response body before resolving — for large-vault bulk replication responses this is an additional risk. Furthermore, `requestUrl` has no `AbortSignal` support, so timed-out requests could not be cancelled and would leak as dangling promises.

**根本原因：** PouchDB CouchDB 适配器使用了 Obsidian 的 `requestUrl` API，该 API 通过 Electron IPC 路由。冷启动时 IPC 通道可能尚未就绪，延迟超过 30 秒的 `Promise.race` 超时。`requestUrl` 还会缓冲整个响应体才 resolve，对于大型 vault 的批量复制是额外风险。此外，`requestUrl` 不支持 `AbortSignal`，超时后请求无法取消，造成资源泄漏。

**Fix / 修复 (`src/sync/FridayServiceHub.ts`):**

- Replaced `requestUrl + Promise.race` with **native `fetch` + `AbortController`** in the PouchDB CouchDB adapter, matching the pattern used in the original `obsidian-friday-plugin`. Native `fetch` uses Chromium's already-warm network stack and supports `AbortSignal`.
- `_changes` long-poll requests are **exempt from the 30-second timeout** — CouchDB holds these connections for the heartbeat interval (30 s), so an equal client-side timeout would race with the heartbeat on cold start.
- PouchDB's own `AbortSignal` (`opts.signal`) is now **combined** with the timeout signal using `AbortSignal.any()` instead of being overwritten. This fixes a latent bug where PouchDB could not cancel its own `_changes` requests when sync was stopped by the user.
- CouchDB server has CORS enabled, so `fetch` works on all platforms.

**替换方式：**
- 用**原生 `fetch` + `AbortController`** 替换 `requestUrl + Promise.race`，与原始 `obsidian-friday-plugin` 保持一致
- `_changes` 长轮询请求豁免 30 秒超时（CouchDB 保持连接 30 秒心跳，等值超时会竞争）
- 使用 `AbortSignal.any()` 合并 PouchDB 的 `opts.signal` 和超时信号（修复了 PouchDB 无法取消自身请求的隐患）

---

### 2. Settings page crash on Obsidian < 1.13.0 / 低版本设置页崩溃修复

**Problem / 问题：**

```
TypeError: button.setButtonText(...).setDestructive is not a function
```

The settings page failed to render on Obsidian versions below 1.13.0 because a previous commit changed `.setWarning()` to `.setDestructive()` — a 1.13.0-only API — to silence an ESLint deprecation warning.

**修复 (`src/setting.ts`):** Reverted `.setDestructive()` back to `.setWarning()` (`@since 0.11.0`). Although `setWarning()` is deprecated since 1.13.0, it has not been removed and works on all supported versions. The ESLint `@typescript-eslint/no-deprecated` rule is suppressed for `setting.ts` via a config-level override (inline disables are not permitted by the project's `eslint-comments/no-restricted-disable` rule).

**修复说明：** 回退至 `.setWarning()`（`@since 0.11.0`）。虽然该方法自 1.13.0 起被标注为 deprecated，但尚未被移除，在所有支持版本上均可正常运行。

---

### 3. "Database not found" message never shown / "数据库不存在"提示不显示修复

**Problem / 问题：** The connection test in Settings showed a generic error instead of the specific "Database not found" message when the CouchDB database did not exist (HTTP 404).

**Root cause:** `requestUrl` defaults to `throw: true`, meaning it throws an exception for HTTP 4xx responses instead of returning the response object. The `response.status === 404` branch in the connection test was therefore unreachable.

**Fix (`src/sync/FridaySyncCore.ts`):** Added `throw: false` to the connection test `requestUrl` call so HTTP error responses are returned as objects and the 404 branch executes correctly.

**修复说明：** 连接测试的 `requestUrl` 调用添加 `throw: false`，使 HTTP 错误响应作为对象返回，404 分支可正确执行。

---

### 4. Cosmetic fix: stray `q` character / 代码 typo 修复

Removed a stray `q` character at the end of a private field declaration in `FridaySyncCore.ts` (line 251).

---

## 🔒 Security & Compliance / 安全与合规

### 5. Correct `minAppVersion`: `1.13.0` → `1.8.7` / 最低版本更正

**`manifest.json` `minAppVersion` was incorrectly set to `1.13.0`.**

After a full audit of every Obsidian API used in the codebase (documented in `docs/obsidian-api-compatibility.md`), the actual API floor is **`1.8.7`** — the version that introduced `app.saveLocalStorage()` / `app.loadLocalStorage()`.

No 1.13.0-only API is currently used. The previous value of `1.13.0` unnecessarily excluded users running Obsidian 1.8.7–1.12.x.

`manifest.json` 和 `versions.json` 均已更新为 `"1.8.7"`。

| API | Since | Used |
|---|---|---|
| `app.saveLocalStorage()` / `loadLocalStorage()` | **1.8.7** ← floor | ✅ |
| `ExtraButtonComponent.setTooltip()` | 1.1.0 | ✅ |
| `requestUrl()` | 0.12.11 | ✅ |
| `button.setWarning()` | 0.11.0 | ✅ |
| `button.setDestructive()` | 1.13.0 | ❌ reverted |

---

### 6. Network request disclosure added to README / README 增加网络请求披露

Per the Obsidian plugin review process requirements, a **"Network Requests & Data Privacy"** section has been added to `README.md` disclosing:

- All external domains contacted (`app.mdfriday.com` for managed-backend users; user-configured CouchDB for all users)
- The 6 specific API calls made to `app.mdfriday.com` (login, trial, activate, license info, usage, usage reset), each with its trigger condition
- Explanation that `btoa()` is used solely for standard HTTP Basic Authentication headers (RFC 7617), not for obfuscating keys or URLs
- Technical explanation of why native `fetch` is used instead of `requestUrl` in the CouchDB adapter (`requestUrl` lacks `AbortSignal` support)

根据 Obsidian 插件 review 要求，README 新增网络请求披露章节，包含外部域名、6 个 API 调用说明、`btoa` 用途说明，以及使用 `fetch` 而非 `requestUrl` 的技术原因。

---

## 🔧 Developer Tooling / 开发工具链

### 7. ESLint config improvements / ESLint 配置改进

- Added **file-specific override for `src/setting.ts`**: `@typescript-eslint/no-deprecated: "off"` — suppresses false positives from deprecated APIs that are intentionally kept for version compatibility (`setWarning()`, `display()`).
- Added **file-specific override for `src/sync/FridayServiceHub.ts`**: `"no-restricted-globals": "off"` — documents and permits native `fetch` in the PouchDB adapter (the only location where `requestUrl` is technically insufficient due to lack of `AbortSignal`).
- Added global rules: `obsidianmd/settings-tab/prefer-update-over-display: "off"` (the rule fires inside the `update()` wrapper itself, not at call sites — a false positive for this design pattern) and `@typescript-eslint/no-deprecated: "warn"` (gradual migration tracking).

ESLint now passes with **zero warnings and zero errors**.

ESLint 现在**零警告、零错误**通过。

---

## 📄 New Documentation / 新增文档

| File | Content |
|---|---|
| `docs/obsidian-api-compatibility.md` | Full audit of every Obsidian API used, with `@since` versions, deprecation status, risk register, and migration path |
| `docs/timeout-fix-plan.md` | Root cause analysis and fix plan for the cold-start timeout (preserved for reference) |

---

## 📊 Official Review Compliance Status / 官方 review 合规状态

| Issue | Status |
|-------|--------|
| **Disclosure**: External network requests to `mdfriday.com` | ✅ **Documented in README in this release** |
| **Disclosure**: `btoa`/`atob` runtime base64 usage | ✅ **Documented in README and code comments in this release** |
| **Warning**: Direct Filesystem Access (`fs` module) | ✅ Fixed in v26.7.11 |
| **Warning**: `globals` not in devDependencies | ✅ Fixed in v26.7.10 |
| **Warning**: `{}` empty object type | ✅ Fixed in v26.7.10 |
| **Warning**: Unnecessary type assertions | ✅ Fixed in v26.7.10 |
| **Recommendation**: Vault Enumeration (`vault.getFiles`) | ✅ Documented — inherent to sync plugin |
| **Recommendation**: localStorage usage | ✅ Migrated to `app.saveLocalStorage/loadLocalStorage` (v26.7.10) |

---

## 🔄 Version Compatibility Matrix / 版本兼容矩阵

| Obsidian version / Obsidian 版本 | Plugin version received / 获得的插件版本 |
|---|---|
| < 1.8.7 | Not installable / 无法安装 |
| 1.8.7 – 1.12.x | v26.7.13 (this release) |
| ≥ 1.13.0 | v26.7.13 (this release) |

> Previous versions (v26.7.4–v26.7.12) incorrectly declared `minAppVersion: "1.13.0"`, blocking users on 1.8.7–1.12.x. This is corrected in v26.7.13.
>
> 之前版本（v26.7.4–v26.7.12）错误声明 `minAppVersion: "1.13.0"`，阻止了 1.8.7–1.12.x 用户安装。本版本已修正。

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Sync core package** / 同步核心包：[npmjs.com/package/@mdfriday/sync-core](https://www.npmjs.com/package/@mdfriday/sync-core)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

