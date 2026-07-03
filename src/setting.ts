import {App, PluginSettingTab, Setting, Notice, Platform} from 'obsidian';
import type MdfridaySyncPlugin from './main';
import {generateEncryptionPassphrase, maskLicenseKey, formatPlanName} from "./license";
import {clearHandlers as clearSyncHandlerCache} from "./sync/core/replication/SyncParamsHandler";

export class MdfridaySyncSettingTab extends PluginSettingTab {
	plugin: MdfridaySyncPlugin;
	private isActivating: boolean = false;
	private activationError: string = '';
	private firstTimeSync: boolean = false;
	private isRefreshingLicenseInfo: boolean = false;
	private lastLicenseInfoRefresh: number = 0;

	constructor(app: App, plugin: MdfridaySyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Format storage size for display
	 * @param sizeMB Size in MB
	 * @returns Formatted string (e.g. "6.16 MB", "1.5 GB")
	 */
	private formatStorageSize(sizeMB: number): string {
		if (sizeMB >= 1024) {
			return `${(sizeMB / 1024).toFixed(2)} GB`;
		}
		return `${sizeMB.toFixed(2)} MB`;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		const {license, licenseSync} = this.plugin.settings;
		
		// =========================================
		// License Section (Always at top - both platforms)
		// =========================================
		this.renderLicenseSection(containerEl);

		// If license is activated and sync is available, show Sync section (both platforms)
		if (license && licenseSync?.enabled) {
			this.renderSyncSection(containerEl);
		}

		// =========================================
		// Desktop-only settings
		// =========================================
		// Enterprise Settings (both platforms)
		this.renderEnterpriseSettings(containerEl);
	}

	/**
	 * Render Publish Settings Section (Desktop only)
	 */
	/**
	 * Render General Settings Section (Desktop only)
	 */
	/**
	 * Render Enterprise Settings Section (All platforms)
	 * For enterprise users to configure custom server URL
	 */
	private renderEnterpriseSettings(containerEl: HTMLElement): void {
		const { enterpriseServerUrl } = this.plugin.settings;

		// =========================================
		// Enterprise Settings Section (at the bottom)
		// =========================================
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enterprise_settings'))
			.setHeading()
			.settingEl.addClass('friday-section-title');

		// Enterprise Server URL Setting
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enterprise_server_url'))
			.setDesc(this.plugin.i18n.t('settings.enterprise_server_url_desc'))
			.addText((text) => {
				text
					.setPlaceholder('https://your-enterprise-server.com')
					.setValue(enterpriseServerUrl || '')
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						this.plugin.settings.enterpriseServerUrl = trimmedValue;
						await this.plugin.saveSettings();
						
						// Also update to Foundry AuthService config
						if (this.plugin.foundryAuthService && this.plugin.absWorkspacePath) {
							try {
								const configResult = await this.plugin.foundryAuthService.updateConfig(
									this.plugin.absWorkspacePath,
									{
										apiUrl: trimmedValue || undefined
									}
								);
								
								if (!configResult.success) {
									console.error('[Friday] Failed to update enterprise server URL to Foundry:', configResult.error);
								}
							} catch (error) {
								console.error('[Friday] Error updating enterprise server URL to Foundry:', error);
							}
						}
					});
				text.inputEl.addClass('friday-input-full-width');
			});
	}

	/**
	 * Render License Section
	 * Shows license key input when not activated, or license status when activated
	 * 
	 * Uses licenseState as the single source of truth
	 */
	private renderLicenseSection(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.license'))
			.setHeading()
			.settingEl.addClass('friday-section-title');

		// Use licenseState for all license-related checks
		if (this.plugin.licenseState?.isActivated() && !this.plugin.licenseState.isExpired()) {
			// ========== License Active State ==========
			
			const licenseInfo = this.plugin.licenseState.getLicenseInfo();
			if (!licenseInfo) {
				console.warn('[Settings] License is activated but no license info available');
				return;
			}
			
			// Row 1: License Key (masked) + Valid Until + Plan Badge (clickable)
			const licenseKeySetting = new Setting(containerEl)
				.setName(maskLicenseKey(this.plugin.licenseState.getLicenseKey() || ''))
				.setDesc(this.plugin.i18n.t('settings.valid_until') + ': ' + licenseInfo.expires);
			
			// Add clickable plan badge to the right
			const planBadge = licenseKeySetting.controlEl.createSpan({
				cls: `friday-plan-badge ${licenseInfo.plan.toLowerCase()} clickable`,
				text: formatPlanName(licenseInfo.plan)
			});
			
			// Make plan badge clickable to refresh license info
			planBadge.title = this.plugin.i18n.t('settings.click_to_refresh_license_info') || 'Click to refresh license info';
			
			planBadge.addEventListener('click', async () => {
				// Check 5 second cooldown
				const now = Date.now();
				if (this.isRefreshingLicenseInfo || (now - this.lastLicenseInfoRefresh < 5000)) {
					return;
				}
				
				// Set refreshing state
				this.isRefreshingLicenseInfo = true;
				this.lastLicenseInfoRefresh = now;
				
				// Update UI to show loading state
				const originalText = planBadge.textContent || '';
				planBadge.textContent = this.plugin.i18n.t('settings.refreshing') || 'Refreshing...';
				planBadge.addClass('refreshing');
				
				try {
					// Refresh from Foundry
					await this.plugin.licenseState?.refresh();
					
					// Sync to settings (for UI display)
					await this.plugin.syncLicenseToSettings();
					
					// Refresh usage data (if still using old method)
					await this.plugin.refreshLicenseUsage();

					// Refresh subdomain info if applicable
					await this.plugin.refreshSubdomainInfo();
					
					// Show success notification
					new Notice(this.plugin.i18n.t('settings.license_info_refreshed') || 'License info updated');
					
					// Refresh display to show updated data
					this.display();
				} catch (error) {
					// Show error notification
					new Notice(this.plugin.i18n.t('settings.refresh_failed') || 'Failed to refresh license info');
					console.error('Failed to refresh license info:', error);
					
					// Restore original state
					planBadge.textContent = originalText;
					planBadge.removeClass('refreshing');
				} finally {
					this.isRefreshingLicenseInfo = false;
				}
			});

			// Add "Pricing Details" button next to the Plan Badge (only for Free plan)
			if (licenseInfo.plan.toLowerCase() === 'free') {
				const pricingBtn = licenseKeySetting.controlEl.createEl('button', {
					cls: 'friday-premium-btn',
					text: this.plugin.i18n.t('settings.pricing_details') || '套餐详情'
				});
				
				pricingBtn.addEventListener('click', () => {
					window.open('https://mdfriday.com/pricing.html', '_blank');
				});
			}

			// Row 2: Storage Usage
			const usage = this.plugin.settings.licenseUsage;
			const usedStorage = usage?.totalDiskUsage || 0;
			const maxStorage = this.plugin.licenseState.getMaxStorage();
			const usagePercentage = maxStorage > 0 ? (usedStorage / maxStorage) * 100 : 0;
			
			const storageSetting = new Setting(containerEl)
				.setName(this.plugin.i18n.t('settings.storage_usage'))
				.setDesc(this.plugin.i18n.t('settings.storage_usage_desc'));
			
			// Create progress bar container
			const progressContainer = storageSetting.controlEl.createDiv({ cls: 'friday-storage-progress-container' });
			
			// Usage text
			const usageText = progressContainer.createDiv({ cls: 'friday-storage-usage-text' });
			usageText.setText(this.formatStorageSize(usedStorage) + ' / ' + this.formatStorageSize(maxStorage));
			
			// Progress bar
			const progressBarOuter = progressContainer.createDiv({ cls: 'friday-storage-progress-bar' });
			const progressBarInner = progressBarOuter.createDiv({ cls: 'friday-storage-progress-fill' });
			progressBarInner.style.width = `${Math.min(usagePercentage, 100).toFixed(1)}%`;

		} else {
			// ========== License Input State ==========
			let inputEl: HTMLInputElement;
			let activateBtn: HTMLButtonElement;
			let statusEl: HTMLElement;

			const licenseSetting = new Setting(containerEl)
				.setName(this.plugin.i18n.t('settings.license_key'))
				.setDesc(this.plugin.i18n.t('settings.license_key_placeholder'))
				.addText((text) => {
					inputEl = text.inputEl;
					text
						.setPlaceholder(this.plugin.i18n.t('settings.license_key_placeholder'))
						.onChange((value) => {
							// Auto uppercase
							text.setValue(value.toUpperCase());
						});
				})
				.addButton((button) => {
					activateBtn = button.buttonEl;
					button
						.setButtonText(this.plugin.i18n.t('settings.activate'))
						.setCta()
						.onClick(async () => {
							const licenseKey = inputEl.value.trim().toUpperCase();

							// Clear previous status
							if (statusEl) {
								statusEl.setText('');
								statusEl.removeClass('friday-license-error', 'friday-license-success');
							}

							// Validate format
							if (!this.plugin.isValidLicenseKeyFormat(licenseKey)) {
								statusEl.setText(this.plugin.i18n.t('settings.license_invalid_format'));
								statusEl.addClass('friday-license-error');
								return;
							}

							// Start activation
							activateBtn.setText(this.plugin.i18n.t('settings.activating'));
							activateBtn.disabled = true;
							inputEl.disabled = true;

							try {
								await this.activateLicense(licenseKey);
								
								// Success - refresh the entire settings display
								new Notice(this.plugin.i18n.t('settings.license_activated_success'));
								this.display();
							} catch (error) {
								// Show error
								statusEl.setText(this.plugin.i18n.t('settings.license_activation_failed'));
								statusEl.addClass('friday-license-error');
								console.error('License activation error:', error);
							} finally {
								activateBtn.setText(this.plugin.i18n.t('settings.activate'));
								activateBtn.disabled = false;
								inputEl.disabled = false;
							}
						});
				});

			// Add "Pricing Details" button next to the Activate button
			const pricingBtn = licenseSetting.controlEl.createEl('button', {
				cls: 'friday-premium-btn',
				text: this.plugin.i18n.t('settings.pricing_details') || '套餐详情'
			});
			
			pricingBtn.addEventListener('click', () => {
				window.open('https://mdfriday.com/pricing.html', '_blank');
			});

			// Add status element
			statusEl = licenseSetting.descEl.createSpan({cls: 'friday-license-status-text'});
			
			// ========== Trial License Request State ==========
			let trialEmailEl: HTMLInputElement;
			let trialRequestBtn: HTMLButtonElement;
			let trialStatusEl: HTMLElement;
			
			const trialSetting = new Setting(containerEl)
				.setName(this.plugin.i18n.t('settings.trial_license'))
				.setDesc(this.plugin.i18n.t('settings.trial_email'))
				.addText((text) => {
					trialEmailEl = text.inputEl;
					text
						.setPlaceholder(this.plugin.i18n.t('settings.trial_email_placeholder'))
						.setValue('');
				})
				.addButton((button) => {
					trialRequestBtn = button.buttonEl;
					button
						.setButtonText(this.plugin.i18n.t('settings.trial_request'))
						.onClick(async () => {
							const email = trialEmailEl.value.trim();
							
							// Clear previous status
							if (trialStatusEl) {
								trialStatusEl.setText('');
								trialStatusEl.removeClass('friday-license-error', 'friday-license-success');
							}
							
							// Validate email format
							const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
							if (!email || !emailRegex.test(email)) {
								trialStatusEl.setText(this.plugin.i18n.t('settings.trial_invalid_email'));
								trialStatusEl.addClass('friday-license-error');
								return;
							}
							
							// Start trial request
							trialRequestBtn.setText(this.plugin.i18n.t('settings.trial_requesting'));
							trialRequestBtn.disabled = true;
							trialEmailEl.disabled = true;
							
						try {
							// Use Foundry License Service
							if (!this.plugin.licenseServiceManager) {
								throw new Error('License service not available');
							}
							
							// Step 1: Request trial license
							const result = await this.plugin.licenseServiceManager.requestTrial(email);
							
							if (result.success && result.data?.licenseKey) {
								const licenseKey = result.data.licenseKey;
								
								// Fill the license key in the input (for user reference)
								inputEl.value = licenseKey;
								
								// Show trial request success
								trialStatusEl.setText(this.plugin.i18n.t('settings.trial_request_success'));
								trialStatusEl.addClass('friday-license-success');
								
								// Step 2: Automatically activate the trial license
								try {
									await this.activateLicense(licenseKey);
									
									// Show activation success
									new Notice(this.plugin.i18n.t('settings.license_activated_success'));
									
									// Clear the email field
									trialEmailEl.value = '';
									
									// Refresh display to show activated license
									this.display();
								} catch (activationError) {
									// If activation fails, still show trial request success
									// User can manually click the activate button
									console.error('Auto-activation failed:', activationError);
									new Notice(this.plugin.i18n.t('settings.trial_request_success'));
									
									// Refresh display to show the activate button
									this.display();
								}
							} else {
								throw new Error(result.error || 'Invalid trial response');
							}
						} catch (error) {
							// Show error
							trialStatusEl.setText(this.plugin.i18n.t('settings.trial_request_failed'));
							trialStatusEl.addClass('friday-license-error');
							console.error('Trial license request error:', error);
						} finally {
							trialRequestBtn.setText(this.plugin.i18n.t('settings.trial_request'));
							trialRequestBtn.disabled = false;
							trialEmailEl.disabled = false;
						}
						});
				});
			
			// Add trial status element
			trialStatusEl = trialSetting.descEl.createSpan({cls: 'friday-license-status-text'});
		}
	}

	/**
	 * Render Sync Section (only shown when license is activated)
	 * Includes Security subsection and Selective Sync subsection
	 * Users must explicitly enable sync via the toggle switch
	 */
	private renderSyncSection(containerEl: HTMLElement): void {
		const license = this.plugin.settings.license;
		const licenseSync = this.plugin.settings.licenseSync;

		if (!license || !licenseSync?.enabled) return;

		// Create sync section header with toggle switch
		const syncHeaderContainer = containerEl.createDiv('friday-sync-header-container');
		new Setting(syncHeaderContainer)
			.setName(this.plugin.i18n.t('settings.sync'))
			.setHeading()
			.settingEl.addClass('friday-section-title');

		// Add toggle switch to the right of the header
		const toggleContainer = syncHeaderContainer.createDiv('friday-sync-toggle-container');
		let syncToggle: HTMLInputElement;
		
		const toggleWrapper = toggleContainer.createDiv('friday-sync-toggle-wrapper');
		toggleWrapper.createSpan({text: this.plugin.i18n.t('settings.sync_enable'), cls: 'friday-sync-toggle-label'});
		
		const toggleElement = toggleWrapper.createEl('label', {cls: 'friday-sync-switch'});
		syncToggle = toggleElement.createEl('input', {type: 'checkbox'});
		syncToggle.checked = this.plugin.settings.syncUserEnabled || false;
		toggleElement.createSpan({cls: 'friday-sync-slider'});
		
		// Container for all sync settings (shown only when enabled)
		const syncContentContainer = containerEl.createDiv('friday-sync-content-container');
		syncContentContainer.style.display = this.plugin.settings.syncUserEnabled ? 'block' : 'none';
		
		// Handle toggle change
		syncToggle.addEventListener('change', async () => {
			const enabled = syncToggle.checked;
			this.plugin.settings.syncUserEnabled = enabled;
			this.plugin.settings.syncEnabled = enabled;
			
			await this.plugin.saveSettings();
			
			if (enabled) {
				// Initialize sync service when enabled
				try {
					await this.plugin.initializeSyncService();
					new Notice(this.plugin.i18n.t('settings.sync_enabled_success') || 'Sync enabled');
					// Refresh display to show sync content
					this.display();
				} catch (error) {
					console.error('Failed to initialize sync service:', error);
					new Notice(this.plugin.i18n.t('settings.sync_enable_failed') || 'Failed to enable sync');
					syncToggle.checked = false;
					this.plugin.settings.syncUserEnabled = false;
					this.plugin.settings.syncEnabled = false;
					await this.plugin.saveSettings();
				}
			} else {
				// Close sync service when disabled
				try {
					if (this.plugin.syncService?.isInitialized) {
						await this.plugin.syncService.close();
					}
					new Notice(this.plugin.i18n.t('settings.sync_disabled_success') || 'Sync disabled');
					// Refresh display to hide sync content
					this.display();
				} catch (error) {
					console.error('Failed to close sync service:', error);
				}
			}
		});
		
		// If sync is not enabled, show a message and return
		if (!this.plugin.settings.syncUserEnabled) {
			const enableMessage = syncContentContainer.createDiv('friday-sync-enable-message');
			enableMessage.createEl('p', {
				text: this.plugin.i18n.t('settings.sync_enable_message') || 'Please enable sync using the toggle above to start syncing your vault.',
				cls: 'friday-sync-info-text'
			});
			return;
		}

		// ========== Security Subsection (moved to syncContentContainer) ==========
		const securityContainer = syncContentContainer.createDiv('friday-security-container');
		new Setting(securityContainer)
			.setName(this.plugin.i18n.t('settings.security'))
			.setHeading();

		// Encryption Password (editable for non-first-time, readonly for first-time with show/hide)
		let passwordVisible = false;
		const encryptionPassphrase = this.plugin.settings.encryptionPassphrase;
		
		if (this.firstTimeSync && encryptionPassphrase) {
			// First time: show readonly password with show/hide toggle
			new Setting(securityContainer)
				.setName(this.plugin.i18n.t('settings.encryption_password'))
				.setDesc(this.plugin.i18n.t('settings.encryption_enabled'))
				.addText((text) => {
					text.inputEl.type = 'password';
					text.inputEl.readOnly = true;
					text.setValue(encryptionPassphrase);
				})
				.addButton((button) => {
					button
						.setButtonText(this.plugin.i18n.t('settings.show_password'))
						.onClick(() => {
							passwordVisible = !passwordVisible;
							const inputEl = button.buttonEl.parentElement?.querySelector('input');
							if (inputEl) {
								inputEl.type = passwordVisible ? 'text' : 'password';
							}
							button.setButtonText(passwordVisible 
								? this.plugin.i18n.t('settings.hide_password') 
								: this.plugin.i18n.t('settings.show_password')
							);
						});
				});
		} else {
			// Non-first-time: editable password field
			new Setting(securityContainer)
				.setName(this.plugin.i18n.t('settings.encryption_password'))
				.setDesc(this.plugin.i18n.t('settings.encryption_password_desc'))
				.addText((text) => {
					text.inputEl.type = 'password';
					text.inputEl.placeholder = this.plugin.i18n.t('settings.encryption_password_placeholder');
					text.setValue(encryptionPassphrase || '');
					text.onChange(async (value) => {
						this.plugin.settings.encryptionPassphrase = value;
						this.plugin.settings.syncConfig.passphrase = value;
						await this.plugin.saveSettings();
					});
				})
				.addButton((button) => {
					button
						.setButtonText(this.plugin.i18n.t('settings.show_password'))
						.onClick(() => {
							passwordVisible = !passwordVisible;
							const inputEl = button.buttonEl.parentElement?.querySelector('input');
							if (inputEl) {
								inputEl.type = passwordVisible ? 'text' : 'password';
							}
							button.setButtonText(passwordVisible 
								? this.plugin.i18n.t('settings.hide_password') 
								: this.plugin.i18n.t('settings.show_password')
							);
						});
				});
		}

		// First time sync - Upload option (in security container)
		if (this.firstTimeSync) {
			new Setting(securityContainer)
				.setName(this.plugin.i18n.t('settings.sync_first_time_title'))
				.setDesc(this.plugin.i18n.t('settings.sync_description'))
				.addButton((button) => {
					button
						.setButtonText(this.plugin.i18n.t('settings.upload_local_to_cloud'))
						.setCta()
						.onClick(async () => {
							button.setButtonText(this.plugin.i18n.t('settings.sync_uploading'));
							button.setDisabled(true);
							try {
								if (!this.plugin.syncService.isInitialized) {
									await this.plugin.syncService.initialize(this.plugin.settings.syncConfig);
								}
								await this.plugin.syncService.rebuildRemote();
								
								// Restart LiveSync after rebuildRemote (which terminates existing sync)
								// This ensures continuous sync is running for new file changes
								if (this.plugin.settings.syncConfig?.syncOnStart) {
									await this.plugin.syncService.startSync(true);
								}
								
								new Notice(this.plugin.i18n.t('settings.sync_upload_success'));
								this.firstTimeSync = false;
								this.display();
							} catch (error) {
								new Notice(this.plugin.i18n.t('settings.sync_operation_failed'));
								button.setButtonText(this.plugin.i18n.t('settings.upload_local_to_cloud'));
								button.setDisabled(false);
							}
						});
				});
		} else {
			// Non-first-time - Download option with IndexedDB cleanup (in security container)
			new Setting(securityContainer)
				.setName(this.plugin.i18n.t('settings.sync_data_available'))
				.setDesc(this.plugin.i18n.t('settings.sync_description'))
				.addButton((button) => {
					button
						.setButtonText(this.plugin.i18n.t('settings.download_from_cloud'))
						.setCta()
						.onClick(async () => {
							// Validate passphrase is entered
							if (!this.plugin.settings.encryptionPassphrase) {
								new Notice(this.plugin.i18n.t('settings.encryption_password_required'));
								return;
							}

							button.setButtonText(this.plugin.i18n.t('settings.sync_downloading'));
							button.setDisabled(true);
							try {
								// Close existing sync service if initialized
								if (this.plugin.syncService?.isInitialized) {
									await this.plugin.syncService.close();
								}

								// Clear IndexedDB to start fresh
								await this.plugin.clearSyncDatabase();

								// Re-initialize sync service with the passphrase
								await this.plugin.initializeSyncService();

								// Fetch from server
								if (this.plugin.syncService.isInitialized) {
									await this.plugin.syncService.fetchFromServer();
									new Notice(this.plugin.i18n.t('settings.sync_download_success'));
									this.display();
								} else {
									throw new Error('Sync service initialization failed');
								}
							} catch (error) {
								console.error('Download failed:', error);
								new Notice(`${this.plugin.i18n.t('settings.sync_operation_failed')}: ${error.message || error}`);
								button.setButtonText(this.plugin.i18n.t('settings.download_from_cloud'));
								button.setDisabled(false);
							}
						});
				});
		}

		// ========== Selective Sync Subsection (Collapsible) ==========
		const selectiveSyncDetails = syncContentContainer.createEl('details', {cls: 'friday-security-container'});
		selectiveSyncDetails.createEl('summary', {text: this.plugin.i18n.t('settings.selective_sync'), cls: 'friday-collapsible-header'});
		
		const selectiveSyncContainer = selectiveSyncDetails.createDiv('friday-collapsible-content');

		// Initialize syncConfig.selectiveSync if not exists
		if (!this.plugin.settings.syncConfig.selectiveSync) {
			this.plugin.settings.syncConfig.selectiveSync = {
				syncImages: false,
				syncAudio: false,
				syncVideo: false,
				syncPdf: false,
				syncThemes: false,
				syncSnippets: false,
				syncPlugins: false,
			};
		}
		const selectiveSync = this.plugin.settings.syncConfig.selectiveSync;

		// Sync Images
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.sync_images'))
			.setDesc(this.plugin.i18n.t('settings.sync_images_desc'))
			.addToggle((toggle) => {
				toggle.setValue(selectiveSync.syncImages ?? true);
				toggle.onChange(async (value) => {
					selectiveSync.syncImages = value;
					await this.plugin.saveSettings();
					await this.updateSelectiveSyncSettings();
				});
			});

		// Sync Audio
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.sync_audio'))
			.setDesc(this.plugin.i18n.t('settings.sync_audio_desc'))
			.addToggle((toggle) => {
				toggle.setValue(selectiveSync.syncAudio ?? false);
				toggle.onChange(async (value) => {
					selectiveSync.syncAudio = value;
					await this.plugin.saveSettings();
					await this.updateSelectiveSyncSettings();
				});
			});

		// Sync Video
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.sync_video'))
			.setDesc(this.plugin.i18n.t('settings.sync_video_desc'))
			.addToggle((toggle) => {
				toggle.setValue(selectiveSync.syncVideo ?? false);
				toggle.onChange(async (value) => {
					selectiveSync.syncVideo = value;
					await this.plugin.saveSettings();
					await this.updateSelectiveSyncSettings();
				});
			});

		// Sync PDF
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.sync_pdf'))
			.setDesc(this.plugin.i18n.t('settings.sync_pdf_desc'))
			.addToggle((toggle) => {
				toggle.setValue(selectiveSync.syncPdf ?? false);
				toggle.onChange(async (value) => {
					selectiveSync.syncPdf = value;
					await this.plugin.saveSettings();
					await this.updateSelectiveSyncSettings();
				});
			});

		// Sync Themes
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.sync_themes'))
			.setDesc(this.plugin.i18n.t('settings.sync_themes_desc'))
			.addToggle((toggle) => {
				toggle.setValue(selectiveSync.syncThemes ?? true);
				toggle.onChange(async (value) => {
					selectiveSync.syncThemes = value;
					await this.plugin.saveSettings();
					await this.updateSelectiveSyncSettings();
				});
			});

		// Sync Snippets
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.sync_snippets'))
			.setDesc(this.plugin.i18n.t('settings.sync_snippets_desc'))
			.addToggle((toggle) => {
				toggle.setValue(selectiveSync.syncSnippets ?? true);
				toggle.onChange(async (value) => {
					selectiveSync.syncSnippets = value;
					await this.plugin.saveSettings();
					await this.updateSelectiveSyncSettings();
				});
			});

		// Sync Plugins
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.sync_plugins'))
			.setDesc(this.plugin.i18n.t('settings.sync_plugins_desc'))
			.addToggle((toggle) => {
				toggle.setValue(selectiveSync.syncPlugins ?? true);
				toggle.onChange(async (value) => {
					selectiveSync.syncPlugins = value;
					await this.plugin.saveSettings();
					await this.updateSelectiveSyncSettings();
				});
			});

		// Ignore Patterns setting - dynamic list using native Setting components
		const currentPatterns = this.plugin.settings.syncConfig?.ignorePatterns || [];
		
		// Container for pattern rows (inserted after the header setting)
		const patternsListContainer = selectiveSyncContainer.createDiv();
		
		// Helper function to save all patterns
		const savePatterns = async () => {
			const patterns: string[] = [];
			const inputs = patternsListContainer.querySelectorAll<HTMLInputElement>('input[type="text"]');
			inputs.forEach((input) => {
				const value = input.value.trim();
				if (value) {
					patterns.push(value);
				}
			});
			
			this.plugin.settings.syncConfig.ignorePatterns = patterns;
			await this.plugin.saveSettings();
			
			if (this.plugin.syncService?.isInitialized) {
				this.plugin.syncService.updateIgnorePatterns(patterns);
			}
		};
		
		// Helper function to create a pattern row using native Setting
		const createPatternRow = (pattern: string = '') => {
			const setting = new Setting(patternsListContainer)
				.setDesc(this.plugin.i18n.t('settings.ignore_patterns_custom_rule'))
				.addText((text) => {
					text.setPlaceholder(this.plugin.i18n.t('settings.ignore_patterns_placeholder'));
					text.setValue(pattern);
					text.onChange(() => savePatterns());
				})
				.addExtraButton((button) => {
					button
						.setIcon('trash-2')
						.setTooltip(this.plugin.i18n.t('settings.ignore_patterns_delete'))
						.onClick(() => {
							setting.settingEl.remove();
							savePatterns();
						});
				});
		};
		
		// Header row with title and add button
		new Setting(selectiveSyncContainer)
			.setName(this.plugin.i18n.t('settings.ignore_patterns'))
			.setDesc(this.plugin.i18n.t('settings.ignore_patterns_desc'))
			.addButton((button) => {
				button
					.setButtonText(this.plugin.i18n.t('settings.ignore_patterns_add'))
					.onClick(() => {
						createPatternRow('');
					});
			});
		
		// Move the list container after the header setting
		selectiveSyncContainer.appendChild(patternsListContainer);
		
		// Initialize with existing patterns
		currentPatterns.forEach((pattern) => {
			createPatternRow(pattern);
		});
		
		// ========== Danger Zone ==========
		this.renderDangerZone(syncContentContainer);
	}

	/**
	 * Update selective sync settings
	 * 
	 * This method handles:
	 * 1. selectiveSync: Controls file type sync (images, audio, video, PDF) - directly via settings
	 * 2. syncInternalFilesIgnorePatterns: Controls .obsidian folder sync (themes, plugins)
	 * 
	 * Note: ignorePatterns is separate and only for user-defined patterns (folders, custom rules)
	 */
	private async updateSelectiveSyncSettings(): Promise<void> {
		const selectiveSync = this.plugin.settings.syncConfig.selectiveSync;
		if (!selectiveSync) return;

		// Build internal ignore patterns using the vault's actual config directory
		const configDir = this.plugin.app?.vault?.configDir ?? '.obsidian';
		const c = configDir.replace(/\./g, '\\.').replace(/\//g, '\\/');
		const defaultInternalPatterns = [
			`${c}\\/workspace`,
			`${c}\\/workspace\\.json`,
			`${c}\\/workspace-mobile\\.json`,
			`${c}\\/cache`,
			"\\/node_modules\\/",
			"\\/\\.git\\/",
			"^\\.git\\/",
			"plugins\\/mdfriday",
		];
		
		let internalPatterns = [...defaultInternalPatterns];
		
		// Add themes folder to ignore if not syncing themes
		if (!(selectiveSync.syncThemes ?? true)) {
			internalPatterns.push(`${c}\\/themes`);
		}
		
		// Add snippets folder to ignore if not syncing snippets
		if (!(selectiveSync.syncSnippets ?? true)) {
			internalPatterns.push(`${c}\\/snippets`);
		}
		
		// Add plugins folder to ignore if not syncing plugins
		if (!(selectiveSync.syncPlugins ?? true)) {
			internalPatterns.push(`${c}\\/plugins`);
		}
		
		// Update settings
		this.plugin.settings.syncConfig.syncInternalFilesIgnorePatterns = internalPatterns.join(", ");
		await this.plugin.saveSettings();

		// Update sync service if initialized (changes take effect immediately)
		if (this.plugin.syncService?.isInitialized) {
			// Update file type filtering (images, audio, video, pdf)
			this.plugin.syncService.updateSelectiveSync({
				syncImages: selectiveSync.syncImages,
				syncAudio: selectiveSync.syncAudio,
				syncVideo: selectiveSync.syncVideo,
				syncPdf: selectiveSync.syncPdf,
			});
			
			// Update internal file patterns (themes, plugins)
			this.plugin.syncService.updateInternalFilesIgnorePatterns(internalPatterns.join(", "));
		}
	}

	/**
	 * Render Danger Zone section with reset functionality
	 */
	private renderDangerZone(containerEl: HTMLElement): void {
		const dangerZone = containerEl.createDiv('friday-danger-zone');
		new Setting(dangerZone)
			.setName(this.plugin.i18n.t('settings.danger_zone'))
			.setHeading()
			.settingEl.addClass('friday-danger-zone-title');

		let resetInput = '';
		let resetButton: HTMLButtonElement;

		new Setting(dangerZone)
			.setName(this.plugin.i18n.t('settings.reset_sync_title'))
			.setDesc(this.plugin.i18n.t('settings.reset_sync_message'))
			.addText((text) => {
				text.inputEl.placeholder = this.plugin.i18n.t('settings.reset_input_placeholder');
				text.onChange((value) => {
					resetInput = value;
					// Enable button only when user types "RESET"
					if (resetButton) {
						resetButton.disabled = value !== 'RESET';
					}
				});
			})
			.addButton((button) => {
				button
					.setButtonText(this.plugin.i18n.t('settings.reset_sync_button'))
					.setWarning();
				
				// Store reference and set initial disabled state after setting up the button
				resetButton = button.buttonEl;
				resetButton.disabled = true;
				
				// Add click handler directly to the button element
				resetButton.addEventListener('click', async () => {
					if (resetInput === 'RESET' && !resetButton.disabled) {
						resetButton.disabled = true;
						resetButton.textContent = this.plugin.i18n.t('settings.sync_resetting');
						try {
							await this.performReset();
						} catch (error) {
							resetButton.disabled = false;
							resetButton.textContent = this.plugin.i18n.t('settings.reset_sync_button');
						}
					}
				});
			});
	}

	/**
	 * Perform the actual reset operation
	 */
	private async performReset(): Promise<void> {
		try {
			const { license } = this.plugin.settings;
			if (!license) {
				throw new Error('No license found');
			}

			// Step 1: Call Foundry License Service to reset cloud data
			if (!this.plugin.licenseServiceManager) {
				throw new Error('License service not available');
			}
			
			const result = await this.plugin.licenseServiceManager.resetUsage(true);
			if (!result.success) {
				throw new Error(result.error || 'Failed to reset usage');
			}

			// Step 2: Close existing sync service
			if (this.plugin.syncService?.isInitialized) {
				await this.plugin.syncService.close();
			}

			// Step 3: Clear in-memory handler cache (contains old PBKDF2 salt)
			// This is critical - without clearing, the old salt would be reused with new passphrase
			clearSyncHandlerCache();

			// Step 4: Clear local IndexedDB and localStorage
			await this.plugin.clearSyncDatabase();

			// Step 5: Generate new encryption passphrase (same as first-time activation)
			this.plugin.settings.encryptionPassphrase = generateEncryptionPassphrase();
			this.plugin.settings.syncConfig.passphrase = this.plugin.settings.encryptionPassphrase;

			// Step 6: Save settings
			await this.plugin.saveSettings();

			// Step 7: Re-initialize sync service
			// Network monitoring will be started after user clicks "Upload to Cloud"
			await this.plugin.initializeSyncService();

			// Step 8: Set first time flag to show upload option
			this.firstTimeSync = true;

			// Step 9: Show success message and refresh display
			new Notice(this.plugin.i18n.t('settings.reset_sync_success'));
			this.display();

		} catch (error) {
			console.error('Reset failed:', error);
			new Notice(this.plugin.i18n.t('settings.reset_sync_failed', { 
				error: error instanceof Error ? error.message : String(error) 
			}));
		}
	}

	/**
	 * Render Security Section - Now integrated into Sync Section
	 * This method is kept for backwards compatibility but does nothing
	 */
	/**
	 * Activate license key using Foundry License Service
	 * This is the main license activation flow:
	 * 1. Login with license key (get token)
	 * 2. Activate license (Foundry uses the token automatically)
	 * 3. Store license data
	 * 4. Configure sync if enabled
	 */
	/**
	 * Activate License
	 * 
	 * Simplified flow using licenseState as single source of truth
	 */
	private async activateLicense(licenseKey: string): Promise<void> {
		if (!this.plugin.licenseServiceManager) {
			throw new Error('License service not available');
		}

		try {
			// Step 1: Login with license key to get token
			const loginResult = await this.plugin.licenseServiceManager.loginWithLicense(licenseKey);
			
			if (!loginResult.success) {
				throw new Error(loginResult.error || 'Login with license failed');
			}
			
			// Step 2: Activate license using Foundry (uses the token from login)
			const activateResult = await this.plugin.licenseServiceManager.activateLicense(licenseKey);
			
			if (!activateResult.success || !activateResult.data) {
				throw new Error(activateResult.error || 'License activation failed');
			}

			const licenseInfo = activateResult.data;

			// Step 3: Reinitialize license state from Foundry (single source of truth)
			if (this.plugin.licenseState) {
				const initResult = await this.plugin.licenseState.initialize();
				
				if (!initResult.isActivated) {
					throw new Error('License activation succeeded but state initialization failed');
				}
			}

			// Step 4: Sync to settings (for UI display only)
			await this.plugin.syncLicenseToSettings();

			// Step 5: Configure sync if enabled (but don't auto-enable, let user choose)
			const isFirstTime = licenseInfo.activation?.firstTime || false;
			
			if (licenseInfo.sync && licenseInfo.features.syncEnabled) {
				// Store sync configuration
				this.plugin.settings.licenseSync = {
					enabled: true,
					endpoint: licenseInfo.sync.dbEndpoint,
					dbName: licenseInfo.sync.dbName,
					email: licenseInfo.sync.email,
					dbPassword: licenseInfo.sync.dbPassword
				};

				// Configure the actual sync config (but don't enable yet)
				// Only set to false on first-time activation, preserve user's choice otherwise
				if (isFirstTime) {
					this.plugin.settings.syncEnabled = false; // User must manually enable
					this.plugin.settings.syncUserEnabled = false; // User must manually enable
				}
				this.plugin.settings.syncConfig = {
					...this.plugin.settings.syncConfig,
					couchDB_URI: licenseInfo.sync.dbEndpoint.replace(`/${licenseInfo.sync.dbName}`, ''),
					couchDB_DBNAME: licenseInfo.sync.dbName,
					couchDB_USER: licenseInfo.sync.email,
					couchDB_PASSWORD: licenseInfo.sync.dbPassword,
					encrypt: true,
					syncOnStart: true,
					syncOnSave: true,
					liveSync: true
				};

				// Generate encryption passphrase if not exists (only for first time)
				if (!this.plugin.settings.encryptionPassphrase && isFirstTime) {
					this.plugin.settings.encryptionPassphrase = generateEncryptionPassphrase();
					this.plugin.settings.syncConfig.passphrase = this.plugin.settings.encryptionPassphrase;
				}
			}

			// Step 6: Save settings
			await this.plugin.saveSettings();

			// Step 7: Fetch license usage information
			await this.plugin.refreshLicenseUsage();

			// Step 8: Set first time flag
			this.firstTimeSync = isFirstTime;

			// Note: Sync service will be initialized when user manually enables sync via the toggle
		} catch (error) {
			console.error('[Friday] License activation failed:', error);
			throw error;
		}
	}

	/**
	 * Render AI Provider Settings Section (Desktop only)
	 *
	 * Layout (two parallel sub-sections, same card style):
	 *   1. LLM Provider  — dropdown + config card
	 *   2. Text Embedding (optional) — dropdown + config card
	 *      Selecting any provider (non-empty) activates embedding; no separate toggle.
	 */
}
