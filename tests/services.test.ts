/**
 * Tests for src/services/license.ts — LicenseServiceManager
 * Tests for src/services/licenseState.ts — LicenseStateManager
 *
 * Both classes take service interfaces as constructor args, so we
 * inject lightweight mocks — no I/O needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LicenseServiceManager } from '../src/services/license';
import { LicenseStateManager } from '../src/services/licenseState';
import type {
  ObsidianLicenseService,
  ObsidianAuthService,
  ObsidianGlobalConfigService,
  ObsidianLicenseInfo,
  ObsidianAuthStatus,
} from '../src/foundry/types';

// ─── Mock factories ───────────────────────────────────────────────────────────

const WS = '/mock/workspace';

function makeLicenseServiceMock(overrides: Partial<ObsidianLicenseService> = {}): ObsidianLicenseService {
  return {
    requestTrial: vi.fn(async () => ({ success: true, data: { email: 'e@e.com', licenseKey: 'MDF-TTTT-TTTT-TTTT', password: 'pw', validityDays: 14 } })),
    loginWithLicense: vi.fn(async () => ({ success: true, data: {} })),
    activateLicense: vi.fn(async () => ({ success: true, data: makeLicenseInfo() })),
    getLicenseInfo: vi.fn(async () => ({ success: true, data: makeLicenseInfo() })),
    getLicenseUsage: vi.fn(async () => ({
      success: true,
      data: {
        licenseKey: 'MDF-ABCD-1234-EF56', plan: 'pro',
        devices: { count: 1, max: 3, list: [] },
        ips: { count: 1, max: 5, list: [] },
        disk: { syncUsage: 100, publishUsage: 50, totalUsage: 150, maxStorage: 2048, unit: 'MB' },
      },
    })),
    resetUsage: vi.fn(async () => ({ success: true })),
    hasActiveLicense: vi.fn(async () => true),
    ...overrides,
  };
}

function makeAuthServiceMock(overrides: Partial<ObsidianAuthService> = {}): ObsidianAuthService {
  return {
    getStatus: vi.fn(async () => ({
      success: true,
      data: {
        isAuthenticated: true, hasSyncConfig: true,
        email: 'u@mdfriday.com', token: 'tok',
        license: 'MDF-ABCD-1234-EF56', serverUrl: 'https://app.mdfriday.com',
        syncConfig: {
          dbEndpoint: 'https://db', dbName: 'mydb', email: 'u@mdfriday.com',
          userDir: 'u', status: 'active', isActive: true, dbPassword: 'pw',
        },
      },
    })),
    getConfig: vi.fn(async () => ({ success: true, data: { apiUrl: 'https://app.mdfriday.com' } })),
    updateConfig: vi.fn(async () => ({ success: true, data: { apiUrl: 'https://app.mdfriday.com' } })),
    ...overrides,
  };
}

function makeConfigServiceMock(overrides: Partial<ObsidianGlobalConfigService> = {}): ObsidianGlobalConfigService {
  const store: Record<string, unknown> = {};
  return {
    get: vi.fn(async (_, key: string) => {
      if (!(key in store)) return { success: false, error: `Key not found: ${key}` };
      return { success: true, data: { key, value: store[key] } };
    }),
    set: vi.fn(async (_, key: string, value: unknown) => {
      store[key] = value;
      return { success: true, data: { key, value } };
    }),
    list: vi.fn(async () => ({ success: true, data: { config: store, scope: 'global' } })),
    ...overrides,
  };
}

function makeLicenseInfo(overrides: Partial<ObsidianLicenseInfo> = {}): ObsidianLicenseInfo {
  return {
    key: 'MDF-ABCD-1234-EF56',
    plan: 'Pro',
    isExpired: false,
    expires: 'Dec 31, 2027',
    expiresAt: Date.now() + 50_000_000,
    daysRemaining: 578,
    isTrial: false,
    features: {
      maxDevices: 3, maxIps: 5,
      syncEnabled: true, syncQuota: 10,
      publishEnabled: true, maxSites: 3, maxStorage: 2048,
      customDomain: false, customSubDomain: true, validityDays: 365,
    },
    user: { email: 'u@mdfriday.com', userDir: 'u' },
    activation: { activated: true, firstTime: false },
    sync: {
      enabled: true, status: 'active',
      dbEndpoint: 'https://db', dbName: 'mydb',
      email: 'u@mdfriday.com', dbPassword: 'pw', userDir: 'u',
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LicenseServiceManager tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('LicenseServiceManager', () => {
  let licenseSvc: ObsidianLicenseService;
  let authSvc: ObsidianAuthService;
  let configSvc: ObsidianGlobalConfigService;
  let manager: LicenseServiceManager;

  beforeEach(() => {
    licenseSvc = makeLicenseServiceMock();
    authSvc = makeAuthServiceMock();
    configSvc = makeConfigServiceMock();
    manager = new LicenseServiceManager(licenseSvc, authSvc, configSvc, WS);
  });

  // ─── requestTrial ──────────────────────────────────────────────────────────
  it('requestTrial returns success and saves licenseKey to config', async () => {
    const result = await manager.requestTrial('trial@mdfriday.com');
    expect(result.success).toBe(true);
    expect(result.data?.licenseKey).toBe('MDF-TTTT-TTTT-TTTT');
    // Should have set publish.mdfriday.licenseKey in config
    expect(configSvc.set).toHaveBeenCalledWith(WS, 'publish.mdfriday.licenseKey', 'MDF-TTTT-TTTT-TTTT');
    expect(configSvc.set).toHaveBeenCalledWith(WS, 'publish.mdfriday.enabled', true);
  });

  it('requestTrial returns error when licenseService fails', async () => {
    licenseSvc.requestTrial = vi.fn(async () => ({ success: false, error: 'Server error' }));
    const result = await manager.requestTrial('e@e.com');
    expect(result.success).toBe(false);
    // The manager passes through the error from the underlying service
    expect(result.error).toBe('Server error');
  });

  // ─── loginWithLicense ─────────────────────────────────────────────────────
  it('loginWithLicense delegates to licenseService and returns success', async () => {
    const result = await manager.loginWithLicense('MDF-ABCD-1234-EF56');
    expect(result.success).toBe(true);
    expect(licenseSvc.loginWithLicense).toHaveBeenCalledWith(WS, 'MDF-ABCD-1234-EF56');
  });

  it('loginWithLicense returns error when licenseService fails', async () => {
    licenseSvc.loginWithLicense = vi.fn(async () => ({ success: false, error: 'Bad credentials' }));
    const result = await manager.loginWithLicense('MDF-ABCD-1234-EF56');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad credentials');
  });

  // ─── activateLicense ──────────────────────────────────────────────────────
  it('activateLicense saves licenseKey to config on success', async () => {
    const result = await manager.activateLicense('MDF-ABCD-1234-EF56');
    expect(result.success).toBe(true);
    expect(configSvc.set).toHaveBeenCalledWith(WS, 'publish.mdfriday.licenseKey', 'MDF-ABCD-1234-EF56');
  });

  it('activateLicense returns error when licenseService fails', async () => {
    licenseSvc.activateLicense = vi.fn(async () => ({ success: false, error: 'Activation failed' }));
    const result = await manager.activateLicense('MDF-ABCD-1234-EF56');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Activation failed');
  });

  // ─── getLicenseInfo ───────────────────────────────────────────────────────
  it('getLicenseInfo delegates to licenseService', async () => {
    const result = await manager.getLicenseInfo();
    expect(result.success).toBe(true);
    expect(licenseSvc.getLicenseInfo).toHaveBeenCalledWith(WS);
  });

  // ─── getLicenseUsage ──────────────────────────────────────────────────────
  it('getLicenseUsage returns usage data', async () => {
    const result = await manager.getLicenseUsage();
    expect(result.success).toBe(true);
    expect(result.data?.disk.totalUsage).toBe(150);
  });

  // ─── hasActiveLicense ─────────────────────────────────────────────────────
  it('hasActiveLicense returns true when licenseService confirms', async () => {
    expect(await manager.hasActiveLicense()).toBe(true);
  });

  it('hasActiveLicense returns false on exception', async () => {
    licenseSvc.hasActiveLicense = vi.fn(() => { throw new Error('crash'); });
    expect(await manager.hasActiveLicense()).toBe(false);
  });

  // ─── resetUsage ───────────────────────────────────────────────────────────
  it('resetUsage returns error without force=true', async () => {
    const result = await manager.resetUsage(false);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Force parameter required/);
  });

  it('resetUsage succeeds with force=true', async () => {
    const result = await manager.resetUsage(true);
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LicenseStateManager tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('LicenseStateManager', () => {
  let licenseSvc: ObsidianLicenseService;
  let authSvc: ObsidianAuthService;
  let stateManager: LicenseStateManager;

  beforeEach(() => {
    licenseSvc = makeLicenseServiceMock();
    authSvc = makeAuthServiceMock();
    stateManager = new LicenseStateManager(licenseSvc, authSvc, null, WS);
  });

  // ─── initialize ───────────────────────────────────────────────────────────
  it('initialize returns isActivated=true when auth + license are valid', async () => {
    const result = await stateManager.initialize();
    expect(result.isActivated).toBe(true);
    expect(result.licenseKey).toBe('MDF-ABCD-1234-EF56');
  });

  it('initialize returns isActivated=false when auth fails', async () => {
    authSvc.getStatus = vi.fn(async () => ({ success: false, error: 'network error' }));
    const result = await stateManager.initialize();
    expect(result.isActivated).toBe(false);
    expect(result.error).toMatch(/network error/);
  });

  it('initialize returns isActivated=false when not authenticated', async () => {
    authSvc.getStatus = vi.fn(async () => ({
      success: true,
      data: { isAuthenticated: false, hasSyncConfig: false },
    }));
    const result = await stateManager.initialize();
    expect(result.isActivated).toBe(false);
  });

  it('initialize returns isActivated=false when no license key', async () => {
    authSvc.getStatus = vi.fn(async () => ({
      success: true,
      data: { isAuthenticated: true, hasSyncConfig: false, email: 'u@e.com' },
    }));
    const result = await stateManager.initialize();
    expect(result.isActivated).toBe(false);
  });

  // ─── Post-initialize state accessors ──────────────────────────────────────
  describe('after successful initialize', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('isActivated returns true', () => {
      expect(stateManager.isActivated()).toBe(true);
    });

    it('getLicenseKey returns the license key', () => {
      expect(stateManager.getLicenseKey()).toBe('MDF-ABCD-1234-EF56');
    });

    it('getEmail returns the user email', () => {
      expect(stateManager.getEmail()).toBe('u@mdfriday.com');
    });

    it('isExpired returns false for a valid license', () => {
      expect(stateManager.isExpired()).toBe(false);
    });

    it('getPlan returns lowercase plan name', () => {
      expect(stateManager.getPlan()).toBe('pro');
    });

    it('getFormattedPlan returns capitalised plan name', () => {
      expect(stateManager.getFormattedPlan()).toBe('Pro');
    });

    it('hasFeature syncEnabled returns true', () => {
      expect(stateManager.hasFeature('syncEnabled')).toBe(true);
    });

    it('hasFeature customDomain returns false', () => {
      expect(stateManager.hasFeature('customDomain')).toBe(false);
    });

    it('getUserDir returns user directory', () => {
      expect(stateManager.getUserDir()).toBe('u');
    });

    it('hasSyncConfig returns true', () => {
      expect(stateManager.hasSyncConfig()).toBe(true);
    });

    it('getSyncConfig returns sync config', () => {
      const sc = stateManager.getSyncConfig();
      expect(sc?.dbEndpoint).toBe('https://db');
      expect(sc?.dbName).toBe('mydb');
    });

    it('isSyncActive returns true', () => {
      expect(stateManager.isSyncActive()).toBe(true);
    });

    it('getSyncDbEndpoint returns endpoint', () => {
      expect(stateManager.getSyncDbEndpoint()).toBe('https://db');
    });

    it('getSyncDbName returns db name', () => {
      expect(stateManager.getSyncDbName()).toBe('mydb');
    });

    it('getMaxStorage returns maxStorage from features', () => {
      expect(stateManager.getMaxStorage()).toBe(2048);
    });

    it('isTrial returns false for Pro plan', () => {
      expect(stateManager.isTrial()).toBe(false);
    });

    it('getDaysRemaining returns a positive number', () => {
      expect(stateManager.getDaysRemaining()).toBeGreaterThan(0);
    });

    it('isCacheValid returns true right after initialization', () => {
      expect(stateManager.isCacheValid()).toBe(true);
    });
  });

  // ─── clear ────────────────────────────────────────────────────────────────
  it('clear resets all state', async () => {
    await stateManager.initialize();
    stateManager.clear();
    expect(stateManager.isActivated()).toBe(false);
    expect(stateManager.getLicenseKey()).toBeNull();
    expect(stateManager.getLicenseInfo()).toBeNull();
    expect(stateManager.getAuthStatus()).toBeNull();
    expect(stateManager.isCacheValid()).toBe(false);
  });

  // ─── refresh ──────────────────────────────────────────────────────────────
  it('refresh calls initialize with forceRefresh=true', async () => {
    await stateManager.initialize();
    // After refresh, licenseService.getLicenseInfo should be called with refresh:true
    await stateManager.refresh();
    expect(licenseSvc.getLicenseInfo).toHaveBeenLastCalledWith(WS, { refresh: true });
  });

  // ─── hasPublishPermission ─────────────────────────────────────────────────
  it('hasPublishPermission returns true when publishEnabled feature is on', async () => {
    await stateManager.initialize();
    expect(stateManager.hasPublishPermission()).toBe(true);
  });

  it('hasPublishPermission returns false when not activated', () => {
    expect(stateManager.hasPublishPermission()).toBe(false);
  });

  // ─── isTrial ─────────────────────────────────────────────────────────────
  it('isTrial returns true for a Free / trial plan', async () => {
    licenseSvc.getLicenseInfo = vi.fn(async () => ({
      success: true,
      data: makeLicenseInfo({ plan: 'Free', isTrial: true }),
    }));
    await stateManager.initialize();
    expect(stateManager.isTrial()).toBe(true);
  });

  // ─── expired license ──────────────────────────────────────────────────────
  it('isExpired returns true for an expired license', async () => {
    licenseSvc.getLicenseInfo = vi.fn(async () => ({
      success: true,
      data: makeLicenseInfo({ isExpired: true, expiresAt: Date.now() - 1000 }),
    }));
    await stateManager.initialize();
    expect(stateManager.isExpired()).toBe(true);
  });
});





