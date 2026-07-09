import {FileSystemAdapter, Platform, Plugin} from 'obsidian';
import * as nodePath from 'path';
import './styles/license-settings.css';
import './styles/live-sync.css';
import {I18nService} from "./i18n";
import {type SyncConfig, SyncService, SyncStatusDisplay} from "./sync";
import {
	isLicenseExpired,
	isValidLicenseKeyFormat,
	type StoredLicenseData,
	type StoredSyncData,
	type StoredUsageData,
	type StoredUserData
} from "./license";
import {MdfridaySyncSettingTab} from "./setting";
import type {
	ObsidianAuthService,
	ObsidianLicenseService,
	ObsidianGlobalConfigService,
} from './foundry/types';
import type {ObsidianEnvironmentConfig as ObsidianMobileEnvironmentConfig} from './foundry/types';
import {createObsidianIdentityHttpClient} from './http';
import {LicenseServiceManager} from './services/license';
import {LicenseStateManager} from './services/licenseState';
import {joinVaultPath} from './utils/common';

export interface SyncPluginSettings {
	// License Settings
	license: StoredLicenseData | null;
	licenseSync: StoredSyncData | null;
	licenseUser: StoredUserData | null;
	licenseUsage: StoredUsageData | null;
	encryptionPassphrase: string;
	// Sync Settings
	syncEnabled: boolean;
	syncUserEnabled: boolean;
	syncConfig: SyncConfig;
	// UI Display Settings
	showEditorStatusDisplay: boolean;
	// Enterprise Settings
	enterpriseServerUrl: string;
}

const DEFAULT_SETTINGS: SyncPluginSettings = {
	license: null,
	licenseSync: null,
	licenseUser: null,
	licenseUsage: null,
	encryptionPassphrase: '',
	syncEnabled: false,
	syncUserEnabled: false,
	syncConfig: SyncService.getDefaultConfig(),
	showEditorStatusDisplay: false,
	enterpriseServerUrl: '',
}

export const API_URL_DEV = 'http://127.0.0.1:1314';
export const API_URL_PRO = 'https://app.mdfriday.com';

export function GetBaseUrl(settings?: SyncPluginSettings): string {
	if (process.env.NODE_ENV === 'development') {
		return API_URL_DEV
	}
	if (settings?.enterpriseServerUrl && settings.enterpriseServerUrl.trim()) {
		return settings.enterpriseServerUrl.trim();
	}
	return API_URL_PRO;
}

export default class MdfridaySyncPlugin extends Plugin {
	settings: SyncPluginSettings;

	pluginDir: string;
	absWorkspacePath: string;
	vaultBasePath: string;
	apiUrl: string;

	// Core services (always available)
	i18n: I18nService;
	syncService: SyncService;
	syncStatusDisplay: SyncStatusDisplay | null = null;

	// Foundry services
	foundryAuthService?: ObsidianAuthService;
	foundryLicenseService?: ObsidianLicenseService;
	foundryGlobalConfigService?: ObsidianGlobalConfigService;
	licenseServiceManager?: LicenseServiceManager | null;
	licenseState?: LicenseStateManager | null;

	async onload() {
		this.pluginDir = `${this.manifest.dir}`;
		await this.loadSettings();

		// Initialize core services
		await this.initCore();

		// Platform-specific initialization
		if (Platform.isDesktop) {
			const adapter = this.app.vault.adapter;
			if (adapter instanceof FileSystemAdapter) {
				const basePath = adapter.getBasePath();
				this.vaultBasePath = basePath;
				this.absWorkspacePath = nodePath.join(basePath, this.pluginDir, 'workspace');
			}
			await this.initDesktopFeatures();
		} else {
			this.absWorkspacePath = joinVaultPath(this.pluginDir, 'workspace');
			const adapter = this.app.vault.adapter;
			if (adapter instanceof FileSystemAdapter) {
				this.vaultBasePath = adapter.getBasePath();
			}
			await this.initMobileFeatures();
		}

		// Initialize Sync Service (common for both platforms)
		// Only initialize if user has explicitly enabled sync
		if (this.settings.syncUserEnabled) {
			window.setTimeout(() => {
				void this.initializeSyncService();
			}, 0);
		}

		this.addSettingTab(new MdfridaySyncSettingTab(this.app, this));
	}

	/**
	 * Initialize core services (common for all platforms)
	 */
	private async initCore(): Promise<void> {
		this.apiUrl = GetBaseUrl(this.settings);
		this.i18n = new I18nService(this);
		await this.i18n.init();
	}

	/**
	 * Initialize desktop-only features
	 */
	private async initDesktopFeatures(): Promise<void> {
		await this.initializeWorkspace();
	}

	/**
	 * Initialize workspace and Foundry services (Desktop)
	 */
	private async initializeWorkspace(): Promise<void> {
		try {
			const {
				createObsidianWorkspaceService,
				createObsidianAuthService,
				createObsidianLicenseService,
				createObsidianGlobalConfigService,
			} = await import('./foundry/index');

			const workspaceService = createObsidianWorkspaceService();

			const relativeWorkspacePath = joinVaultPath(this.pluginDir, 'workspace');
			if (!await this.app.vault.adapter.exists(relativeWorkspacePath)) {
				await this.app.vault.adapter.mkdir(relativeWorkspacePath);
			}

			const existsResult = await workspaceService.workspaceExists(this.absWorkspacePath);
			if (existsResult.success && !existsResult.data) {
				const initResult = await workspaceService.initWorkspace(this.absWorkspacePath);
				if (!initResult.success) {
					console.error('[MDFriday Sync] Failed to initialize workspace:', initResult.error);
				}
			} else if (!existsResult.success) {
				console.error('[MDFriday Sync] Failed to check workspace existence:', existsResult.error);
			}

			const identityHttpClient = createObsidianIdentityHttpClient();
			this.foundryAuthService    = createObsidianAuthService(identityHttpClient);
			this.foundryLicenseService = createObsidianLicenseService(identityHttpClient);
			this.foundryGlobalConfigService = createObsidianGlobalConfigService();

			if (this.foundryLicenseService && this.foundryAuthService && this.foundryGlobalConfigService) {
				this.licenseServiceManager = new LicenseServiceManager(
					this.foundryLicenseService,
					this.foundryAuthService,
					this.foundryGlobalConfigService,
					this.absWorkspacePath
				);
			}

			if (this.foundryLicenseService && this.foundryAuthService) {
				this.licenseState = new LicenseStateManager(
					this.foundryLicenseService,
					this.foundryAuthService,
					null, // no domain service for sync-only plugin
					this.absWorkspacePath
				);

				const initResult = await this.licenseState.initialize();
				if (initResult.isActivated) {
					await this.syncLicenseToSettings();
				} else if (initResult.error) {
					console.warn('[MDFriday Sync] License initialization error:', initResult.error);
				}
			}

			if (this.foundryAuthService) {
				try {
					const configResult = await this.foundryAuthService.getConfig(this.absWorkspacePath);
					if (configResult.success && configResult.data) {
						if (!this.settings.enterpriseServerUrl && configResult.data.apiUrl) {
							this.settings.enterpriseServerUrl = configResult.data.apiUrl;
						}
					}
				} catch (error) {
					console.error('[MDFriday Sync] Error loading enterprise server URL:', error);
				}
			}
		} catch (error) {
			console.error('[MDFriday Sync] Error initializing workspace:', error);
		}
	}

	/**
	 * Initialize mobile-only features
	 */
	private async initMobileFeatures(): Promise<void> {
		try {
			await this.initializeWorkspaceMobile();
		} catch (error) {
			console.error('[MDFriday Sync Mobile] Error initializing mobile features:', error);
		}
	}

	/**
	 * Initialize workspace and Foundry services for Mobile
	 */
	private async initializeWorkspaceMobile(): Promise<void> {
		try {
			const { ObsidianMobileWorkspaceRepository, ObsidianMobileFileSystemRepository } =
				await import('./services/obsidian-mobile-repositories');

			const {
				createObsidianWorkspaceService,
				createObsidianAuthService,
				createObsidianLicenseService,
				createObsidianGlobalConfigService,
			} = await import('./foundry/mobile');

			const workspaceRepo = new ObsidianMobileWorkspaceRepository(this.app.vault, this.pluginDir);
			const fileSystemRepo = new ObsidianMobileFileSystemRepository(this.app.vault, this.pluginDir);
			const httpClient = createObsidianIdentityHttpClient();

			const config: ObsidianMobileEnvironmentConfig = {
				platform: 'mobile',
				persistence: {
					workspace: workspaceRepo,
					fileSystem: fileSystemRepo,
				},
				identityHttpClient: httpClient,
			};

			const workspaceService          = createObsidianWorkspaceService(config);
			this.foundryAuthService         = createObsidianAuthService(httpClient, config);
			this.foundryLicenseService      = createObsidianLicenseService(httpClient, config);
			this.foundryGlobalConfigService = createObsidianGlobalConfigService(config);

			if (!await this.app.vault.adapter.exists(this.absWorkspacePath)) {
				await this.app.vault.adapter.mkdir(this.absWorkspacePath);
			}

			const existsResult = await workspaceService.workspaceExists(this.absWorkspacePath);
			if (existsResult.success && !existsResult.data) {
				const initResult = await workspaceService.initWorkspace(this.absWorkspacePath);
				if (!initResult.success) {
					console.error('[MDFriday Sync Mobile] Failed to initialize workspace:', initResult.error);
				}
			} else if (!existsResult.success) {
				console.error('[MDFriday Sync Mobile] Failed to check workspace existence:', existsResult.error);
			}

			if (this.foundryLicenseService && this.foundryAuthService && this.foundryGlobalConfigService) {
				this.licenseServiceManager = new LicenseServiceManager(
					this.foundryLicenseService,
					this.foundryAuthService,
					this.foundryGlobalConfigService,
					this.absWorkspacePath
				);
			}

			if (this.foundryLicenseService && this.foundryAuthService) {
				this.licenseState = new LicenseStateManager(
					this.foundryLicenseService,
					this.foundryAuthService,
					null, // domainService = null (sync-only plugin)
					this.absWorkspacePath
				);

				const initResult = await this.licenseState.initialize();
				if (initResult.isActivated) {
					await this.syncLicenseToSettings();
				} else if (initResult.error) {
					console.warn('[MDFriday Sync Mobile] License initialization error:', initResult.error);
				}
			}

			if (this.foundryAuthService) {
				try {
					const configResult = await this.foundryAuthService.getConfig(this.absWorkspacePath);
					if (configResult.success && configResult.data) {
						if (!this.settings.enterpriseServerUrl && configResult.data.apiUrl) {
							this.settings.enterpriseServerUrl = configResult.data.apiUrl;
						}
					}
				} catch (error) {
					console.error('[MDFriday Sync Mobile] Error loading enterprise server URL:', error);
				}
			}
		} catch (error) {
			console.error('[MDFriday Sync Mobile] Error initializing workspace:', error);
		}
	}

	onunload() {
		// Clean up sync status display
		if (this.syncStatusDisplay) {
			this.syncStatusDisplay.onunload();
			this.syncStatusDisplay = null;
		}

		// Stop sync service
		if (this.syncService) {
			void this.syncService.stopSync(); // fire-and-forget: onunload must not return a Promise
		}
	}

	/**
	 * Initialize Sync Service with current settings.
	 * Identical to the original Friday plugin implementation.
	 */
	async initializeSyncService() {
		try {
			// Clean up existing status display before creating new one
			if (this.syncStatusDisplay) {
				this.syncStatusDisplay.onunload();
				this.syncStatusDisplay = null;
			}

			this.syncService = new SyncService(this);

			// Initialize status display
			this.syncStatusDisplay = new SyncStatusDisplay(this);

			// Initialize if sync is enabled
			if (this.settings.syncEnabled && this.settings.syncConfig) {
				const initialized = await this.syncService.initialize(this.settings.syncConfig);

				// Connect status display to sync core after initialization
				if (initialized && this.syncService.syncCore && this.syncStatusDisplay) {
					this.syncStatusDisplay.setCore(this.syncService.syncCore);
					this.syncStatusDisplay.initialize();

					// Connect status display to core for progress tracking
					this.syncService.syncCore.setStatusDisplay(this.syncStatusDisplay);

					// Connect log callback to status display
					this.syncService.syncCore.setLogCallback((message, level, key) => {
						this.syncStatusDisplay?.addLog(message, level, key);
					});

					// Start LiveSync (continuous replication) by default
					if (this.settings.syncConfig.syncOnStart) {
						await this.syncService.startSync(true); // true = liveSync mode
					}
				}
			} else if (this.syncStatusDisplay) {
				// Initialize status display even if sync is not enabled
				this.syncStatusDisplay.initialize();
			}
		} catch (error) {
			console.error('[MDFriday Sync] Error initializing sync service:', error);
		}
	}

	/**
	 * Clear sync database (IndexedDB) and related localStorage data to start fresh.
	 * Identical to the original Friday plugin implementation.
	 */
	async clearSyncDatabase(): Promise<void> {
		try {
			// @ts-ignore - accessing internal Obsidian API
			const vaultName = this.app.vault.getName() || "friday-vault";

			const SuffixDatabaseName = "-livesync-v2";
			const indexedDBName = `_pouch_${vaultName}${SuffixDatabaseName}`;

			// Step 1: Clear localStorage items with sync-related prefixes
			this.clearSyncLocalStorage();

			// Step 2: Delete the IndexedDB database
			return new Promise((resolve, reject) => {
				const deleteRequest = indexedDB.deleteDatabase(indexedDBName);

				deleteRequest.onsuccess = () => {
					resolve();
				};

				deleteRequest.onerror = (event) => {
					console.error(`[MDFriday Sync] Error deleting IndexedDB: ${indexedDBName}`, event);
					reject(new Error(`Failed to delete database: ${indexedDBName}`));
				};

				deleteRequest.onblocked = () => {
					console.warn(`[MDFriday Sync] Delete blocked for IndexedDB: ${indexedDBName}`);
					resolve();
				};
			});
		} catch (error) {
			console.error('[MDFriday Sync] Error in clearSyncDatabase:', error);
			throw error;
		}
	}

	/**
	 * Clear sync-related localStorage items.
	 */
	private clearSyncLocalStorage(): void {
		try {
			const keysToRemove: string[] = [];
			for (let i = 0; i < window.localStorage.length; i++) {
				const key = window.localStorage.key(i);
				if (key && (key.startsWith('friday-kv-') || key.startsWith('friday-friday-sync-salt-'))) {
					keysToRemove.push(key);
				}
			}
			keysToRemove.forEach(key => {
				window.localStorage.removeItem(key);
			});
		} catch (error) {
			console.warn('[MDFriday Sync] Error clearing sync localStorage:', error);
		}
	}

	/**
	 * Test CouchDB Sync connection.
	 */
	async testSyncConnection(): Promise<{ success: boolean; message: string }> {
		if (!this.syncService || !this.syncService.isInitialized) {
			this.syncService = new SyncService(this);
			await this.syncService.initialize(this.settings.syncConfig);
		}
		return await this.syncService.testConnection();
	}

	isValidLicenseKeyFormat(licenseKey: string): boolean {
		return isValidLicenseKeyFormat(licenseKey);
	}

	/**
	 * Sync license state from Foundry to Obsidian settings.
	 * Identical to the original Friday plugin implementation.
	 */
	async syncLicenseToSettings(): Promise<void> {
		if (!this.licenseState) {
			return;
		}

		try {
			const licenseInfo = this.licenseState.getLicenseInfo();
			const authStatus = this.licenseState.getAuthStatus();

			// Update license data (for UI display)
			if (licenseInfo) {
				this.settings.license = {
					key: this.licenseState.getLicenseKey() || '',
					plan: licenseInfo.plan,
					expiresAt: licenseInfo.expiresAt || 0,
					features: {
						...licenseInfo.features,
						validityDays: licenseInfo.features?.validityDays || 365
					},
					activatedAt: Date.now()
				};
			}

			// Update user data (for UI display)
			if (authStatus?.email) {
				this.settings.licenseUser = {
					email: authStatus.email,
					userDir: this.licenseState.getUserDir() || ''
				};
			}

			// Update sync config data (for UI display)
			if (this.licenseState.hasSyncConfig()) {
				const syncConfig = this.licenseState.getSyncConfig();
				if (syncConfig) {
					this.settings.licenseSync = {
						enabled: true,
						endpoint: syncConfig.dbEndpoint,
						dbName: syncConfig.dbName,
						email: syncConfig.email,
						dbPassword: syncConfig.dbPassword || ''
					};
				}
			}

		} catch (error) {
			console.error('[MDFriday Sync] Error syncing license to settings:', error);
		}
	}

	/**
	 * Refresh license usage information from API.
	 */
	async refreshLicenseUsage() {
		if (!this.licenseServiceManager) {
			return;
		}

		const { license } = this.settings;

		if (!license || isLicenseExpired(license.expiresAt)) {
			return;
		}

		try {
			const result = await this.licenseServiceManager.getLicenseUsage();

			if (result.success && result.data) {
				const usage = result.data;

				if (usage.disk) {
					this.settings.licenseUsage = {
						totalDiskUsage: usage.disk.totalUsage || 0,
						maxStorage: usage.disk.maxStorage || 1024,
						unit: usage.disk.unit || 'MB',
						lastUpdated: Date.now()
					};

					await this.saveData(this.settings);
				}
			}
		} catch (error) {
			console.warn('[MDFriday Sync] Failed to fetch license usage:', error);
		}
	}

	/**
	 * No-op: domain management is not part of this sync-only plugin.
	 */
	async refreshSubdomainInfo(): Promise<void> {}

		async loadSettings() {
			const savedData = await this.loadData() as Partial<SyncPluginSettings> | null;
			this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);
		this.initializeDefaultIgnorePatterns();
	}

	/**
	 * Initialize default sync ignore patterns.
	 * Identical to the original Friday plugin implementation.
	 */
	private initializeDefaultIgnorePatterns(): void {
		// Initialize selectiveSync with defaults if not exists
		if (!this.settings.syncConfig.selectiveSync) {
			this.settings.syncConfig.selectiveSync = {
				syncImages: false,
				syncAudio: false,
				syncVideo: false,
				syncPdf: false,
				syncThemes: false,
				syncSnippets: false,
				syncPlugins: false,
			};
		}

		// Initialize ignorePatterns as empty array if not set
		if (!this.settings.syncConfig.ignorePatterns) {
			this.settings.syncConfig.ignorePatterns = [];
		}

		// Build internal ignore patterns using the vault's actual config directory
		const selectiveSync = this.settings.syncConfig.selectiveSync;
		const configDir = this.app.vault.configDir;
		const c = configDir.replace(/\./g, '\\.').replace(/\//g, '\\/');
		const defaultInternalPatterns = [
			`${c}\\/workspace`,
			`${c}\\/workspace\\.json`,
			`${c}\\/workspace-mobile\\.json`,
			`${c}\\/cache`,
			"\\/node_modules\\/",
			"\\/\\.git\\/",
			"^\\.git\\/",
			"plugins\\/mdfriday-sync",
		];

		let internalPatterns = [...defaultInternalPatterns];

		if (!(selectiveSync.syncThemes ?? true)) {
			internalPatterns.push(`${c}\\/themes`);
		}
		if (!(selectiveSync.syncSnippets ?? true)) {
			internalPatterns.push(`${c}\\/snippets`);
		}
		if (!(selectiveSync.syncPlugins ?? true)) {
			internalPatterns.push(`${c}\\/plugins`);
		}

		if (!this.settings.syncConfig.syncInternalFilesIgnorePatterns) {
			this.settings.syncConfig.syncInternalFilesIgnorePatterns = internalPatterns.join(", ");
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
