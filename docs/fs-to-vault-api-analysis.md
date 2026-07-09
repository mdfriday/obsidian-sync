# `fs` 模块替换为 Obsidian Vault API — 可行性分析报告

> 分析日期：2026-07-09  
> 结论：**✅ 可行，影响低-中等，存在现成的参考实现**

---

## 一、背景

Obsidian 官方 review 工具对 `src/foundry/index.ts` 返回：

> **Warning**: **Direct Filesystem Access**: Uses the Node.js `fs` module to access the filesystem outside of the Obsidian vault API. Can read and write any file on the system.

该文件使用 `import * as fs from 'fs'` 进行文件读写。我们当前通过 `eslint.config.js` 的配置级例外绕过了 ESLint 规则，但 review 工具的扫描器是独立的，不受 ESLint 配置影响。

---

## 二、`fs` 模块的实际使用场景

`foundry/index.ts` 中所有 `fs` 调用均集中在三个辅助函数中：

```typescript
// 读取 JSON 文件
async function readJsonFile<T>(filePath: string): Promise<T | null> {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
}

// 写入 JSON 文件（自动创建父目录）
async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
    fs.mkdirSync(nodePath.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// 检查文件是否存在（同步）
function fileExists(filePath: string): boolean {
    try { fs.accessSync(filePath); return true; } catch { return false; }
}
```

**这三个函数操作的文件一共只有 3 个：**

| 文件（相对 workspacePath） | 用途 |
|---------------------------|------|
| `.mdfriday/user-data.json` | 认证 token + license + sync 配置 |
| `.mdfriday/workspace.json` | workspace 初始化标记 |
| `.mdfriday/config.json` | 全局插件配置 |

**文件的实际物理位置（桌面端）：**

```
{vaultBasePath}/.obsidian/plugins/mdfriday-sync/workspace/.mdfriday/
```

> ⚠️ 关键发现：这 3 个文件完全位于 Obsidian vault 目录内部，不存在"vault 外部文件访问"的情况。

---

## 三、Obsidian Vault API 对应能力

`vault.adapter`（`DataAdapter`接口）提供了所有需要的操作：

| `fs` 用法 | Obsidian API 替代 | 备注 |
|-----------|------------------|------|
| `fs.readFileSync(path, 'utf8')` | `await vault.adapter.read(path)` | 异步 |
| `fs.writeFileSync(path, content)` | `await vault.adapter.write(path, content)` | 异步 |
| `fs.mkdirSync(dir, {recursive: true})` | `await vault.adapter.mkdir(dir)` | 异步 |
| `fs.accessSync(path)` | `await vault.adapter.exists(path)` | 异步，返回 boolean |

**路径格式变化：**
- 当前：绝对路径（`/Users/.../vault/.obsidian/plugins/mdfriday-sync/workspace`）
- 迁移后：vault 相对路径（`.obsidian/plugins/mdfriday-sync/workspace`）

---

## 四、关键发现：`mobile.ts` 已经是完整参考实现

**`src/foundry/mobile.ts` 已经用 `vault.adapter` 实现了完全相同的功能！**

| 对比项 | `foundry/index.ts`（桌面端，当前） | `foundry/mobile.ts`（移动端，已有）|
|--------|-----------------------------------|-------------------------------------|
| 文件读取 | `fs.readFileSync(absolutePath)` | `vault.adapter.read(relativePath)` |
| 文件写入 | `fs.writeFileSync(absolutePath)` | `vault.adapter.write(relativePath)` |
| 目录创建 | `fs.mkdirSync(dir, {recursive})` | `vault.adapter.mkdir(dir)` |
| 文件存在 | `fs.accessSync(path)` | `vault.adapter.exists(path)` |
| 路径基准 | 绝对路径 | vault 相对路径 |
| 服务类构造函数 | `(http: IdentityHttpClient)` | `(http: IdentityHttpClient, vault: Vault, pluginDir: string)` |
| 工厂函数参数 | 无 vault 参数 | 通过 config 对象传入 vault + pluginDir |

**`mobile.ts` 的辅助函数（迁移目标）：**

```typescript
// 已在 mobile.ts 中工作的实现：
async function vaultReadJson<T>(vault: Vault, path: string): Promise<T | null> {
    if (!await vault.adapter.exists(path)) return null;
    const raw = await vault.adapter.read(path);
    return JSON.parse(raw) as T;
}

async function vaultWriteJson(vault: Vault, path: string, data: unknown): Promise<void> {
    const parts = path.split('/');
    parts.pop();
    const dir = parts.join('/');
    if (dir && !await vault.adapter.exists(dir)) {
        await vault.adapter.mkdir(dir);
    }
    await vault.adapter.write(path, JSON.stringify(data, null, 2));
}
```

---

## 五、影响范围分析

### 需要修改的文件：2 个

#### 5.1 `src/foundry/index.ts`（主要改动）

| 变更类型 | 详情 |
|---------|------|
| 删除 imports | `import * as fs from 'fs'`，`import * as nodePath from 'path-browserify'` |
| 新增 import | `import type { Vault } from 'obsidian'` |
| 替换辅助函数 | `readJsonFile` → `vaultReadJson`；`writeJsonFile` → `vaultWriteJson`；`fileExists(sync)` → `vault.adapter.exists(async)` |
| 服务类构造函数 | 4 个服务类增加 `vault: Vault` 和 `pluginDir: string` 参数（与 mobile.ts 一致） |
| 工厂函数签名 | 4 个工厂函数增加 `vault: Vault, pluginDir: string` 参数 |
| 路径构造 | `nodePath.join(workspacePath, MDFRIDAY_DIR, ...)` → `vaultPath(pluginDir, 'workspace', MDFRIDAY_DIR, ...)` |
| `fileExists` 同步 → 异步 | `workspaceExists()` 和 `initWorkspace()` 中的调用改为 `await` |
| 修改行数估算 | ~60-80 行（替换辅助函数 + 更新构造函数 + 工厂函数） |

#### 5.2 `src/main.ts`（最小改动）

| 变更类型 | 详情 |
|---------|------|
| 工厂函数调用（4 处） | 增加 `this.app.vault, this.pluginDir` 参数 |
| `absWorkspacePath` 构造 | 移除 `nodePath.join(basePath, this.pluginDir, 'workspace')`，改用 `joinVaultPath(this.pluginDir, 'workspace')` |
| `path-browserify` import | 可以删除（main.ts 不再需要 nodePath） |
| 修改行数估算 | ~10-15 行 |

### 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `src/foundry/types.ts` | 服务接口（`ObsidianAuthService` 等）不变 |
| `src/foundry/mobile.ts` | 已是目标模式，无需改动 |
| `src/services/license.ts` | 只是透传 `workspacePath` 字符串，服务实现自行处理 |
| `src/services/licenseState.ts` | 同上 |
| `src/sync/FridaySyncCore.ts` | 不依赖 foundry 文件 I/O |
| 所有其他文件 | 无依赖 |

---

## 六、架构变化详解

### 当前架构（桌面端）

```
main.ts
  └── absWorkspacePath: string (绝对路径)
        └── foundry/index.ts
              ├── import * as fs from 'fs'              ← review 警告来源
              ├── readJsonFile(absolutePath)
              ├── writeJsonFile(absolutePath)
              └── fileExists(absolutePath)
```

### 迁移后架构（与移动端统一）

```
main.ts
  └── vault: Vault + pluginDir: string (vault 相对路径)
        └── foundry/index.ts
              ├── vault.adapter.read(relativePath)      ← 官方 Obsidian API
              ├── vault.adapter.write(relativePath)
              ├── vault.adapter.exists(relativePath)
              └── vault.adapter.mkdir(relativePath)
```

### `workspacePath` 参数的语义变化

迁移后，服务接口中的 `workspacePath: string` 参数会被**忽略**（与 mobile.ts 当前行为一致）。服务实例在构造时已经获得了 `vault` + `pluginDir`，路径由这两者推导，无需外部传入。

这意味着 `LicenseServiceManager` 和 `LicenseStateManager` 传入的 `this.absWorkspacePath` 不再被实际使用，但这不影响功能（mobile 端已经是这种状态）。

---

## 七、风险评估

| 风险项 | 级别 | 说明 |
|--------|------|------|
| `vault.adapter` API 稳定性 | 🟢 低 | Obsidian 核心 API，长期稳定 |
| 路径分隔符 | 🟢 低 | vault 相对路径统一使用 `/`，与 `vaultPath()` 辅助函数一致 |
| 同步 → 异步变化 | 🟢 低 | 调用方已是 async 函数，直接加 `await` 即可 |
| `workspacePath` 参数被忽略 | 🟡 中 | 语义上与接口定义不符，但与 mobile 端现有行为一致；未来可考虑清理接口 |
| 现有测试覆盖 | 🟡 中 | 需要验证 `foundry-desktop.test.ts` 仍然通过 |
| ESLint 配置简化 | 🟢 低（正收益） | 可删除 `foundry/index.ts` 的配置级 `no-nodejs-modules: off` 例外 |

---

## 八、预期收益

| 收益 | 说明 |
|------|------|
| 消除 review Warning | "Direct Filesystem Access" 警告消失 |
| 删除 ESLint 配置例外 | `eslint.config.js` 中 `foundry/index.ts` 的 `no-nodejs-modules: off` 可以删除 |
| 删除 `path-browserify` import | `main.ts` 不再需要 nodePath |
| 代码一致性 | 桌面端与移动端统一使用 vault adapter 模式 |
| 潜在跨平台合并 | 未来可将 `foundry/index.ts` 和 `foundry/mobile.ts` 合并为一个文件 |

---

## 九、实施计划

### 阶段一：核心迁移（预计 2-3 小时）

**Step 1：更新 `foundry/index.ts`**
1. 删除 `import * as fs from 'fs'` 和 `import * as nodePath from 'path-browserify'`
2. 添加 `import type { Vault } from 'obsidian'`
3. 将 3 个 `fs` 辅助函数替换为 `vaultReadJson` / `vaultWriteJson`（参考 mobile.ts）
4. 将路径常量函数改为与 mobile.ts 相同的 `makeUserDataPath(pluginDir)` 模式
5. 更新 4 个服务类构造函数，接受 `vault: Vault, pluginDir: string`
6. 更新 4 个工厂函数，接受 `vault: Vault, pluginDir: string`

**Step 2：更新 `main.ts`（桌面端路径）**
1. 工厂函数调用传入 `this.app.vault, this.pluginDir`（4 处）
2. `absWorkspacePath` 桌面端改为 vault 相对路径（`joinVaultPath(this.pluginDir, 'workspace')`）
3. 删除 `import * as nodePath from 'path-browserify'`（如不再使用）

**Step 3：更新 `eslint.config.js`**
1. 删除 `foundry/index.ts` 的配置级 `no-nodejs-modules: off` 例外块

### 阶段二：验证（预计 30 分钟）

1. 运行 `npm run lint:ci` — 确认 0 warnings
2. 运行 `npm run tsc-check` — 确认无新增类型错误
3. 运行 `npm run test` — 确认 foundry-desktop.test.ts 通过
4. 手动测试：桌面端 workspace 初始化、license 激活、auth 状态读取

### 阶段三（可选，低优先级）

合并 `foundry/index.ts` 和 `foundry/mobile.ts` 为同一实现文件，消除代码重复。

---

## 十、结论

**迁移可行性：✅ 强烈推荐**

| 维度 | 评估 |
|------|------|
| 技术可行性 | ✅ 完全可行，`mobile.ts` 是现成参考 |
| 影响范围 | 🟢 低，仅 2 个文件（`foundry/index.ts` + `main.ts`） |
| 风险 | 🟢 低，Obsidian vault API 稳定，路径在 vault 内 |
| 收益 | ✅ 消除 review Warning，简化 ESLint 配置 |
| 工作量 | 🟡 中，约 3-4 小时 |

这不是一个大规模重构，而是将桌面端的文件 I/O 从"裸 Node.js fs"对齐到"移动端已经使用的 vault.adapter 模式"。两端的业务逻辑完全相同，只是底层 I/O 机制不同。

