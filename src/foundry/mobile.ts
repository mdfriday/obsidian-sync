/**
 * Lightweight Foundry Mobile Services
 *
 * Replaces @mdfriday/foundry/obsidian/mobile for the sync-only plugin on Mobile.
 * Uses Obsidian's vault.adapter for file I/O instead of Node.js fs.
 */

import { Platform } from 'obsidian';
import type { Vault } from 'obsidian';
import type {
  IdentityHttpClient,
  ObsidianAuthResult,
  ObsidianAuthStatus,
  ObsidianServerConfig,
  ObsidianLicenseResult,
  ObsidianLicenseInfo,
  ObsidianLicenseUsage,
  ObsidianConfigResult,
  ConfigGetResult,
  ConfigListResult,
  ObsidianWorkspaceResult,
  ObsidianWorkspaceInfo,
  ObsidianAuthService,
  ObsidianLicenseService,
  ObsidianGlobalConfigService,
  ObsidianWorkspaceService,
  RawDeviceEntry,
  RawIpEntry,
  ObsidianEnvironmentConfig,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Re-export ObsidianEnvironmentConfig (used in main.ts type annotation)
// ─────────────────────────────────────────────────────────────────────────────
export type { ObsidianEnvironmentConfig } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Mobile config (passed to factory functions)
// ─────────────────────────────────────────────────────────────────────────────

/** Opaque config passed to mobile factory functions — only `persistence.workspace` is needed */
interface MobileServiceConfig {
  persistence?: {
    workspace?: {
      getVault?(): Vault;
      getPluginDir?(): string;
    };
  };
}

/** Generic API envelope: { data: T[] } */
interface ApiEnvelope<T = unknown> {
  data?: T[];
  success?: boolean;
  [key: string]: unknown;
}

function unwrapFirst<T>(responseData: unknown): T | undefined {
  return (responseData as ApiEnvelope<T> | undefined)?.data?.[0];
}

interface ActivationApiFeatures {
  max_devices?: number; max_ips?: number; sync_enabled?: boolean; sync_quota?: number;
  publish_enabled?: boolean; max_sites?: number; max_storage?: number;
  custom_domain?: boolean; custom_sub_domain?: boolean; validity_days?: number;
}

interface ActivationApiResponse {
  features?: ActivationApiFeatures; expires_at?: number; license_key?: string; plan?: string;
  activated?: boolean; first_time?: boolean; success?: boolean;
  user?: { email?: string; user_dir?: string };
  sync?: { status?: string; db_endpoint?: string; db_name?: string; email?: string; db_password?: string };
}

interface StoredLicenseShape {
  key?: string; plan?: string; expiresAt?: number;
  features?: { maxDevices?: number; maxIps?: number; syncEnabled?: boolean; syncQuota?: number; publishEnabled?: boolean; maxSites?: number; maxStorage?: number; customDomain?: boolean; customSubDomain?: boolean; validityDays?: number };
  user?: ObsidianLicenseInfo['user'];
  activation?: ObsidianLicenseInfo['activation'];
  sync?: ObsidianLicenseInfo['sync'];
}

interface SyncConfigShape {
  dbEndpoint?: string; dbName?: string; email?: string; userDir?: string;
  status?: string; dbPassword?: string; [key: string]: unknown;
}

interface RawUsageResponse {
  license_key: string; plan: string;
  devices?: { count?: number; devices?: RawDeviceEntry[] };
  ips?: { count?: number; ips?: RawIpEntry[] };
  features?: { max_devices?: number; max_ips?: number; max_storage?: number };
  disks?: { sync_disk_usage?: number; publish_disk_usage?: number; total_disk_usage?: number; unit?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MDFRIDAY_DIR   = '.mdfriday';
const USER_DATA_FILE = 'user-data.json';
const WORKSPACE_FILE = 'workspace.json';
const CONFIG_FILE    = 'config.json';
const DEFAULT_API_URL = 'https://app.mdfriday.com';

// ─────────────────────────────────────────────────────────────────────────────
// Vault adapter helpers
// ─────────────────────────────────────────────────────────────────────────────

function vaultPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

async function vaultReadJson<T>(vault: Vault, path: string): Promise<T | null> {
  try {
    if (!await vault.adapter.exists(path)) return null;
    const raw = await vault.adapter.read(path);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function vaultWriteJson(vault: Vault, path: string, data: unknown): Promise<void> {
  // Ensure parent directory exists
  const parts = path.split('/');
  parts.pop();
  const dir = parts.join('/');
  if (dir && !await vault.adapter.exists(dir)) {
    await vault.adapter.mkdir(dir);
  }
  await vault.adapter.write(path, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// User-data helpers
// ─────────────────────────────────────────────────────────────────────────────

interface UserData {
  email?: string;
  token?: string;
  serverConfig?: { apiUrl?: string; websiteUrl?: string };
  license?: StoredLicenseShape;
  syncConfig?: SyncConfigShape;
}

function makeUserDataPath(pluginDir: string): string {
  return vaultPath(pluginDir, 'workspace', MDFRIDAY_DIR, USER_DATA_FILE);
}

function makeConfigPath(pluginDir: string): string {
  return vaultPath(pluginDir, 'workspace', MDFRIDAY_DIR, CONFIG_FILE);
}

function makeWorkspaceMarker(pluginDir: string): string {
  return vaultPath(pluginDir, 'workspace', MDFRIDAY_DIR, WORKSPACE_FILE);
}

async function loadUserData(vault: Vault, pluginDir: string): Promise<UserData | null> {
  return vaultReadJson<UserData>(vault, makeUserDataPath(pluginDir));
}

async function saveUserData(vault: Vault, pluginDir: string, patch: Partial<UserData>): Promise<void> {
  const existing = (await loadUserData(vault, pluginDir)) || {};
  const merged: UserData = { ...existing, ...patch };
  Object.keys(merged).forEach(k => (merged as Record<string, unknown>)[k] === undefined && delete (merged as Record<string, unknown>)[k]);
  await vaultWriteJson(vault, makeUserDataPath(pluginDir), merged);
}

function getApiUrl(ud: UserData | null): string {
  return ud?.serverConfig?.apiUrl || DEFAULT_API_URL;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential generation (same formula as Desktop)
// ─────────────────────────────────────────────────────────────────────────────

function licenseToEmail(key: string): string {
  return `${key.replace(/^MDF-/i, '').toLowerCase()}@mdfriday.com`;
}

function licenseToPassword(key: string): string {
  const part = key.replace(/^MDF-/i, '').toLowerCase();
  if (typeof btoa !== 'undefined') return btoa(part);
  return Buffer.from(part).toString('base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// Device info (mobile)
// ─────────────────────────────────────────────────────────────────────────────

async function getDeviceId(): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(
        [Platform.isMobile ? 'mobile' : 'desktop', new Date().getTimezoneOffset()].join('|')
      );
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 16);
    }
  } catch {
    // crypto.subtle unavailable — fall through to random fallback
  }
  return Math.random().toString(36).slice(2, 18);
}

function getDeviceInfo(): { deviceName: string; deviceType: 'desktop' | 'mobile' } {
  const deviceType: 'desktop' | 'mobile' = Platform.isMobile ? 'mobile' : 'desktop';
  let name = Platform.isMobile ? 'MDFriday Sync Mobile' : 'MDFriday Sync Desktop';
  if (Platform.isIosApp) name = 'MDFriday Sync on iOS';
  else if (Platform.isAndroidApp) name = 'MDFriday Sync on Android';
  return { deviceName: name, deviceType };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build license info (shared helper, same as Desktop)
// ─────────────────────────────────────────────────────────────────────────────

function buildLicenseInfoFromActivation(data: ActivationApiResponse, userDir: string): ObsidianLicenseInfo {
  const f: ActivationApiFeatures = data.features ?? {};
  const expiresAt: number = data.expires_at ?? 0;
  const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
  const expires = new Date(expiresAt).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });

  const info: ObsidianLicenseInfo = {
    key: data.license_key ?? '',
    plan: data.plan ? (data.plan.charAt(0).toUpperCase() + data.plan.slice(1).toLowerCase()) : 'Free',
    isExpired: Date.now() > expiresAt,
    expires, expiresAt, daysRemaining,
    isTrial: (data.plan || '').toLowerCase() === 'free',
    features: {
      maxDevices: f.max_devices ?? 1, maxIps: f.max_ips ?? 1,
      syncEnabled: f.sync_enabled ?? false, syncQuota: f.sync_quota ?? 0,
      publishEnabled: f.publish_enabled ?? false, maxSites: f.max_sites ?? 1,
      maxStorage: f.max_storage ?? 1024, customDomain: f.custom_domain ?? false,
      customSubDomain: f.custom_sub_domain ?? false, validityDays: f.validity_days ?? 365,
    },
    user: { email: data.user?.email || '', userDir },
    activation: { activated: data.activated ?? true, firstTime: data.first_time ?? false },
  };

  if (data.sync && f.sync_enabled) {
    info.sync = {
      enabled: true, status: data.sync.status || 'active',
      dbEndpoint: data.sync.db_endpoint || '', dbName: data.sync.db_name || '',
      email: data.sync.email || '', dbPassword: data.sync.db_password || '', userDir,
    };
  }
  return info;
}

function buildLicenseInfoFromStored(stored: StoredLicenseShape): ObsidianLicenseInfo {
  const expiresAt: number = stored.expiresAt || 0;
  const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
  const expires = new Date(expiresAt).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  const f = stored.features || {};
  return {
    key: stored.key || '', plan: stored.plan || 'Free',
    isExpired: Date.now() > expiresAt, expires, expiresAt, daysRemaining,
    isTrial: (stored.plan || '').toLowerCase() === 'free',
    features: {
      maxDevices: f.maxDevices ?? 1, maxIps: f.maxIps ?? 1,
      syncEnabled: f.syncEnabled ?? false, syncQuota: f.syncQuota ?? 0,
      publishEnabled: f.publishEnabled ?? false, maxSites: f.maxSites ?? 1,
      maxStorage: f.maxStorage ?? 1024, customDomain: f.customDomain ?? false,
      customSubDomain: f.customSubDomain ?? false, validityDays: f.validityDays ?? 365,
    },
    user: stored.user, activation: stored.activation, sync: stored.sync,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Auth Service
// ─────────────────────────────────────────────────────────────────────────────

class MobileAuthService implements ObsidianAuthService {
  constructor(private http: IdentityHttpClient, private vault: Vault, private pluginDir: string) {}

  async getStatus(_workspacePath: string): Promise<ObsidianAuthResult<ObsidianAuthStatus>> {
    try {
      const ud = await loadUserData(this.vault, this.pluginDir);
      const isAuthenticated = !!(ud?.token && ud?.email);
      const sc = ud?.syncConfig;
      const status: ObsidianAuthStatus = {
        isAuthenticated, serverUrl: ud?.serverConfig?.apiUrl,
        hasSyncConfig: !!sc, email: ud?.email, token: ud?.token, license: ud?.license?.key,
        syncConfig: sc ? {
          dbEndpoint: sc.dbEndpoint || '', dbName: sc.dbName || '',
          email: sc.email || '', userDir: sc.userDir || '',
          status: sc.status || 'active', isActive: sc.status === 'active',
          dbPassword: sc.dbPassword || '',
        } : undefined,
      };
      return { success: true, data: status };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getConfig(_workspacePath: string): Promise<ObsidianAuthResult<ObsidianServerConfig>> {
    try {
      const ud = await loadUserData(this.vault, this.pluginDir);
      return { success: true, data: { apiUrl: ud?.serverConfig?.apiUrl, websiteUrl: ud?.serverConfig?.websiteUrl } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async updateConfig(workspacePath: string, config: ObsidianServerConfig): Promise<ObsidianAuthResult<ObsidianServerConfig>> {
    try {
      const ud = await loadUserData(this.vault, this.pluginDir);
      const serverConfig = { ...(ud?.serverConfig || {}), ...config };
      await saveUserData(this.vault, this.pluginDir, { serverConfig });
      return { success: true, data: serverConfig };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile License Service
// ─────────────────────────────────────────────────────────────────────────────

class MobileLicenseService implements ObsidianLicenseService {
  constructor(private http: IdentityHttpClient, private vault: Vault, private pluginDir: string) {}

  async requestTrial(workspacePath: string, email: string): Promise<ObsidianLicenseResult<{ email: string; licenseKey: string; password: string; validityDays: number }>> {
    try {
      const ud  = await loadUserData(this.vault, this.pluginDir);
      const res = await this.http.postMultipart(`${getApiUrl(ud)}/api/license/trial`, { email });
      if (res.status !== 200 && res.status !== 201) throw new Error('Trial request failed');
      const d = unwrapFirst<{ license_key?: string; email?: string; password?: string; validity_days?: number }>(res.data);
      if (!d?.license_key) throw new Error('Invalid trial response');
      return { success: true, data: { email: d.email ?? '', licenseKey: d.license_key, password: d.password ?? '', validityDays: d.validity_days ?? 0 } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async loginWithLicense(workspacePath: string, licenseKey: string): Promise<ObsidianLicenseResult<{}>> {
    try {
      const ud     = await loadUserData(this.vault, this.pluginDir);
      const apiUrl = getApiUrl(ud);
      const email  = licenseToEmail(licenseKey);
      const pass   = licenseToPassword(licenseKey);
      const res    = await this.http.postForm(`${apiUrl}/api/login`, { email, password: pass });
      if (res.status !== 201) throw new Error(`Login failed: ${res.status}`);
      const token = unwrapFirst<string>(res.data);
      if (!token) throw new Error('No token in login response');
      await saveUserData(this.vault, this.pluginDir, { email, token, serverConfig: { apiUrl } });
      return { success: true, data: {} as object };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async activateLicense(workspacePath: string, licenseKey: string): Promise<ObsidianLicenseResult<ObsidianLicenseInfo>> {
    try {
      const ud    = await loadUserData(this.vault, this.pluginDir);
      const token = ud?.token;
      if (!token) throw new Error('Not authenticated');
      const apiUrl   = getApiUrl(ud);
      const deviceId = await getDeviceId();
      const { deviceName, deviceType } = getDeviceInfo();
      const res = await this.http.postMultipart(
        `${apiUrl}/api/license/activate`,
        { license_key: licenseKey, device_id: deviceId, device_name: deviceName, device_type: deviceType },
        { 'Authorization': `Bearer ${token}` }
      );
      if (res.status !== 200 && res.status !== 201) throw new Error(`Activation failed: ${res.status}`);
      const raw: ActivationApiResponse = (unwrapFirst<ActivationApiResponse>(res.data) ?? (res.data as ActivationApiResponse));
      if (!raw?.success) throw new Error('License activation unsuccessful');
      const userDir = raw.user?.user_dir ?? '';
      const info    = buildLicenseInfoFromActivation(raw, userDir);
      const licenseToStore: StoredLicenseShape = { key: raw.license_key, plan: info.plan, expiresAt: raw.expires_at ?? 0, features: info.features, user: info.user, activation: info.activation, sync: info.sync };
      const syncToStore: SyncConfigShape | undefined = info.sync ? { dbEndpoint: info.sync.dbEndpoint, dbName: info.sync.dbName, email: info.sync.email, dbPassword: info.sync.dbPassword, userDir, status: info.sync.status } : ud?.syncConfig;
      await saveUserData(this.vault, this.pluginDir, { license: licenseToStore, syncConfig: syncToStore });
      return { success: true, data: info };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getLicenseInfo(workspacePath: string, options?: { refresh?: boolean }): Promise<ObsidianLicenseResult<ObsidianLicenseInfo>> {
    try {
      const ud = await loadUserData(this.vault, this.pluginDir);
      if (!ud?.license) return { success: true, message: 'No active license' };
      if (options?.refresh && ud.token) {
        const res = await this.http.get(
          `${getApiUrl(ud)}/api/license/info?key=${ud.license.key}&_t=${Date.now()}`,
          { 'Authorization': `Bearer ${ud.token}`, 'Cache-Control': 'no-cache' }
        );
        if (res.status === 200 && (res.data as ApiEnvelope<ActivationApiResponse>)?.data?.[0]) {
          const raw  = unwrapFirst<ActivationApiResponse>(res.data) as ActivationApiResponse;
          const info = buildLicenseInfoFromActivation({ ...raw, user: { email: ud.email ?? '', user_dir: String(ud.syncConfig?.userDir ?? '') } }, String(ud.syncConfig?.userDir ?? ''));
          await saveUserData(this.vault, this.pluginDir, { license: { ...ud.license, plan: info.plan, expiresAt: raw.expires_at ?? ud.license.expiresAt, features: info.features } });
          return { success: true, data: info };
        }
      }
      return { success: true, data: buildLicenseInfoFromStored(ud.license) };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getLicenseUsage(_workspacePath: string): Promise<ObsidianLicenseResult<ObsidianLicenseUsage>> {
    try {
      const ud = await loadUserData(this.vault, this.pluginDir);
      if (!ud?.token || !ud?.license?.key) throw new Error('Not authenticated');
      const res = await this.http.get(
        `${getApiUrl(ud)}/api/license/usage?key=${ud.license.key}&_t=${Date.now()}`,
        { 'Authorization': `Bearer ${ud.token}`, 'Cache-Control': 'no-cache' }
      );
      if (res.status !== 200) throw new Error(`Usage fetch failed: ${res.status}`);
      const raw = unwrapFirst<RawUsageResponse>(res.data);
      if (!raw) throw new Error('Invalid usage response');
      return { success: true, data: {
        licenseKey: raw.license_key, plan: raw.plan,
        devices: { count: raw.devices?.count || 0, max: raw.features?.max_devices || 1, list: (raw.devices?.devices || []).map((d: RawDeviceEntry) => ({ id: d.id, name: d.device_name, type: d.device_type, status: d.status, lastSeenAt: d.last_seen_at })) },
        ips:     { count: raw.ips?.count || 0,     max: raw.features?.max_ips || 1,     list: (raw.ips?.ips || []).map((ip: RawIpEntry) => ({ ip: ip.ip_address, city: ip.city, region: ip.region, country: ip.country, status: ip.status, lastSeenAt: ip.last_seen_at })) },
        disk: { syncUsage: Number(raw.disks?.sync_disk_usage) || 0, publishUsage: Number(raw.disks?.publish_disk_usage) || 0, totalUsage: Number(raw.disks?.total_disk_usage) || 0, maxStorage: raw.features?.max_storage || 1024, unit: raw.disks?.unit || 'MB' },
      }};
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async resetUsage(workspacePath: string, force: boolean): Promise<ObsidianLicenseResult<void>> {
    if (!force) return { success: false, error: 'Set force=true to confirm' };
    try {
      const ud = await loadUserData(this.vault, this.pluginDir);
      if (!ud?.token || !ud?.license?.key) throw new Error('Not authenticated');
      const res = await this.http.post(`${getApiUrl(ud)}/api/license/usage/reset?key=${ud.license.key}`, {}, { 'Authorization': `Bearer ${ud.token}` });
      if (res.status !== 200 && res.status !== 201) throw new Error(`Reset failed: ${res.status}`);
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async hasActiveLicense(_workspacePath: string): Promise<boolean> {
    try {
      const ud = await loadUserData(this.vault, this.pluginDir);
      return !!(ud?.license) && Date.now() < (ud.license.expiresAt || 0);
    } catch { return false; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Workspace Service
// ─────────────────────────────────────────────────────────────────────────────

class MobileWorkspaceService implements ObsidianWorkspaceService {
  constructor(private vault: Vault, private pluginDir: string) {}

  async workspaceExists(_workspacePath: string): Promise<ObsidianWorkspaceResult<boolean>> {
    try {
      const exists = await this.vault.adapter.exists(makeWorkspaceMarker(this.pluginDir));
      return { success: true, data: exists };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async initWorkspace(workspacePath: string): Promise<ObsidianWorkspaceResult<ObsidianWorkspaceInfo>> {
    try {
      const metadata = { id: `ws-${Date.now()}`, name: 'workspace', createdAt: new Date().toISOString(), modulesDir: 'modules', projectsDir: 'projects', version: '1.0.0' };
      await vaultWriteJson(this.vault, makeWorkspaceMarker(this.pluginDir), metadata);
      const cfgPath = makeConfigPath(this.pluginDir);
      if (!await this.vault.adapter.exists(cfgPath)) await vaultWriteJson(this.vault, cfgPath, {});
      return { success: true, data: { id: metadata.id, name: metadata.name, path: workspacePath, createdAt: metadata.createdAt, modulesDir: metadata.modulesDir, projectsDir: metadata.projectsDir, projectCount: 0, projects: [] } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Config Service
// ─────────────────────────────────────────────────────────────────────────────

function setNested(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function getNested(obj: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((cur, p) => (cur == null || typeof cur !== 'object') ? undefined : (cur as Record<string, unknown>)[p], obj);
}

class MobileConfigService implements ObsidianGlobalConfigService {
  constructor(private vault: Vault, private pluginDir: string) {}

  private cfgPath(): string { return makeConfigPath(this.pluginDir); }

  private async load(): Promise<Record<string, unknown>> {
    return (await vaultReadJson<Record<string, unknown>>(this.vault, this.cfgPath())) || {};
  }

  async get(workspacePath: string, key: string): Promise<ObsidianConfigResult<ConfigGetResult>> {
    try {
      const cfg = await this.load();
      const value = getNested(cfg, key);
      if (value === undefined) return { success: false, error: `Key not found: ${key}` };
      return { success: true, data: { key, value } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async set(workspacePath: string, key: string, value: unknown): Promise<ObsidianConfigResult<ConfigGetResult>> {
    try {
      const cfg = await this.load();
      setNested(cfg, key, value);
      await vaultWriteJson(this.vault, this.cfgPath(), cfg);
      return { success: true, data: { key, value } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async list(_workspacePath: string): Promise<ObsidianConfigResult<ConfigListResult>> {
    try {
      return { success: true, data: { config: await this.load(), scope: 'global' } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile repository stubs (required by obsidian-mobile-repositories.ts)
// ─────────────────────────────────────────────────────────────────────────────

// These are re-exported so main.ts can import them just as before
export { ObsidianMobileWorkspaceRepository, ObsidianMobileFileSystemRepository } from '../services/obsidian-mobile-repositories';

// ─────────────────────────────────────────────────────────────────────────────
// Factory functions (mirror @mdfriday/foundry/obsidian/mobile exports)
//
// In main.ts the config has: { platform, persistence: { workspace, fileSystem }, identityHttpClient }
// We extract vault+pluginDir from the WorkspaceRepository which is our
// ObsidianMobileWorkspaceRepository that holds vault+pluginDir references.
// ─────────────────────────────────────────────────────────────────────────────

function extractVaultAndDir(config: MobileServiceConfig): { vault: Vault; pluginDir: string } {
  // ObsidianMobileWorkspaceRepository exposes getVault()/getPluginDir()
  const repo = config?.persistence?.workspace as unknown as { getVault?(): Vault; getPluginDir?(): string };
  if (repo?.getVault && repo?.getPluginDir) {
    return { vault: repo.getVault(), pluginDir: repo.getPluginDir() };
  }
  throw new Error('[MDFriday Sync] Mobile config missing vault/pluginDir accessors');
}

export function createObsidianWorkspaceService(config: ObsidianEnvironmentConfig): ObsidianWorkspaceService {
  const { vault, pluginDir } = extractVaultAndDir(config as unknown as MobileServiceConfig);
  return new MobileWorkspaceService(vault, pluginDir);
}

export function createObsidianAuthService(httpClient: IdentityHttpClient, config: ObsidianEnvironmentConfig): ObsidianAuthService {
  const { vault, pluginDir } = extractVaultAndDir(config as unknown as MobileServiceConfig);
  return new MobileAuthService(httpClient, vault, pluginDir);
}

export function createObsidianLicenseService(httpClient: IdentityHttpClient, config: ObsidianEnvironmentConfig): ObsidianLicenseService {
  const { vault, pluginDir } = extractVaultAndDir(config as unknown as MobileServiceConfig);
  return new MobileLicenseService(httpClient, vault, pluginDir);
}

export function createObsidianGlobalConfigService(config: ObsidianEnvironmentConfig): ObsidianGlobalConfigService {
  const { vault, pluginDir } = extractVaultAndDir(config as unknown as MobileServiceConfig);
  return new MobileConfigService(vault, pluginDir);
}

