import { vi } from 'vitest';
import type { ISyncCore } from '../../src/interfaces/ISyncCore';
import type {
    IManagersFacade,
    INetworkManager,
    IStorageEventManagerFacade,
    IOfflineTrackerFacade,
    IConnectionMonitorFacade,
} from '../../src/interfaces/ISyncCore';

// ── Sub-mock factories ─────────────────────────────────────────────────────

export function makeMockNetworkManager(
    overrides: Partial<INetworkManager> = {}
): INetworkManager {
    return {
        setServerReachable: vi.fn(),
        consecutiveFailures: 0,
        ...overrides,
    };
}

export function makeMockManagers(
    overrides: Partial<IManagersFacade> = {}
): IManagersFacade {
    return {
        networkManager: makeMockNetworkManager(),
        ...overrides,
    };
}

export function makeMockStorageEventManager(
    overrides: Partial<IStorageEventManagerFacade> = {}
): IStorageEventManagerFacade {
    return {
        processFileEventDirect: vi.fn(async () => {}),
        markFileProcessing: vi.fn(),
        ...overrides,
    };
}

export function makeMockOfflineTracker(
    overrides: Partial<IOfflineTrackerFacade> = {}
): IOfflineTrackerFacade {
    return {
        setOffline: vi.fn(),
        ...overrides,
    };
}

export function makeMockConnectionMonitor(
    overrides: Partial<IConnectionMonitorFacade> = {}
): IConnectionMonitorFacade {
    return {
        isReconnectScheduled: vi.fn(() => false),
        scheduleReconnect: vi.fn(),
        ...overrides,
    };
}

// ── Main mock factory ──────────────────────────────────────────────────────

export function makeMockSyncCore(overrides: Partial<ISyncCore> = {}): ISyncCore {
    return {
        getSettings: vi.fn(() => ({
            liveSync: false,
            syncInternalFiles: true,
            couchDB_URI: 'https://test-db.example.com',
            couchDB_USER: 'test',
            couchDB_PASSWORD: 'test',
            couchDB_DBNAME: 'test-db',
            isConfigured: true,
            suspendFileWatching: false,
        } as any)),

        replicationStat: {
            value: {
                sent: 0,
                arrived: 0,
                maxPullSeq: 0,
                maxPushSeq: 0,
                lastSyncPullSeq: 0,
                lastSyncPushSeq: 0,
                syncStatus: 'NOT_CONNECTED' as any,
            },
        } as any,

        kvDB: {
            get: vi.fn(async () => undefined),
            set: vi.fn(async () => {}),
            delete: vi.fn(async () => {}),
        } as any,

        managers: makeMockManagers(),
        storageEventManager: makeMockStorageEventManager(),
        offlineTracker: makeMockOfflineTracker(),
        connectionMonitor: makeMockConnectionMonitor(),

        testConnection: vi.fn(async () => ({ success: true, message: 'OK' })),
        startSync: vi.fn(async () => true),
        handleNetworkRecovery: vi.fn(async () => {}),
        setStatus: vi.fn(),

        ...overrides,
    };
}

