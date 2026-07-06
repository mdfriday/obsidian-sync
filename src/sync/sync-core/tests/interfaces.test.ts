/**
 * Interface contract tests — Phase 2
 *
 * Verifies that:
 * 1. ISyncCore can be implemented by a plain object (structural typing)
 * 2. IPluginAdapters can be mocked without any Obsidian dependency
 *
 * These tests have zero Obsidian imports — that's the whole point.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ISyncCore } from '../src/interfaces/ISyncCore';
import type {
    IDomEventRegistrar,
    IVaultFileLister,
    IHttpClient,
} from '../src/interfaces/IPluginAdapters';
import { makeMockSyncCore } from './__mocks__/ISyncCore.mock';

// ── ISyncCore ──────────────────────────────────────────────────────────────

describe('ISyncCore interface', () => {
    it('makeMockSyncCore satisfies the ISyncCore shape', () => {
        const core: ISyncCore = makeMockSyncCore();
        expect(core.getSettings).toBeDefined();
        expect(core.replicationStat).toBeDefined();
        expect(core.kvDB).toBeDefined();
        expect(core.managers).toBeDefined();
        expect(core.testConnection).toBeDefined();
        expect(core.startSync).toBeDefined();
        expect(core.handleNetworkRecovery).toBeDefined();
        expect(core.setStatus).toBeDefined();
    });

    it('getSettings returns settings object', () => {
        const core = makeMockSyncCore();
        const settings = core.getSettings();
        expect(settings).toBeDefined();
        expect(typeof settings.liveSync).toBe('boolean');
    });

    it('replicationStat.value.syncStatus is accessible', () => {
        const core = makeMockSyncCore();
        expect(core.replicationStat.value.syncStatus).toBe('NOT_CONNECTED');
    });

    it('testConnection resolves with success shape', async () => {
        const core = makeMockSyncCore();
        const result = await core.testConnection();
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('message');
    });

    it('startSync resolves to boolean', async () => {
        const core = makeMockSyncCore();
        const result = await core.startSync(true, { reason: 'AUTO_RECONNECT' });
        expect(typeof result).toBe('boolean');
    });

    it('managers.networkManager.setServerReachable is callable', () => {
        const core = makeMockSyncCore();
        core.managers?.networkManager?.setServerReachable(true);
        expect(core.managers?.networkManager?.setServerReachable).toHaveBeenCalledWith(true);
    });

    it('storageEventManager.processFileEventDirect is callable', async () => {
        const core = makeMockSyncCore();
        await core.storageEventManager?.processFileEventDirect({ type: 'CHANGED', path: 'test.md' });
        expect(core.storageEventManager?.processFileEventDirect).toHaveBeenCalled();
    });

    it('overrides work correctly', () => {
        const core = makeMockSyncCore({
            getSettings: vi.fn(() => ({ liveSync: true } as any)),
        });
        expect(core.getSettings().liveSync).toBe(true);
    });
});

// ── IDomEventRegistrar ─────────────────────────────────────────────────────

describe('IDomEventRegistrar interface', () => {
    it('can be implemented with a simple mock', () => {
        const registrar: IDomEventRegistrar = {
            registerDomEvent: vi.fn(),
        };
        const mockWindow = {} as EventTarget; // Node env: use plain object
        registrar.registerDomEvent(mockWindow, 'online', () => {});
        expect(registrar.registerDomEvent).toHaveBeenCalledWith(
            mockWindow,
            'online',
            expect.any(Function)
        );
    });

    it('accepts any EventTarget-like object as target', () => {
        const registrar: IDomEventRegistrar = { registerDomEvent: vi.fn() };
        const mockTarget = {} as EventTarget; // Node env: use plain object
        registrar.registerDomEvent(mockTarget, 'visibilitychange', () => {});
        expect(registrar.registerDomEvent).toHaveBeenCalledTimes(1);
    });
});

// ── IVaultFileLister ───────────────────────────────────────────────────────

describe('IVaultFileLister interface', () => {
    it('list resolves with files and folders arrays', async () => {
        const lister: IVaultFileLister = {
            list: vi.fn(async () => ({
                files: ['.obsidian/plugins/my-plugin/main.js'],
                folders: ['.obsidian/plugins/my-plugin'],
            })),
        };
        const result = await lister.list('.obsidian');
        expect(Array.isArray(result.files)).toBe(true);
        expect(Array.isArray(result.folders)).toBe(true);
        expect(result.files[0]).toContain('.obsidian');
    });

    it('list with empty path returns empty result', async () => {
        const lister: IVaultFileLister = {
            list: vi.fn(async () => ({ files: [], folders: [] })),
        };
        const result = await lister.list('');
        expect(result.files).toHaveLength(0);
    });
});

// ── IHttpClient ────────────────────────────────────────────────────────────

describe('IHttpClient interface', () => {
    it('request resolves with status, text, json, arrayBuffer, headers', async () => {
        const http: IHttpClient = {
            request: vi.fn(async () => ({
                status: 200,
                text: 'OK',
                json: { ok: true },
                arrayBuffer: new ArrayBuffer(0),
                headers: { 'content-type': 'application/json' },
            })),
        };
        const result = await http.request({ url: 'https://db.test', method: 'HEAD' });
        expect(result.status).toBe(200);
        expect(result.headers['content-type']).toBe('application/json');
    });

    it('request propagates network errors', async () => {
        const http: IHttpClient = {
            request: vi.fn(async () => {
                throw new Error('Network error');
            }),
        };
        await expect(
            http.request({ url: 'https://unreachable.test', method: 'HEAD', throw: false })
        ).rejects.toThrow('Network error');
    });

    it('accepts optional throw:false param', async () => {
        const http: IHttpClient = {
            request: vi.fn(async (_params) => ({
                status: 404,
                text: 'Not Found',
                json: {},
                arrayBuffer: new ArrayBuffer(0),
                headers: {},
            })),
        };
        const result = await http.request({
            url: 'https://db.test',
            method: 'GET',
            throw: false,
        });
        expect(result.status).toBe(404);
    });
});



