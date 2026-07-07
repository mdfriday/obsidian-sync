# MDFriday Sync — Release Notes v26.7.8

> Released: July 7, 2026  发布日期：2026 年 7 月 7 日

---

## 📋 Overview / 概述

This release introduces a major **architectural refactor**: the sync core logic (`sync/core/` + `sync/features/`) has been extracted into a standalone NPM package [`@mdfriday/sync-core`](https://www.npmjs.com/package/@mdfriday/sync-core), and several mobile/desktop compatibility bugs are fixed.

本版本引入重大**架构重构**：将同步核心逻辑（`sync/core/` + `sync/features/`）提取为独立 NPM 包 [`@mdfriday/sync-core`](https://www.npmjs.com/package/@mdfriday/sync-core)，并修复了多个移动端 / 桌面端兼容性问题。

---

## 🏗️ Architecture Change / 架构变更

### Sync Core extracted to `@mdfriday/sync-core@0.1.0`

The following directories have been extracted to a separate, independently publishable NPM package:

以下目录已提取为独立 NPM 包：

- `src/sync/core/` — PouchDB、CouchDB 复制逻辑、加密、服务层
- `src/sync/features/` — ConnectionMonitor、HiddenFileSync、NetworkEvents、OfflineTracker、ServerConnectivity、ConnectionFailure

**Benefits / 优势：**

| 维度 | 效果 |
|------|------|
| 代码隔离 | sync 核心与 Obsidian API 完全解耦 |
| 独立测试 | sync-core 可在无 Obsidian 环境下单元测试 |
| 版本管理 | sync 核心可独立发布、独立迭代 |
| 复用性 | 其他非 Obsidian 项目可直接引用 `@mdfriday/sync-core` |

**Adapter layer / 适配层** (留在插件内，不变):

新增三个 Obsidian 适配器，将 sync-core 的平台无关接口桥接到 Obsidian API：

- `ObsidianDomEventRegistrar` — 封装 `Plugin.registerDomEvent`
- `ObsidianVaultFileLister` — 封装 `vault.adapter.*` 全部文件操作
- `ObsidianHttpClient` — 封装 `requestUrl`

---

## 🐛 Bug Fixes / 错误修复

### 1. Mobile: `Attempting to load NodeJS package: "path"` / 移动端加载 Node.js 模块报错

**Root cause / 根本原因:**  
`src/foundry/index.ts` 在顶层 `import * as nodePath from 'path'`，在 Obsidian mobile（无 Node.js 运行时）直接报错。

**Fix / 修复:**  
esbuild 中将 `path` 从 externals 移除，改为 alias 到 `path-browserify`（浏览器兼容实现）：
```javascript
// esbuild.config.mjs
alias: { 'path': 'path-browserify' }
```

---

### 2. Mobile: `Attempting to load NodeJS package: "http"/"https"` / 移动端加载 http/https 报错

**Root cause / 根本原因:**  
`src/http.ts` 顶层存在 `import * as http from 'http'` 和 `import * as https from 'https'`，但这两个 import 实际上**完全未被使用**（所有 HTTP 调用均通过 Obsidian 的 `requestUrl`）。

**Fix / 修复:**  
直接删除这两行无用 import。

---

### 3. `this.adapter.getRoot is not a function` / HiddenFileSync 运行时崩溃

**Root cause / 根本原因:**  
`IVaultFileLister` 接口扩展后增加了 `getRoot()`、`stat()`、`read()`、`write()` 等方法，但 `ObsidianVaultFileLister` 适配器只实现了 `list()`，其余方法均缺失。

**Fix / 修复:**  
完整实现 `ObsidianVaultFileLister`，全部委托给 `plugin.app.vault` 和 `plugin.app.vault.adapter`：

```typescript
// 现在完整实现：
list() / stat() / exists() / read() / readBinary()
write() / writeBinary() / setMtime() / remove() / mkdir()
createFolder() / getRoot() / configDir
```

---

### 4. `_changes` long-poll 请求间歇性 timeout 日志 / 日志噪音

**Root cause / 根本原因:**  
`FridayServiceHub.connect()` 对所有 PouchDB HTTP 请求统一施加 30s 客户端超时，而 CouchDB `_changes` 长轮询的 heartbeat 也是 30s，导致二者**竞态**：timeout 与 heartbeat 同时到期，随机一方先触发。

**Impact / 影响:**  
仅产生 console 日志噪音，PouchDB 的 `retry: true` 确保同步自动重试继续，**不影响实际同步功能**。

**Fix / 修复:**  
`_changes` 请求跳过客户端超时（与原始 livesync 行为一致），其余请求保留 30s 超时：

```typescript
const isChanges = reqUrl.includes('/_changes');
const result = isChanges
    ? await requestPromise          // _changes: 不加客户端超时
    : await Promise.race([...]);    // 普通请求: 保留 30s 超时
```

---

## 📦 New Dependency / 新增依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `@mdfriday/sync-core` | `^0.1.0` | 同步核心逻辑（原 `src/sync/sync-core/`）|
| `path-browserify` | latest | 替代 Node.js `path`，支持 mobile |

---

## 🔄 Version Compatibility Matrix / 版本兼容矩阵

| Obsidian version / Obsidian 版本 | Plugin version received / 获得的插件版本 |
|---|---|
| < 1.0.0 | Not installable / 无法安装 |
| 1.0.0 – 1.3.x | v26.7.1 |
| 1.4.0 – 1.7.1 | v26.7.2 |
| 1.7.2 – 1.12.x | v26.7.3 |
| ≥ 1.13.0 | v26.7.8 (latest / 最新) |

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Sync core package** / 同步核心包：[npmjs.com/package/@mdfriday/sync-core](https://www.npmjs.com/package/@mdfriday/sync-core)
- **Sync core source** / 同步核心源码：[github.com/mdfriday/sync-core](https://github.com/mdfriday/sync-core)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

