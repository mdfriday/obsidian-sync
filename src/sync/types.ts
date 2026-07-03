/**
 * Friday Sync Module - Type Definitions
 * 
 * Re-exports types from the core library for use in Friday plugin.
 */

// Re-export all types from core
export * from "./core/common/types";

// ==================== Hidden File Sync Types ====================

import type { FilePath } from "./core/common/types";

// Internal file document prefix constants (matching livesync)
export const ICHeader = "i:";
export const ICHeaderEnd = "i;";
export const ICHeaderLength = ICHeader.length;

/**
 * Internal file info interface for hidden files (.obsidian)
 */
export interface InternalFileInfo {
    path: FilePath;
    mtime: number;
    ctime: number;
    size: number;
    deleted?: boolean;
}

/**
 * Default ignore patterns for Obsidian config-dir sync
 * Following Obsidian official sync best practices:
 * - workspace*: Device-specific layout state, different per device
 * - cache: Temporary cache files, regenerated automatically
 * - node_modules/.git: Development artifacts
 */
export function getDefaultInternalIgnorePatterns(configDir: string): string[] {
    const c = configDir.replace(/\./g, '\\.').replace(/\//g, '\\/');
    return [
        `${c}\\/workspace`,           // Workspace layout (device-specific)
        `${c}\\/workspace\\.json`,    // Workspace JSON
        `${c}\\/workspace-mobile\\.json`, // Mobile workspace
        `${c}\\/cache`,               // Cache directory
        "\\/node_modules\\/",         // Node modules
        "\\/\\.git\\/",               // Git directories (in subdirectories)
        "^\\.git\\/",                 // Git directories (at root)
        "plugins\\/mdfriday",         // MDFriday plugin directory (device-specific)
    ];
}

/** @deprecated Use getDefaultInternalIgnorePatterns() instead */
export const DEFAULT_INTERNAL_IGNORE_PATTERNS = getDefaultInternalIgnorePatterns('.obsidian').join(",");

/**
 * Hidden file sync settings interface
 */
export interface HiddenFileSyncSettings {
    syncInternalFiles: boolean;
    syncInternalFilesBeforeReplication: boolean;
    syncInternalFilesInterval: number;
    syncInternalFilesIgnorePatterns: string;
    syncInternalFilesTargetPatterns: string;
    syncInternalFileOverwritePatterns: string;
    watchInternalFileChanges: boolean;
    suppressNotifyHiddenFilesChange: boolean;
}

// Re-export replicator types
export type { 
    LiveSyncAbstractReplicator, 
    LiveSyncReplicatorEnv, 
    ReplicationStat,
    ReplicationCallback,
} from "./core/replication/LiveSyncAbstractReplicator";

export type { 
    LiveSyncCouchDBReplicatorEnv 
} from "./core/replication/couchdb/LiveSyncReplicator";

export { 
    LiveSyncCouchDBReplicator 
} from "./core/replication/couchdb/LiveSyncReplicator";

// Re-export local database types
export type { 
    LiveSyncLocalDBEnv,
    ChunkRetrievalResult,
} from "./core/pouchdb/LiveSyncLocalDB";

export { 
    LiveSyncLocalDB 
} from "./core/pouchdb/LiveSyncLocalDB";

// Re-export service types
export type { ServiceHub } from "./core/services/ServiceHub";

// Re-export encryption utilities
export { 
    encryptString, 
    decryptString, 
    tryDecryptString 
} from "./core/encryption/stringEncryption";

// Re-export i18n
export { $msg, setLang } from "./core/common/i18n";

// Re-export logger
export { Logger } from "./core/common/logger";

// Re-export utilities
export { 
    isCloudantURI 
} from "./core/pouchdb/utils_couchdb";
