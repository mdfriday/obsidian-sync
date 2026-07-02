/**
 * Obsidian API mock for unit tests
 * Stubs only what's needed by foundry/types.ts and foundry/mobile.ts
 */

export class FileSystemAdapter {
  getBasePath() { return '/mock/vault'; }
}

export const Platform = { isDesktop: true, isMobile: false };
export const Plugin = class {};
export const Notice = class { constructor(msg: string) {} };
export const requestUrl = vi.fn();

/** Minimal Vault mock that uses an in-memory store */
export function createMockVault(initialFiles: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialFiles };

  const adapter = {
    exists: vi.fn(async (path: string) => path in store),
    read: vi.fn(async (path: string) => {
      if (!(path in store)) throw new Error(`ENOENT: ${path}`);
      return store[path];
    }),
    write: vi.fn(async (path: string, content: string) => {
      store[path] = content;
    }),
    mkdir: vi.fn(async (_path: string) => {}),
    stat: vi.fn(async (path: string) => {
      if (!(path in store)) return null;
      return { type: 'file', size: store[path].length, mtime: Date.now() };
    }),
    list: vi.fn(async (path: string) => ({
      files: Object.keys(store).filter(k => k.startsWith(path) && !k.slice(path.length + 1).includes('/')),
      folders: [],
    })),
    rmdir: vi.fn(async () => {}),
    remove: vi.fn(async (path: string) => { delete store[path]; }),
  };

  return { adapter, _store: store };
}

