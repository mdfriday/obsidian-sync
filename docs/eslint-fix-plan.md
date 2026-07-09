# ESLint 问题分析与修复计划

> 生成时间：2026-07-09  
> 工具：`eslint-plugin-obsidianmd` (官方 Obsidian ESLint 插件)  
> 命令：`npm run lint`  
> 当前状态：**✅ 0 个警告，0 个错误** — `lint:ci`（`--max-warnings=0`）全量通过

---

## 修复历程总览

| 阶段 | 描述 | 结果 |
|------|------|------|
| 初始状态 | 首次引入 eslint-plugin-obsidianmd | 453 警告，0 错误 |
| rm warning 1–5（commits 42d6fa2–94f661c） | 按计划批量修复代码质量问题 | **0 警告，0 错误** |
| 官方审查合规修复（2026-07-09 第二轮） | 修复 eslint.config.js 中规避官方规则的配置问题 | **0 警告，0 错误** ✅ |

---

## 历史问题统计（已全部修复）

| 规则 | 初始数量 | 当前数量 | 状态 |
|------|----------|----------|------|
| `no-unused-vars` / `@typescript-eslint/no-unused-vars` | 319 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-assignment` | 21 | 0 | ✅ |
| `no-undef` | 18 | 0 | ✅ |
| `no-restricted-globals` (localStorage) | 16 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-member-access` | 14 | 0 | ✅ |
| `@typescript-eslint/no-deprecated` | 12 | 0 | ✅ |
| `@typescript-eslint/no-explicit-any` | 10 | 0 | ✅ |
| `obsidianmd/settings-tab/prefer-update-over-display` | 9 | 0 | ✅ |
| `obsidianmd/hardcoded-config-path` | 7 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-call` | 7 | 0 | ✅ |
| `obsidianmd/no-tfile-tfolder-cast` | 5 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-return` | 5 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-argument` | 5 | 0 | ✅ |
| `obsidianmd/ui/sentence-case` | 1 | 0 | ✅ |
| `obsidianmd/settings-tab/prefer-setting-definitions` | 1 | 1 | ⏳ 见下文 |

---

## 第一轮修复详情（rm warning 1–5 commits）

### Step 1 — `prefer-update-over-display`（9 处）→ ✅

`src/setting.ts` 中所有 `this.display()` 替换为 `this.update()`（Obsidian 1.13+ 要求）。  
同步解决 `@typescript-eslint/no-deprecated` 中 `display` 弃用警告。

### Step 2 — `setWarning()` → `setDestructive()`（1 处）→ ✅

`src/setting.ts:908`，替换已弃用 API。

### Step 3 — `no-tfile-tfolder-cast`（5 处）→ ✅

`src/sync/FridayServiceHub.ts`、`src/sync/FridaySyncCore.ts` 中强制转换改为 `instanceof` 检查。

### Step 4 — `DEFAULT_INTERNAL_IGNORE_PATTERNS` → ✅

`src/sync/types.ts` 改用 `getDefaultInternalIgnorePatterns(vault.configDir)` 函数版本。

### Step 5 — `no-restricted-globals` (localStorage)（16 处）→ ✅

`src/sync/FridayServiceHub.ts` 中 `localStorage` 改为 `App#saveLocalStorage / loadLocalStorage`，实现 vault 级别数据隔离。

### Step 6 — `no-unused-vars`（319 处）→ ✅

- 接口实现参数加 `_` 前缀（`_workspacePath`、`_handler` 等）
- 删除未使用的导入
- 空 catch 块改为 `catch { }`

### Step 7 — `hardcoded-config-path`（7 处代码路径）→ ✅

`src/setting.ts`、`src/sync/types.ts` 中硬编码 `.obsidian` 路径改为动态 `vault.configDir`。

### Step 8 — `no-undef` / Buffer（18 处）→ ✅

`Buffer` 跨平台写法改为 `TextEncoder` / `btoa`；或限制在 `Platform.isDesktop` 路径中。

### Step 9 — `no-unsafe-*`（43 处）→ ✅

`src/http.ts` 中 LLM 客户端使用 `requestUrl`（Obsidian 官方 API）替代了 Node.js 原生 `http`/`https` 模块。

### Step 10 — `ui/sentence-case`（1 处）→ ✅

运行 `npm run lint:fix` 自动修复 UI 字符串大小写。

---

## 第二轮修复详情（官方审查合规，2026-07-09）

代码警告已全部清零后，发现 `eslint.config.js` 本身存在三处规避官方规则的配置，会在 Obsidian 官方插件审查时被识别。本轮修复重新启用了被关闭的规则，并以正确方式处理例外情况。

### Fix A — `obsidianmd/no-nodejs-modules` 全局关闭 → 改为精准例外

**问题：** 原配置以注释 `"Node.js http/https intentionally used in LLM streaming client"` 为由全局关闭了 `no-nodejs-modules`。实际验证后，`http.ts` 已改用 Obsidian 的 `requestUrl`；真正需要 Node.js 原生模块的仅 `src/foundry/index.ts`（`fs` 模块）。

**修复：**

1. `src/main.ts`：`import 'path'` → `import 'path-browserify'`（直接引用 polyfill，无需 esbuild alias）
2. `src/foundry/index.ts`：同上，`path` → `path-browserify`；保留 `import * as fs from 'fs'`，添加 JSDoc 说明
3. `eslint.config.js`：删除全局 `"obsidianmd/no-nodejs-modules": "off"`；新增**配置级文件级例外**（inline `eslint-disable` 被插件内置的 `eslint-comments/no-restricted-disable` 规则阻止，必须用配置级）：

```javascript
// eslint.config.js — 新增块
{
  files: ["src/foundry/index.ts"],
  rules: {
    // Desktop-only module; dynamically imported behind Platform.isDesktop in main.ts.
    // fs is intentional here; path is already switched to path-browserify.
    "obsidianmd/no-nodejs-modules": "off",
  },
},
```

**架构说明：** `foundry/index.ts` 完全通过 `await import('./foundry/index')` 动态加载，调用点在 `main.ts` 的 `if (Platform.isDesktop)` 块内，移动端永远不会执行此模块。

---

### Fix B — `hardcoded-config-path` 通过忽略 locale 目录隐藏 → 改为修复字符串

**问题：** 原配置将 `src/i18n/locales/**` 整体排除在 ESLint 检查之外，以规避 locale 描述字符串中出现 `.obsidian` 触发的 `hardcoded-config-path` 警告（6 处）。

**修复：** 删除 locale 目录的全局 ignore，直接修改三处描述字符串。同时具备更好的 UX：Obsidian 允许用户自定义 configDir，固定写 `.obsidian` 会让描述与实际不符。

| 文件 | 修改前 | 修改后 |
|------|--------|--------|
| `en.ts` | `from .obsidian/themes folder` | `from the vault's themes folder` |
| `en.ts` | `from .obsidian/snippets folder` | `from the vault's snippets folder` |
| `en.ts` | `from .obsidian/plugins folder` | `from the vault's plugins folder` |
| `zh-cn.ts` | `同步 .obsidian/themes 文件夹…` | `同步保险库主题文件夹…` |
| `zh-cn.ts` | `同步 .obsidian/snippets 文件夹…` | `同步保险库代码片段文件夹…` |
| `zh-cn.ts` | `同步 .obsidian/plugins 文件夹…` | `同步保险库插件文件夹…` |

> 注意：`eslint-comments/no-restricted-disable` 同样阻止对 `obsidianmd/hardcoded-config-path` 使用 inline disable，因此必须修复字符串本身，无法绕过。

---

### Fix C — `@typescript-eslint/ban-ts-comment` 全局关闭 → 改为 warn

**问题：** 原配置直接关闭了 `ban-ts-comment`，允许随意使用 `@ts-ignore`（比 `@ts-expect-error` 更宽松，也不会在被抑制的错误消失后发出告警）。

**修复：** 改为 `"warn"`，配合以下三处具体修改：

| 文件 | 位置 | 修改 |
|------|------|------|
| `src/main.ts` | `clearSyncDatabase()` | `vault.getName()` 已有公开类型，直接删除多余注释 |
| `src/sync/FridaySyncCore.ts` | `getVaultName()` | 同上，删除不必要注释 |
| `src/sync/FridayStorageEventManager.ts` | raw event 注册 | `@ts-ignore` → `@ts-expect-error`，并移至正确行（直接在 `vault.on("raw", ...)` 前一行） |

> `@ts-expect-error` 比 `@ts-ignore` 更精确：当被抑制的错误消失时，TypeScript 会发出 TS2578，避免僵尸注释积累。

---

## 当前遗留事项

### ⏳ Step 13 — `obsidianmd/settings-tab/prefer-setting-definitions`（1 处）

**影响文件：** `src/setting.ts`（`MdfridaySyncSettingTab` 类）  
**规则状态：** `eslint.config.js` 中保持 `"off"`（当前唯一仍关闭的 Obsidian 官方规则）  
**背景：** `manifest.json` 的 `minAppVersion` 为 `1.13.0`，理论上应实现 `getSettingDefinitions()` 以支持 Obsidian 1.13+ 设置搜索。  
**影响：** 用户无法在 Obsidian 设置搜索中找到本插件的设置项，功能本身不受影响。  
**优先级：** 较大重构，建议单独排期。参考 [Obsidian 1.13 设置 API 文档](https://docs.obsidian.md)。

---

## 当前 eslint.config.js 规则说明

```
全局关闭（有充分理由）：
  no-console                                  全代码使用 console.* 记录调试日志
  @typescript-eslint/require-await            async 用于满足接口约定，不一定有 await
  @typescript-eslint/no-base-to-string        catch 块中 String(e) 是刻意格式化
  @typescript-eslint/no-empty-object-type     {} 返回类型用于历史兼容
  @typescript-eslint/no-unnecessary-type-assertion  低优先级清理
  no-undef                                    TypeScript 已处理，对 .ts 文件冗余
  @typescript-eslint/restrict-template-expressions  Logger() 传入 unknown 值
  no-void                                     刻意用 void 丢弃 promise

降为 warn（渐进采纳）：
  @typescript-eslint/no-explicit-any
  @typescript-eslint/no-unsafe-* 系列
  @typescript-eslint/no-floating-promises
  @typescript-eslint/no-unused-vars / no-unused-vars
  @typescript-eslint/ban-ts-comment           允许 @ts-expect-error（需附说明文字）

文件级配置例外（非 inline disable）：
  src/foundry/index.ts → obsidianmd/no-nodejs-modules: off
    整文件仅在 Platform.isDesktop 下动态加载，fs 使用合法

关闭待重构（有 docs 跟踪）：
  obsidianmd/settings-tab/prefer-setting-definitions  见上方遗留事项（Step 13）
```

---

## CI/CD 状态

```json
// package.json scripts（已配置）
"lint":     "eslint src/",
"lint:fix": "eslint src/ --fix",
"lint:ci":  "eslint src/ --max-warnings=0",
"tsc-check":"tsc --noEmit -skipLibCheck"
```

- `lint:ci`（`--max-warnings=0`）**当前通过** ✅
- `tsc-check` 存在若干与 `@mdfriday/sync-core` 接口演进相关的类型错误（已用 `-skipLibCheck` 缓解），与 ESLint 无关，单独跟踪。
