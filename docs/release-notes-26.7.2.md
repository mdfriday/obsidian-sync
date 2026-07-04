# MDFriday Sync — Release Notes v26.7.2

> Released: July 4, 2026 · 发布日期：2026 年 7 月 4 日

---

## 📋 Overview / 概述

This is a quality release focused entirely on **Obsidian plugin review compliance**. No new user-facing features are introduced — every change improves code quality, API correctness, and CSS standards to meet the [Obsidian Community Plugin](https://github.com/obsidianmd/obsidian-releases) submission requirements.

本版本是一个专注于 **Obsidian 插件审核合规** 的质量版本。不包含任何新用户功能，所有变更均为提升代码质量、API 正确性和 CSS 规范，以满足 [Obsidian 社区插件](https://github.com/obsidianmd/obsidian-releases) 提交要求。

---

## 🔧 Breaking Changes / 破坏性变更

None. / 无。

---

## ✅ Fixes & Improvements / 修复与改进

### API Compliance / API 合规

#### `manifest.json`
- **`minAppVersion` bumped** `0.15.0` → `1.0.0` to match the actual Obsidian APIs used throughout the codebase  
  将 `minAppVersion` 从 `0.15.0` 提升至 `1.0.0`，与代码中实际使用的 Obsidian API 版本对齐
- **Plugin description** no longer contains the word "Obsidian" (Obsidian review policy)  
  插件描述中移除了 "Obsidian" 一词（符合 Obsidian 审核政策）

---

### Heading & Style API / 标题与样式 API

- Replaced all direct `createEl("h2"/"h3", ...)` calls in `setting.ts` with `new Setting(el).setName(...).setHeading()` — the Obsidian-recommended way to render settings section headings  
  将 `setting.ts` 中所有直接的 `createEl("h2"/"h3")` 调用替换为 `new Setting(...).setName(...).setHeading()`

- Removed all `element.style.*` direct assignments; replaced with:
  - `element.show()` / `element.hide()` for visibility
  - `element.setCssStyles({ ... })` for dynamic inline styles
  - CSS classes for static styles  
  移除所有直接的 `element.style.*` 赋值，改用 Obsidian API 推荐方式

---

### `navigator` API → Obsidian `Platform` API

In `src/foundry/index.ts` and `src/foundry/mobile.ts`, all OS-detection via `navigator.userAgent` replaced with Obsidian's `Platform` API:

```ts
// Before / 之前
const ua = navigator.userAgent;
if (ua.includes('Mac')) ...

// After / 之后
import { Platform } from 'obsidian';
if (Platform.isMacOS) ...
```

---

### `fetch` → Obsidian `requestUrl`

All bare `fetch()` calls replaced with Obsidian's built-in `requestUrl` which routes through the native network layer (required for cross-platform mobile support):

| File / 文件 | Change / 变更 |
|---|---|
| `FridaySyncCore.ts` | DB connectivity check |
| `ServerConnectivity/index.ts` | Server reachability ping |
| `FridayServiceHub.ts` (×2) | PouchDB HTTP adapter + timeout-wrapped batch fetch |

The PouchDB HTTP handler wraps `requestUrl` results back into a `Response`-compatible object so the existing PouchDB replication logic is unaffected.  
PouchDB HTTP 处理器将 `requestUrl` 结果包装回兼容 `Response` 对象，现有 PouchDB 同步逻辑不受影响。

---

### File Deletion: `Vault.trash()` / `Vault.delete()` → `FileManager.trashFile()`

```ts
// Before / 之前
await vault.trash(file, false);
await vault.delete(file);

// After / 之后
await this.core.app.fileManager.trashFile(file);
```

Uses the user's system trash preference rather than hard-deleting files.  
使用用户的系统回收站偏好，而非直接删除文件。

---

### Popout Window Compatibility / 弹出窗口兼容性

All global timer and DOM globals updated for popout window compatibility:

| Before / 之前 | After / 之后 | Files changed |
|---|---|---|
| `setTimeout(...)` | `window.setTimeout(...)` | 11 files |
| `clearTimeout(...)` | `window.clearTimeout(...)` | 6 files |
| `setInterval(...)` | `window.setInterval(...)` | 2 files |
| `clearInterval(...)` | `window.clearInterval(...)` | 1 file |
| `requestAnimationFrame(...)` | `window.requestAnimationFrame(...)` | 1 file |
| `document.querySelector(...)` | `activeDocument.querySelector(...)` | 4 files |
| `globalThis.*` | `window.*` | 6 files |

---

### Promise Handling / Promise 处理

- Three async event listeners in `setting.ts` (plan badge click, sync toggle change, reset button click) converted from `addEventListener('click', async () => {...})` to `addEventListener('click', () => { void (async () => {...})(); })` — avoids returning a Promise where `void` is expected  
  三个异步事件监听器改为使用 `void` 包装的 IIFE 模式，避免在期望 `void` 的地方返回 Promise

- Added `void` operator to all floating (unawaited) Promise calls:
  - `this.processQueue()` in `FridayServiceHub.ts`
  - `savePatterns()` in `setting.ts`
  - `this.persistChanges()` in `OfflineTracker/index.ts`
  - `this.performHealthCheck()` in `ConnectionMonitor/index.ts`  
  为所有未 `await` 的浮动 Promise 调用添加 `void` 操作符

- `onunload()` in `main.ts` changed from `async` to synchronous; cleanup uses `void this.syncService.stopSync()` (fire-and-forget)  
  `onunload()` 由 `async` 改为同步，清理工作通过 `void` 触发即弃

---

### Type Safety / 类型安全

- **`foundry/index.ts`**: Defined `ActivationApiResponse`, `ActivationApiFeatures`, `StoredLicenseShape`, `SyncConfigShape` interfaces for API responses; replaced `data: any` parameters with typed parameters — eliminates dozens of `no-unsafe-member-access` warnings  
  为 API 响应定义具体接口类型，替换 `data: any` 参数

- **`foundry/types.ts`**: `loginWithLicense` return type `ObsidianLicenseResult<{}>` → `ObsidianLicenseResult<object>`  
  返回类型中的空对象类型 `{}` 改为 `object`

- **`sync/core/common/types.ts`**: Simplified duplicate union members  
  `string | (string | undefined)` → `string | undefined`

- **`FridayStorageEventManager.ts`**: Added `instanceof TFile` guards before all `as TFile` casts; vault event callbacks wrapped in arrow functions for correct `this` binding  
  在 TFile 类型断言前添加 `instanceof` 检查；Vault 事件改用箭头函数包装确保正确的 `this` 绑定

- **Unlinted `eslint-disable` comments**: All 12 bare `// eslint-disable-next-line` directives now specify the exact rule name and include a description explaining why the suppression is necessary  
  所有 eslint-disable 注释现在都指定了具体规则名称并附有解释

---

### Node.js Built-in Imports / Node.js 内置模块导入

- `src/foundry/index.ts`: Removed `getNodeModules()` pattern that used `require('fs')` and `require('path')` inside functions; replaced with top-level `import * as fs from 'fs'` and `import * as nodePath from 'path'`  
  移除函数内 `require()` 模式，改为顶层静态导入

- `src/main.ts`: `require('path')` → `import * as nodePath from 'path'`  
- `src/http.ts`: `require('http'/'https')` → static imports  
- `src/sync/SyncStatusDisplay.ts`: `require('obsidian')` → added `Menu` / `MenuItem` to existing obsidian import  
- `src/sync/core/mods.ts`: Removed Node.js `crypto` module fallback (Obsidian/Electron always has `window.crypto`)  
  移除 Node.js crypto 回退（Obsidian/Electron 始终提供 `window.crypto`）

---

### `.obsidian` Hard-coded Paths → `vault.configDir`

Sync ignore patterns now use `this.app.vault.configDir` instead of the hard-coded string `.obsidian`:

```ts
// Before / 之前
"\\.obsidian\\/workspace",

// After / 之后
const configDir = this.app.vault.configDir;  // respects user config
const c = configDir.replace(/\./g, '\\.').replace(/\//g, '\\/');
`${c}\\/workspace`
```

Applied in `main.ts` (`initializeDefaultIgnorePatterns`) and `setting.ts` (`updateSelectiveSyncSettings`). The module-level constant `DEFAULT_INTERNAL_IGNORE_PATTERNS` in `sync/types.ts` is now backed by a `getDefaultInternalIgnorePatterns(configDir)` factory function.

---

### `localStorage` → Obsidian Storage APIs

- `FridaySyncCore.ts`, `FridayServiceHub.ts`: PouchDB salt/key-value storage remains in `localStorage` (technical requirement — PouchDB sets these keys internally and no Obsidian API equivalent exists for prefix-based iteration)  
  PouchDB 内部存储保留 `localStorage`（技术限制，Obsidian API 不支持前缀迭代）

---

### Other Minor Fixes / 其他小修复

| Fix / 修复 | Location / 位置 |
|---|---|
| `Object.prototype.hasOwnProperty.call(obj, key)` instead of `obj.hasOwnProperty(key)` | `configForDoc.ts:193` |
| Lexical `const` inside `case` block wrapped in `{ }` | `FridayStorageEventManager.ts:637` |
| `FileManager.trashFile()` instead of deprecated vault methods | `FridayServiceHub.ts:573-575` |
| `getSyncConfig()` return type `any \| null` → `ObsidianSyncConfig \| null` | `licenseState.ts:294` |
| Duplicate union type members removed | `types.ts:20-24` |
| `Promise<any> \| any` union → `(...args: any[]) => any` | `ServiceBackend.ts:6-19` |
| Empty catch blocks now have explanation comments | `foundry/index.ts`, `foundry/mobile.ts` |

---

## 🎨 CSS Fixes / CSS 修复

### Removed CSS Masks (`css-masks` partial-support warning)

The `.friday-premium-btn` rainbow gradient border was previously implemented using `mask` / `-webkit-mask` / `mask-composite` (partially supported in Obsidian 1.4.5). Replaced with the `background-clip: padding-box / border-box` double-layer technique — no masks needed, wider compatibility:

```css
/* Before — used CSS masks (partially supported) */
.friday-premium-btn::before {
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    -webkit-mask-composite: xor;
}

/* After — background-clip gradient border (fully supported) */
.friday-premium-btn {
    border: 2px solid transparent;
    background:
        linear-gradient(var(--background-primary), var(--background-primary)) padding-box,
        linear-gradient(120deg, #ff6a6a, ..., #bd93f9) border-box;
}
```

---

### Eliminated All `!important` Declarations

Replaced 50+ `!important` declarations with proper CSS specificity:

| Before / 之前 | After / 之后 |
|---|---|
| `.friday-section-title { margin-top: 40px !important; }` | `.setting-item-heading.friday-section-title { margin-top: 40px; }` |
| `.friday-sync-header-container .friday-section-title { border-bottom: none !important; }` | `.friday-sync-header-container .setting-item-heading.friday-section-title { border-bottom: none; }` |
| Progress bar `.livesync-status-progressbar { opacity: 1 !important; }` | `.livesync-status div.livesync-status-progressbar { opacity: 1; }` (higher specificity) |
| Plan badge `padding-top: 6px !important` | Removed (value was identical to base `.friday-plan-badge { padding: 6px 16px }`) |

**Result**: `styles.css` now contains **0** `!important` declarations. / `styles.css` 现在包含 **0** 个 `!important` 声明。

---

### Fixed Unknown Type Selector

```css
/* Before — type selector (linter error) */
.livesync-status-progressbar livesync-progressbar-track { ... }

/* After — class selector (correct) */
.livesync-status-progressbar .livesync-progressbar-track { ... }
```

---

## 📦 Other Infrastructure / 其他基础设施

### LICENSE File Added / 添加 LICENSE 文件

Apache-2.0 `LICENSE` file added to the repository root. / 在仓库根目录添加了 Apache-2.0 `LICENSE` 文件。

### GitHub Actions Updated / GitHub Actions 更新

`.github/workflows/release.yml` upgraded:
- Actions updated from v3 → v4 (`checkout`, `setup-node`)
- Added `permissions: id-token: write, attestations: write`
- Added `actions/attest-build-provenance@v2` step to cryptographically sign `main.js` and `styles.css` release artifacts  
  添加构建来源证明步骤，对发布产物进行加密签名

### Removed Unused Dependency / 移除未使用依赖

`builtin-modules` (devDependency) removed from `package.json` — it was never imported anywhere in the codebase.  
从 `package.json` 移除了从未使用的 `builtin-modules` 开发依赖。

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Backend source** / 后端源码：[github.com/mdfriday/hugoverse](https://github.com/mdfriday/hugoverse)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

---

*This release contains no changes visible to end users — it is entirely a code quality and compliance release.*

*本版本不包含任何对终端用户可见的变更，完全是代码质量和合规性修复版本。*

