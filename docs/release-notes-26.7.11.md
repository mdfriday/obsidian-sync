# MDFriday Sync — Release Notes v26.7.11

> Released: July 9, 2026  发布日期：2026 年 7 月 9 日

---

## 📋 Overview / 概述

This release eliminates the **"Direct Filesystem Access"** warning from the Obsidian official review scanner by replacing the Node.js `fs` module in `foundry/index.ts` (the desktop workspace service) with Obsidian's `vault.adapter` API. The desktop implementation now follows the exact same pattern as the mobile implementation (`foundry/mobile.ts`), achieving full architectural parity between platforms.

本版本通过将 `foundry/index.ts`（桌面端 workspace 服务）中的 Node.js `fs` 模块替换为 Obsidian 官方的 `vault.adapter` API，消除了官方 review 扫描器的 **"Direct Filesystem Access"** 警告。桌面端实现现在与移动端实现（`foundry/mobile.ts`）采用完全相同的模式，实现了跨平台架构统一。

---

## 🐛 Bug Fixes & Compliance / 错误修复与合规

### 1. Desktop Workspace Services: Replace `fs` with `vault.adapter` / 桌面端服务：`fs` 替换为 `vault.adapter`

**Problem / 问题：** `src/foundry/index.ts` imported `import * as fs from 'fs'` (Node.js built-in) to read/write workspace config files (auth token, license, sync config). This triggered a **Warning** in the Obsidian official review:

> **Warning**: Direct Filesystem Access — Uses the Node.js `fs` module to access the filesystem outside of the Obsidian vault API. Can read and write any file on the system.

**问题说明：** `src/foundry/index.ts` 使用 `import * as fs from 'fs'`（Node.js 内置模块）读写 workspace 配置文件（auth token、license、同步配置），触发 Obsidian 官方 review 的 Warning：直接文件系统访问。

**Fix / 修复：** Replaced all `fs` calls with Obsidian's `vault.adapter` API, matching the pattern already used in `foundry/mobile.ts`:

**替换对应关系 / API mapping:**

| Before (Node.js `fs`) | After (Obsidian `vault.adapter`) |
|-----------------------|----------------------------------|
| `fs.readFileSync(path, 'utf8')` | `await vault.adapter.read(path)` |
| `fs.writeFileSync(path, content)` | `await vault.adapter.write(path, content)` |
| `fs.mkdirSync(dir, {recursive})` | `await vault.adapter.mkdir(dir)` |
| `fs.accessSync(path)` | `await vault.adapter.exists(path)` |
| Absolute paths | Vault-relative paths |

**Path format change / 路径格式变化:**

```
Before / 修复前（绝对路径）：
  /Users/…/vault/.obsidian/plugins/mdfriday-sync/workspace/.mdfriday/user-data.json

After / 修复后（vault 相对路径）：
  .obsidian/plugins/mdfriday-sync/workspace/.mdfriday/user-data.json
```

**Service constructor update / 服务类构造函数更新：** All four service classes and factory functions now accept `vault: Vault` and `pluginDir: string`, mirroring `foundry/mobile.ts`:

```typescript
// Before / 修复前
createObsidianWorkspaceService()
createObsidianAuthService(httpClient)
createObsidianLicenseService(httpClient)
createObsidianGlobalConfigService()

// After / 修复后 (aligned with mobile.ts)
createObsidianWorkspaceService(vault, pluginDir)
createObsidianAuthService(httpClient, vault, pluginDir)
createObsidianLicenseService(httpClient, vault, pluginDir)
createObsidianGlobalConfigService(vault, pluginDir)
```

---

### 2. `main.ts`: Remove `path-browserify` Import / 移除 `path-browserify` 导入

Since the desktop service no longer needs absolute path construction, the `import * as nodePath from 'path-browserify'` in `main.ts` is removed. Desktop `absWorkspacePath` is now computed the same way as mobile:

```typescript
// Before / 修复前 — absolute path via path-browserify
this.absWorkspacePath = nodePath.join(basePath, this.pluginDir, 'workspace');

// After / 修复后 — vault-relative, same as mobile
this.absWorkspacePath = joinVaultPath(this.pluginDir, 'workspace');
```

---

## 🏗️ Architecture: Desktop ↔ Mobile Parity / 架构：桌面端与移动端统一

`foundry/index.ts` and `foundry/mobile.ts` now share the same file I/O pattern. Both use `vault.adapter` with vault-relative paths. The only remaining difference is how they receive `vault` and `pluginDir` from their factory functions.

`foundry/index.ts` 和 `foundry/mobile.ts` 现在共享相同的文件 I/O 模式，均使用 `vault.adapter` 和 vault 相对路径。仅有的区别是工厂函数接收 `vault` 和 `pluginDir` 的方式。

```
Before / 修复前：
  mobile.ts  → vault.adapter ✅
  index.ts   → Node.js fs   ❌

After / 修复后：
  mobile.ts  → vault.adapter ✅
  index.ts   → vault.adapter ✅  (unified / 统一)
```

---

## 🔧 Developer Tooling / 开发工具链

### 3. ESLint Config Simplified / ESLint 配置简化

The `foundry/index.ts` per-file `no-nodejs-modules: off` override in `eslint.config.js` is removed — it was the last remaining ESLint config-level exception. The `no-nodejs-modules` rule is now fully enforced across all source files with no overrides.

`eslint.config.js` 中为 `foundry/index.ts` 设置的 `no-nodejs-modules: off` 配置级例外已删除——这是最后一个 ESLint 配置级例外。`no-nodejs-modules` 规则现在在所有源文件中全面执行，无任何例外。

### 4. Tests Updated / 测试适配

`tests/foundry-desktop.test.ts` is updated to match the new API:
- Added `mkVault()` — a mock `Vault` that delegates `adapter.read/write/exists/mkdir` to real Node.js `fs` in a temp directory
- All factory calls updated to pass `vault, pluginDir`
- Path helpers updated to reflect the new vault-relative directory layout

---

## 📊 Official Review Compliance Status / 官方 review 合规状态

| Issue | Status |
|-------|--------|
| **Warning**: Direct Filesystem Access (`fs` module) | ✅ **Fixed in this release** |
| **Warning**: `globals` not in devDependencies | ✅ Fixed in v26.7.10 |
| **Warning**: `{}` empty object type | ✅ Fixed in v26.7.10 |
| **Warning**: Unnecessary type assertions (30 sites) | ✅ Fixed in v26.7.10 |
| **Warning**: Do not import Node.js builtin `"fs"` (ESLint) | ✅ Fixed in this release |
| **Recommendation**: Vault Enumeration (`vault.getFiles`) | ✅ Documented — inherent to sync plugin |
| **Recommendation**: localStorage usage | ✅ Migrated to `app.saveLocalStorage/loadLocalStorage` (v26.7.10) |

---

## 🔄 Version Compatibility Matrix / 版本兼容矩阵

| Obsidian version / Obsidian 版本 | Plugin version received / 获得的插件版本 |
|---|---|
| < 1.0.0 | Not installable / 无法安装 |
| 1.0.0 – 1.3.x | v26.7.1 |
| 1.4.0 – 1.7.1 | v26.7.2 |
| 1.7.2 – 1.12.x | v26.7.3 |
| ≥ 1.13.0 | v26.7.11 (latest / 最新) |

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Sync core package** / 同步核心包：[npmjs.com/package/@mdfriday/sync-core](https://www.npmjs.com/package/@mdfriday/sync-core)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

