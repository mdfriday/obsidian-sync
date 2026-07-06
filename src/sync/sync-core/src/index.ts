/**
 * @mdfriday/sync-core — Public API
 *
 * This package contains the platform-independent CouchDB sync core.
 * It has zero hard dependencies on Obsidian APIs.
 *
 * Modules are exported progressively as each phase of migration completes.
 */

// Phase 2: Interface contracts
export * from './interfaces/ISyncCore';
export * from './interfaces/IPluginAdapters';

