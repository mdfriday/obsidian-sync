/**
 * Lightweight Foundry Types
 * Pure TypeScript interfaces — zero runtime code.
 * Replaces @mdfriday/foundry type imports.
 */

// ─── HTTP Client ──────────────────────────────────────────────────────────────

export interface IdentityHttpResponse {
  status: number;
  ok: boolean;
  data: unknown;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface IdentityHttpClient {
  post(url: string, data: unknown, headers?: Record<string, string>): Promise<IdentityHttpResponse>;
  postJSON(url: string, data: unknown, headers?: Record<string, string>): Promise<IdentityHttpResponse>;
  postForm(url: string, data: Record<string, string>): Promise<IdentityHttpResponse>;
  postMultipart(url: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<IdentityHttpResponse>;
  get(url: string, headers?: Record<string, string>): Promise<IdentityHttpResponse>;
}

export interface PublishHttpResponse {
  status: number;
  ok: boolean;
  statusText: string;
  data: unknown;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface PublishHttpClient {
  postJSON(url: string, data: unknown, headers?: Record<string, string>): Promise<PublishHttpResponse>;
  postMultipart(url: string, formData: Record<string, unknown>, headers?: Record<string, string>): Promise<PublishHttpResponse>;
  putBinary(url: string, data: Buffer | Uint8Array, headers?: Record<string, string>): Promise<PublishHttpResponse>;
  get(url: string, headers?: Record<string, string>): Promise<PublishHttpResponse>;
}

export interface LLMHttpRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface LLMHttpResponse {
  status: number;
  statusText: string;
  ok: boolean;
  body?: ReadableStream<Uint8Array>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface LLMHttpClient {
  fetch(request: LLMHttpRequest): Promise<LLMHttpResponse>;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface ObsidianSyncConfig {
  dbEndpoint: string;
  dbName: string;
  email: string;
  userDir: string;
  status: string;
  isActive: boolean;
  dbPassword?: string;
}

export interface ObsidianAuthStatus {
  isAuthenticated: boolean;
  serverUrl?: string;
  hasSyncConfig: boolean;
  license?: string;
  email?: string;
  token?: string;
  syncConfig?: ObsidianSyncConfig;
}

export interface ObsidianServerConfig {
  apiUrl?: string;
  websiteUrl?: string;
}

export interface ObsidianAuthResult<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

// ─── License Types ────────────────────────────────────────────────────────────

export interface ObsidianLicenseFeatures {
  maxDevices: number;
  maxIps: number;
  syncEnabled: boolean;
  syncQuota: number;
  publishEnabled: boolean;
  maxSites: number;
  maxStorage: number;
  customDomain: boolean;
  customSubDomain: boolean;
  validityDays?: number;
}

export interface ObsidianLicenseSyncConfig {
  dbEndpoint: string;
  dbName: string;
  db_password?: string;
  userDir?: string;
  [key: string]: unknown;
}

export interface ObsidianLicenseInfo {
  key: string;
  plan: string;
  isExpired: boolean;
  expires: string;
  expiresAt?: number;
  daysRemaining: number;
  isTrial: boolean;
  features: ObsidianLicenseFeatures;
  user?: { email: string; userDir: string };
  activation?: { activated: boolean; firstTime: boolean };
  sync?: {
    enabled: boolean;
    status: string;
    dbEndpoint: string;
    dbName: string;
    email: string;
    dbPassword: string;
    userDir: string;
    liveSyncConfig?: ObsidianLicenseSyncConfig;
  };
}

/** Raw device entry as returned by the API */
export interface RawDeviceEntry {
  id: string;
  device_name: string;
  device_type: string;
  status: string;
  last_seen_at: string;
}

/** Normalised device entry stored in ObsidianLicenseUsage */
export interface DeviceEntry {
  id: string;
  name: string;
  type: string;
  status: string;
  lastSeenAt: string;
}

/** Raw IP entry as returned by the API */
export interface RawIpEntry {
  ip_address: string;
  city: string;
  region: string;
  country: string;
  status: string;
  last_seen_at: string;
}

/** Normalised IP entry stored in ObsidianLicenseUsage */
export interface IpEntry {
  ip: string;
  city: string;
  region: string;
  country: string;
  status: string;
  lastSeenAt: string;
}

export interface ObsidianLicenseUsage {
  licenseKey: string;
  plan: string;
  devices: { count: number; max: number; list: DeviceEntry[] };
  ips: { count: number; max: number; list: IpEntry[] };
  disk: {
    syncUsage: number;
    publishUsage: number;
    totalUsage: number;
    maxStorage: number;
    unit: string;
  };
}

export interface ObsidianLicenseResult<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface ConfigGetResult {
  key: string;
  value: unknown;
  project?: string;
}

export interface ConfigListResult {
  config: Record<string, unknown>;
  scope: string;
  project?: string;
}

export interface ObsidianConfigResult<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

// ─── Workspace Types ──────────────────────────────────────────────────────────

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  createdAt?: string;
}

export interface ObsidianWorkspaceInfo {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  modulesDir: string;
  projectsDir: string;
  projectCount: number;
  projects: ProjectInfo[];
}

export interface ObsidianWorkspaceResult<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

// ─── Repository Types (used by mobile repositories) ──────────────────────────

export interface WorkspaceMetadataData {
  id: string;
  name: string;
  createdAt: string | number;
  modulesDir?: string;
  projectsDir?: string;
  version?: string;
}

export interface ProjectRegistry {
  projects: Array<{
    id: string;
    name: string;
    path: string;
    createdAt: string | number;
  }>;
}

export interface FolderScanResult {
  path: string;
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface ContentFolderInfo {
  path: string;
  languageCode: string;
  weight: number;
}

export interface StaticFolderInfo {
  path: string;
}

export interface FolderStructure {
  rootPath: string;
  contentFolders: ContentFolderInfo[];
  staticFolder: StaticFolderInfo | null;
  isStructured: boolean;
}

export interface SymlinkResult {
  source: string;
  target: string;
  success: boolean;
  error?: string;
}

/** Minimal file-stat shape returned by FileSystemRepository.stat() */
export interface FileStat {
  size: number;
  mtime: number | Date;
  ctime?: number | Date;
  isFile?: boolean | (() => boolean);
  isDirectory?: boolean | (() => boolean);
  isSymbolicLink?: boolean | (() => boolean);
}

export interface WorkspaceRepository {
  isWorkspace(workspacePath: string): Promise<boolean>;
  initWorkspaceStructure(workspacePath: string, modulesDir: string, projectsDir: string): Promise<void>;
  saveWorkspaceMetadata(workspacePath: string, metadata: WorkspaceMetadataData): Promise<void>;
  loadWorkspaceMetadata(workspacePath: string): Promise<WorkspaceMetadataData>;
  saveProjectRegistry(workspacePath: string, registry: ProjectRegistry): Promise<void>;
  loadProjectRegistry(workspacePath: string): Promise<ProjectRegistry>;
}

export interface FileSystemRepository {
  exists(filePath: string): Promise<boolean>;
  isDirectory(filePath: string): Promise<boolean>;
  isFile(filePath: string): Promise<boolean>;
  readDirectory(dirPath: string): Promise<FolderScanResult[]>;
  scanFolderStructure(dirPath: string): Promise<FolderStructure>;
  createSymlink(source: string, target: string): Promise<SymlinkResult>;
  createSymlinks(links: Array<{ source: string; target: string }>): Promise<SymlinkResult[]>;
  removeSymlink(filePath: string): Promise<void>;
  isSymlink(filePath: string): Promise<boolean>;
  readSymlink(filePath: string): Promise<string>;
  createDirectory(dirPath: string, recursive?: boolean): Promise<void>;
  remove(filePath: string, recursive?: boolean): Promise<void>;
  stat(filePath: string): Promise<FileStat>;
  copyFile(source: string, target: string): Promise<void>;
  readFile(filePath: string, encoding?: BufferEncoding): Promise<string>;
  writeFile(filePath: string, content: string, encoding?: BufferEncoding): Promise<void>;
  unlink(filePath: string): Promise<void>;
  access(filePath: string): Promise<void>;
  resolvePath(filePath: string): Promise<string>;
}

// ─── Mobile Config Types ──────────────────────────────────────────────────────

export interface ObsidianMobilePersistence {
  workspace: WorkspaceRepository;
  fileSystem: FileSystemRepository;
}

export interface ObsidianEnvironmentConfig {
  platform: 'mobile';
  persistence: ObsidianMobilePersistence;
  identityHttpClient: IdentityHttpClient;
}

// ─── Service Interfaces (used by LicenseServiceManager / LicenseStateManager) ─

export interface ObsidianAuthService {
  getStatus(workspacePath: string): Promise<ObsidianAuthResult<ObsidianAuthStatus>>;
  getConfig(workspacePath: string): Promise<ObsidianAuthResult<ObsidianServerConfig>>;
  updateConfig(workspacePath: string, config: ObsidianServerConfig): Promise<ObsidianAuthResult<ObsidianServerConfig>>;
}

export interface ObsidianLicenseService {
  requestTrial(workspacePath: string, email: string): Promise<ObsidianLicenseResult<{ email: string; licenseKey: string; password: string; validityDays: number }>>;
  loginWithLicense(workspacePath: string, licenseKey: string): Promise<ObsidianLicenseResult<object>>;
  activateLicense(workspacePath: string, licenseKey: string): Promise<ObsidianLicenseResult<ObsidianLicenseInfo>>;
  getLicenseInfo(workspacePath: string, options?: { refresh?: boolean }): Promise<ObsidianLicenseResult<ObsidianLicenseInfo>>;
  getLicenseUsage(workspacePath: string): Promise<ObsidianLicenseResult<ObsidianLicenseUsage>>;
  resetUsage(workspacePath: string, force: boolean): Promise<ObsidianLicenseResult<void>>;
  hasActiveLicense(workspacePath: string): Promise<boolean>;
}

export interface ObsidianGlobalConfigService {
  get(workspacePath: string, key: string): Promise<ObsidianConfigResult<ConfigGetResult>>;
  set(workspacePath: string, key: string, value: unknown): Promise<ObsidianConfigResult<ConfigGetResult>>;
  list(workspacePath: string): Promise<ObsidianConfigResult<ConfigListResult>>;
}

export interface ObsidianWorkspaceService {
  workspaceExists(workspacePath: string): Promise<ObsidianWorkspaceResult<boolean>>;
  initWorkspace(workspacePath: string): Promise<ObsidianWorkspaceResult<ObsidianWorkspaceInfo>>;
}

// ─── Domain types used in licenseState.ts ────────────────────────────────────

export interface ObsidianDomainInfo {
  subdomain?: string;
  customDomain?: string;
  fullDomain?: string;
}

export interface ObsidianDomainService {
  getDomainInfo(workspacePath: string): Promise<{ success: boolean; data?: ObsidianDomainInfo; error?: string }>;
}

