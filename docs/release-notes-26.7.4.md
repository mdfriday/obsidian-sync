# MDFriday Sync — Release Notes v26.7.4

> Released: July 4, 2026 · 发布日期：2026 年 7 月 4 日

---

## 📋 Overview / 概述

This release fixes two remaining Obsidian plugin review errors that persisted after v26.7.3 by bumping `minAppVersion` to **`1.13.0`**.

本版本通过将 `minAppVersion` 提升至 **`1.13.0`** 修复了 v26.7.3 之后仍存在的两个插件审核错误。

---

## 🔧 Breaking Changes / 破坏性变更

**Requires Obsidian ≥ 1.13.0** (was ≥ 1.7.2 in v26.7.3).

**要求 Obsidian ≥ 1.13.0**（v26.7.3 要求 ≥ 1.7.2）。

Users on an older Obsidian version will automatically receive an older compatible plugin version via the `versions.json` fallback mechanism — no manual action required.  
旧版本 Obsidian 用户将通过 `versions.json` 回退机制自动获取兼容的旧插件版本，无需手动操作。

---

## 🐛 Bug Fix / 错误修复

### Plugin review error: `minAppVersion` still too low / 插件审核错误：`minAppVersion` 声明仍过低

**Remaining error after v26.7.3 (minAppVersion: 1.7.2):**

```
Error: Uses Obsidian APIs newer than the declared `minAppVersion`
  obsidianmd/no-unsupported-api
  src/sync/SyncStatusDisplay.ts:85
```

**Root cause / 根本原因:**

`SyncStatusDisplay.ts:85` accesses `Plugin.settings` — a property added to Obsidian's `Plugin` base class in version **1.13.0** (confirmed from the `@since 1.13.0` annotation in `obsidian.d.ts`):

`SyncStatusDisplay.ts:85` 访问了 `Plugin.settings`，该属性在 Obsidian **1.13.0** 中添加到 `Plugin` 基类（来源：`obsidian.d.ts` 中的 `@since 1.13.0` 注解）：

```typescript
// obsidian.d.ts — Plugin class
/**
 * Plugin settings. Assign loaded data here in `onload`.
 * @since 1.13.0
 */
settings?: unknown;
```

**All APIs requiring newer versions / 所有需要更新版本的 API：**

| API | `@since` | Used in / 使用位置 |
|---|---|---|
| `FileManager.trashFile(file)` | 1.7.2 | `FridayServiceHub.ts:580` |
| `Plugin.settings` | **1.13.0** | `SyncStatusDisplay.ts:85` |

`minAppVersion` must be at least the highest of these: **`1.13.0`**.  
`minAppVersion` 必须至少为这些值中最高的：**`1.13.0`**。

**Fix / 修复:**

```json
// manifest.json
{
  "minAppVersion": "1.13.0"   // was "1.7.2" in v26.7.3
}

// versions.json
{
  "26.7.3": "1.7.2",
  "26.7.4": "1.13.0"
}
```

No code changes. / 无代码变更。

---

## 🔄 Version Compatibility Matrix / 版本兼容矩阵

| Obsidian version / Obsidian 版本 | Plugin version received / 获得的插件版本 |
|---|---|
| < 1.0.0 | Not installable / 无法安装 |
| 1.0.0 – 1.3.x | v26.7.1 |
| 1.4.0 – 1.7.1 | v26.7.2 |
| 1.7.2 – 1.12.x | v26.7.3 |
| ≥ 1.13.0 | v26.7.4 (latest / 最新) |

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Backend source** / 后端源码：[github.com/mdfriday/hugoverse](https://github.com/mdfriday/hugoverse)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

---

*See [release-notes-26.7.2.md](./release-notes-26.7.2.md) for the full list of compliance changes introduced in the v26.7.x series.*

*完整的 26.7.x 系列合规变更列表请参见 [release-notes-26.7.2.md](./release-notes-26.7.2.md)。*
