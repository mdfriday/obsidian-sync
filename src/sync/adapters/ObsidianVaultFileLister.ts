import type { Plugin } from 'obsidian';
import type { IVaultFileLister } from '@mdfriday/sync-core/interfaces/IPluginAdapters';

/**
 * Wraps plugin.app.vault (+ adapter) as IVaultFileLister.
 *
 * Used by FridayHiddenFileSync to perform all vault file operations
 * without importing Obsidian types into the sync-core package.
 */
export class ObsidianVaultFileLister implements IVaultFileLister {
    constructor(private plugin: Plugin) {}

    private get adapter() {
        return this.plugin.app.vault.adapter;
    }

    private get vault() {
        return this.plugin.app.vault;
    }

    // ── Directory listing ────────────────────────────────────────────────────

    async list(path: string): Promise<{ files: string[]; folders: string[] }> {
        return this.adapter.list(path);
    }

    // ── File metadata ────────────────────────────────────────────────────────

    async stat(path: string): Promise<{ type: string; size: number; mtime: number; ctime: number } | null> {
        const s = await this.adapter.stat(path);
        if (!s) return null;
        return { type: s.type, size: s.size, mtime: s.mtime, ctime: s.ctime };
    }

    async exists(path: string): Promise<boolean> {
        return this.adapter.exists(path);
    }

    // ── Read ─────────────────────────────────────────────────────────────────

    async read(path: string): Promise<string> {
        return this.adapter.read(path);
    }

    async readBinary(path: string): Promise<ArrayBuffer> {
        return this.adapter.readBinary(path);
    }

    // ── Write ────────────────────────────────────────────────────────────────

    async write(path: string, data: string): Promise<void> {
        return this.adapter.write(path, data);
    }

    async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
        return this.adapter.writeBinary(path, data);
    }

    async setMtime(path: string, mtime: number): Promise<void> {
        if (typeof (this.adapter as any).setMtime === 'function') {
            await (this.adapter as any).setMtime(path, mtime);
        }
    }

    async remove(path: string): Promise<void> {
        return this.adapter.remove(path);
    }

    async mkdir(path: string): Promise<void> {
        return this.adapter.mkdir(path);
    }

    // ── Vault-level operations ───────────────────────────────────────────────

    async createFolder(path: string): Promise<void> {
        await this.vault.createFolder(path);
    }

    getRoot(): string {
        return this.vault.getRoot().path;
    }

    get configDir(): string {
        return this.vault.configDir;
    }
}
