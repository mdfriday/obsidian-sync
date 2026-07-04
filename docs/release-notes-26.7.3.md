# MDFriday Sync — Release Notes v26.7.3

> Released: July 4, 2026 · 发布日期：2026 年 7 月 4 日

---

## 📋 Overview / 概述

This is a **hotfix release** that corrects the declared `minAppVersion` from `1.0.0` to `1.4.0`.  
Version 26.7.2 introduced several Obsidian APIs that were added after version 1.0.0, causing the plugin review process to flag an error. This release aligns the declared minimum with the APIs actually in use.

本版本是一个**热修复版本**，将 `minAppVersion` 从 `1.0.0` 更正为 `1.4.0`。  
26.7.2 版本中使用了若干在 1.0.0 之后才引入的 Obsidian API，导致插件审核流程报错。本版本将声明的最低版本与实际使用的 API 对齐。

---

## 🔧 Breaking Changes / 破坏性变更

**Requires Obsidian ≥ 1.7.2** (was ≥ 1.0.0 in previous releases, ≥ 1.4.0 in v26.7.2).

**要求 Obsidian ≥ 1.7.2**（v26.7.2 要求 ≥ 1.4.0，更早版本要求 ≥ 1.0.0）。

Obsidian 1.7.2 was released in 2024 and is available to most active users. Users on an older version will automatically receive plugin v26.7.2 via Obsidian's versioned plugin fallback in `versions.json`.  
Obsidian 1.7.2 发布于 2024 年，大多数活跃用户均可使用。旧版本用户将通过 `versions.json` 回退机制自动获取 v26.7.2 插件版本。

---

## 🐛 Bug Fix / 错误修复

### Plugin review error: `minAppVersion` too low / 插件审核错误：`minAppVersion` 声明过低

**Error from Obsidian plugin review:**

```
Error: Uses Obsidian APIs newer than the declared minAppVersion
  obsidianmd/no-unsupported-api
  src/setting.ts:565, src/setting.ts:584, src/setting.ts:605, src/setting.ts:630
  src/setting.ts:782-784
  src/sync/FridayServiceHub.ts:496, src/sync/FridayServiceHub.ts:580
  src/sync/FridaySyncCore.ts:1526
  src/sync/SyncStatusDisplay.ts:85
  src/sync/features/HiddenFileSync/index.ts:353
```

**Root cause / 根本原因:**

The following Obsidian APIs used in v26.7.2 were introduced after version 1.0.0:

以下 v26.7.2 中使用的 Obsidian API 均在 1.0.0 版本之后才引入：

| API | Minimum version / 最低要求 | Used in / 使用位置 |
|---|---|---|
| `ButtonComponent.setDisabled()` | 1.4.0 | `setting.ts` |
| `ExtraButtonComponent.setIcon()` / `.setTooltip()` | 1.4.0 | `setting.ts` |
| `FileManager.trashFile()` | **1.7.2** | `FridayServiceHub.ts` |
| `Vault.createFolder()` returning `Promise<TFolder>` | 1.4.0 | `FridaySyncCore.ts`, `HiddenFileSync` |

Bumping to `1.4.0` in v26.7.2 resolved the first three rows but missed `FileManager.trashFile()` which was introduced in **1.7.2**. This release corrects the declared minimum.

**v26.7.2 中将 minAppVersion 提升至 1.4.0 修复了前三项，但遗漏了 `FileManager.trashFile()`（在 1.7.2 引入）。本版本修正了声明的最低版本要求。**

**Fix / 修复:**

```json
// manifest.json
{
  "minAppVersion": "1.7.2"  // was "1.4.0" in v26.7.2, "1.0.0" in v26.7.1
}

// versions.json
{
  "26.7.1": "1.0.0",   // basic Obsidian APIs
  "26.7.2": "1.4.0",   // ButtonComponent.setDisabled, vault.createFolder, etc.
  "26.7.3": "1.7.2"    // FileManager.trashFile()
}
```

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Backend source** / 后端源码：[github.com/mdfriday/hugoverse](https://github.com/mdfriday/hugoverse)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

---

*See [release-notes-26.7.2.md](./release-notes-26.7.2.md) for the full list of changes introduced in the v26.7.x series.*

*完整的 26.7.x 系列变更列表请参见 [release-notes-26.7.2.md](./release-notes-26.7.2.md)。*

