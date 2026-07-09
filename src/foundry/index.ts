/**
 * Lightweight Foundry Desktop Services
 *
 * Replaces @mdfriday/foundry for the sync-only plugin on Desktop (Node.js).
 * Uses Node.js `fs`/`path` directly — both are marked external in esbuild.
 *
 * Data layout inside workspacePath:
 *   .mdfriday/workspace.json   – workspace init marker
 *   .mdfriday/user-data.json   – auth + license + sync config
 *   .mdfriday/config.json      – global plugin config
 */

import { Platform } from 'obsidian';
import * as fs from 'fs';
import * as nodePath from 'path';
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
} from './types';

/** Generic envelope returned by the MDFriday API: { data: T[] } */
interface ApiEnvelope<T = unknown> {
  data?: T[];
  success?: boolean;
  message?: string;
  [key: string]: unknown;
}

/** Helper – unwrap the first element of an API envelope */
function unwrapFirst<T>(responseData: unknown): T | undefined {
  return (responseData as ApiEnvelope<T> | undefined)?.data?.[0];
}

/** Raw usage API response shape */
interface RawUsageResponse {
  license_key: string;
  plan: string;
  devices?: { count?: number; devices?: RawDeviceEntry[] };
  ips?: { count?: number; ips?: RawIpEntry[] };
  features?: { max_devices?: number; max_ips?: number; max_storage?: number };
  disks?: { sync_disk_usage?: number; publish_disk_usage?: number; total_disk_usage?: number; unit?: string };
}

/** Raw login response – token string */
type RawTokenResponse = string;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MDFRIDAY_DIR = '.mdfriday';
const USER_DATA_FILE = 'user-data.json';
const WORKSPACE_FILE = 'workspace.json';
const CONFIG_FILE = 'config.json';
const DEFAULT_API_URL = 'https://app.mdfriday.com';

// ─────────────────────────────────────────────────────────────────────────────
// Credential generation from License Key
//   MDF-XXXX-XXXX-XXXX  →  email = xxxx-xxxx-xxxx@mdfriday.com
//                           password = btoa("xxxx-xxxx-xxxx")
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
// Node.js file helpers  (fs / path are external — not bundled)
// ─────────────────────────────────────────────────────────────────────────────


async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  fs.mkdirSync(nodePath.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function fileExists(filePath: string): boolean {
  try { fs.accessSync(filePath); return true; } catch { return false; }
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

interface SyncConfigShape {
  dbEndpoint?: string;
  dbName?: string;
  email?: string;
  userDir?: string;
  status?: string;
  dbPassword?: string;
  [key: string]: unknown;
}

function userDataPath(workspacePath: string): string {
  return nodePath.join(workspacePath, MDFRIDAY_DIR, USER_DATA_FILE);
}

async function loadUserData(workspacePath: string): Promise<UserData | null> {
  return readJsonFile<UserData>(userDataPath(workspacePath));
}

async function saveUserData(workspacePath: string, patch: Partial<UserData>): Promise<void> {
  const existing = (await loadUserData(workspacePath)) || {};
  const merged: UserData = { ...existing, ...patch };
  // Remove undefined values
  Object.keys(merged).forEach(k => (merged as Record<string, unknown>)[k] === undefined && delete (merged as Record<string, unknown>)[k]);
  await writeJsonFile(userDataPath(workspacePath), merged);
}

function getApiUrl(userData: UserData | null): string {
  return userData?.serverConfig?.apiUrl || DEFAULT_API_URL;
}

// ─────────────────────────────────────────────────────────────────────────────
// Device fingerprint (simple, stable within the install)
// ─────────────────────────────────────────────────────────────────────────────

async function getDeviceId(): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const components = [
        Platform.isMobile ? 'mobile' : 'desktop',
        typeof navigator !== 'undefined' ? navigator.language : '',
        new Date().getTimezoneOffset().toString(),
      ].join('|');
      const data = new TextEncoder().encode(components);
      const buf  = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }
  } catch {
    // crypto.subtle unavailable — fall through to random fallback
  }
  return Math.random().toString(36).slice(2, 18);
}

function getDeviceInfo() {
  const deviceType: 'desktop' | 'mobile' = Platform.isMobile ? 'mobile' : 'desktop';
  let deviceName = 'MDFriday Sync';
  if (Platform.isIosApp) deviceName = 'MDFriday Sync on iOS';
  else if (Platform.isAndroidApp) deviceName = 'MDFriday Sync on Android';
  else if (Platform.isMacOS) deviceName = 'MDFriday Sync on macOS';
  else if (Platform.isWin) deviceName = 'MDFriday Sync on Windows';
  else if (Platform.isLinux) deviceName = 'MDFriday Sync on Linux';
  return { deviceName, deviceType };
}

// ─────────────────────────────────────────────────────────────────────────────
// API response shapes (typed to replace `any` parameter patterns)
// ─────────────────────────────────────────────────────────────────────────────

interface ActivationApiFeatures {
  max_devices?: number;
  max_ips?: number;
  sync_enabled?: boolean;
  sync_quota?: number;
  publish_enabled?: boolean;
  max_sites?: number;
  max_storage?: number;
  custom_domain?: boolean;
  custom_sub_domain?: boolean;
  validity_days?: number;
}

interface ActivationApiResponse {
  features?: ActivationApiFeatures;
  expires_at?: number;
  license_key?: string;
  plan?: string;
  activated?: boolean;
  first_time?: boolean;
  success?: boolean;
  user?: { email?: string; user_dir?: string };
  sync?: {
    status?: string;
    db_endpoint?: string;
    db_name?: string;
    email?: string;
    db_password?: string;
  };
}

interface StoredLicenseShape {
  key?: string;
  plan?: string;
  expiresAt?: number;
  features?: {
    maxDevices?: number;
    maxIps?: number;
    syncEnabled?: boolean;
    syncQuota?: number;
    publishEnabled?: boolean;
    maxSites?: number;
    maxStorage?: number;
    customDomain?: boolean;
    customSubDomain?: boolean;
    validityDays?: number;
  };
  user?: ObsidianLicenseInfo['user'];
  activation?: ObsidianLicenseInfo['activation'];
  sync?: ObsidianLicenseInfo['sync'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Build license info from raw API activation response
// ─────────────────────────────────────────────────────────────────────────────

function buildLicenseInfoFromActivation(data: ActivationApiResponse, userDir: string): ObsidianLicenseInfo {
  const f: ActivationApiFeatures = data.features ?? {};
  const expiresAt: number = data.expires_at ?? 0;
  const msRemaining = expiresAt - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));
  const expiresDate = new Date(expiresAt);
  const expires = expiresDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const info: ObsidianLicenseInfo = {
    key: data.license_key ?? '',
    plan: data.plan ? (data.plan.charAt(0).toUpperCase() + data.plan.slice(1).toLowerCase()) : 'Free',
    isExpired: Date.now() > expiresAt,
    expires,
    expiresAt,
    daysRemaining,
    isTrial: (data.plan ?? '').toLowerCase() === 'free',
    features: {
      maxDevices:    f.max_devices ?? 1,
      maxIps:        f.max_ips ?? 1,
      syncEnabled:   f.sync_enabled ?? false,
      syncQuota:     f.sync_quota ?? 0,
      publishEnabled:f.publish_enabled ?? false,
      maxSites:      f.max_sites ?? 1,
      maxStorage:    f.max_storage ?? 1024,
      customDomain:  f.custom_domain ?? false,
      customSubDomain: f.custom_sub_domain ?? false,
      validityDays:  f.validity_days ?? 365,
    },
    user: { email: data.user?.email ?? '', userDir },
    activation: { activated: data.activated ?? true, firstTime: data.first_time ?? false },
  };

  if (data.sync && f.sync_enabled) {
    info.sync = {
      enabled:    true,
      status:     data.sync.status ?? 'active',
      dbEndpoint: data.sync.db_endpoint ?? '',
      dbName:     data.sync.db_name ?? '',
      email:      data.sync.email ?? '',
      dbPassword: data.sync.db_password ?? '',
      userDir,
    };
  }

  return info;
}

function buildLicenseInfoFromStored(stored: StoredLicenseShape): ObsidianLicenseInfo {
  const expiresAt: number = stored.expiresAt ?? 0;
  const msRemaining = expiresAt - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));
  const expiresDate = new Date(expiresAt);
  const expires = expiresDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const f = stored.features || {};

  return {
    key:        stored.key || '',
    plan:       stored.plan || 'Free',
    isExpired:  Date.now() > expiresAt,
    expires,
    expiresAt,
    daysRemaining,
    isTrial:    (stored.plan || '').toLowerCase() === 'free',
    features: {
      maxDevices:     f.maxDevices ?? 1,
      maxIps:         f.maxIps ?? 1,
      syncEnabled:    f.syncEnabled ?? false,
      syncQuota:      f.syncQuota ?? 0,
      publishEnabled: f.publishEnabled ?? false,
      maxSites:       f.maxSites ?? 1,
      maxStorage:     f.maxStorage ?? 1024,
      customDomain:   f.customDomain ?? false,
      customSubDomain:f.customSubDomain ?? false,
      validityDays:   f.validityDays ?? 365,
    },
    user:       stored.user,
    activation: stored.activation,
    sync:       stored.sync,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Service
// ─────────────────────────────────────────────────────────────────────────────

class LightweightAuthService implements ObsidianAuthService {
  constructor(private http: IdentityHttpClient) {}

  async getStatus(workspacePath: string): Promise<ObsidianAuthResult<ObsidianAuthStatus>> {
    try {
      const ud = await loadUserData(workspacePath);
      const isAuthenticated = !!(ud?.token && ud?.email);
      const sc = ud?.syncConfig;
      const status: ObsidianAuthStatus = {
        isAuthenticated,
        serverUrl: ud?.serverConfig?.apiUrl,
        hasSyncConfig: !!sc,
        email:    ud?.email,
        token:    ud?.token,
        license:  ud?.license?.key,
        syncConfig: sc ? {
          dbEndpoint: sc.dbEndpoint || '',
          dbName:     sc.dbName     || '',
          email:      sc.email      || '',
          userDir:    sc.userDir    || '',
          status:     sc.status     || 'active',
          isActive:   sc.status === 'active',
          dbPassword: sc.dbPassword || '',
        } : undefined,
      };
      return { success: true, data: status };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getConfig(workspacePath: string): Promise<ObsidianAuthResult<ObsidianServerConfig>> {
    try {
      const ud = await loadUserData(workspacePath);
      return { success: true, data: { apiUrl: ud?.serverConfig?.apiUrl, websiteUrl: ud?.serverConfig?.websiteUrl } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async updateConfig(workspacePath: string, config: ObsidianServerConfig): Promise<ObsidianAuthResult<ObsidianServerConfig>> {
    try {
      const ud = await loadUserData(workspacePath);
      const serverConfig = { ...(ud?.serverConfig || {}), ...config };
      await saveUserData(workspacePath, { serverConfig });
      return { success: true, data: serverConfig };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// License Service
// ─────────────────────────────────────────────────────────────────────────────

class LightweightLicenseService implements ObsidianLicenseService {
  constructor(private http: IdentityHttpClient) {}

  async requestTrial(workspacePath: string, email: string): Promise<ObsidianLicenseResult<{ email: string; licenseKey: string; password: string; validityDays: number }>> {
    try {
      const ud  = await loadUserData(workspacePath);
      const url = `${getApiUrl(ud)}/api/license/trial`;
      const res = await this.http.postMultipart(url, { email });
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
      const ud       = await loadUserData(workspacePath);
      const apiUrl   = getApiUrl(ud);
      const email    = licenseToEmail(licenseKey);
      const password = licenseToPassword(licenseKey);

      const res = await this.http.postForm(`${apiUrl}/api/login`, { email, password });
      if (res.status !== 201) throw new Error(`Login failed: ${res.status}`);

      const token = unwrapFirst<RawTokenResponse>(res.data);
      if (!token) throw new Error('No token in login response');

      await saveUserData(workspacePath, { email, token, serverConfig: { apiUrl } });
      return { success: true, data: {} as object };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async activateLicense(workspacePath: string, licenseKey: string): Promise<ObsidianLicenseResult<ObsidianLicenseInfo>> {
    try {
      const ud    = await loadUserData(workspacePath);
      const token = ud?.token;
      if (!token) throw new Error('Not authenticated — call loginWithLicense first');

      const apiUrl    = getApiUrl(ud);
      const deviceId  = await getDeviceId();
      const { deviceName, deviceType } = getDeviceInfo();

      const res = await this.http.postMultipart(
        `${apiUrl}/api/license/activate`,
        { license_key: licenseKey, device_id: deviceId, device_name: deviceName, device_type: deviceType },
        { 'Authorization': `Bearer ${token}` }
      );
      if (res.status !== 200 && res.status !== 201) throw new Error(`Activation failed: ${res.status}`);

      const raw: ActivationApiResponse = (unwrapFirst<ActivationApiResponse>(res.data) ?? (res.data as ActivationApiResponse));
      if (!raw?.success) throw new Error('License activation unsuccessful');

      const userDir = raw.user?.user_dir || '';
      const info    = buildLicenseInfoFromActivation(raw, userDir);

      // persist license + sync config
      const licenseToStore = {
        key:        raw.license_key,
        plan:       info.plan,
        expiresAt:  raw.expires_at || 0,
        features:   info.features,
        activatedAt:Date.now(),
        activated:  raw.activated ?? true,
        firstTime:  raw.first_time ?? false,
        user:       info.user,
        activation: info.activation,
        sync:       info.sync,
      };
      const syncToStore = info.sync ? {
        dbEndpoint: info.sync.dbEndpoint,
        dbName:     info.sync.dbName,
        email:      info.sync.email,
        dbPassword: info.sync.dbPassword,
        userDir,
        status:     info.sync.status,
      } : ud?.syncConfig;

      await saveUserData(workspacePath, { license: licenseToStore, syncConfig: syncToStore });
      return { success: true, data: info };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getLicenseInfo(workspacePath: string, options?: { refresh?: boolean }): Promise<ObsidianLicenseResult<ObsidianLicenseInfo>> {
    try {
      const ud = await loadUserData(workspacePath);
      if (!ud?.license) return { success: true, message: 'No active license' };

      if (options?.refresh && ud.token) {
        // Refresh from server
        const apiUrl     = getApiUrl(ud);
        const licenseKey = ud.license.key;
        const token      = ud.token;
        const ts         = Date.now();
        const res = await this.http.get(
          `${apiUrl}/api/license/info?key=${licenseKey}&_t=${ts}`,
          { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
        );
        if (res.status === 200 && (res.data as ApiEnvelope<ActivationApiResponse>)?.data?.[0]) {
          const raw = unwrapFirst<ActivationApiResponse>(res.data) as ActivationApiResponse;
          const userDir = String(ud.syncConfig?.userDir ?? ud.license?.user?.userDir ?? '');
          const info = buildLicenseInfoFromActivation({ ...raw, user: { email: ud.email || '', user_dir: userDir } }, userDir);
          // update stored license
          const updated = { ...ud.license, ...{ key: raw.license_key || licenseKey, plan: info.plan, expiresAt: raw.expires_at || ud.license.expiresAt, features: info.features, isExpired: info.isExpired } };
          await saveUserData(workspacePath, { license: updated });
          return { success: true, data: info };
        }
      }

      return { success: true, data: buildLicenseInfoFromStored(ud.license) };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getLicenseUsage(workspacePath: string): Promise<ObsidianLicenseResult<ObsidianLicenseUsage>> {
    try {
      const ud    = await loadUserData(workspacePath);
      const token = ud?.token;
      if (!token) throw new Error('Not authenticated');
      const licenseKey = ud?.license?.key;
      if (!licenseKey) throw new Error('No license');
      const apiUrl = getApiUrl(ud);
      const ts     = Date.now();
      const res = await this.http.get(
        `${apiUrl}/api/license/usage?key=${licenseKey}&_t=${ts}`,
        { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      );
      if (res.status !== 200) throw new Error(`Usage fetch failed: ${res.status}`);
      const raw = unwrapFirst<RawUsageResponse>(res.data);
      if (!raw) throw new Error('Invalid usage response');
      const usage: ObsidianLicenseUsage = {
        licenseKey: raw.license_key,
        plan:       raw.plan,
        devices:    { count: raw.devices?.count || 0, max: raw.features?.max_devices || 1, list: (raw.devices?.devices || []).map((d: RawDeviceEntry) => ({ id: d.id, name: d.device_name, type: d.device_type, status: d.status, lastSeenAt: d.last_seen_at })) },
        ips:        { count: raw.ips?.count || 0, max: raw.features?.max_ips || 1, list: (raw.ips?.ips || []).map((ip: RawIpEntry) => ({ ip: ip.ip_address, city: ip.city, region: ip.region, country: ip.country, status: ip.status, lastSeenAt: ip.last_seen_at })) },
        disk: {
          syncUsage:    Number(raw.disks?.sync_disk_usage) || 0,
          publishUsage: Number(raw.disks?.publish_disk_usage) || 0,
          totalUsage:   Number(raw.disks?.total_disk_usage) || 0,
          maxStorage:   raw.features?.max_storage || 1024,
          unit:         raw.disks?.unit || 'MB',
        },
      };
      return { success: true, data: usage };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async resetUsage(workspacePath: string, force: boolean): Promise<ObsidianLicenseResult<void>> {
    if (!force) return { success: false, error: 'Set force=true to confirm reset' };
    try {
      const ud    = await loadUserData(workspacePath);
      const token = ud?.token;
      if (!token) throw new Error('Not authenticated');
      const licenseKey = ud?.license?.key;
      if (!licenseKey) throw new Error('No license');
      const apiUrl = getApiUrl(ud);
      const res = await this.http.post(
        `${apiUrl}/api/license/usage/reset?key=${licenseKey}`,
        {},
        { 'Authorization': `Bearer ${token}` }
      );
      if (res.status !== 200 && res.status !== 201) throw new Error(`Reset failed: ${res.status}`);
      return { success: true, message: 'Usage data reset successfully' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async hasActiveLicense(workspacePath: string): Promise<boolean> {
    try {
      const ud = await loadUserData(workspacePath);
      if (!ud?.license) return false;
      const expiresAt = ud.license.expiresAt || 0;
      return Date.now() < expiresAt;
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Service
// ─────────────────────────────────────────────────────────────────────────────

class LightweightWorkspaceService implements ObsidianWorkspaceService {
  async workspaceExists(workspacePath: string): Promise<ObsidianWorkspaceResult<boolean>> {
    try {
      const marker = nodePath.join(workspacePath, MDFRIDAY_DIR, WORKSPACE_FILE);
      return { success: true, data: fileExists(marker) };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async initWorkspace(workspacePath: string): Promise<ObsidianWorkspaceResult<ObsidianWorkspaceInfo>> {
    try {
      const dir    = nodePath.join(workspacePath, MDFRIDAY_DIR);
      const marker = nodePath.join(dir, WORKSPACE_FILE);

      const metadata = {
        id:         `ws-${Date.now()}`,
        name:       'workspace',
        createdAt:  new Date().toISOString(),
        modulesDir: 'modules',
        projectsDir:'projects',
        version:    '1.0.0',
      };
      await writeJsonFile(marker, metadata);

      // ensure config.json exists
      const configPath = nodePath.join(dir, CONFIG_FILE);
      if (!fileExists(configPath)) {
        await writeJsonFile(configPath, {});
      }

      return {
        success: true,
        data: {
          id:           metadata.id,
          name:         metadata.name,
          path:         workspacePath,
          createdAt:    metadata.createdAt,
          modulesDir:   metadata.modulesDir,
          projectsDir:  metadata.projectsDir,
          projectCount: 0,
          projects:     [],
        },
      };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Config Service (dot-notation key → nested JSON)
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
  const parts = key.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

class LightweightGlobalConfigService implements ObsidianGlobalConfigService {
  private configPath(workspacePath: string): string {
    return nodePath.join(workspacePath, MDFRIDAY_DIR, CONFIG_FILE);
  }

  private async load(workspacePath: string): Promise<Record<string, unknown>> {
    return (await readJsonFile<Record<string, unknown>>(this.configPath(workspacePath))) || {};
  }

  async get(workspacePath: string, key: string): Promise<ObsidianConfigResult<ConfigGetResult>> {
    try {
      const cfg   = await this.load(workspacePath);
      const value = getNested(cfg, key);
      if (value === undefined) return { success: false, error: `Key not found: ${key}` };
      return { success: true, data: { key, value } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async set(workspacePath: string, key: string, value: unknown): Promise<ObsidianConfigResult<ConfigGetResult>> {
    try {
      const cfg = await this.load(workspacePath);
      setNested(cfg, key, value);
      await writeJsonFile(this.configPath(workspacePath), cfg);
      return { success: true, data: { key, value } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async list(workspacePath: string): Promise<ObsidianConfigResult<ConfigListResult>> {
    try {
      const config = await this.load(workspacePath);
      return { success: true, data: { config, scope: 'global' } };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory functions  (mirror @mdfriday/foundry Desktop exports)
// ─────────────────────────────────────────────────────────────────────────────

export function createObsidianWorkspaceService(): ObsidianWorkspaceService {
  return new LightweightWorkspaceService();
}

export function createObsidianAuthService(httpClient: IdentityHttpClient): ObsidianAuthService {
  return new LightweightAuthService(httpClient);
}

export function createObsidianLicenseService(httpClient: IdentityHttpClient): ObsidianLicenseService {
  return new LightweightLicenseService(httpClient);
}

export function createObsidianGlobalConfigService(): ObsidianGlobalConfigService {
  return new LightweightGlobalConfigService();
}

// Re-export all types
export type {
  ObsidianAuthService,
  ObsidianLicenseService,
  ObsidianGlobalConfigService,
  ObsidianWorkspaceService,
} from './types';

