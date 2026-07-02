/**
 * Tests for src/foundry/mobile.ts — Lightweight Mobile Services
 *
 * Uses a mock Vault (in-memory store) instead of the real Obsidian vault.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vault } from 'obsidian';

// ─── Mock vault builder ───────────────────────────────────────────────────────

function buildMockVault(initialFiles: Record<string, string> = {}): Vault {
  const store: Record<string, string> = { ...initialFiles };
  return {
    adapter: {
      exists: vi.fn(async (path: string) => path in store),
      read: vi.fn(async (path: string) => {
        if (!(path in store)) throw new Error(`ENOENT: ${path}`);
        return store[path];
      }),
      write: vi.fn(async (path: string, content: string) => { store[path] = content; }),
      mkdir: vi.fn(async () => {}),
      stat: vi.fn(async (path: string) => path in store ? { type: 'file', size: store[path].length, mtime: Date.now() } : null),
      list: vi.fn(async () => ({ files: [], folders: [] })),
    },
    _store: store,
  } as unknown as Vault;
}

function createHttpMock(overrides: Record<string, unknown> = {}) {
  return {
    post: vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '{}', json: async () => ({}) })),
    postJSON: vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '{}', json: async () => ({}) })),
    postForm: vi.fn(async () => ({ status: 201, ok: true, data: { data: ['mock-token'] }, text: async () => '', json: async () => ({}) })),
    postMultipart: vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '', json: async () => ({}) })),
    get: vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '', json: async () => ({}) })),
    ...overrides,
  };
}

// ─── Subject ─────────────────────────────────────────────────────────────────

import {
  createObsidianWorkspaceService,
  createObsidianAuthService,
  createObsidianLicenseService,
  createObsidianGlobalConfigService,
} from '../src/foundry/mobile';
import { ObsidianMobileWorkspaceRepository } from '../src/services/obsidian-mobile-repositories';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLUGIN_DIR = '.obsidian/plugins/mdfriday';
const USER_DATA_PATH = `${PLUGIN_DIR}/workspace/.mdfriday/user-data.json`;
const CONFIG_PATH = `${PLUGIN_DIR}/workspace/.mdfriday/config.json`;
const WORKSPACE_MARKER = `${PLUGIN_DIR}/workspace/.mdfriday/workspace.json`;

function makeConfig(vault: Vault) {
  const workspaceRepo = new ObsidianMobileWorkspaceRepository(vault, PLUGIN_DIR);
  return {
    platform: 'mobile' as const,
    persistence: { workspace: workspaceRepo, fileSystem: {} as any },
    identityHttpClient: createHttpMock(),
  };
}

function writeJson(vault: any, path: string, data: unknown) {
  vault._store[path] = JSON.stringify(data, null, 2);
}

// ─── WorkspaceService ────────────────────────────────────────────────────────

describe('createObsidianWorkspaceService (Mobile)', () => {
  it('workspaceExists returns false when marker file is absent', async () => {
    const vault = buildMockVault();
    const svc = createObsidianWorkspaceService(makeConfig(vault));
    const result = await svc.workspaceExists('ignored-ws-path');
    expect(result.success).toBe(true);
    expect(result.data).toBe(false);
  });

  it('initWorkspace creates the marker file', async () => {
    const vault = buildMockVault();
    const svc = createObsidianWorkspaceService(makeConfig(vault));
    const result = await svc.initWorkspace('ignored-ws-path');
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('workspace');
    expect((vault as any)._store[WORKSPACE_MARKER]).toBeDefined();
  });

  it('workspaceExists returns true after initWorkspace', async () => {
    const vault = buildMockVault();
    const config = makeConfig(vault);
    const svc = createObsidianWorkspaceService(config);
    await svc.initWorkspace('ignored');
    const result = await svc.workspaceExists('ignored');
    expect(result.data).toBe(true);
  });
});

// ─── AuthService ─────────────────────────────────────────────────────────────

describe('createObsidianAuthService (Mobile)', () => {
  it('getStatus returns unauthenticated when no user-data exists', async () => {
    const vault = buildMockVault();
    const http = createHttpMock();
    const svc = createObsidianAuthService(http, makeConfig(vault));
    const result = await svc.getStatus('ignored');
    expect(result.success).toBe(true);
    expect(result.data?.isAuthenticated).toBe(false);
  });

  it('getStatus returns authenticated when token + email are stored', async () => {
    const vault = buildMockVault();
    writeJson(vault, USER_DATA_PATH, { email: 'u@mdfriday.com', token: 'tok', license: { key: 'MDF-ABCD-1234-EF56' } });
    const svc = createObsidianAuthService(createHttpMock(), makeConfig(vault));
    const result = await svc.getStatus('ignored');
    expect(result.data?.isAuthenticated).toBe(true);
    expect(result.data?.email).toBe('u@mdfriday.com');
  });

  it('updateConfig persists config to vault', async () => {
    const vault = buildMockVault();
    const svc = createObsidianAuthService(createHttpMock(), makeConfig(vault));
    await svc.updateConfig('ignored', { apiUrl: 'https://new.api' });
    const stored = JSON.parse((vault as any)._store[USER_DATA_PATH]);
    expect(stored.serverConfig.apiUrl).toBe('https://new.api');
  });
});

// ─── LicenseService ──────────────────────────────────────────────────────────

describe('createObsidianLicenseService (Mobile)', () => {
  it('hasActiveLicense returns false when no license', async () => {
    const vault = buildMockVault();
    const svc = createObsidianLicenseService(createHttpMock(), makeConfig(vault));
    expect(await svc.hasActiveLicense('ignored')).toBe(false);
  });

  it('hasActiveLicense returns true when license is valid', async () => {
    const vault = buildMockVault();
    writeJson(vault, USER_DATA_PATH, { license: { key: 'MDF-ABCD-1234-EF56', expiresAt: Date.now() + 10_000_000 } });
    const svc = createObsidianLicenseService(createHttpMock(), makeConfig(vault));
    expect(await svc.hasActiveLicense('ignored')).toBe(true);
  });

  it('getLicenseInfo returns stored license', async () => {
    const vault = buildMockVault();
    const expiresAt = Date.now() + 10_000_000;
    writeJson(vault, USER_DATA_PATH, {
      license: {
        key: 'MDF-ABCD-1234-EF56', plan: 'Enterprise', expiresAt,
        features: { maxDevices: 5, maxIps: 10, syncEnabled: true, syncQuota: 50, publishEnabled: true, maxSites: 10, maxStorage: 10240, customDomain: true, customSubDomain: true, validityDays: 365 },
        user: { email: 'u@mdfriday.com', userDir: 'u' },
        activation: { activated: true, firstTime: false },
      },
    });
    const svc = createObsidianLicenseService(createHttpMock(), makeConfig(vault));
    const result = await svc.getLicenseInfo('ignored');
    expect(result.success).toBe(true);
    expect(result.data?.plan).toBe('Enterprise');
    expect(result.data?.features.customDomain).toBe(true);
  });

  it('loginWithLicense saves token to vault', async () => {
    const vault = buildMockVault();
    const http = createHttpMock({
      postForm: vi.fn(async () => ({
        status: 201, ok: true, data: { data: ['vault-mobile-token'] }, text: async () => '', json: async () => ({}),
      })),
    });
    const svc = createObsidianLicenseService(http, makeConfig(vault));
    const result = await svc.loginWithLicense('ignored', 'MDF-ABCD-1234-EF56');
    expect(result.success).toBe(true);
    const stored = JSON.parse((vault as any)._store[USER_DATA_PATH]);
    expect(stored.token).toBe('vault-mobile-token');
  });

  it('activateLicense persists license and syncConfig', async () => {
    const vault = buildMockVault();
    writeJson(vault, USER_DATA_PATH, { email: 'u@mdfriday.com', token: 'tok' });
    const expiresAt = Date.now() + 10_000_000;
    const activationPayload = {
      success: true, license_key: 'MDF-ABCD-1234-EF56', plan: 'pro', expires_at: expiresAt,
      activated: true, first_time: false,
      features: { max_devices: 3, max_ips: 5, sync_enabled: true, sync_quota: 10, publish_enabled: true, max_sites: 3, max_storage: 2048, custom_domain: false, custom_sub_domain: true, validity_days: 365 },
      user: { email: 'u@mdfriday.com', user_dir: 'u' },
      sync: { status: 'active', db_endpoint: 'https://db', db_name: 'mydb', email: 'u@mdfriday.com', db_password: 'pw' },
    };
    const http = createHttpMock({
      postMultipart: vi.fn(async () => ({
        status: 200, ok: true, data: { data: [activationPayload] }, text: async () => '', json: async () => ({}),
      })),
    });
    const svc = createObsidianLicenseService(http, makeConfig(vault));
    const result = await svc.activateLicense('ignored', 'MDF-ABCD-1234-EF56');
    expect(result.success).toBe(true);
    expect(result.data?.sync?.dbEndpoint).toBe('https://db');
    const stored = JSON.parse((vault as any)._store[USER_DATA_PATH]);
    expect(stored.license.key).toBe('MDF-ABCD-1234-EF56');
    expect(stored.syncConfig.dbName).toBe('mydb');
  });
});

// ─── GlobalConfigService ─────────────────────────────────────────────────────

describe('createObsidianGlobalConfigService (Mobile)', () => {
  it('set + get round-trips a nested key', async () => {
    const vault = buildMockVault();
    const svc = createObsidianGlobalConfigService(makeConfig(vault));
    await svc.set('ignored', 'publish.mdfriday.licenseKey', 'MDF-ABCD-1234-EF56');
    const result = await svc.get('ignored', 'publish.mdfriday.licenseKey');
    expect(result.success).toBe(true);
    expect(result.data?.value).toBe('MDF-ABCD-1234-EF56');
  });

  it('list returns the full config object', async () => {
    const vault = buildMockVault();
    writeJson(vault, CONFIG_PATH, { x: 1, y: { z: 2 } });
    const svc = createObsidianGlobalConfigService(makeConfig(vault));
    const result = await svc.list('ignored');
    expect(result.success).toBe(true);
    expect(result.data?.config.x).toBe(1);
    expect(result.data?.config.y.z).toBe(2);
  });

  it('get returns error for missing key', async () => {
    const vault = buildMockVault();
    const svc = createObsidianGlobalConfigService(makeConfig(vault));
    const result = await svc.get('ignored', 'nonexistent');
    expect(result.success).toBe(false);
  });
});


