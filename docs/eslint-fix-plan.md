# ESLint 问题分析与修复计划

> 生成时间：2026-07-09  
> 工具：`eslint-plugin-obsidianmd` (官方 Obsidian ESLint 插件)  
> 命令：`npm run lint`  
> 结果：**453 个警告，0 个错误**（26 个文件受影响）

---

## 总体统计

| 规则 | 数量 | 级别 | 类别 |
|------|------|------|------|
| `no-unused-vars` / `@typescript-eslint/no-unused-vars` | 319 | warn | 代码质量 |
| `@typescript-eslint/no-unsafe-assignment` | 21 | warn | 类型安全 |
| `no-undef` | 18 | warn | 运行时安全 |
| `no-restricted-globals` (localStorage) | 16 | warn | Obsidian API |
| `@typescript-eslint/no-unsafe-member-access` | 14 | warn | 类型安全 |
| `@typescript-eslint/no-deprecated` | 12 | warn | API 更新 |
| `@typescript-eslint/no-explicit-any` | 10 | warn | 类型安全 |
| `obsidianmd/settings-tab/prefer-update-over-display` | 9 | warn | Obsidian API |
| `obsidianmd/hardcoded-config-path` | 7 | warn | Obsidian API |
| `@typescript-eslint/no-unsafe-call` | 7 | warn | 类型安全 |
| `obsidianmd/no-tfile-tfolder-cast` | 5 | warn | Obsidian API |
| `@typescript-eslint/no-unsafe-return` | 5 | warn | 类型安全 |
| `@typescript-eslint/no-unsafe-argument` | 5 | warn | 类型安全 |
| `obsidianmd/settings-tab/prefer-setting-definitions` | 1 | warn | Obsidian API |
| `obsidianmd/ui/sentence-case` | 1 | warn | UI 规范 |

---

## 问题分组与修复计划

### 第一批：Obsidian 官方 API 最佳实践（高优先级）

这些是 Obsidian 插件官方规范，影响插件在应用商店的合规性和兼容性。

---

#### 1.1 `obsidianmd/settings-tab/prefer-update-over-display` — 9处

**影响文件：** `src/setting.ts`

**问题说明：** 在 `PluginSettingTab` 中调用 `this.display()` 刷新设置页，但 Obsidian 1.13+ 要求改用 `this.update()` 才能正确刷新声明式设置。

**受影响行：** 180, 277, 374, 382, 453, 470, 580, 622, 978

**修复方法：** 将 `this.display()` 替换为 `this.update()`

```typescript
// 修复前
this.display();

// 修复后
this.update();
```

**注意：** 该修复自动同时解决 `@typescript-eslint/no-deprecated` 警告（`display` 自 1.13.0 起已弃用）。

---

#### 1.2 `obsidianmd/hardcoded-config-path` — 7处

**影响文件：** `src/setting.ts`, `src/sync/types.ts`

**问题说明：** 代码中硬编码了 `.obsidian` 配置路径。Obsidian 允许用户自定义配置目录，应使用 `vault.configDir` 动态获取。

**修复方法：**

```typescript
// 修复前
const path = ".obsidian/workspace.json";
const pattern = `\\.obsidian\\/workspace`;

// 修复后
const path = `${vault.configDir}/workspace.json`;
const pattern = `${vault.configDir.replace(/\./g, '\\.').replace(/\//g, '\\/')}\\/workspace`;
```

**具体位置：**
- `src/sync/types.ts:52` — `getDefaultInternalIgnorePatterns()` 函数
- `src/setting.ts:830` — 选择性同步路径过滤

---

#### 1.3 `obsidianmd/no-tfile-tfolder-cast` — 5处

**影响文件：** `src/sync/FridayServiceHub.ts`, `src/sync/FridaySyncCore.ts`

**问题说明：** 直接将 `AbstractFile` 强制转换为 `TFile`，存在类型安全风险。应使用 `instanceof` 检查。

**修复方法：**

```typescript
// 修复前
await vault.modify(existingFile as TFile, content as string);

// 修复后
if (existingFile instanceof TFile) {
    await vault.modify(existingFile, content as string);
}
```

---

#### 1.4 `no-restricted-globals` (localStorage) — 16处

**影响文件：** `src/sync/FridayServiceHub.ts`

**问题说明：** 直接使用 `localStorage`，应改用 Obsidian 的 `App#saveLocalStorage` / `App#loadLocalStorage` 以实现 vault 级别的数据隔离。

**受影响行：** `FridayServiceHub.ts` 中 `openSimpleStore` 方法使用 localStorage 模拟 `SimpleStore`。

**修复方法：**

```typescript
// 修复前
localStorage.getItem(`friday-${kind}-${key}`)
localStorage.setItem(`friday-${kind}-${key}`, JSON.stringify(value))
localStorage.removeItem(`friday-${kind}-${key}`)

// 修复后 — 通过 plugin.app 实例访问
this.plugin.app.saveLocalStorage(`friday-${kind}-${key}`, value)
this.plugin.app.loadLocalStorage(`friday-${kind}-${key}`)
```

---

### 第二批：废弃 API 更新（中优先级）

---

#### 2.1 `@typescript-eslint/no-deprecated` — 12处

**影响文件：** `src/setting.ts`, `src/sync/types.ts`

**废弃项：**

| 废弃用法 | 替代方案 | 位置 |
|---------|---------|------|
| `this.display()` | `this.update()` | `setting.ts` 多处（已在 1.1 节覆盖） |
| `DEFAULT_INTERNAL_IGNORE_PATTERNS` | `getDefaultInternalIgnorePatterns()` | `sync/types.ts` |
| `setWarning()` | `setDestructive()` | `setting.ts:908` |

**修复方法：**

```typescript
// src/sync/types.ts — 修复前
export { DEFAULT_INTERNAL_IGNORE_PATTERNS };

// 修复后 — 改用函数版本并传入 configDir
const patterns = getDefaultInternalIgnorePatterns(vault.configDir);

// src/setting.ts:908 — 修复前
button.setWarning();

// 修复后
button.setDestructive();
```

---

#### 2.2 `no-undef` (Buffer) — 18处

**影响文件：** `src/http.ts`, `src/foundry/index.ts`, `src/foundry/mobile.ts`, `src/services/obsidian-mobile-repositories.ts`

**问题说明：** 代码中直接使用 `Buffer`，但在浏览器/移动端环境中 `Buffer` 不是全局变量。

**修复方法：**

```typescript
// 修复前
Buffer.from(part).toString('base64');

// 修复后 — 使用 TextEncoder/TextDecoder (跨平台)
const encoded = new TextEncoder().encode(part);
const base64 = btoa(String.fromCharCode(...encoded));
```

对于 Desktop Only 的代码，添加 `Platform.isDesktop` 检查并在 `tsconfig.json` 中添加 `node` types（已有）。

---

### 第三批：未使用变量清理（中优先级）

---

#### 3.1 `no-unused-vars` — 319处（最多）

**影响所有文件**

主要类型：

| 类型 | 数量 | 修复方法 |
|------|------|---------|
| 未使用的接口方法参数（如 `workspacePath`、`handler`） | ~100+ | 使用 `_` 前缀标记为有意忽略 |
| 未使用的导入 | ~50+ | 删除导入 |
| 未使用的函数变量 | ~50+ | 删除变量或使用 `_` 前缀 |
| catch 块中未使用的 `error` 变量 | ~20+ | 改为 `catch { }` 或使用变量 |

**典型修复：**

```typescript
// 修复前 (接口实现中不需要的参数)
async getStatus(workspacePath: string): Promise<...> { ... }

// 修复后 (用 _ 标记有意未使用)
async getStatus(_workspacePath: string): Promise<...> { ... }

// 修复前 (空 catch)
} catch (error) {
    return null;
}

// 修复后
} catch {
    return null;
}
```

**最受影响的文件：**
- `src/foundry/index.ts` — `workspacePath` 接口参数
- `src/foundry/mobile.ts` — `workspacePath` 接口参数
- `src/sync/FridayServiceHub.ts` — `handler`、`url` 等参数
- `src/services/obsidian-mobile-repositories.ts` — `filePath`、`dirPath` 等

---

### 第四批：类型安全提升（低优先级 — 持续进行）

---

#### 4.1 `@typescript-eslint/no-unsafe-*` — 52处（残余）

**已完成：** 上轮优化已修复 catch 块中的 `(e as Error).message` 模式。

**剩余问题：**

| 规则 | 数量 | 主要来源 |
|------|------|---------|
| `no-unsafe-assignment` | 21 | `http.ts` 中 `http`/`https` 模块（Node.js 全局未声明）|
| `no-unsafe-member-access` | 14 | 同上；`FridaySyncCore.ts` PouchDB 文档访问 |
| `no-unsafe-call` | 7 | `http.ts` Node.js `req.on()`、`req.end()` 等 |
| `no-unsafe-return` | 5 | 返回 `any` 类型值 |
| `no-unsafe-argument` | 5 | 传入 `any` 类型参数 |

**根本原因：** `src/http.ts` 中的 `ObsidianLLMHttpClient` 直接使用 Node.js `http`/`https` 模块，但这两个模块未在 tsconfig 的 `types` 中声明，TypeScript 无法推断其类型。

**修复方案：** 为 Node.js 类型创建声明，或将 LLM 客户端移入 Desktop-only 代码路径。

---

#### 4.2 `@typescript-eslint/no-explicit-any` — 10处

**影响文件：** `src/sync/FridaySyncCore.ts`, `src/http.ts`

**剩余 `any` 用法均来自：**
1. `SimpleStore<any>` — 外部库约束，无法更改
2. `Record<string, any>` in FormData 处理 — 可改为 `Record<string, unknown>`

---

### 第五批：Obsidian 1.13+ 设置 API 现代化（低优先级）

---

#### 5.1 `obsidianmd/settings-tab/prefer-setting-definitions` — 1处

**影响文件：** `src/setting.ts`

**问题说明：** `MdfridaySyncSettingTab` 未实现 `getSettingDefinitions()`，设置项不会出现在 Obsidian 1.13+ 的设置搜索中。

**修复方法：** 实现声明式设置 API（较大重构，建议单独排期）。

---

#### 5.2 `obsidianmd/ui/sentence-case` — 1处

**问题说明：** UI 字符串不符合句子首字母大写规范。

**修复方法：** 运行 `npm run lint:fix` 自动修复。

---

## 修复路线图

### 第一阶段（立即修复）— 约 2 小时工作量

| 步骤 | 内容 | 文件 |
|------|------|------|
| Step 1 | `this.display()` → `this.update()` | `setting.ts` |
| Step 2 | `setWarning()` → `setDestructive()` | `setting.ts` |
| Step 3 | `as TFile` → `instanceof TFile` | `FridayServiceHub.ts`, `FridaySyncCore.ts` |
| Step 4 | `DEFAULT_INTERNAL_IGNORE_PATTERNS` → 函数版 | `sync/types.ts` |
| Step 5 | 自动修复（sentence-case 等）| 全局 |

### 第二阶段（本周内）— 约 4 小时工作量

| 步骤 | 内容 | 文件 |
|------|------|------|
| Step 6 | 接口实现参数加 `_` 前缀 | 所有实现文件 |
| Step 7 | 删除未使用导入 | 全局 |
| Step 8 | 空 catch 块清理 | 全局 |
| Step 9 | `localStorage` → `App#saveLocalStorage` | `FridayServiceHub.ts` |

### 第三阶段（下一个迭代）— 约 8 小时工作量

| 步骤 | 内容 | 文件 |
|------|------|------|
| Step 10 | 修复 `hardcoded-config-path`（动态 configDir）| `setting.ts`, `sync/types.ts` |
| Step 11 | 修复 `Buffer` 跨平台问题 | `http.ts`, `foundry/index.ts` |
| Step 12 | LLM 客户端 Node.js 类型声明 | `http.ts` |

### 第四阶段（长期）

| 步骤 | 内容 |
|------|------|
| Step 13 | 实现 `getSettingDefinitions()` 声明式设置 API |
| Step 14 | 彻底消除 `SimpleStore<any>` 等剩余 `any` |

---

## 建议加入 CI/CD

在 `package.json` 中增加 CI lint 检查：

```json
{
  "scripts": {
    "lint":       "eslint src/",
    "lint:fix":   "eslint src/ --fix",
    "lint:ci":    "eslint src/ --max-warnings=0",
    "tsc-check":  "tsc --noEmit -skipLibCheck"
  }
}
```

> `lint:ci` 使用 `--max-warnings=0`，所有警告都视为 CI 失败，强制逐步清零。

---

## 最终结果（2026-07-09）

| 指标 | 初始值 | 最终值 | 减少 |
|------|--------|--------|------|
| 总问题数 | 453 | **48** | **-405 (-89%)** |
| 错误（阻断 CI）| 0 | **0** | — |
| 警告 | 453 | 48 | -405 |
| 受影响文件数 | 26 | ~8 | — |

## 已完成修复汇总

| 规则 | 修复前 | 修复后 | 状态 |
|------|--------|--------|------|
| `obsidianmd/settings-tab/prefer-update-over-display` | 9 | 0 | ✅ |
| `obsidianmd/no-tfile-tfolder-cast` | 5 | 0 | ✅ |
| `obsidianmd/hardcoded-config-path` | 7 | 0 | ✅ |
| `no-restricted-globals` (localStorage) | 16 | 0 | ✅ |
| `@typescript-eslint/no-deprecated` (display/setWarning) | 12 | 1 | ✅ |
| `@typescript-eslint/no-explicit-any` | 10 | 0 | ✅ |
| `no-undef` | 18 | 0 | ✅ |
| `no-unused-vars` / `@typescript-eslint/no-unused-vars` | 319 | 2 | ✅ |
| `@typescript-eslint/no-unsafe-assignment` | 21 | 18 | 🔄 |
| `@typescript-eslint/no-unsafe-member-access` | 14 | 11 | 🔄 |
| `@typescript-eslint/no-unsafe-call` | 7 | 7 | 🔄 |
| `@typescript-eslint/no-unsafe-argument` | 5 | 4 | 🔄 |
| `@typescript-eslint/no-unsafe-return` | 5 | 3 | 🔄 |
| `obsidianmd/ui/sentence-case` | 1 | 1 | ⏳ |
| `obsidianmd/settings-tab/prefer-setting-definitions` | 1 | 1 | ⏳ |

## 剩余 48 个警告分析

### 43个 `@typescript-eslint/no-unsafe-*` — 根本原因在 `src/http.ts`

`ObsidianLLMHttpClient` 类直接使用 Node.js `http`/`https` 模块作为隐式全局变量，但这两个模块没有被正确导入（TypeScript 也报同样错误）：

```typescript
// http.ts:574 — 这是根本原因
const transport = url.protocol === 'https:' ? https : http;
```

**修复方向（第三阶段）：** 改为显式 `import http from 'node:http'`，并包装进 `Platform.isDesktop` 守卫。

### 2个 `no-unused-vars`
来自 `services/obsidian-mobile-repositories.ts` 中的接口参数。

### 1个 `obsidianmd/ui/sentence-case`
UI 字符串大小写问题，可运行 `npm run lint:fix` 自动修复。

### 1个 `obsidianmd/settings-tab/prefer-setting-definitions`
`MdfridaySyncSettingTab` 未实现 `getSettingDefinitions()`，是一个较大重构，建议单独排期。

### 1个 `@typescript-eslint/no-deprecated`
`SyncStatusDisplay.ts:447` — `noticeEl` 已弃用，应改用 `messageEl`。

## 后续建议

1. **将 `lint:ci` 加入 CI/CD**：`"lint:ci": "eslint src/ --max-warnings=47"` 防止警告数继续增长
2. **修复 `http.ts` LLM 客户端的 Node.js 导入**（第三阶段首要任务）
3. **实现 `getSettingDefinitions()`**（配合 Obsidian 1.13+ 设置搜索功能）



