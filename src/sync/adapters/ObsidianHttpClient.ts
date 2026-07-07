import { requestUrl } from 'obsidian';
import type { IHttpClient } from '@mdfriday/sync-core/interfaces/IPluginAdapters';

/**
 * Wraps Obsidian's requestUrl as IHttpClient.
 *
 * requestUrl bypasses Obsidian's CORS sandbox restrictions, which is
 * required for CouchDB connectivity checks from within the plugin.
 */
export class ObsidianHttpClient implements IHttpClient {
    async request(
        params: Parameters<IHttpClient['request']>[0]
    ): ReturnType<IHttpClient['request']> {
        const result = await requestUrl(params as Parameters<typeof requestUrl>[0]);
        return {
            status: result.status,
            text: result.text,
            json: result.json,
            arrayBuffer: result.arrayBuffer,
            headers: result.headers as Record<string, string>,
        };
    }
}

