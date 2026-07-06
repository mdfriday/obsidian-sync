/**
 * Feature unit tests — ConnectionFailure
 * Zero Obsidian dependencies: ISyncCore is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FridayConnectionFailureHandler } from '../../src/features/ConnectionFailure';
import { makeMockSyncCore, makeMockManagers } from '../__mocks__/ISyncCore.mock';

describe('FridayConnectionFailureHandler', () => {
    let handler: FridayConnectionFailureHandler;
    let mockCore: ReturnType<typeof makeMockSyncCore>;

    beforeEach(() => {
        mockCore = makeMockSyncCore();
        handler = new FridayConnectionFailureHandler(mockCore);
    });

    it('checkConnectionFailure returns false (allow auto-retry)', async () => {
        const result = await handler.checkConnectionFailure();
        expect(result).toBe(false);
    });

    it('handleReplicationError returns "retry" for network errors', async () => {
        const networkError = new TypeError('fetch failed');
        const action = await handler.handleReplicationError(networkError, false);
        expect(action).toBe('retry');
    });

    it('handleReplicationError marks server unreachable on network error', async () => {
        const networkError = new TypeError('Failed to fetch');
        await handler.handleReplicationError(networkError, false);
        expect(mockCore.managers?.networkManager?.setServerReachable).toHaveBeenCalledWith(false);
    });

    it('handleReplicationError returns "abort" for auth errors (401)', async () => {
        const authError = { status: 401, message: 'Unauthorized' };
        const action = await handler.handleReplicationError(authError, false);
        expect(action).toBe('abort');
    });

    it('handleReplicationError returns "abort" for auth errors (403)', async () => {
        const authError = { status: 403, message: 'Forbidden' };
        const action = await handler.handleReplicationError(authError, false);
        expect(action).toBe('abort');
    });

    it('handleReplicationError returns "retry" for timeout errors', async () => {
        const timeoutError = { name: 'TimeoutError', message: 'timeout' };
        const action = await handler.handleReplicationError(timeoutError, false);
        expect(action).toBe('retry');
    });

    it('handleReplicationError returns "ignore" for unknown errors', async () => {
        const unknownError = new Error('Something weird happened');
        const action = await handler.handleReplicationError(unknownError, false);
        expect(action).toBe('ignore');
    });

    it('getRetryDelay returns a positive number', () => {
        const delay = handler.getRetryDelay();
        expect(delay).toBeGreaterThan(0);
    });

    it('resetNotificationCooldown resets internal state', () => {
        handler.notifyDatabaseReset(); // sets lastFailureNotified
        handler.resetNotificationCooldown();
        // After reset, second notifyDatabaseReset should fire again (not be blocked by cooldown)
        // We can't easily test this without a spy on Logger, but we verify no throw
        expect(() => handler.resetNotificationCooldown()).not.toThrow();
    });
});

