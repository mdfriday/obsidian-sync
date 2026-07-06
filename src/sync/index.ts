/**
 * Friday Sync Module
 * 
 * CouchDB synchronization module based on Self-hosted LiveSync
 * Provides sync functionality for the Friday Obsidian plugin
 */

// Export the main SyncService
export { SyncService, type SyncConfig, type SyncStatus, type SyncStatusCallback } from "./SyncService";

// Export the sync core (for advanced usage)
export { FridaySyncCore } from "./FridaySyncCore";

// Export the status display component
export { SyncStatusDisplay } from "./SyncStatusDisplay";

// Export the storage event manager (for watching local file changes)
export { FridayStorageEventManager, type FileEvent, type FileEventType } from "./FridayStorageEventManager";

// Export the hidden file sync module (for .obsidian synchronization)
export { FridayHiddenFileSync } from "./sync-core/src/features/HiddenFileSync";

// Export hidden file utilities
export { 
    isInternalMetadata, 
    stripInternalMetadataPrefix,
    addInternalPrefix,
} from "./utils/hiddenFileUtils";

// Export utilities for cache management
export { clearHandlers as clearSyncHandlerCache } from "./sync-core/src/core/replication/SyncParamsHandler";

// Export ignore pattern utilities (livesync compatible gitignore matching)
export { isAccepted, isAcceptedAll } from "./sync-core/src/core/string_and_binary/path";

// Export types from the core library
export * from "./types";
