/**
 * ISyncCore — Minimum interface that features depend on from FridaySyncCore.
 *
 * This interface allows sync/features/** to be extracted into a platform-independent
 * package without depending on the concrete FridaySyncCore class (which is Obsidian-specific).
 *
 * FridaySyncCore (in the plugin) implements this interface.
 */

import type { ObsidianLiveSyncSettings } from '../core/common/types';
import type { KeyValueDatabase } from '../core/interfaces/KeyValueDatabase';
import type { ReplicationStat } from '../core/replication/LiveSyncAbstractReplicator';
import type { ReactiveSource } from 'octagonal-wheels/dataobject/reactive';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal sub-interfaces (avoid importing heavy concrete types into features)
// ──────────────────────────────────────────────────────────────────────────────

/** The subset of NetworkManager that features need */
export interface INetworkManager {
    setServerReachable(reachable: boolean): void;
    readonly consecutiveFailures: number;
}

/** The subset of LiveSyncManagers that features need */
export interface IManagersFacade {
    readonly networkManager: INetworkManager | null;
}

/** The subset of FridayStorageEventManager that OfflineTracker needs */
export interface IStorageEventManagerFacade {
    processFileEventDirect(event: { type: 'CHANGED' | 'DELETE'; path: string }): Promise<void>;
    markFileProcessing(path: string): void;
}

/** The subset of FridayOfflineTracker that NetworkEvents needs */
export interface IOfflineTrackerFacade {
    setOffline(offline: boolean): void;
}

/** The subset of FridayConnectionMonitor that NetworkEvents needs */
export interface IConnectionMonitorFacade {
    isReconnectScheduled(): boolean;
    scheduleReconnect(delay: number): void;
}

// ──────────────────────────────────────────────────────────────────────────────
// ISyncCore — the main interface
// ──────────────────────────────────────────────────────────────────────────────

export interface ISyncCore {
    // ── Configuration ──────────────────────────────────────────────────────────
    getSettings(): ObsidianLiveSyncSettings;

    // ── Reactive state (used by NetworkEvents, ConnectionMonitor) ──────────────
    /** Reactive replication statistics — features read .value.syncStatus */
    readonly replicationStat: ReactiveSource<ReplicationStat>;

    // ── Sub-system access ──────────────────────────────────────────────────────
    /** Database interface for offline-change persistence */
    readonly kvDB: KeyValueDatabase;

    /** Manager facade — features access networkManager through this */
    readonly managers: IManagersFacade | null;

    /** Storage event manager — OfflineTracker triggers re-sync through this */
    readonly storageEventManager: IStorageEventManagerFacade | null;

    /** Offline tracker — NetworkEvents updates offline state through this */
    readonly offlineTracker: IOfflineTrackerFacade | null;

    /** Connection monitor — NetworkEvents checks for scheduled reconnects */
    readonly connectionMonitor: IConnectionMonitorFacade | null;

    // ── Actions ────────────────────────────────────────────────────────────────

    /**
     * Test connectivity to the remote CouchDB server.
     * Used by ConnectionMonitor to verify server is reachable before reconnecting.
     */
    testConnection(): Promise<{ success: boolean; message: string }>;

    /**
     * Start (or restart) the sync process.
     * @param continuous  true = live-sync mode, false = one-shot
     * @param options     reason and forceCheck flags
     */
    startSync(
        continuous?: boolean,
        options?: {
            reason?: 'PLUGIN_STARTUP' | 'AUTO_RECONNECT' | 'NETWORK_RECOVERY';
            forceCheck?: boolean;
        }
    ): Promise<boolean>;

    /**
     * Handle network recovery (online event).
     * Checks current status and triggers reconnection if needed.
     */
    handleNetworkRecovery(): Promise<void>;

    /**
     * Update the plugin's displayed sync status.
     */
    setStatus(status: string, message?: string): void;
}

