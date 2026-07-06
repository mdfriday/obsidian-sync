/**
 * Feature unit tests — ServerConnectivity
 * Zero Obsidian dependencies: IHttpClient is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerConnectivityChecker } from '../../src/features/ServerConnectivity';
import type { IHttpClient } from '../../src/interfaces/IPluginAdapters';

function makeHttpOk(): IHttpClient {
    return {
        request: vi.fn(async () => ({
            status: 200,
            text: 'OK',
            json: {},
            arrayBuffer: new ArrayBuffer(0),
            headers: {},
        })),
    };
}

function makeHttpFail(): IHttpClient {
    return {
        request: vi.fn(async () => { throw new Error('Network error'); }),
    };
}

/** Simulate navigator.onLine = true for tests that need network availability */
function setOnline(online: boolean) {
    Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

const dbSettings: any = { couchDB_URI: 'https://db.test', couchDB_USER: 'u', couchDB_PASSWORD: 'p' };

describe('ServerConnectivityChecker', () => {
    let checker: ServerConnectivityChecker;

    beforeEach(() => {
        setOnline(true); // Default: online for most tests
    });

    afterEach(() => {
        setOnline(true); // Restore after each test
    });

    it('initial status is UNKNOWN', () => {
        checker = new ServerConnectivityChecker(makeHttpOk());
        expect(checker.currentStatus).toBe('UNKNOWN');
        expect(checker.isServerReachable).toBe(false);
    });

    it('checkConnectivity returns REACHABLE when server responds 200', async () => {
        checker = new ServerConnectivityChecker(makeHttpOk());
        const result = await checker.checkConnectivity(dbSettings, true);
        expect(result.status).toBe('REACHABLE');
        expect(checker.isServerReachable).toBe(true);
    });

    it('checkConnectivity returns UNREACHABLE on network error', async () => {
        checker = new ServerConnectivityChecker(makeHttpFail());
        const result = await checker.checkConnectivity(dbSettings, true);
        expect(result.status).toBe('UNREACHABLE');
        expect(result.error).toBeDefined();
    });

    it('respects cooldown and returns cached result without re-requesting', async () => {
        const http = makeHttpOk();
        checker = new ServerConnectivityChecker(http);
        // First call (forceCheck=true) triggers actual request
        await checker.checkConnectivity(dbSettings, true);
        // Second call without forceCheck uses cache
        await checker.checkConnectivity(dbSettings, false);
        expect(http.request).toHaveBeenCalledTimes(1);
    });

    it('forceCheck=true bypasses cooldown', async () => {
        const http = makeHttpOk();
        checker = new ServerConnectivityChecker(http);
        await checker.checkConnectivity(dbSettings, true);
        await checker.checkConnectivity(dbSettings, true); // force again
        expect(http.request).toHaveBeenCalledTimes(2);
    });

    it('returns UNREACHABLE when navigator.onLine is false', async () => {
        const http = makeHttpOk();
        checker = new ServerConnectivityChecker(http);
        setOnline(false);
        const result = await checker.checkConnectivity(dbSettings, true);
        expect(result.status).toBe('UNREACHABLE');
        expect(http.request).not.toHaveBeenCalled();
    });
});




