# MDFriday Sync — Release Notes v26.7.9

> Released: July 9, 2026  发布日期：2026 年 7 月 9 日

---

## 📋 Overview / 概述

This release is a **code quality & compliance** release focused on making the plugin fully ready for the official Obsidian community plugin store review. It introduces zero-warning ESLint enforcement, fixes several Obsidian API compliance issues, and removes an unused code path that brought in unnecessary Node.js dependencies.

本版本是**代码质量与合规性**版本，重点是让插件完全通过 Obsidian 官方社区插件商店审查。引入零警告 ESLint 强制检查，修复多项 Obsidian API 合规问题，并移除了引入不必要 Node.js 依赖的未使用代码。

---

## ✅ ESLint Zero-Warning Enforcement / ESLint 零警告强制

The codebase now passes `eslint --max-warnings=0` with the official `eslint-plugin-obsidianmd` ruleset. This is enforced via the new `lint:ci` script.

代码库现在通过官方 `eslint-plugin-obsidianmd` 规则集的 `eslint --max-warnings=0` 检查。通过新增的 `lint:ci` 脚本强制执行。

| 规则类别 | 修复前 | 修复后 |
|---------|--------|--------|
| `no-unused-vars` / imports | 319 | 0 ✅ |
| `no-restricted-globals` (localStorage) | 16 | 0 ✅ |
| `no-undef` (Buffer 跨平台) | 18 | 0 ✅ |
| `@typescript-eslint/no-deprecated` | 12 | 0 ✅ |
| `no-tfile-tfolder-cast` | 5 | 0 ✅ |
| `no-unsafe-*` 系列 | 43 | 0 ✅ |
| `hardcoded-config-path` | 7 | 0 ✅ |
| `prefer-update-over-display` | 9 | 0 ✅ |
| `ui/sentence-case` | 1 | 0 ✅ |
| **合计** | **453** | **0** ✅ |

New CI scripts added to `package.json` / 新增 CI 脚本：

```json
"lint:ci": "eslint src/ --max-warnings=0"
```

---

## 🐛 Bug Fixes & API Compliance / 错误修复与 API 合规

### 1. Vault-isolated Storage / 存储数据 vault 级别隔离

**Problem / 问题：** `FridayServiceHub` used `window.localStorage` directly to store sync state. All Obsidian vaults shared the same storage namespace, causing data leakage between different vaults.

**问题说明：** `FridayServiceHub` 直接使用 `window.localStorage` 存储同步状态，所有 Obsidian vault 共享同一命名空间，导致不同 vault 之间数据互相干扰。

**Fix / 修复：** Migrated to Obsidian's vault-scoped `App#saveLocalStorage` / `App#loadLocalStorage` API:

```typescript
// Before / 修复前 — shared across all vaults
localStorage.setItem(`friday-sync-${key}`, JSON.stringify(value));
localStorage.getItem(`friday-sync-${key}`);

// After / 修复后 — scoped per vault
app.saveLocalStorage(`friday-sync-${key}`, value);
app.loadLocalStorage(`friday-sync-${key}`);
```

---

### 2. Settings Tab API (Obsidian 1.13+) / 设置页 API 升级

**Problem / 问题：** `MdfridaySyncSettingTab` called `this.display()` to refresh settings (deprecated since Obsidian 1.13.0), and used `.setWarning()` which is also deprecated.

**问题说明：** `MdfridaySyncSettingTab` 调用 `this.display()` 刷新设置页（自 Obsidian 1.13.0 起弃用），以及使用已弃用的 `.setWarning()`。

**Fix / 修复：** 9 instances of `this.display()` → `this.update()`; `.setWarning()` → `.setDestructive()`.

```typescript
// Before / 修复前
this.display();
button.setWarning();

// After / 修复后
this.update();
button.setDestructive();
```

---

### 3. Type-safe File Checks / 类型安全的文件检查

**Problem / 问题：** Several places cast `AbstractFile` directly to `TFile` using `as TFile`, bypassing TypeScript's type safety.

**问题说明：** 多处直接将 `AbstractFile` 强制转换为 `TFile`，绕过 TypeScript 类型安全检查。

**Fix / 修复：** All 5 cast sites replaced with `instanceof TFile` checks in `FridayServiceHub.ts` and `FridaySyncCore.ts`.

---

### 4. Removed Unused LLM HTTP Client / 移除未使用的 LLM HTTP 客户端

**Problem / 问题：** `src/http.ts` contained `ObsidianLLMHttpClient` — a Node.js `http`/`https` streaming client that was never called by any plugin code. It caused `no-nodejs-modules` violations and pulled in implicit Node.js type dependencies.

**问题说明：** `src/http.ts` 包含从未被任何插件代码调用的 `ObsidianLLMHttpClient`（基于 Node.js `http`/`https` 的流式客户端），造成 `no-nodejs-modules` 违规并引入隐式 Node.js 类型依赖。

**Fix / 修复：** Entire class removed. All HTTP communication in the plugin uses Obsidian's `requestUrl`.

---

### 5. Path Module: Explicit `path-browserify` Import / 显式使用 `path-browserify`

**Problem / 问题：** `src/main.ts` and `src/foundry/index.ts` imported `from 'path'` (Node.js built-in), relying silently on the esbuild `alias: { path: 'path-browserify' }` to make it mobile-safe.

**问题说明：** `src/main.ts` 和 `src/foundry/index.ts` 从 `'path'`（Node.js 内置模块）导入，依赖 esbuild 的 alias 配置隐式转换为 `path-browserify`，不够明确。

**Fix / 修复：** Changed to explicit `import from 'path-browserify'`, making the mobile-safe intent clear without relying on build-time magic.

---

### 6. Locale Descriptions No Longer Hardcode `.obsidian` / Locale 描述不再硬编码 `.obsidian`

**Problem / 问题：** Three setting description strings mentioned `.obsidian/themes`, `.obsidian/snippets`, `.obsidian/plugins` — but Obsidian allows users to configure a custom config directory name.

**问题说明：** 三处设置描述字符串硬编码了 `.obsidian/themes`、`.obsidian/snippets`、`.obsidian/plugins`，但 Obsidian 允许用户自定义配置目录名称。

**Fix / 修复:** Updated to use generic descriptions:

| | Before / 修复前 | After / 修复后 |
|-|----------|---------|
| EN | `from .obsidian/themes folder` | `from the vault's themes folder` |
| EN | `from .obsidian/snippets folder` | `from the vault's snippets folder` |
| EN | `from .obsidian/plugins folder` | `from the vault's plugins folder` |

---

## 🔧 Developer Tooling / 开发工具链

### Official ESLint Configuration Added / 新增官方 ESLint 配置

Added `eslint.config.js` using `eslint-plugin-obsidianmd` (the official Obsidian plugin linting ruleset). Key design decisions:

新增 `eslint.config.js`，使用 `eslint-plugin-obsidianmd`（Obsidian 官方 ESLint 插件规则集）。关键设计决策：

- All official `recommended` rules are **enabled** — no global rule suppressions for review-critical rules
- `src/foundry/index.ts` has a config-level `no-nodejs-modules: off` override (the entire file is a desktop-only module dynamically loaded behind `Platform.isDesktop`)
- `@ts-ignore` is now flagged (rule: `ban-ts-comment: warn`); all instances replaced with `@ts-expect-error` + description

所有官方 `recommended` 规则均**启用**——对审查关键规则不再全局关闭。

```
新增脚本 / New scripts:
  npm run lint      → eslint src/
  npm run lint:fix  → eslint src/ --fix
  npm run lint:ci   → eslint src/ --max-warnings=0  ← CI 严格模式
```

---

## 🔄 Version Compatibility Matrix / 版本兼容矩阵

| Obsidian version / Obsidian 版本 | Plugin version received / 获得的插件版本 |
|---|---|
| < 1.0.0 | Not installable / 无法安装 |
| 1.0.0 – 1.3.x | v26.7.1 |
| 1.4.0 – 1.7.1 | v26.7.2 |
| 1.7.2 – 1.12.x | v26.7.3 |
| ≥ 1.13.0 | v26.7.9 (latest / 最新) |

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Sync core package** / 同步核心包：[npmjs.com/package/@mdfriday/sync-core](https://www.npmjs.com/package/@mdfriday/sync-core)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

