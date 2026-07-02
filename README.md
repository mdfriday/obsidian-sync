# MDFriday Sync

> **Free, open-source, end-to-end encrypted vault sync for Obsidian** — Desktop & Mobile

Keep your Obsidian vault in perfect sync across all your devices — no subscription, no black box, no vendor lock-in.  
You own your data. You control the server.

---

## Why MDFriday Sync?

There are several ways to sync an Obsidian vault. Here's how they compare:

| | MDFriday Sync | Obsidian Sync | Self-hosted LiveSync | Remotely Save |
|---|---|---|---|---|
| **Price** | Free / Self-host | $8–$16 / month | Free | Free |
| **Plugin open source** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| **Backend open source** | ✅ [Yes](https://github.com/mdfriday/hugoverse) | ❌ No | ✅ (CouchDB) | ✅ (S3 / WebDAV) |
| **Managed backend** | ✅ License key only | ✅ Managed | ❌ Manual CouchDB setup | ❌ Manual setup |
| **Fully self-hostable** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| **End-to-end encryption** | ✅ AES-256 / HKDF | ✅ Yes | ✅ Yes | ⚠️ Optional |
| **Real-time live sync** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Mobile support** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Hidden file sync** | ✅ `.obsidian/` folder | ✅ Yes | ✅ Yes | ❌ No |
| **Conflict handling** | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Basic |
| **Selective sync** | ✅ Per file type | ✅ Yes | ⚠️ Limited | ❌ No |

**MDFriday Sync** builds on the battle-tested [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) core and adds what it lacks: **a fully managed, open-source backend**. With Self-hosted LiveSync you still have to provision and configure your own CouchDB server, manage user accounts, and handle updates yourself. With MDFriday Sync you enter a single license key and everything — database provisioning, authentication, connection credentials — is handled for you automatically. And if you prefer full control, the backend ([hugoverse](https://github.com/mdfriday/hugoverse)) is open source and self-hostable too.

---

## How It Works

MDFriday Sync uses **CouchDB** as the sync backend — a battle-tested, open-source database purpose-built for multi-device replication. Changes made on any device are pushed to a CouchDB server and instantly pulled to all other connected devices.

You have two options for the backend:

### Option A — MDFriday Managed (recommended)
Activate a license at [mdfriday.com](https://mdfriday.com). The backend is provisioned automatically — no CouchDB installation, no server configuration, no credential juggling. Just paste your license key and start syncing. Your data is encrypted on your device before it ever leaves.

### Option B — Self-host Everything (100% free)
Run the backend yourself using **[hugoverse](https://github.com/mdfriday/hugoverse)** — MDFriday's fully open-source backend. It bundles CouchDB setup and everything needed to run your own sync server.

```bash
# Spin up your own backend
git clone https://github.com/mdfriday/hugoverse
# follow the hugoverse README for setup
```

Or point the plugin directly at any existing **CouchDB v3+** instance you manage.

---

## Features

- 🔄 **Live sync** — changes appear on other devices in seconds via CouchDB long-polling
- 🔒 **End-to-end encryption** — AES-256 / HKDF; the server never sees plain text
- 🕵️ **Path obfuscation** — optionally hashes file paths so even filenames are hidden from the server
- 📁 **Selective sync** — choose which file types to sync: images, audio, video, PDF, themes, snippets, plugins
- 🚫 **Custom ignore patterns** — gitignore-style rules to exclude folders or file types
- ⚙️ **Hidden file sync** — keeps `.obsidian/` configuration in sync across devices, with smart per-device exclusions (workspace layout, cache, etc.)
- 📶 **Offline support** — queues changes locally while offline and replays them on reconnect
- 🔁 **Auto-reconnect** — detects network interruptions and reconnects automatically
- 📊 **Status indicator** — real-time sync status shown in the editor corner
- 🌐 **Desktop + Mobile** — works on all platforms without any platform-specific code
- 🌏 **Bilingual UI** — English and Simplified Chinese (中文) built-in

---

## Quick Start

### 1. Install the plugin

Search for **MDFriday Sync** in Obsidian's Community Plugins browser, or install manually by placing the files in your vault's `.obsidian/plugins/mdfriday-sync/` folder.

### 2. Prepare a CouchDB server

- **MDFriday hosted** — create an account at [mdfriday.com](https://mdfriday.com); your CouchDB URL and credentials are provided automatically.
- **Self-hosted** — follow the [hugoverse](https://github.com/mdfriday/hugoverse) setup guide, or install CouchDB directly and create a database.

> CouchDB must be reachable from all your devices (desktop and mobile). For home servers, a VPN or reverse proxy with HTTPS is recommended.

### 3. Configure the plugin

Open **Settings → MDFriday Sync** and fill in:

| Field | Description |
|---|---|
| **Server URL** | Full CouchDB URL, e.g. `https://myserver.com:5984` |
| **Database name** | Name of the CouchDB database (e.g. `my-vault`) |
| **Username / Password** | CouchDB credentials |
| **Encryption passphrase** | *(Optional but recommended)* Must be the same on every device |

Click **Test Connection** to verify.

### 4. Start syncing

- Toggle **Enable Sync** — the plugin starts live-syncing immediately.
- **First device**: click **Upload local data to cloud** to seed the remote database.
- **Additional devices**: enter the same credentials + passphrase → click **Download data from cloud**.

> ⚠️ If you see *"The remote database has been rebuilt"*, click **Fetch from Server** to re-sync a new device.

---

## Selective Sync

Control exactly what gets synced:

| Toggle | File types covered |
|---|---|
| Images | `bmp png jpg jpeg gif svg webp avif` |
| Audio | `mp3 wav m4a 3gp flac ogg oga opus` |
| Video | `mp4 webm ogv mov mkv` |
| PDF | `pdf` |
| Themes | `.obsidian/themes/` |
| Snippets | `.obsidian/snippets/` |
| Plugins | `.obsidian/plugins/` |

You can also define **custom ignore patterns** in gitignore format (e.g. `attachments/`, `*.tmp`, `private/**`) to exclude entire folders or file extensions.

---

## Hidden File (`.obsidian`) Sync

MDFriday Sync can keep your Obsidian configuration — themes, snippets, plugin settings — in sync across devices.

The following are excluded by default because they are device-specific or auto-regenerated:

| Excluded | Why |
|---|---|
| `workspace.json`, `workspace-mobile.json` | Window layout — differs per device |
| `cache/` | Auto-regenerated, large, and device-specific |
| `node_modules/`, `.git/` | Development artifacts |
| `plugins/mdfriday/` | MDFriday plugin data — device-specific |

---

## Building from Source

```bash
git clone https://github.com/mdfriday/obsidian-sync
cd obsidian-sync
npm install
npm run build      # → main.js + styles.css
npm run dev        # watch mode for development
npm test           # run unit tests
```

**Requirements:** Node.js ≥ 18

---

## Security Model

1. **Encryption happens on your device** — the passphrase never leaves your machine.
2. **The server stores only ciphertext** — even if the server is compromised, your notes cannot be read.
3. **Path obfuscation** (optional) — file paths are SHA-256 hashed before being stored, so the server cannot infer your folder structure.
4. **Open source end-to-end** — [plugin code](https://github.com/mdfriday/obsidian-sync) and [backend code](https://github.com/mdfriday/hugoverse) are both publicly auditable.

---

## Troubleshooting

| Symptom | Solution |
|---|---|
| "Remote database has been rebuilt" | Click **Fetch from Server** on the affected device |
| Sync stopped but no error | Click **Reconnect Sync** in Settings |
| Files missing after sync | Click **Rebuild vault from DB** to re-write files from local cache |
| Files on server but not on new device | Use **Download data from cloud** on the new device |
| Encryption mismatch | Verify the passphrase is identical on all devices |

---

## License

Apache-2.0 — see [LICENSE](LICENSE).  
Use it, fork it, self-host it — no restrictions.

---

## Acknowledgements

— [LiveSync](https://github.com/vrtmrz/obsidian-livesync) – multi-device synchronization
