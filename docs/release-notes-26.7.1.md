# MDFriday Sync — Release Notes v26.7.1

> Released: July 4, 2026 · 发布日期：2026 年 7 月 4 日

---

## 🎉 First Release / 首次发布

We are excited to announce the **first public release** of **MDFriday Sync** — a free, open-source, end-to-end encrypted vault synchronization plugin for Obsidian, supporting both Desktop and Mobile.

我们非常高兴地宣布 **MDFriday Sync** 的**首个正式版本**发布。这是一款免费、开源、端对端加密的 Obsidian 笔记库同步插件，同时支持桌面端与移动端。

---

## ✨ What's New / 新特性

### 🔄 Live Sync via CouchDB / 基于 CouchDB 的实时同步

Vault changes are pushed to a CouchDB server and pulled to all connected devices in seconds — no polling, no delay.

笔记库的任何变更都会即时推送到 CouchDB 服务器，并实时同步到所有已连接设备，无需轮询，延迟极低。

---

### 🔒 End-to-End Encryption / 端对端加密

All content is encrypted on your device using **AES-256 / HKDF** before it ever leaves. The server stores only ciphertext — your data cannot be read even if the server is compromised.

所有内容在离开设备前均使用 **AES-256 / HKDF** 在本地加密。服务器仅存储密文，即便服务器遭到入侵，您的数据也无法被读取。

---

### 🕵️ Path Obfuscation / 路径混淆

Optionally hashes file paths before storage so the server cannot infer your folder structure or file names.

可选功能：在存储前对文件路径进行哈希处理，使服务器无法推断您的目录结构或文件名。

---

### 📁 Selective Sync / 选择性同步

Fine-grained control over what gets synced. Toggle each category independently:

精细控制同步范围，可按类别独立开启或关闭：

| Category / 类别 | File Types / 文件类型 |
|---|---|
| Images / 图片 | `bmp png jpg jpeg gif svg webp avif` |
| Audio / 音频 | `mp3 wav m4a 3gp flac ogg oga opus` |
| Video / 视频 | `mp4 webm ogv mov mkv` |
| PDF | `pdf` |
| Themes / 主题 | `.obsidian/themes/` |
| Snippets / 代码片段 | `.obsidian/snippets/` |
| Plugins / 插件 | `.obsidian/plugins/` |

---

### 🚫 Custom Ignore Patterns / 自定义忽略规则

Define gitignore-style patterns to exclude folders or file types from sync (e.g. `attachments/`, `*.tmp`, `private/**`).

支持 gitignore 格式的自定义忽略规则，可排除特定目录或文件类型（如 `attachments/`、`*.tmp`、`private/**`）。

---

### ⚙️ Hidden File Sync / 隐藏文件同步（`.obsidian/`）

Keep your Obsidian configuration — themes, snippets, plugin settings — in sync across all devices, with smart per-device exclusions for workspace state, cache, and device-specific files.

跨设备同步 Obsidian 配置（主题、代码片段、插件设置），并智能排除工作区状态、缓存及设备特有文件，避免冲突。

Default exclusions / 默认排除项：
- `.obsidian/workspace` · `.obsidian/workspace.json` · `.obsidian/workspace-mobile.json`
- `.obsidian/cache`
- `node_modules/` · `.git/`
- `plugins/mdfriday-sync` *(this plugin's own data / 本插件自身数据)*

---

### 📶 Offline Support & Auto-Reconnect / 离线支持与自动重连

Changes made while offline are queued locally and replayed automatically once connectivity is restored. Network interruptions are detected and reconnection is handled transparently.

离线时产生的变更会暂存本地，网络恢复后自动同步。网络中断时自动检测并重连，无需手动干预。

---

### 📊 Real-Time Status Indicator / 实时状态指示器

A compact status display in the editor corner shows live sync progress, connection state, and recent log entries at a glance.

编辑器角落的紧凑状态显示器，实时展示同步进度、连接状态及最新日志，一目了然。

---

### 🌐 Desktop & Mobile / 桌面端与移动端全支持

Works on all Obsidian platforms without any platform-specific workarounds. Mobile uses Obsidian's own Vault API for full compatibility.

在所有 Obsidian 平台上开箱即用，无需特定平台的特殊处理。移动端使用 Obsidian 原生 Vault API，兼容性完整。

---

### 🌏 Bilingual UI / 中英双语界面

The Settings panel is fully localized in **English** and **Simplified Chinese (简体中文)**. Language is detected automatically from Obsidian's locale.

设置面板完整支持**英语**与**简体中文**，根据 Obsidian 语言设置自动切换。

---

### 🔑 License Key Activation / 许可证密钥激活

Activate the managed backend with a single license key from [mdfriday.com](https://mdfriday.com). Database provisioning, authentication, and connection credentials are all handled automatically — no CouchDB configuration required.

在 [mdfriday.com](https://mdfriday.com) 获取许可证密钥，一键激活托管后端。数据库配置、身份验证、连接凭据均自动完成，无需手动配置 CouchDB。

---

### 🏢 Enterprise & Self-Host Support / 企业版与自托管支持

Point the plugin at any **CouchDB v3+** instance or run your own backend with **[hugoverse](https://github.com/mdfriday/hugoverse)** — MDFriday's fully open-source backend. Enterprise users can configure a custom API URL via the Enterprise Settings panel.

支持对接任意 **CouchDB v3+** 实例，或使用 MDFriday 完全开源的后端 **[hugoverse](https://github.com/mdfriday/hugoverse)** 自托管。企业用户可在设置面板中配置自定义 API 地址。

---

## 🛠 Technical Highlights / 技术亮点

| Item / 项目 | Detail / 详情 |
|---|---|
| Sync core / 同步核心 | Built on [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) |
| Encryption / 加密 | AES-256-GCM + HKDF key derivation |
| Chunking / 分块 | Rabin-Karp content-defined chunking |
| Local DB / 本地数据库 | PouchDB (IndexedDB) |
| Remote DB / 远端数据库 | CouchDB v3+ |
| Conflict resolution / 冲突处理 | CouchDB multi-version concurrency control |
| Build / 构建 | esbuild, TypeScript 5, tree-shaking |
| Test / 测试 | Vitest unit tests for core logic |
| Min Obsidian version / 最低版本 | 0.15.0 |

---

## 🚀 Getting Started / 快速开始

1. Install **MDFriday Sync** from Obsidian's Community Plugins  
   在 Obsidian 社区插件市场安装 **MDFriday Sync**

2. Open **Settings → MDFriday Sync** and enter your license key  
   进入 **设置 → MDFriday Sync**，输入许可证密钥

3. Toggle **Enable Sync** — live sync starts immediately  
   开启**启用同步**开关，实时同步立即开始

4. On your first device, click **Upload local data to cloud** to seed the remote database  
   在第一台设备上点击**上传本地数据到云端**，初始化远端数据库

5. On additional devices, enter the same credentials + passphrase → **Download data from cloud**  
   在其他设备上输入相同凭据和密码短语 → 点击**从云端下载数据**

---

## 🔗 Links / 相关链接

- **Plugin source** / 插件源码：[github.com/mdfriday/obsidian-sync](https://github.com/mdfriday/obsidian-sync)
- **Backend source** / 后端源码：[github.com/mdfriday/hugoverse](https://github.com/mdfriday/hugoverse)
- **Website** / 官网：[mdfriday.com](https://mdfriday.com)
- **License / 开源协议**：Apache-2.0

---

*Thank you for being an early adopter of MDFriday Sync. Your feedback shapes the next release!*

*感谢您成为 MDFriday Sync 的早期用户。您的反馈将推动下一个版本的持续改进！*

