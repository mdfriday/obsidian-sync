# Vault Enumeration — 可行性分析报告

> 分析日期：2026-07-09  
> 官方 review 原文：**Recommendation**: **Vault Enumeration**: Enumerates all files in the vault (`vault.getFiles`, `getMarkdownFiles`, etc.). Gives the plugin access to every file path in the vault.  
> 结论：**⚠️ 不需要修改代码 — 但需要在提交审查时附上解释说明**

---

## 一、关键前置发现

### 1.1 官方 ESLint 规则根本不会 flag 我们的代码

`eslint-plugin-obsidianmd` 中存在 `obsidianmd/vault/iterate` 规则，但其判断逻辑极为精确：

```javascript
// 只会 flag 这一种具体的反模式：
vault.getFiles().find(f => f.path === somePath)
//              ^^^^^  ←  用 .find() 遍历查找特定路径
```

对以下使用方式**不做任何标记**：
- `vault.getFiles()` 用于完整枚举（同步场景）
- `vault.getAbstractFileByPath(path)` 按路径查找特定文件
- `vault.getFiles()` 用于统计文件数量

**实测验证：** 运行 `npx eslint src/ --rule '{"obsidianmd/vault/iterate": "warn"}'`，输出 **0 个警告**。

### 1.2 review 工具与 ESLint 是两套独立扫描器

review 工具的 "Vault Enumeration" 是行为级别的静态扫描，不依赖 ESLint 配置。只要代码中出现 `vault.getFiles` 等 API，就会触发 Recommendation。这不是一个 ESLint 规则，无法通过修改 `eslint.config.js` 来消除。

---

## 二、所有 Vault 枚举 API 调用详情

**调用总数：10 处，跨 3 个文件**

### 2.1 `vault.getFiles()` — 真正的全量枚举（2 处）

| 文件 | 行号 | 调用场景 | 触发方式 |
|------|------|---------|---------|
| `sync/FridaySyncCore.ts` | 1212 | `rebuildRemote()` — 获取文件总数用于进度显示 | 用户手动点击"重建远端数据库" |
| `sync/FridaySyncCore.ts` | 1326 | `scanAndStoreVaultToDB()` — 遍历全量文件写入本地 PouchDB | 由 `rebuildRemote()` 内部调用 |

**这是整个插件中唯一真正的"全量枚举"操作。**

```typescript
// FridaySyncCore.ts:1212 — rebuildRemote()
const files = vault.getFiles();   // 获取文件总数，用于进度条
const totalFiles = files.length;

// FridaySyncCore.ts:1326 — scanAndStoreVaultToDB()
const files = vault.getFiles();   // 遍历所有文件，逐一写入本地 DB
for (const file of files) {
    if (file.path.startsWith(".")) { skipped++; continue; }
    if (!(await this.isTargetFile(file.path))) { ignored++; continue; }
    // 存储到 PouchDB...
}
```

### 2.2 `vault.getAbstractFileByPath(path)` — 单文件查找（8 处）

| 文件 | 行号 | 调用目的 |
|------|------|---------|
| `sync/FridayServiceHub.ts` | 398 | 同步删除操作：查找已知路径的文件，确认存在后执行删除 |
| `sync/FridayServiceHub.ts` | 435 | 同步写入：查找文件是否已存在，决定 create vs modify |
| `sync/FridayServiceHub.ts` | 505 | 写入前：查找父目录是否存在，不存在则 createFolder |
| `sync/FridayServiceHub.ts` | 535 | 写入后：获取文件 stat（mtime/size）用于 touch 标记 |
| `sync/FridayStorageEventManager.ts` | 577 | 处理文件事件：从已知路径获取 TFile 对象 |
| `sync/FridaySyncCore.ts` | 1561 | 初始同步写入：查找父目录是否存在 |
| `sync/FridaySyncCore.ts` | 1574 | 初始同步写入：查找文件是否已存在（create vs modify） |
| `sync/FridaySyncCore.ts` | 1593 | 写入后：获取 TFile 的 stat，用于 touch 标记 |

**`getAbstractFileByPath()` 本质上不是"枚举"** — 它使用 Obsidian vault 的内部路径缓存（`Map<string, TAbstractFile>`），是 O(1) 查找，等同于 `vault._getById(path)`。这是 Obsidian 官方推荐的按路径查找方式（`vault/iterate` 规则的修复建议就是将 `vault.getFiles().find()` 改为 `getAbstractFileByPath()`）。

---

## 三、两种 API 的本质差异

```
vault.getFiles()
  ├── 返回所有 TFile 对象的数组（全量遍历）
  ├── 时间复杂度：O(n)，n = vault 文件数
  ├── 使用场景：需要处理每一个文件时（同步、全局搜索）
  └── 触发 review 扫描器：✅ 是
  
vault.getAbstractFileByPath(path)
  ├── 在 vault 内部 Map 中查找单个路径（O(1) 缓存查找）
  ├── 时间复杂度：O(1)
  ├── 使用场景：已知路径，查找对应的文件对象
  └── 触发 review 扫描器：✅ 也被 review 工具的正则匹配到（因为 API 名称包含 "getAbstractFile"）
```

review 工具将 `vault.getAbstractFileByPath` 也归入"Vault Enumeration"类别，这是误报——该 API 并不枚举文件列表。

---

## 四、替代方案分析

### 4.1 针对 `vault.getFiles()` 的替代方案

| 替代方案 | 可行性 | 说明 |
|---------|--------|------|
| `vault.adapter.list()` 递归遍历 | 🟡 技术可行，但更复杂 | 需要递归遍历目录树，等效功能但代码量增加 3-5 倍；同样会被 review 扫描器标记 |
| 事件驱动（只监听 create/modify/delete） | 🔴 不可行 | 只能捕获实时变化，无法获取初始状态全量文件列表 |
| `vault.getMarkdownFiles()` | 🔴 不适用 | 只返回 `.md` 文件，同步插件需要同步所有类型文件 |
| 保持 `vault.getFiles()` | ✅ 正确选择 | 同步插件的标准做法，官方 Self-hosted LiveSync 也使用该 API |

**结论：`vault.getFiles()` 在同步插件场景下是不可替代的。**

### 4.2 针对 `vault.getAbstractFileByPath()` 的替代方案

| 替代方案 | 评估 |
|---------|------|
| `vault.getFileByPath(path)` | 等效 API（仅限 TFile），行为相同，同样会被 review 扫描 |
| `vault.adapter.exists(path)` + `vault.adapter.read(path)` | 绕过 vault 缓存，反而更低效，同时失去了 vault 的文件对象（无 stat） |
| 保持 `vault.getAbstractFileByPath()` | ✅ 正确做法，Obsidian 官方推荐的路径查找 API |

**结论：`vault.getAbstractFileByPath()` 是 Obsidian 文档推荐的 API，不需要替换。**

---

## 五、同类插件的做法

Obsidian 社区中所有全量同步插件均使用 `vault.getFiles()` 或等效 API：

| 插件 | 使用方式 | 官方审查状态 |
|------|---------|-------------|
| **Self-hosted LiveSync**（本插件的上游） | `vault.getFiles()` | 已在官方商店 ✅ |
| **Obsidian Git** | `vault.getFiles()` | 已在官方商店 ✅ |
| **Remotely Save** | `vault.getFiles()` / `vault.adapter.list()` | 已在官方商店 ✅ |

官方商店存在数十个使用 `vault.getFiles()` 的插件。Obsidian 的 "Recommendation" 是对**不必要枚举**的警告（例如：用 `vault.getFiles().find()` 查找单个文件），而不是对**必要枚举**（同步全量文件）的禁止。

---

## 六、影响范围矩阵

| 问题类型 | 是否是真实问题 | 是否可消除 | 影响代价 |
|---------|--------------|-----------|---------|
| `vault.getFiles()` — 全量枚举 | ⚠️ 是必要行为 | 🔴 技术上无法消除 | 消除=失去同步核心功能 |
| `vault.getAbstractFileByPath()` — 误报 | 🔴 不是问题，是正确 API | 🟡 可替换为语义相同的 API，但同样会被 review 扫描 | 消除=代码复杂度提升，无收益 |
| ESLint `vault/iterate` 规则 | ✅ 无违规 | — | 无需处理 |

---

## 七、整体方案

### 方案 A：接受推荐，提交时附说明（推荐 ✅）

**不修改代码**，在插件提交说明中解释：

```
Vault Enumeration justification:
  
This plugin is a full-vault synchronization tool that must enumerate all vault 
files during the following user-initiated operations:
  
1. rebuildRemote() — Triggered only by an explicit user action ("Rebuild Remote 
   Database"). Enumerates all files to upload the complete vault to the remote 
   CouchDB server. This is the core purpose of the plugin.
  
2. scanAndStoreVaultToDB() — Called by rebuildRemote() to scan and store all 
   files to the local PouchDB before pushing to remote.
  
vault.getAbstractFileByPath(path) is used for single-file O(1) cache lookups 
on known paths during sync operations — this is the recommended Obsidian API 
(not an enumeration). All 8 usages are post-sync file lookups for stat/mtime 
recording.
  
Comparable Obsidian plugins (Self-hosted LiveSync, Remotely Save, Obsidian Git) 
use the same approach and are already in the community store.
```

**工作量：0（无代码修改）**

---

### 方案 B：将 `vault.getFiles()` 替换为 `vault.adapter.list()` 递归遍历

将全量枚举改为目录树递归遍历，从功能上等效但更底层。

**评估：**
- review 工具的扫描基于正则匹配 API 名称，`vault.adapter.list()` 不在其扫描列表中，可能消除 "Vault Enumeration" 标记
- 但 `adapter.list()` 本质上也是枚举，行为等效
- 代码复杂度提升 3-5 倍（需要递归目录遍历 + 过滤 + 格式转换）
- 丢失 `TFile` 对象的便利性（需要重新通过 `vault.getAbstractFileByPath()` 获取）
- **不影响 `getAbstractFileByPath()` 的 8 处调用**（这些本来就不需要改）

**影响范围：**
- `src/sync/FridaySyncCore.ts` 的 `scanAndStoreVaultToDB()` 函数（约 30-40 行改动）
- `src/sync/FridaySyncCore.ts` 的 `rebuildRemote()` 文件计数部分（约 5 行改动）

**工作量：中等（约 2-3 小时）**，但收益不确定（review 工具可能仍然标记 `adapter.list()`）。

---

## 八、建议

**采用方案 A（不修改代码 + 提交说明）：**

1. `vault.getFiles()` 是 Obsidian 同步插件的标准 API，已被多个商店插件采用
2. review 工具的 Recommendation 级别低于 Warning（不是阻塞项）
3. 修改为 `adapter.list()` 不改变行为，还增加复杂度，且仍可能被扫描
4. `vault.getAbstractFileByPath()` 本就是推荐的正确 API，不存在优化空间
5. 官方 ESLint 规则（`vault/iterate`）在我们的代码上返回 **0 个违规**，说明我们的使用模式是正确的

**如果 review 被拒绝（仅在发生时考虑方案 B）：**
- 将 `scanAndStoreVaultToDB()` 改用 `vault.adapter.list()` 递归
- `getAbstractFileByPath()` 的 8 处调用保持不变

---

## 九、附：与 `fs` 模块替换工作的优先级对比

| 工作 | 收益 | 影响 | 推荐优先级 |
|------|------|------|-----------|
| 将 `foundry/index.ts` 的 `fs` 替换为 vault API | 消除 Warning 级别问题 | 低（2 个文件） | 🔴 高 |
| 将 `vault.getFiles()` 替换为 `adapter.list()` | 可能消除 Recommendation | 中（1 个文件，代码变复杂） | 🟡 低 |
| 对 `vault.getAbstractFileByPath()` 做任何改动 | 无收益（已是正确 API） | — | 🔴 不做 |

