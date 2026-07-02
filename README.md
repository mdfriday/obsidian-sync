# MDFriday Sync

> **Standalone CouchDB sync plugin for Obsidian** — Desktop & Mobile

MDFriday Sync lets you keep your Obsidian vault in sync across all your devices using any CouchDB-compatible server. It is extracted from the [Friday plugin](https://github.com/mdfriday/obsidian-friday-plugin) as a self-contained, dependency-free sync-only plugin.

---

## Features

| Feature | Details |
|---|---|
| **Live sync** | Continuously replicate changes in real time |
| **End-to-end encryption** | AES-256 / HKDF with a user-supplied passphrase |
| **Selective sync** | Toggle images, audio, video, PDF, themes, snippets, plugins |
| **Hidden file sync** | `.obsidian/` folder (configurable) |
| **Custom ignore patterns** | Gitignore-style rules |
| **Desktop + Mobile** | No platform-only code in the critical path |

---

## Quick start

1. **Install** the plugin (`obsidian-mdfriday-sync`).
2. Open **Settings → MDFriday Sync**.
3. Enter your **CouchDB Server URL**, **database name**, **username** and **password**.
4. Set an **encryption passphrase** (same on every device).
5. Click **Enable sync** toggle — the plugin will start live-syncing.
6. On first use: click **Upload vault to cloud** to seed the remote database.
7. On additional devices: enter the same credentials + passphrase → **Download vault from cloud**.

---

## Building from source

```bash
cd obsidian-mdfriday-sync
npm install
npm run build      # production  → main.js + styles.css
npm run dev        # development → watch mode
```

---

## Architecture

```
obsidian-mdfriday-sync/
├── src/
│   ├── main.ts        Plugin entry point — MdfridaySyncPlugin
│   ├── setting.ts     Settings tab UI
│   └── sync/          Full copy of the sync engine (CouchDB / PouchDB core)
│       ├── SyncService.ts
│       ├── FridaySyncCore.ts
│       ├── FridayServiceHub.ts
│       ├── FridayStorageEventManager.ts
│       ├── SyncStatusDisplay.ts
│       ├── core/      Low-level livesync library
│       ├── features/  Network, connectivity, hidden-file helpers
│       └── utils/
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── styles.css
```

---

## License

Apache-2.0 — see [LICENSE](LICENSE).

