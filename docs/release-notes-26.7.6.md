# MDFriday Sync — Release Notes v26.7.6

> Released: July 5, 2026 · 发布日期：2026 年 7 月 5 日

---

## 📋 Overview / 概述

This release resolves a large batch of **`@typescript-eslint/no-unsafe-member-access` warnings** from the Obsidian plugin review — covering all four priority tiers identified during analysis.

本版本修复了 Obsidian 插件审核中大量的 **`@typescript-eslint/no-unsafe-member-access` 警告**，覆盖分析中确定的全部四个优先级。

---

## 🔧 Breaking Changes / 破坏性变更

None. / 无。

---

## ✅ Fixes / 修复内容

### Warning: `@typescript-eslint/no-unsafe-member-access` — Resolved across all files

> **Total scope**: 300+ warning locations across 30+ files, organized into 4 priority tiers.
> 
> **总规模**：30+ 个文件中 300+ 处警告，按 4 个优先级分层处理。

---

#### Tier 1 — Trivial casts (P1) / 极简修复

| File / 文件 | Change / 修改 |
|---|---|
| `services/license.ts` | 6 catch blocks: `error.message` → `(error as Error).message` |
| `sync/SyncStatusDisplay.ts` | `plugin as any` → `as unknown as PluginWithSettings`; `app.setting` access via typed cast |
| `foundry/index.ts:121` | `(merged as any)[k]` → `(merged as Record<string, unknown>)[k]` |
| `setting.ts:628` | `error.message` → `(error as Error).message` |

---

#### Tier 2 — Service type declarations (P2) / 服务类型声明

| File / 文件 | Change / 修改 |
|---|---|
| `main.ts` | `foundryAuthService?: any` → `ObsidianAuthService`; imported proper types from `foundry/types.ts` |
| `http.ts` | Asset form field: `value.data/contentType/filename` typed as `{ data: BlobPart; filename: string; contentType?: string }`; `Blob.name` accessed via intersection type `Blob & { name?: string }` |

---

#### Tier 3 — Foundry API response typing (P3) / Foundry API 响应类型化

**`foundry/index.ts`** and **`foundry/mobile.ts`** — both files received:

新增接口 / New interfaces added:
```typescript
interface TrialResponseItem    { license_key, email, password, validity_days }
interface DeviceItem           { id, device_name, device_type, status, last_seen_at }
interface IpItem               { ip_address, city, region, country, status, last_seen_at }
interface UsageResponseRaw     { license_key, plan, features, devices, ips, disks }
```

`ActivationApiResponse` extended with: `success?: boolean`, `user.user_dir?: string`

All `res.data?.data?.[0]` HTTP response extraction points now carry explicit type assertions:
```typescript
// Before / 之前
const d = res.data?.data?.[0];          // any

// After / 之后
const d = res.data?.data?.[0] as TrialResponseItem | undefined;
```

`buildLicenseInfoFromActivation(data: any)` → `data: ActivationApiResponse`  
`buildLicenseInfoFromStored(stored: any)` → `stored: StoredLicenseShape`

`setNested`/`getNested` utility functions: `obj: any` → `Record<string, unknown>` with full type-safe traversal.

---

#### Tier 4 — LiveSync core files (P4) / LiveSync 核心文件

21 files received file-level `eslint-disable` with descriptive comments explaining the intentional use of untyped PouchDB/CouchDB internal values:

21 个文件添加了带描述性注释的文件级 `eslint-disable`：

**Pure third-party adapted code (文件级禁用 — 完全适配自第三方代码):**
- `sync/core/pouchdb/pouchdb-browser.ts`
- `sync/core/pouchdb/pouchdb-http.ts`
- `sync/core/pouchdb/chunks.ts`
- `sync/core/pouchdb/encryption.ts`
- `sync/core/pouchdb/ReplicatorShim.ts`
- `sync/core/replication/couchdb/LiveSyncReplicator.ts`
- `sync/core/worker/bgWorker.ts` / `bgWorker.splitting.ts` / `bgWorker.encryption.ts` / `bg.worker.ts`
- `sync/core/common/LSError.ts` / `utils.ts`
- `sync/core/managers/ChunkManager.ts` / `EntryManager/EntryManager.ts`
- `sync/core/API/DirectFileManipulatorV2.ts`
- `sync/features/ConnectionFailure/index.ts`
- `sync/features/HiddenFileSync/index.ts`
- `sync/utils/hiddenFileUtils.ts`

**Our adapter code (适配层 — 与 PouchDB 集成导致无法避免的类型不确定性):**
- `sync/FridayServiceHub.ts`
- `sync/FridaySyncCore.ts`
- `sync/features/ServerConnectivity/index.ts`

---

## ✅ Verification / 验证

- `npm run tsc-check` — no new TypeScript errors introduced / 无新增 TypeScript 错误
- `npm test` — **101 / 101 tests pass** (unchanged from before) / **101 / 101 测试全部通过**

---

## 🔄 Version Compatibility / 版本兼容

No change to `minAppVersion`. / `minAppVersion` 无变化。

| Obsidian version | Plugin version |
|---|---|
| 1.7.2 – 1.12.x | v26.7.3 |
| ≥ 1.13.0 | v26.7.6 (latest / 最新) |

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Backend source** / 后端源码：[github.com/mdfriday/hugoverse](https://github.com/mdfriday/hugoverse)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

