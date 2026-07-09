/**
 * Tests for src/foundry/index.ts — Lightweight Desktop Services
 * Uses a real temp directory for file I/O via a mock Vault adapter.
 * Mocks only the HTTP client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import type { Vault } from 'obsidian';
import {
  createObsidianWorkspaceService,
  createObsidianAuthService,
  createObsidianLicenseService,
  createObsidianGlobalConfigService,
} from '../src/foundry/index';

// ─── Test fixtures ────────────────────────────────────────────────────────────

let vaultRoot: string;
const PLUGIN_DIR = '.obsidian/plugins/test-plugin';

beforeEach(() => {
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-desk-'));
});
afterEach(() => { fs.rmSync(vaultRoot, { recursive: true, force: true }); });

/** Build a mock Vault that delegates to real fs under vaultRoot */
function mkVault(): Vault {
  const full = (p: string) => path.join(vaultRoot, p);
  return {
    adapter: {
      exists: async (p: string) => fs.existsSync(full(p)),
      read:   async (p: string) => fs.readFileSync(full(p), 'utf8'),
      write:  async (p: string, content: string) => {
        const abs = full(p);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
      },
      mkdir:  async (p: string) => { fs.mkdirSync(full(p), { recursive: true }); },
    },
  } as unknown as Vault;
}

// Absolute-path helpers for test setup & verification
// Layout: {vaultRoot}/{PLUGIN_DIR}/workspace/.mdfriday/{file}
const abs  = (...parts: string[]) => path.join(vaultRoot, ...parts);
const ud   = () => abs(PLUGIN_DIR, 'workspace', '.mdfriday', 'user-data.json');
const cfgP = () => abs(PLUGIN_DIR, 'workspace', '.mdfriday', 'config.json');
const mkrP = () => abs(PLUGIN_DIR, 'workspace', '.mdfriday', 'workspace.json');

function wj(p: string, d: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8');
}
function rj(p: string): any { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function mkHttp(ov: Record<string, any> = {}): any {
  return {
    post:          vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '', json: async () => ({}) })),
    postJSON:      vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '', json: async () => ({}) })),
    postForm:      vi.fn(async () => ({ status: 201, ok: true, data: { data: ['tok'] }, text: async () => '', json: async () => ({}) })),
    postMultipart: vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '', json: async () => ({}) })),
    get:           vi.fn(async () => ({ status: 200, ok: true, data: {}, text: async () => '', json: async () => ({}) })),
    ...ov,
  };
}

// ─── WorkspaceService ────────────────────────────────────────────────────────

describe('WorkspaceService (Desktop)', () => {
  it('returns false when no marker', async () => {
    const r = await createObsidianWorkspaceService(mkVault(), PLUGIN_DIR).workspaceExists('');
    expect(r.success).toBe(true);
    expect(r.data).toBe(false);
  });

  it('initWorkspace creates marker and returns info', async () => {
    const r = await createObsidianWorkspaceService(mkVault(), PLUGIN_DIR).initWorkspace('');
    expect(r.success).toBe(true);
    expect(r.data?.name).toBe('workspace');
    expect(fs.existsSync(mkrP())).toBe(true);
    expect(rj(mkrP()).id).toMatch(/^ws-\d+$/);
  });

  it('returns true after initWorkspace', async () => {
    const svc = createObsidianWorkspaceService(mkVault(), PLUGIN_DIR);
    await svc.initWorkspace('');
    const r = await svc.workspaceExists('');
    expect(r.success).toBe(true);
    expect(r.data).toBe(true);
  });
});

// ─── AuthService ─────────────────────────────────────────────────────────────

describe('AuthService (Desktop)', () => {
  it('unauthenticated when no user-data', async () => {
    const r = await createObsidianAuthService(mkHttp(), mkVault(), PLUGIN_DIR).getStatus('');
    expect(r.data?.isAuthenticated).toBe(false);
  });

  it('authenticated when token+email stored', async () => {
    wj(ud(), { email: 'x@mdfriday.com', token: 'tok', license: { key: 'MDF-ABCD-1234-EF56' } });
    const r = await createObsidianAuthService(mkHttp(), mkVault(), PLUGIN_DIR).getStatus('');
    expect(r.data?.isAuthenticated).toBe(true);
    expect(r.data?.email).toBe('x@mdfriday.com');
    expect(r.data?.license).toBe('MDF-ABCD-1234-EF56');
  });

  it('hasSyncConfig when syncConfig stored', async () => {
    wj(ud(), { email: 'x@x.com', token: 't',
      syncConfig: { dbEndpoint: 'https://db', dbName: 'n', email: 'x@x.com', userDir: 'u', status: 'active', dbPassword: 'p' } });
    const r = await createObsidianAuthService(mkHttp(), mkVault(), PLUGIN_DIR).getStatus('');
    expect(r.data?.hasSyncConfig).toBe(true);
    expect(r.data?.syncConfig?.isActive).toBe(true);
  });

  it('getConfig returns apiUrl', async () => {
    wj(ud(), { serverConfig: { apiUrl: 'https://my.api' } });
    const r = await createObsidianAuthService(mkHttp(), mkVault(), PLUGIN_DIR).getConfig('');
    expect(r.data?.apiUrl).toBe('https://my.api');
  });

  it('updateConfig persists new apiUrl', async () => {
    wj(ud(), { serverConfig: { apiUrl: 'https://old' } });
    const r = await createObsidianAuthService(mkHttp(), mkVault(), PLUGIN_DIR).updateConfig('', { apiUrl: 'https://new', websiteUrl: 'https://w' });
    expect(r.data?.apiUrl).toBe('https://new');
    expect(rj(ud()).serverConfig.apiUrl).toBe('https://new');
  });
});

// ─── LicenseService ──────────────────────────────────────────────────────────

describe('LicenseService (Desktop)', () => {
  it('hasActiveLicense false when no file', async () => {
    expect(await createObsidianLicenseService(mkHttp(), mkVault(), PLUGIN_DIR).hasActiveLicense('')).toBe(false);
  });

  it('hasActiveLicense false when expired', async () => {
    wj(ud(), { license: { key: 'K', expiresAt: Date.now() - 1000 } });
    expect(await createObsidianLicenseService(mkHttp(), mkVault(), PLUGIN_DIR).hasActiveLicense('')).toBe(false);
  });

  it('hasActiveLicense true when valid', async () => {
    wj(ud(), { license: { key: 'K', expiresAt: Date.now() + 10_000_000 } });
    expect(await createObsidianLicenseService(mkHttp(), mkVault(), PLUGIN_DIR).hasActiveLicense('')).toBe(true);
  });

  it('getLicenseInfo returns no-license message', async () => {
    const r = await createObsidianLicenseService(mkHttp(), mkVault(), PLUGIN_DIR).getLicenseInfo('');
    expect(r.success).toBe(true);
    expect(r.message).toBe('No active license');
  });

  it('getLicenseInfo returns stored data', async () => {
    wj(ud(), { license: {
      key: 'MDF-ABCD-1234-EF56', plan: 'Pro', expiresAt: Date.now() + 10_000_000,
      features: { maxDevices: 3, maxIps: 5, syncEnabled: true, syncQuota: 10, publishEnabled: true, maxSites: 3, maxStorage: 2048, customDomain: false, customSubDomain: true, validityDays: 365 },
      user: { email: 'u@u.com', userDir: 'u' }, activation: { activated: true, firstTime: false },
    }});
    const r = await createObsidianLicenseService(mkHttp(), mkVault(), PLUGIN_DIR).getLicenseInfo('');
    expect(r.data?.key).toBe('MDF-ABCD-1234-EF56');
    expect(r.data?.isExpired).toBe(false);
    expect(r.data?.features.syncEnabled).toBe(true);
  });

  it('loginWithLicense saves token', async () => {
    const h = mkHttp({ postForm: vi.fn(async () => ({ status: 201, ok: true, data: { data: ['bearer-tok'] }, text: async () => '', json: async () => ({}) })) });
    const r = await createObsidianLicenseService(h, mkVault(), PLUGIN_DIR).loginWithLicense('', 'MDF-ABCD-1234-EF56');
    expect(r.success).toBe(true);
    expect(rj(ud()).token).toBe('bearer-tok');
    expect(rj(ud()).email).toBe('abcd-1234-ef56@mdfriday.com');
  });

  it('loginWithLicense error on 401', async () => {
    const h = mkHttp({ postForm: vi.fn(async () => ({ status: 401, ok: false, data: {}, text: async () => '', json: async () => ({}) })) });
    const r = await createObsidianLicenseService(h, mkVault(), PLUGIN_DIR).loginWithLicense('', 'MDF-ABCD-1234-EF56');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Login failed/);
  });

  it('activateLicense error when not authenticated', async () => {
    const r = await createObsidianLicenseService(mkHttp(), mkVault(), PLUGIN_DIR).activateLicense('', 'MDF-ABCD-1234-EF56');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Not authenticated/);
  });

  it('activateLicense persists license+syncConfig', async () => {
    wj(ud(), { email: 'u@u.com', token: 'tok' });
    const payload = {
      success: true, license_key: 'MDF-ABCD-1234-EF56', plan: 'pro', expires_at: Date.now() + 10_000_000,
      activated: true, first_time: false,
      features: { max_devices: 3, max_ips: 5, sync_enabled: true, sync_quota: 10, publish_enabled: true, max_sites: 3, max_storage: 2048, custom_domain: false, custom_sub_domain: true, validity_days: 365 },
      user: { email: 'u@u.com', user_dir: 'u' },
      sync: { status: 'active', db_endpoint: 'https://db', db_name: 'mydb', email: 'u@u.com', db_password: 'pw' },
    };
    const h = mkHttp({ postMultipart: vi.fn(async () => ({ status: 200, ok: true, data: { data: [payload] }, text: async () => '', json: async () => ({}) })) });
    const r = await createObsidianLicenseService(h, mkVault(), PLUGIN_DIR).activateLicense('', 'MDF-ABCD-1234-EF56');
    expect(r.success).toBe(true);
    expect(r.data?.plan).toBe('Pro');
    expect(rj(ud()).syncConfig.dbEndpoint).toBe('https://db');
  });

  it('requestTrial returns licenseKey', async () => {
    const h = mkHttp({ postMultipart: vi.fn(async () => ({ status: 201, ok: true, data: { data: [{ email: 't@t.com', license_key: 'MDF-TTTT-TTTT-TTTT', password: 'p', validity_days: 14 }] }, text: async () => '', json: async () => ({}) })) });
    const r = await createObsidianLicenseService(h, mkVault(), PLUGIN_DIR).requestTrial('', 't@t.com');
    expect(r.success).toBe(true);
    expect(r.data?.licenseKey).toBe('MDF-TTTT-TTTT-TTTT');
  });

  it('resetUsage without force returns error', async () => {
    const r = await createObsidianLicenseService(mkHttp(), mkVault(), PLUGIN_DIR).resetUsage('', false);
    expect(r.success).toBe(false);
  });

  it('getLicenseUsage returns disk usage', async () => {
    wj(ud(), { token: 'tok', license: { key: 'K', expiresAt: Date.now() + 10_000_000 } });
    const usage = {
      license_key: 'K', plan: 'pro',
      features: { max_devices: 3, max_ips: 5, max_storage: 2048 },
      devices: { count: 1, devices: [] }, ips: { count: 0, ips: [] },
      disks: { sync_disk_usage: '100', publish_disk_usage: '50', total_disk_usage: '150', unit: 'MB' },
    };
    const h = mkHttp({ get: vi.fn(async () => ({ status: 200, ok: true, data: { data: [usage] }, text: async () => '', json: async () => ({}) })) });
    const r = await createObsidianLicenseService(h, mkVault(), PLUGIN_DIR).getLicenseUsage('');
    expect(r.success).toBe(true);
    expect(r.data?.disk.totalUsage).toBe(150);
    expect(r.data?.disk.unit).toBe('MB');
  });
});

// ─── GlobalConfigService ─────────────────────────────────────────────────────

describe('GlobalConfigService (Desktop)', () => {
  it('get error for unknown key', async () => {
    const r = await createObsidianGlobalConfigService(mkVault(), PLUGIN_DIR).get('', 'x');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Key not found/);
  });

  it('set+get top-level key', async () => {
    const svc = createObsidianGlobalConfigService(mkVault(), PLUGIN_DIR);
    await svc.set('', 'foo', 'bar');
    expect((await svc.get('', 'foo')).data?.value).toBe('bar');
  });

  it('set+get nested dot-notation key', async () => {
    const svc = createObsidianGlobalConfigService(mkVault(), PLUGIN_DIR);
    await svc.set('', 'a.b.c', 42);
    expect((await svc.get('', 'a.b.c')).data?.value).toBe(42);
    expect(rj(cfgP()).a.b.c).toBe(42);
  });

  it('list returns full config', async () => {
    wj(cfgP(), { x: 1, y: { z: 2 } });
    const r = await createObsidianGlobalConfigService(mkVault(), PLUGIN_DIR).list('');
    expect(r.data?.config.x).toBe(1);
    expect(r.data?.config.y.z).toBe(2);
  });

  it('overwrite existing key', async () => {
    const svc = createObsidianGlobalConfigService(mkVault(), PLUGIN_DIR);
    await svc.set('', 'n', 1);
    await svc.set('', 'n', 99);
    expect((await svc.get('', 'n')).data?.value).toBe(99);
  });
});

