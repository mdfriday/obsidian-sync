/**
 * Feature unit tests — OfflineTracker
 * Zero Obsidian dependencies: ISyncCore and KeyValueDatabase are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FridayOfflineTracker } from '../../src/features/OfflineTracker';
import { makeMockSyncCore } from '../__mocks__/ISyncCore.mock';
import type { FilePath } from '../../src/core/common/types';

describe('FridayOfflineTracker', () => {
    let tracker: FridayOfflineTracker;
    let mockCore: ReturnType<typeof makeMockSyncCore>;

    beforeEach(() => {
        mockCore = makeMockSyncCore();
        tracker = new FridayOfflineTracker(mockCore);
    });

    it('isOffline is false by default', () => {
        expect(tracker.isOffline).toBe(false);
    });

    it('setOffline(true) marks tracker as offline', () => {
        tracker.setOffline(true);
        expect(tracker.isOffline).toBe(true);
    });

    it('trackChange does nothing when online', () => {
        tracker.setOffline(false);
        tracker.trackChange('test.md' as FilePath, 'modify');
        expect(tracker.pendingCount).toBe(0);
    });

    it('trackChange records change when offline', () => {
        tracker.setOffline(true);
        tracker.trackChange('notes/test.md' as FilePath, 'create');
        expect(tracker.pendingCount).toBe(1);
    });

    it('trackChange deduplicates same path', () => {
        tracker.setOffline(true);
        tracker.trackChange('test.md' as FilePath, 'create');
        tracker.trackChange('test.md' as FilePath, 'modify');
        // Same path, latest change wins
        expect(tracker.pendingCount).toBe(1);
        const changes = tracker.getPendingChanges();
        expect(changes[0].type).toBe('modify');
    });

    it('getPendingChanges returns all tracked changes', () => {
        tracker.setOffline(true);
        tracker.trackChange('a.md' as FilePath, 'create');
        tracker.trackChange('b.md' as FilePath, 'delete');
        const changes = tracker.getPendingChanges();
        expect(changes).toHaveLength(2);
    });

    it('hasPendingChanges returns false initially', () => {
        expect(tracker.hasPendingChanges()).toBe(false);
    });

    it('hasPendingChanges returns true after offline change', () => {
        tracker.setOffline(true);
        tracker.trackChange('x.md' as FilePath, 'modify');
        expect(tracker.hasPendingChanges()).toBe(true);
    });

    it('clearPendingChanges empties the queue', async () => {
        tracker.setOffline(true);
        tracker.trackChange('y.md' as FilePath, 'create');
        await tracker.clearPendingChanges();
        expect(tracker.pendingCount).toBe(0);
        expect(mockCore.kvDB.delete).toHaveBeenCalled();
    });

    it('getPendingChangesSummary counts by type', () => {
        tracker.setOffline(true);
        tracker.trackChange('a.md' as FilePath, 'create');
        tracker.trackChange('b.md' as FilePath, 'modify');
        tracker.trackChange('c.md' as FilePath, 'delete');
        const summary = tracker.getPendingChangesSummary();
        expect(summary.creates).toBe(1);
        expect(summary.modifies).toBe(1);
        expect(summary.deletes).toBe(1);
    });

    it('initialize loads persisted changes from kvDB', async () => {
        const stored: [string, any][] = [
            ['persisted.md', { path: 'persisted.md', type: 'modify', timestamp: Date.now() }],
        ];
        mockCore.kvDB.get = vi.fn(async () => stored);
        await tracker.initialize();
        expect(tracker.pendingCount).toBe(1);
    });
});

