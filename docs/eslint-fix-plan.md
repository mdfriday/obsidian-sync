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
| 官方 review 反馈修复（2026-07-09 第三轮） | 处理 Obsidian 官方 review 工具返回的 warning/recommendation | **0 警告，0 错误** ✅ |

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
| `@typescript-eslint/no-unnecessary-type-assertion` | 30 | 0 | ✅ |
| `obsidianmd/hardcoded-config-path` | 7 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-call` | 7 | 0 | ✅ |
| `obsidianmd/no-tfile-tfolder-cast` | 5 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-return` | 5 | 0 | ✅ |
| `@typescript-eslint/no-unsafe-argument` | 5 | 0 | ✅ |
| `@typescript-eslint/no-empty-object-type` | 3 | 0 | ✅ |
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

`src/sync/FridayServiceHub.ts` 中主要的 `localStorage` 读写改为 `App#saveLocalStorage / loadLocalStorage`。

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

### Fix A — `obsidianmd/no-nodejs-modules` 全局关闭 → 改为精准例外 → ✅

删除全局 `"obsidianmd/no-nodejs-modules": "off"`；`src/main.ts` 和 `src/foundry/index.ts` 中 `path` → `path-browserify`；为 `src/foundry/index.ts` 添加配置级文件级例外（inline disable 被 `eslint-comments/no-restricted-disable` 阻止）。

### Fix B — `hardcoded-config-path` 通过忽略 locale 目录隐藏 → 改为修复字符串 → ✅

删除 locale 目录的全局 ignore；直接修改三处描述字符串，去掉硬编码的 `.obsidian`。

### Fix C — `@typescript-eslint/ban-ts-comment` 全局关闭 → 改为 warn → ✅

所有 `@ts-ignore` 改为 `@ts-expect-error`（附说明文字），或删除不必要注释。

---

## 第三轮修复详情（官方 review 反馈，2026-07-09）

Obsidian 官方 review 工具返回若干 Warning 和 Recommendation，原因是我们的 `eslint.config.js` 通过全局 `"off"` 关闭了两条本应启用的规则，且 review 工具使用独立的静态扫描器（不受我们的 ESLint 配置影响）。

### 为什么 ESLint 没有检测到这些问题？

| review 反馈 | 根本原因 |
|-------------|----------|
| `{}` 空对象类型警告 | `@typescript-eslint/no-empty-object-type` 在 eslint.config.js 中设为 `"off"` |
| 不必要的类型断言警告 | `@typescript-eslint/no-unnecessary-type-assertion` 在 eslint.config.js 中设为 `"off"` |
| `fs` 模块直接引用 | review 工具为独立静态扫描器，不受我们的 `no-nodejs-modules` 配置级例外影响 |
| `globals` 依赖缺失 | `globals` 包在 eslint.config.js 中使用，但未列入 `package.json` devDependencies |
| localStorage 使用 | review 工具扫描行为模式，我们之前的 `no-restricted-globals` 修复覆盖了显式 `localStorage`，但 `window.localStorage` 用于 key 枚举的用法仍保留 |

---

### Fix D — `globals` 补充到 devDependencies → ✅

```bash
npm install --save-dev globals
```

`eslint.config.js` 中 `import globals from "globals"` 需要此包，但之前未显式声明。

---

### Fix E — `@typescript-eslint/no-empty-object-type` 重新启用并修复 → ✅（3 处）

从 `eslint.config.js` 删除 `"@typescript-eslint/no-empty-object-type": "off"`；修复三处 `{}` 类型：

| 文件 | 修改前 | 修改后 |
|------|--------|--------|
| `src/foundry/index.ts:411` | `ObsidianLicenseResult<{}>` | `ObsidianLicenseResult<object>` |
| `src/foundry/mobile.ts:341` | `ObsidianLicenseResult<{}>` | `ObsidianLicenseResult<object>` |
| `src/i18n/types.ts:361` | `commands: {}` | `commands: Record<string, string>` |

> `{}` 表示"任意非 null 值"（包括数字、字符串等），`object` 才表示"任意对象类型"，`Record<string, string>` 是对 commands 的正确描述。

---

### Fix F — `@typescript-eslint/no-unnecessary-type-assertion` 重新启用并自动修复 → ✅（30 处）

从 `eslint.config.js` 删除 `"@typescript-eslint/no-unnecessary-type-assertion": "off"`；运行自动修复：

```bash
npx eslint src/ --rule '{"@typescript-eslint/no-unnecessary-type-assertion": "warn"}' --fix
```

受影响文件（共 30 处自动移除多余 `as` 断言）：
`foundry/index.ts`, `foundry/mobile.ts`, `sync/FridayServiceHub.ts`, `sync/FridayStorageEventManager.ts`, `sync/FridaySyncCore.ts`, `sync/SyncStatusDisplay.ts`, `sync/adapters/ObsidianHttpClient.ts`, `sync/utils/hiddenFileUtils.ts`, `utils/common.ts`

修复后，`sync/FridaySyncCore.ts` 中 `DatabaseConnectingStatus` import 因不再使用而同步删除。

---

### Fix G — `SimpleKeyValueDB` 迁移至 Obsidian Vault-scoped Storage API → ✅

**问题：** `FridaySyncCore.ts` 中 `SimpleKeyValueDB` 使用 `window.localStorage.getItem/setItem/removeItem` 直接读写，触发官方 review 的 localStorage 使用提示。

**修复：**
- `get()` → `app.loadLocalStorage(key)`
- `set()` → `app.saveLocalStorage(key, value)`
- `delete()` → `app.saveLocalStorage(key, undefined)`
- `destroy()` 中删除操作 → `app.saveLocalStorage(key, undefined)`
- 构造函数新增 `app: App` 参数；`FridaySyncCore` 将 `plugin.app` 传入

```typescript
// 修复前
class SimpleKeyValueDB {
    constructor(prefix: string) { ... }
    async get<T>(key: string): Promise<T | undefined> {
        const value = window.localStorage.getItem(this.getKey(key));
        return JSON.parse(value) as T;
    }
    async set<T>(key: string, value: T): Promise<void> {
        window.localStorage.setItem(this.getKey(key), JSON.stringify(value));
    }
}

// 修复后
class SimpleKeyValueDB {
    constructor(prefix: string, app: App) { ... }
    async get<T>(key: string): Promise<T | undefined> {
        return this.app.loadLocalStorage(this.getKey(key)) as T | undefined;
    }
    async set<T>(key: string, value: T): Promise<void> {
        this.app.saveLocalStorage(this.getKey(key), value);
    }
}
```

**遗留：** `keys()` 和部分 `keys` 枚举（`FridayServiceHub.ts`、`main.ts`）仍使用 `window.localStorage`，原因是 Obsidian 的 `app.loadLocalStorage` API 没有枚举/列举所有 key 的能力。这是 API 层面的限制，已在代码注释中说明。

---

### Fix H — `fs` 模块：review 工具扫描说明

**情况：** review 工具的 "Direct Filesystem Access" 警告来自独立静态扫描器，与 ESLint 配置无关。`foundry/index.ts` 使用 `fs` 读写位于 vault 内部（`.obsidian/plugins/mdfriday-sync/workspace/`）的插件配置文件，这是桌面端 workspace 管理的必要操作。

**ESLint 层面的处理：**
- `obsidianmd/no-nodejs-modules` 规则在 `foundry/index.ts` 的配置级例外中保持关闭（inline disable 被 `no-restricted-disable` 阻止）
- `foundry/index.ts` 整文件通过 `Platform.isDesktop` guard 动态加载，移动端永远不执行

**提交说明建议（向 Obsidian review 解释）：**
> `fs` is used exclusively in `src/foundry/index.ts`, a desktop-only module that is dynamically imported only inside `if (Platform.isDesktop)` in main.ts. It reads/writes plugin workspace config files stored inside the vault folder at `.obsidian/plugins/mdfriday-sync/workspace/`. This module is never loaded on mobile.

---

### Fix I — Vault Enumeration：review 工具扫描说明

**情况：** `vault.getFiles()` 和 `vault.getAbstractFileByPath()` 是同步插件的核心功能，用于比对本地文件列表与远程 CouchDB 数据库，是 vault 双向同步不可缺少的操作。

**提交说明建议：**
> `vault.getFiles()` is used to enumerate vault files for sync comparison against the remote CouchDB database. This is core to the plugin's purpose as a full-vault sync tool and cannot be avoided.

---

## 当前遗留事项

### ⏳ Step 13 — `obsidianmd/settings-tab/prefer-setting-definitions`（1 处）

**影响文件：** `src/setting.ts`（`MdfridaySyncSettingTab` 类）  
**规则状态：** `eslint.config.js` 中保持 `"off"`（当前唯一仍关闭的 Obsidian 官方规则）  
**背景：** `manifest.json` 的 `minAppVersion` 为 `1.13.0`，应实现 `getSettingDefinitions()` 以支持 Obsidian 1.13+ 设置搜索。  
**影响：** 用户无法在 Obsidian 设置搜索中找到本插件的设置项，功能本身不受影响。  
**优先级：** 较大重构，建议单独排期。

### ⏳ localStorage key 枚举（待观察）

以下位置仍使用 `window.localStorage` 进行 key 枚举（只读），原因是 Obsidian `app.loadLocalStorage` 没有提供枚举所有 key 的 API：

| 位置 | 用途 |
|------|------|
| `src/sync/FridaySyncCore.ts` — `SimpleKeyValueDB.keys()` | 列举 checkpoint key |
| `src/sync/FridaySyncCore.ts` — `SimpleKeyValueDB.destroy()` 枚举部分 | 清理 key 列表 |
| `src/sync/FridayServiceHub.ts:199` | store key 枚举 |
| `src/main.ts` — `clearSyncLocalStorage()` | 清理同步相关 key |

如 Obsidian 未来提供 key 枚举 API，可进一步消除这些用法。

---

## 当前 eslint.config.js 规则说明

```
全局关闭（有充分理由）：
  no-console                                  全代码使用 console.* 记录调试日志
  @typescript-eslint/require-await            async 用于满足接口约定，不一定有 await
  @typescript-eslint/no-base-to-string        catch 块中 String(e) 是刻意格式化
  @typescript-eslint/ban-ts-comment           允许 @ts-expect-error（需附说明文字）
  no-undef                                    TypeScript 已处理，对 .ts 文件冗余
  @typescript-eslint/restrict-template-expressions  Logger() 传入 unknown 值
  no-void                                     刻意用 void 丢弃 promise

降为 warn（渐进采纳）：
  @typescript-eslint/no-explicit-any
  @typescript-eslint/no-unsafe-* 系列
  @typescript-eslint/no-floating-promises
  @typescript-eslint/no-unused-vars / no-unused-vars

文件级配置例外（非 inline disable）：
  src/foundry/index.ts → obsidianmd/no-nodejs-modules: off
    整文件仅在 Platform.isDesktop 下动态加载；
    fs 用于读写位于 vault 内部的插件配置文件；
    inline disable 被 eslint-comments/no-restricted-disable 阻止。

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
