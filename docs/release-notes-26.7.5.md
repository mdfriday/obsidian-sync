# MDFriday Sync — Release Notes v26.7.5

> Released: July 4, 2026 · 发布日期：2026 年 7 月 4 日

---

## 📋 Overview / 概述

This is a **hotfix release** that corrects the `minAppVersion` from `1.7.2` to `1.13.0`, fixing the final Obsidian plugin review error.

本版本是一个**热修复版本**，将 `minAppVersion` 从 `1.7.2` 更正为 `1.13.0`，修复了 Obsidian 插件审核中最后一个错误。

---

## 🔧 Breaking Changes / 破坏性变更

**Requires Obsidian ≥ 1.13.0** (was ≥ 1.7.2 in v26.7.4).

**要求 Obsidian ≥ 1.13.0**（v26.7.4 要求 ≥ 1.7.2）。

Users on an older Obsidian version will automatically receive a compatible older plugin version via the `versions.json` fallback — no manual action required.  
旧版本 Obsidian 用户将通过 `versions.json` 回退机制自动获取兼容的旧插件版本，无需手动操作。

---

## 🐛 Bug Fix / 错误修复

### Final `minAppVersion` correction / 最终 `minAppVersion` 修正

**Error from Obsidian plugin review (v26.7.4 / minAppVersion: 1.7.2):**

```
Error: Uses Obsidian APIs newer than the declared `minAppVersion`
  obsidianmd/no-unsupported-api
  src/sync/SyncStatusDisplay.ts:85
```

**Root cause / 根本原因:**

`SyncStatusDisplay.ts:85` accesses `this.plugin.settings`, which maps to `Plugin.settings` — a property added to Obsidian's `Plugin` base class in **1.13.0**, confirmed directly from the type definition:

`SyncStatusDisplay.ts:85` 访问了 `this.plugin.settings`，对应 `Plugin.settings` 属性，该属性在 Obsidian **1.13.0** 中加入基类，直接来源于类型定义文件的标注：

```typescript
// node_modules/obsidian/obsidian.d.ts
/**
 * Plugin settings. Assign loaded data here in `onload`.
 * @since 1.13.0
 */
settings?: unknown;
```

**Fix / 修复:**

```json
// manifest.json
{ "minAppVersion": "1.13.0" }   // was "1.7.2" in v26.7.4

// versions.json
{
  "26.7.4": "1.13.0",
  "26.7.5": "1.13.0"
}
```

No code changes in this release. / 本版本无代码变更。

---

## 🔄 Version Compatibility Matrix / 版本兼容矩阵

| Obsidian version / Obsidian 版本 | Plugin version received / 获得的插件版本 |
|---|---|
| < 1.0.0 | Not installable / 无法安装 |
| 1.0.0 – 1.3.x | v26.7.1 |
| 1.4.0 – 1.7.1 | v26.7.2 |
| 1.7.2 – 1.12.x | v26.7.3 |
| ≥ 1.13.0 | v26.7.5 (latest / 最新) |

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Backend source** / 后端源码：[github.com/mdfriday/hugoverse](https://github.com/mdfriday/hugoverse)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

---

*See [release-notes-26.7.2.md](./release-notes-26.7.2.md) for the full list of compliance changes introduced in the v26.7.x series.*

*完整的 26.7.x 系列合规变更列表请参见 [release-notes-26.7.2.md](./release-notes-26.7.2.md)。*

