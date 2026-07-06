import type { Plugin } from 'obsidian';
import type { IVaultFileLister } from '../sync-core/src/interfaces/IPluginAdapters';

/**
 * Wraps plugin.app.vault.adapter.list as IVaultFileLister.
 *
 * Used by FridayHiddenFileSync to enumerate .obsidian/ directory
 * without importing Obsidian types into the sync-core package.
 */
export class ObsidianVaultFileLister implements IVaultFileLister {
    constructor(private plugin: Plugin) {}

    async list(path: string): Promise<{ files: string[]; folders: string[] }> {
        return this.plugin.app.vault.adapter.list(path);
    }
}

