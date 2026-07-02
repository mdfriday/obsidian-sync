import { describe, it, expect } from 'vitest';
import {
  isValidLicenseKeyFormat,
  maskLicenseKey,
  isLicenseExpired,
  formatPlanName,
  generateEncryptionPassphrase,
} from '../src/license';

describe('license utilities', () => {
  // ─── isValidLicenseKeyFormat ────────────────────────────────────────────────
  describe('isValidLicenseKeyFormat', () => {
    it('accepts a valid MDF key (uppercase)', () => {
      expect(isValidLicenseKeyFormat('MDF-ABCD-1234-EF56')).toBe(true);
    });

    it('accepts a valid MDF key (lowercase)', () => {
      expect(isValidLicenseKeyFormat('mdf-abcd-1234-ef56')).toBe(true);
    });

    it('accepts a valid MDF key (mixed case)', () => {
      expect(isValidLicenseKeyFormat('MDF-aBcD-1234-EF56')).toBe(true);
    });

    it('rejects a key with wrong prefix', () => {
      expect(isValidLicenseKeyFormat('FRI-ABCD-1234-EF56')).toBe(false);
    });

    it('rejects a key with wrong segment length', () => {
      expect(isValidLicenseKeyFormat('MDF-ABC-1234-EF56')).toBe(false);
    });

    it('rejects a key with too many segments', () => {
      expect(isValidLicenseKeyFormat('MDF-ABCD-1234-EF56-XXXX')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidLicenseKeyFormat('')).toBe(false);
    });

    it('rejects a key with special characters', () => {
      expect(isValidLicenseKeyFormat('MDF-AB!D-1234-EF56')).toBe(false);
    });
  });

  // ─── maskLicenseKey ─────────────────────────────────────────────────────────
  describe('maskLicenseKey', () => {
    it('masks a standard MDF key correctly', () => {
      expect(maskLicenseKey('MDF-ABCD-1234-EF56')).toBe('MDF-••••-••••-EF56');
    });

    it('returns the key unchanged if too short', () => {
      expect(maskLicenseKey('AB')).toBe('AB');
    });

    it('handles empty string', () => {
      expect(maskLicenseKey('')).toBe('');
    });

    it('falls back to generic masking for non-MDF keys', () => {
      const result = maskLicenseKey('ABCDEFGH1234');
      expect(result.endsWith('1234')).toBe(true);
      expect(result.slice(0, -4)).toMatch(/^•+$/);
    });
  });

  // ─── isLicenseExpired ───────────────────────────────────────────────────────
  describe('isLicenseExpired', () => {
    it('returns true when expiresAt is in the past', () => {
      expect(isLicenseExpired(Date.now() - 1000)).toBe(true);
    });

    it('returns false when expiresAt is in the future', () => {
      expect(isLicenseExpired(Date.now() + 100_000)).toBe(false);
    });

    it('treats 0 as expired', () => {
      expect(isLicenseExpired(0)).toBe(true);
    });
  });

  // ─── formatPlanName ─────────────────────────────────────────────────────────
  describe('formatPlanName', () => {
    it('capitalizes a lowercase plan name', () => {
      expect(formatPlanName('free')).toBe('Free');
    });

    it('normalises an all-uppercase plan name', () => {
      expect(formatPlanName('ENTERPRISE')).toBe('Enterprise');
    });

    it('handles mixed case', () => {
      expect(formatPlanName('pRo')).toBe('Pro');
    });

    it('returns Unknown for empty string', () => {
      expect(formatPlanName('')).toBe('Unknown');
    });
  });

  // ─── generateEncryptionPassphrase ───────────────────────────────────────────
  describe('generateEncryptionPassphrase', () => {
    it('generates a 24-character passphrase', () => {
      const p = generateEncryptionPassphrase();
      expect(p).toHaveLength(24);
    });

    it('uses only alphanumeric characters', () => {
      const p = generateEncryptionPassphrase();
      expect(/^[A-Za-z0-9]+$/.test(p)).toBe(true);
    });

    it('generates different passphrases each time', () => {
      const a = generateEncryptionPassphrase();
      const b = generateEncryptionPassphrase();
      // Collision is astronomically unlikely for 24-char alphanumeric strings
      expect(a).not.toBe(b);
    });
  });
});


