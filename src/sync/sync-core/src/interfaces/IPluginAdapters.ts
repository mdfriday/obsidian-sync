/**
 * IPluginAdapters — Platform-neutral adapter interfaces.
 *
 * These replace direct Obsidian API usage in sync/features/**:
 *   - IDomEventRegistrar  ← replaces Plugin.registerDomEvent
 *   - IVaultFileLister    ← replaces plugin.app.vault.adapter.list
 *   - IHttpClient         ← replaces Obsidian's requestUrl
 *
 * Obsidian implementations live in src/sync/adapters/ (plugin side).
 */

/**
 * Replaces Plugin.registerDomEvent in FridayNetworkEvents.
 *
 * Obsidian's registerDomEvent automatically removes listeners when the
 * plugin unloads. The Obsidian adapter (ObsidianDomEventRegistrar) wraps
 * plugin.registerDomEvent to preserve this behaviour.
 */
export interface IDomEventRegistrar {
    registerDomEvent(
        el: EventTarget,
        type: string,
        handler: EventListenerOrEventListenerObject
    ): void;
}

/**
 * Replaces plugin.app.vault.adapter.list in FridayHiddenFileSync.
 *
 * Used only to enumerate files inside .obsidian/ for hidden-file sync.
 */
export interface IVaultFileLister {
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

/**
 * Replaces Obsidian's requestUrl in ServerConnectivityChecker.
 *
 * requestUrl bypasses Obsidian's CORS sandbox. The adapter wraps it so
 * the core package has no direct Obsidian dependency for HTTP.
 */
export interface IHttpClient {
    request(params: {
        url: string;
        method: string;
        headers?: Record<string, string>;
        body?: string;
        /** If false, do not throw on non-2xx status (mirrors requestUrl behaviour) */
        throw?: boolean;
    }): Promise<{
        status: number;
        text: string;
        json: unknown;
        arrayBuffer: ArrayBuffer;
        headers: Record<string, string>;
    }>;
}

