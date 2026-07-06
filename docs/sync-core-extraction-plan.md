# sync-core 独立包拆分方案

> **目标**：将 `src/sync/core/` 和 `src/sync/features/` 提取到 `src/sync/sync-core/` 目录，形成可独立发布的 NPM 包，同时保持 Obsidian 插件功能完全不变，测试在整个过程中持续通过。

---

## 一、整体架构

### 当前结构

```
src/sync/
├── core/                        ← 纯逻辑（60-70%代码，零 Obsidian 依赖）
│   ├── PlatformAPIs/
│   │   ├── obsidian/            ← 唯一 Obsidian 具体实现（loader 架构已隔离）
│   │   ├── browser/
│   │   ├── base/
│   │   └── Synchromesh.ts       ← 抽象入口，无 Obsidian 依赖
│   ├── pouchdb/
│   ├── replication/
│   ├── common/
│   ├── encryption/
│   ├── services/
│   ├── managers/
│   └── ...
├── features/
│   ├── ConnectionMonitor/       ← 仅 import type FridaySyncCore（类型擦除）
│   ├── ConnectionFailure/       ← 仅 import type FridaySyncCore（类型擦除）
│   ├── OfflineTracker/          ← 仅 import type FridaySyncCore（类型擦除）
│   ├── NetworkEvents/           ← import Plugin（仅用 registerDomEvent）
│   ├── HiddenFileSync/          ← import Plugin（仅用 vault.adapter.list）
│   └── ServerConnectivity/      ← import requestUrl
├── FridaySyncCore.ts            ← Obsidian 插件核心（Plugin 宿主）
├── FridayServiceHub.ts          ← 15个服务实现（TFile/Platform/requestUrl）
├── FridayStorageEventManager.ts ← Vault 事件监听（Plugin/TFile/TFolder）
├── SyncService.ts               ← 公共 API（Plugin/Notice）
├── SyncStatusDisplay.ts         ← UI 状态栏（Plugin/Notice/Menu）
└── ...
```

### 目标结构

```
src/sync/
├── sync-core/                   ← 【新】可独立发布的 NPM 包
│   ├── package.json             ← @mdfriday/sync-core 包配置
│   ├── tsconfig.json            ← 独立编译配置
│   ├── src/
│   │   ├── index.ts             ← 公共导出入口
│   │   ├── interfaces/
│   │   │   ├── ISyncCore.ts     ← 【新】features 依赖的核心接口
│   │   │   └── IPluginAdapters.ts ← 【新】平台无关适配器接口
│   │   ├── core/                ← 从 sync/core/ 迁移（PlatformAPIs/obsidian/ 除外）
│   │   │   ├── PlatformAPIs/
│   │   │   │   ├── obsidian/    ← 保留（由 SynchromeshLoader 动态加载）
│   │   │   │   ├── browser/
│   │   │   │   ├── base/
│   │   │   │   └── Synchromesh.ts
│   │   │   ├── pouchdb/
│   │   │   ├── replication/
│   │   │   ├── common/
│   │   │   ├── encryption/
│   │   │   ├── services/
│   │   │   └── managers/
│   │   └── features/            ← 从 sync/features/ 迁移（适配接口）
│   │       ├── ConnectionMonitor/
│   │       ├── ConnectionFailure/
│   │       ├── OfflineTracker/
│   │       ├── NetworkEvents/   ← Plugin → IDomEventRegistrar
│   │       ├── HiddenFileSync/  ← Plugin → IVaultFileLister
│   │       └── ServerConnectivity/ ← requestUrl → IHttpClient
│   └── tests/                   ← 【新】sync-core 包的专属测试
│       ├── utils.test.ts
│       ├── features.test.ts
│       └── __mocks__/
│           └── ISyncCore.mock.ts
│
├── adapters/                    ← 【新】Obsidian 适配器（留在插件内）
│   ├── ObsidianDomEventRegistrar.ts
│   └── ObsidianVaultFileLister.ts
│
├── FridaySyncCore.ts            ← 不动（补充 implements ISyncCore）
├── FridayServiceHub.ts          ← 不动（import 路径调整）
├── FridayStorageEventManager.ts ← 不动（import 路径调整）
├── SyncService.ts               ← 不动
└── SyncStatusDisplay.ts         ← 不动
```

---

## 二、核心接口设计

### 2.1 ISyncCore — features 依赖的最小核心接口

```typescript
// src/sync/sync-core/src/interfaces/ISyncCore.ts

import type { ObsidianLiveSyncSettings } from '../core/common/types';
import type { LiveSyncLocalDB } from '../core/pouchdb/LiveSyncLocalDB';
import type { LiveSyncCouchDBReplicator } from '../core/replication/couchdb/LiveSyncReplicator';
import type { LiveSyncManagers } from '../core/managers/LiveSyncManagers';
import type { ServiceHub } from '../core/services/ServiceHub';
import type { KeyValueDatabase } from '../core/interfaces/KeyValueDatabase';
import type { ServerStatus } from '../features/ServerConnectivity';

export interface ISyncCore {
    // 配置
    getSettings(): ObsidianLiveSyncSettings;
    
    // 核心组件（只读访问）
    readonly localDatabase: LiveSyncLocalDB | null;
    readonly replicator: LiveSyncCouchDBReplicator | null;
    readonly managers: LiveSyncManagers | null;
    readonly services: ServiceHub;
    readonly kvDB: KeyValueDatabase;
    
    // 状态
    readonly serverStatus: ServerStatus;
    readonly isManualOperation: boolean;
    readonly manualOperationType: "RESET" | "PUSH" | "FETCH" | "PULL" | null;
    
    // 跨模块引用（用 any 避免循环 + 接口可逐步精确）
    readonly storageEventManager: { markFileProcessing(path: string): void } | null;
    readonly hiddenFileSync: { isThisModuleEnabled(): boolean; watchVaultRawEvents(path: any): Promise<void> } | null;
    readonly offlineTracker: { trackChange(path: any, type: string): void } | null;
    readonly connectionMonitor: { scheduleReconnect(): void } | null;
    readonly connectionFailureHandler: { handleFailure(error: any): Promise<any> } | null;
    
    // 方法
    isServerReachable(): Promise<boolean>;
    setStatus(status: string, message?: string): void;
    startSync(): Promise<void>;
}
```

### 2.2 IPluginAdapters — 平台 API 抽象

```typescript
// src/sync/sync-core/src/interfaces/IPluginAdapters.ts

/**
 * 替代 Plugin.registerDomEvent
 * NetworkEvents 模块仅需要此接口注册 DOM 事件（在插件卸载时自动清理）
 */
export interface IDomEventRegistrar {
    registerDomEvent(
        el: EventTarget,
        type: string,
        handler: EventListenerOrEventListenerObject
    ): void;
}

/**
 * 替代 plugin.app.vault.adapter.list
 * HiddenFileSync 仅需要此接口列出 .obsidian 目录内容
 */
export interface IVaultFileLister {
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

/**
 * 替代 requestUrl
 * ServerConnectivity 仅需要此接口做 HTTP HEAD 连通性检查
 */
export interface IHttpClient {
    request(params: {
        url: string;
        method: string;
        headers?: Record<string, string>;
        body?: string;
        throw?: boolean;
    }): Promise<{
        status: number;
        text: string;
        json: any;
        arrayBuffer: ArrayBuffer;
        headers: Record<string, string>;
    }>;
}
```

---

## 三、变更矩阵

| 文件 | 动作 | 改动内容 | 工作量 |
|------|------|---------|--------|
| `sync/core/**`（除 PlatformAPIs/obsidian） | 迁移 | 零改动，直接移动 | — |
| `sync/core/PlatformAPIs/obsidian/` | 随 core 迁移 | 零改动（loader 已隔离） | — |
| `features/ConnectionMonitor/` | 迁移+适配 | `import type FridaySyncCore` → `import type ISyncCore` | ~3行 |
| `features/ConnectionFailure/` | 迁移+适配 | 同上 | ~3行 |
| `features/OfflineTracker/` | 迁移+适配 | 同上 | ~3行 |
| `features/NetworkEvents/` | 迁移+适配 | `Plugin` → `IDomEventRegistrar`，FridaySyncCore → ISyncCore | ~8行 |
| `features/HiddenFileSync/` | 迁移+适配 | `Plugin` → `IVaultFileLister`，FridaySyncCore → ISyncCore | ~8行 |
| `features/ServerConnectivity/` | 迁移+适配 | `requestUrl` → `IHttpClient`（构造注入） | ~5行 |
| `FridaySyncCore.ts` | **原地保留** | 补 `implements ISyncCore`，调整 import 路径 | ~5行 |
| `FridayServiceHub.ts` | **原地保留** | 调整 import 路径（core → sync-core/src/core） | 批量替换 |
| `FridayStorageEventManager.ts` | **原地保留** | 调整 import 路径 | 批量替换 |
| `adapters/ObsidianDomEventRegistrar.ts` | **新建** | 封装 Plugin.registerDomEvent | ~20行 |
| `adapters/ObsidianVaultFileLister.ts` | **新建** | 封装 plugin.app.vault.adapter.list | ~15行 |
| `sync-core/package.json` | **新建** | NPM 包配置 | — |
| `sync-core/tsconfig.json` | **新建** | 独立 TS 配置 | — |
| `sync-core/src/interfaces/ISyncCore.ts` | **新建** | 见上方设计 | — |
| `sync-core/src/interfaces/IPluginAdapters.ts` | **新建** | 见上方设计 | — |
| `vitest.config.ts` | 调整 | 更新 exclude 规则，增加 sync-core 测试 | ~3行 |
| `tsconfig.json` | 调整 | 增加 `@mdfriday/sync-core` 路径别名 | ~3行 |
| `esbuild.config.mjs` | 调整 | 增加路径别名解析 | ~5行 |

---

## 四、逐步实施计划

### Phase 0：基线确认（0.5h）

**目标**：确认当前测试全部通过，建立 Git 分支。

```bash
# 1. 建立拆分分支
git checkout -b feature/sync-core-extraction

# 2. 运行现有测试，确认全绿
npm test

# 3. 记录测试基线
npm test -- --reporter=verbose 2>&1 | tee docs/test-baseline.txt
```

**验收**：所有现有测试通过（foundry-desktop, foundry-mobile, license, services）

---

### Phase 1：创建包骨架（1h）

**目标**：建立 `sync-core/` 目录结构，不移动任何代码。

**1.1 创建目录结构**

```bash
mkdir -p src/sync/sync-core/src/{interfaces,core,features}
mkdir -p src/sync/sync-core/tests/__mocks__
mkdir -p src/sync/adapters
```

**1.2 创建 `src/sync/sync-core/package.json`**

```json
{
  "name": "@mdfriday/sync-core",
  "version": "0.1.0",
  "description": "CouchDB sync core logic for MDFriday — platform independent",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "fflate": "^0.8.2",
    "idb": "^8.0.3",
    "minimatch": "^10.2.5",
    "octagonal-wheels": "^0.1.44",
    "xxhash-wasm-102": "npm:xxhash-wasm@^1.0.2"
  },
  "peerDependencies": {
    "obsidian": ">=1.7.0"
  },
  "peerDependenciesMeta": {
    "obsidian": { "optional": true }
  }
}
```

**1.3 创建 `src/sync/sync-core/tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "paths": {
      "obsidian": ["../../../tests/__mocks__/obsidian.ts"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**1.4 创建空导出入口 `src/sync/sync-core/src/index.ts`**

```typescript
// Public exports — filled progressively as modules are migrated
export * from './interfaces/ISyncCore';
export * from './interfaces/IPluginAdapters';
```

**✅ 测试检查点**：运行 `npm test` → 仍然全绿（新目录不影响任何现有测试）

---

### Phase 2：定义接口（1.5h）

**目标**：创建 `ISyncCore` 和 `IPluginAdapters` 接口文件，并配套测试。

**2.1 创建接口文件**

按照第二节设计，创建：
- `src/sync/sync-core/src/interfaces/ISyncCore.ts`
- `src/sync/sync-core/src/interfaces/IPluginAdapters.ts`

**2.2 创建接口测试（接口契约测试）**

```typescript
// src/sync/sync-core/tests/interfaces.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { ISyncCore } from '../src/interfaces/ISyncCore';
import type { IDomEventRegistrar, IVaultFileLister, IHttpClient } from '../src/interfaces/IPluginAdapters';

// 验证接口可以被正确实现（编译期检查 + 运行期 mock 验证）

function makeMockSyncCore(): ISyncCore {
  return {
    getSettings: vi.fn(() => ({ liveSync: false } as any)),
    localDatabase: null,
    replicator: null,
    managers: null,
    services: {} as any,
    kvDB: {} as any,
    serverStatus: 'UNKNOWN',
    isManualOperation: false,
    manualOperationType: null,
    storageEventManager: null,
    hiddenFileSync: null,
    offlineTracker: null,
    connectionMonitor: null,
    connectionFailureHandler: null,
    isServerReachable: vi.fn(async () => true),
    setStatus: vi.fn(),
    startSync: vi.fn(async () => {}),
  };
}

describe('ISyncCore interface', () => {
  it('mock ISyncCore satisfies the interface shape', () => {
    const core = makeMockSyncCore();
    expect(core.getSettings).toBeDefined();
    expect(core.isServerReachable).toBeDefined();
    expect(core.serverStatus).toBe('UNKNOWN');
  });
});

describe('IDomEventRegistrar interface', () => {
  it('can be implemented with a simple mock', () => {
    const registrar: IDomEventRegistrar = {
      registerDomEvent: vi.fn(),
    };
    registrar.registerDomEvent(window, 'online', () => {});
    expect(registrar.registerDomEvent).toHaveBeenCalled();
  });
});

describe('IVaultFileLister interface', () => {
  it('can be implemented with a simple mock', async () => {
    const lister: IVaultFileLister = {
      list: vi.fn(async () => ({ files: ['a.md'], folders: [] })),
    };
    const result = await lister.list('.obsidian');
    expect(result.files).toContain('a.md');
  });
});

describe('IHttpClient interface', () => {
  it('can be implemented with a simple mock', async () => {
    const http: IHttpClient = {
      request: vi.fn(async () => ({
        status: 200, text: 'ok', json: {}, 
        arrayBuffer: new ArrayBuffer(0), headers: {}
      })),
    };
    const result = await http.request({ url: 'https://test.com', method: 'HEAD' });
    expect(result.status).toBe(200);
  });
});
```

**2.3 更新 `vitest.config.ts` 包含新测试**

```typescript
// 更新 include 确保 sync-core/tests/ 被包含
// 更新 exclude 移除对 sync/core/** 的全局排除（改为细粒度控制）
```

**✅ 测试检查点**：`npm test` → 原有测试全绿 + 新接口测试通过

---

### Phase 3：迁移 `core/` 目录（1h）

**目标**：将 `src/sync/core/` 内容复制到 `src/sync/sync-core/src/core/`，不删除原有文件。

**3.1 复制 core 目录**

```bash
# 使用 rsync 保留目录结构
rsync -av src/sync/core/ src/sync/sync-core/src/core/
```

**3.2 验证 `SynchromeshLoader` 配置**

`core/PlatformAPIs/obsidian/` 中的文件通过 `SynchromeshLoader.obsidian.ts` 动态加载，
NPM 包发布时替换为 `SynchromeshLoader.platform.ts`（已是空实现）。

不需要任何代码改动，构建时通过 esbuild 的 alias 配置选择不同 loader：

```javascript
// esbuild.config.mjs 中（插件构建用 obsidian loader）
alias: {
  './SynchromeshLoader.platform': './src/sync/core/PlatformAPIs/SynchromeshLoader.obsidian'
}
```

**3.3 更新 `sync-core/src/index.ts` 导出 core 内容**

```typescript
// 导出核心公共 API
export * from './core/common/types';
export * from './core/common/logger';
export * from './core/common/i18n';
export * from './core/pouchdb/LiveSyncLocalDB';
export * from './core/replication/LiveSyncAbstractReplicator';
// ... 其他公共导出
```

**注意**：此阶段 `src/sync/core/` **原始文件保留不动**，
Friday* 文件仍 import 原路径，构建不受影响。

**✅ 测试检查点**：`npm test` → 全绿（原始文件未变动）

---

### Phase 4：迁移 `features/`（4h）

分 6 个子步骤，每步独立可验证。

#### Phase 4.1：迁移无 Obsidian 依赖的 features（1h）

目标：ConnectionMonitor、ConnectionFailure、OfflineTracker

**改动示例（以 ConnectionMonitor 为例）**：

```typescript
// src/sync/sync-core/src/features/ConnectionMonitor/index.ts

// 修改前
import type { FridaySyncCore } from "../../FridaySyncCore";

// 修改后（仅改这1行）
import type { ISyncCore } from "../../interfaces/ISyncCore";

export class FridayConnectionMonitor {
    // 修改前：private core: FridaySyncCore;
    private core: ISyncCore;  // 改这1行
    
    // 修改前：constructor(core: FridaySyncCore)
    constructor(core: ISyncCore) {  // 改这1行
        this.core = core;
    }
    // ...其余代码不变
}
```

**配套测试**：

```typescript
// src/sync/sync-core/tests/features/ConnectionMonitor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FridayConnectionMonitor } from '../../src/features/ConnectionMonitor';
import { makeMockSyncCore } from '../__mocks__/ISyncCore.mock';

describe('FridayConnectionMonitor', () => {
  let monitor: FridayConnectionMonitor;
  let mockCore: ReturnType<typeof makeMockSyncCore>;

  beforeEach(() => {
    mockCore = makeMockSyncCore();
    monitor = new FridayConnectionMonitor(mockCore);
  });

  it('startMonitoring starts health checks', () => {
    monitor.startMonitoring();
    expect(monitor.isMonitoring).toBe(true);
  });

  it('stopMonitoring stops monitoring', () => {
    monitor.startMonitoring();
    monitor.stopMonitoring();
    expect(monitor.isMonitoring).toBe(false);
  });
  
  it('scheduleReconnect calls core.startSync after delay', async () => {
    vi.useFakeTimers();
    monitor.scheduleReconnect(100);
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();
    expect(mockCore.startSync).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

**✅ 测试检查点**：新 feature 测试通过，原有测试不受影响

#### Phase 4.2：迁移 NetworkEvents（0.5h）

```typescript
// src/sync/sync-core/src/features/NetworkEvents/index.ts

// 修改前
import { Plugin } from "obsidian";
import type { FridaySyncCore } from "../../FridaySyncCore";

// 修改后
import type { IDomEventRegistrar } from "../../interfaces/IPluginAdapters";
import type { ISyncCore } from "../../interfaces/ISyncCore";

export class FridayNetworkEvents {
    // 修改前：private plugin: Plugin;
    private eventReg: IDomEventRegistrar;  // 改字段名+类型
    private core: ISyncCore;

    // 修改前：constructor(plugin: Plugin, core: FridaySyncCore)
    constructor(eventReg: IDomEventRegistrar, core: ISyncCore) {
        this.eventReg = eventReg;
        this.core = core;
    }

    registerEvents(): void {
        // 修改前：this.plugin.registerDomEvent(...)
        this.eventReg.registerDomEvent(window, "online", this.boundHandlers.online);
        this.eventReg.registerDomEvent(window, "offline", this.boundHandlers.offline);
        this.eventReg.registerDomEvent(activeDocument, "visibilitychange", ...);
        // ...
    }
}
```

**配套测试**：

```typescript
// src/sync/sync-core/tests/features/NetworkEvents.test.ts
describe('FridayNetworkEvents', () => {
  it('registerEvents calls registerDomEvent for online/offline/etc', () => {
    const mockEventReg: IDomEventRegistrar = { registerDomEvent: vi.fn() };
    const mockCore = makeMockSyncCore();
    const ne = new FridayNetworkEvents(mockEventReg, mockCore);
    ne.registerEvents();
    expect(mockEventReg.registerDomEvent).toHaveBeenCalledWith(
      window, 'online', expect.any(Function)
    );
    expect(mockEventReg.registerDomEvent).toHaveBeenCalledTimes(5);
  });
});
```

#### Phase 4.3：迁移 HiddenFileSync（1.5h）

```typescript
// 修改前
import { type Plugin, type ListedFiles } from "obsidian";
// 修改后
import type { IVaultFileLister } from "../../interfaces/IPluginAdapters";
// ListedFiles 替换为本地类型定义：
type ListedFiles = { files: string[]; folders: string[] };

export class FridayHiddenFileSync {
    // 修改前：private plugin: Plugin;
    private fileLister: IVaultFileLister;
    
    // 修改前：constructor(plugin: Plugin, core: FridaySyncCore)
    constructor(fileLister: IVaultFileLister, core: ISyncCore) {
        this.fileLister = fileLister;
        this.core = core;
    }
    
    // 修改前：private get adapter() { return this.plugin.app.vault.adapter; }
    // 修改后：直接使用 this.fileLister.list(path) 替代 this.adapter.list(path)
}
```

**配套测试**：

```typescript
// src/sync/sync-core/tests/features/HiddenFileSync.test.ts
describe('FridayHiddenFileSync', () => {
  let mockFileLister: IVaultFileLister;
  let mockCore: ISyncCore;
  let hiddenSync: FridayHiddenFileSync;

  beforeEach(() => {
    mockFileLister = { list: vi.fn(async () => ({ files: [], folders: [] })) };
    mockCore = makeMockSyncCore({ 
      getSettings: () => ({ syncInternalFiles: true } as any) 
    });
    hiddenSync = new FridayHiddenFileSync(mockFileLister, mockCore);
  });

  it('isThisModuleEnabled returns true when settings.syncInternalFiles=true', () => {
    expect(hiddenSync.isThisModuleEnabled()).toBe(true);
  });

  it('getInternalFiles calls fileLister.list', async () => {
    mockFileLister.list = vi.fn(async () => ({
      files: ['.obsidian/plugins/my-plugin/main.js'],
      folders: ['.obsidian/plugins/my-plugin'],
    }));
    await hiddenSync.getInternalFiles();
    expect(mockFileLister.list).toHaveBeenCalledWith('.obsidian');
  });
});
```

#### Phase 4.4：迁移 ServerConnectivity（0.5h）

```typescript
// 修改前：直接使用顶级 requestUrl
import { requestUrl } from 'obsidian';

// 修改后：构造注入 IHttpClient
import type { IHttpClient } from "../../interfaces/IPluginAdapters";

export class ServerConnectivityChecker {
    private http: IHttpClient;
    
    constructor(http: IHttpClient) {
        this.http = http;
    }
    
    private async pingServer(setting: RemoteDBSettings) {
        // 修改前：const result = await requestUrl({ url, method: 'HEAD', throw: false });
        const result = await this.http.request({ url, method: 'HEAD', throw: false });
        return { ok: result.status >= 200 && result.status < 400 };
    }
}
```

**配套测试**：

```typescript
// src/sync/sync-core/tests/features/ServerConnectivity.test.ts
describe('ServerConnectivityChecker', () => {
  it('checkConnectivity returns REACHABLE when server responds 200', async () => {
    const mockHttp: IHttpClient = {
      request: vi.fn(async () => ({ status: 200, text: '', json: {}, arrayBuffer: new ArrayBuffer(0), headers: {} }))
    };
    const checker = new ServerConnectivityChecker(mockHttp);
    const result = await checker.checkConnectivity({ couchDB_URI: 'https://db.test' } as any);
    expect(result.status).toBe('REACHABLE');
  });

  it('checkConnectivity returns UNREACHABLE on network error', async () => {
    const mockHttp: IHttpClient = {
      request: vi.fn(async () => { throw new Error('Network error'); })
    };
    const checker = new ServerConnectivityChecker(mockHttp);
    const result = await checker.checkConnectivity({ couchDB_URI: 'https://db.test' } as any, true);
    expect(result.status).toBe('UNREACHABLE');
  });
  
  it('respects cooldown and returns cached result', async () => {
    const mockHttp: IHttpClient = { request: vi.fn(async () => ({ status: 200, text: '', json: {}, arrayBuffer: new ArrayBuffer(0), headers: {} })) };
    const checker = new ServerConnectivityChecker(mockHttp);
    await checker.checkConnectivity({ couchDB_URI: 'https://db.test' } as any, true);
    await checker.checkConnectivity({ couchDB_URI: 'https://db.test' } as any); // should use cache
    expect(mockHttp.request).toHaveBeenCalledTimes(1); // only 1 actual request
  });
});
```

**✅ 测试检查点**：所有 feature 测试通过，无 Obsidian 依赖

---

### Phase 5：创建 Obsidian 适配器（1h）

**目标**：在插件侧创建适配器，将 Obsidian Plugin 包装为 sync-core 接口。

**5.1 `src/sync/adapters/ObsidianDomEventRegistrar.ts`**

```typescript
import type { Plugin } from 'obsidian';
import type { IDomEventRegistrar } from '../sync-core/src/interfaces/IPluginAdapters';

/**
 * 将 Obsidian Plugin.registerDomEvent 包装为 IDomEventRegistrar 接口
 * Obsidian 的 registerDomEvent 在插件卸载时会自动清理事件监听器
 */
export class ObsidianDomEventRegistrar implements IDomEventRegistrar {
    constructor(private plugin: Plugin) {}

    registerDomEvent(
        el: EventTarget,
        type: string,
        handler: EventListenerOrEventListenerObject
    ): void {
        this.plugin.registerDomEvent(el as HTMLElement, type as keyof HTMLElementEventMap, handler as EventListener);
    }
}
```

**5.2 `src/sync/adapters/ObsidianVaultFileLister.ts`**

```typescript
import type { Plugin } from 'obsidian';
import type { IVaultFileLister } from '../sync-core/src/interfaces/IPluginAdapters';

/**
 * 将 Obsidian plugin.app.vault.adapter.list 包装为 IVaultFileLister 接口
 */
export class ObsidianVaultFileLister implements IVaultFileLister {
    constructor(private plugin: Plugin) {}

    async list(path: string): Promise<{ files: string[]; folders: string[] }> {
        return this.plugin.app.vault.adapter.list(path);
    }
}
```

**5.3 `src/sync/adapters/ObsidianHttpClient.ts`**

```typescript
import { requestUrl } from 'obsidian';
import type { IHttpClient } from '../sync-core/src/interfaces/IPluginAdapters';

/**
 * 将 Obsidian requestUrl 包装为 IHttpClient 接口
 * requestUrl 绕过了 Obsidian 的 CORS 沙箱限制
 */
export class ObsidianHttpClient implements IHttpClient {
    async request(params: Parameters<IHttpClient['request']>[0]) {
        return requestUrl(params as any);
    }
}
```

**✅ 测试检查点**：`npm test` → 全绿

---

### Phase 6：更新 Friday* 文件引用（2h）

**目标**：Friday* 文件从新位置 import，同时补充接口实现声明。

**6.1 更新 `FridaySyncCore.ts`**

```typescript
// 新增 implements 声明
import type { ISyncCore } from './sync-core/src/interfaces/ISyncCore';

export class FridaySyncCore implements ISyncCore {
    // 现有代码完全不变
    // TypeScript 会检查是否满足接口，若有遗漏会报错提示
    
    // 更新 features 实例化（传适配器替代 plugin）
    this._networkEvents = new FridayNetworkEvents(
        new ObsidianDomEventRegistrar(plugin),  // ← 新
        this
    );
    this._hiddenFileSync = new FridayHiddenFileSync(
        new ObsidianVaultFileLister(plugin),    // ← 新
        this
    );
    this._serverChecker = new ServerConnectivityChecker(
        new ObsidianHttpClient()                 // ← 新
    );
}
```

**6.2 批量更新 import 路径**

使用脚本批量将 Friday* 文件中的 `from "./core/` 替换为 `from "./sync-core/src/core/`：

```bash
# 预览变更
grep -rn 'from "\./core/' src/sync/FridaySyncCore.ts | head -20
grep -rn 'from "\./core/' src/sync/FridayServiceHub.ts | head -20

# 替换（仅 Friday* 文件）
sed -i 's|from "\./core/|from "./sync-core/src/core/|g' src/sync/FridaySyncCore.ts
sed -i 's|from "\./core/|from "./sync-core/src/core/|g' src/sync/FridayServiceHub.ts
sed -i 's|from "\./core/|from "./sync-core/src/core/|g' src/sync/FridayStorageEventManager.ts

# 同样更新 features import
sed -i 's|from "\./features/|from "./sync-core/src/features/|g' src/sync/FridaySyncCore.ts
```

**6.3 更新 `tsconfig.json` 路径别名（为未来发包准备）**

```json
{
  "compilerOptions": {
    "paths": {
      "@mdfriday/sync-core": ["./src/sync/sync-core/src/index.ts"],
      "@mdfriday/sync-core/*": ["./src/sync/sync-core/src/*"]
    }
  }
}
```

**✅ 测试检查点**：`npm test` 全绿 + `npm run tsc-check` 无类型错误

---

### Phase 7：删除旧目录（1h）

**前提**：Phase 6 所有测试通过，TypeScript 编译无错误。

```bash
# 删除已迁移的旧目录
rm -rf src/sync/core/
rm -rf src/sync/features/

# 再次验证
npm run tsc-check
npm run build
npm test
```

**✅ 测试检查点**：构建成功 + 测试全绿

---

### Phase 8：完善测试与 NPM 发包准备（2h）

**8.1 补充 `ISyncCore.mock.ts` 完整版**

```typescript
// src/sync/sync-core/tests/__mocks__/ISyncCore.mock.ts
import { vi } from 'vitest';
import type { ISyncCore } from '../../src/interfaces/ISyncCore';

export function makeMockSyncCore(overrides: Partial<ISyncCore> = {}): ISyncCore {
    return {
        getSettings: vi.fn(() => ({
            liveSync: false,
            syncInternalFiles: true,
            couchDB_URI: 'https://test-db.example.com',
        } as any)),
        localDatabase: null,
        replicator: null,
        managers: null,
        services: {} as any,
        kvDB: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        } as any,
        serverStatus: 'UNKNOWN' as any,
        isManualOperation: false,
        manualOperationType: null,
        storageEventManager: null,
        hiddenFileSync: null,
        offlineTracker: null,
        connectionMonitor: null,
        connectionFailureHandler: null,
        isServerReachable: vi.fn(async () => true),
        setStatus: vi.fn(),
        startSync: vi.fn(async () => {}),
        ...overrides,
    };
}
```

**8.2 为 `sync-core` 添加 `esbuild` 构建配置**

在 `src/sync/sync-core/package.json` 中补充构建脚本：

```json
{
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js",
    "build:types": "tsc --declaration --emitDeclarationOnly --outDir dist/types",
    "test": "vitest run"
  }
}
```

**8.3 更新 `vitest.config.ts` 最终配置**

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'src/sync/sync-core/tests/**/*.test.ts', // 显式包含
    ],
    exclude: ['node_modules'],  // 移除对 sync/core/** 的排除
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/foundry/**',
        'src/services/license.ts',
        'src/services/licenseState.ts',
        'src/license.ts',
        'src/sync/sync-core/src/**',  // 新增覆盖率统计
      ],
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
      '@mdfriday/sync-core': path.resolve(__dirname, 'src/sync/sync-core/src/index.ts'),
    },
  },
});
```

---

## 五、测试策略

### 测试分层

| 层级 | 测试文件位置 | 覆盖内容 | 框架 |
|------|------------|---------|------|
| **接口契约** | `sync-core/tests/interfaces.test.ts` | 接口形状验证，mock 合规性 | vitest |
| **Feature 单元** | `sync-core/tests/features/*.test.ts` | 每个 feature 独立逻辑（使用 mock ISyncCore） | vitest |
| **Core 工具函数** | `sync-core/tests/core/utils.test.ts` | path、string、encryption 工具 | vitest |
| **Core 数据库** | `sync-core/tests/core/pouchdb.test.ts` | PouchDB in-memory 操作 | vitest + pouchdb-memory |
| **现有插件测试** | `tests/*.test.ts` | foundry、license、services | vitest（不改动）|

### 测试保障原则

1. **每个 Phase 结束后立即运行 `npm test`**，不积累失败
2. **先写测试再迁移代码**（针对 features），保证接口设计合理
3. **使用 `makeMockSyncCore()` 工厂函数**，统一 mock 维护入口
4. **sync-core 包内的测试不 import 任何 Obsidian API**
5. **obsidian mock 只在 plugin 测试中使用**，sync-core 测试完全无 Obsidian 依赖

### 阶段检查点汇总

| Phase | 执行命令 | 预期结果 |
|-------|---------|---------|
| 0 - 基线 | `npm test` | 4个测试文件全绿 |
| 1 - 骨架 | `npm test` | 仍然全绿（+0新测试）|
| 2 - 接口 | `npm test` | 全绿 + interfaces.test.ts 通过 |
| 3 - core迁移 | `npm test` | 全绿 |
| 4.1 - features(无Obsidian) | `npm test` | 全绿 + ConnectionMonitor/Failure/OfflineTracker 测试通过 |
| 4.2 - NetworkEvents | `npm test` | 全绿 + NetworkEvents 测试通过 |
| 4.3 - HiddenFileSync | `npm test` | 全绿 + HiddenFileSync 测试通过 |
| 4.4 - ServerConnectivity | `npm test` | 全绿 + ServerConnectivity 测试通过 |
| 5 - 适配器 | `npm test` | 全绿 |
| 6 - Friday* 更新 | `npm test` + `npm run tsc-check` | 全绿 + 0 TS 错误 |
| 7 - 删除旧目录 | `npm run build` + `npm test` | 构建成功 + 全绿 |
| 8 - 完善 | `npm test` | 全绿 + 覆盖率报告生成 |

---

## 六、构建配置变更

### esbuild.config.mjs 变更

```javascript
// 新增 SynchromeshLoader 替换（插件构建用 obsidian loader）
alias: {
  './SynchromeshLoader.platform': 
    './src/sync/sync-core/src/core/PlatformAPIs/SynchromeshLoader.obsidian',
  '@mdfriday/sync-core':
    './src/sync/sync-core/src/index.ts',
}
```

### tsconfig.json 变更

```json
{
  "compilerOptions": {
    "paths": {
      "@mdfriday/sync-core": ["./src/sync/sync-core/src/index.ts"],
      "@mdfriday/sync-core/*": ["./src/sync/sync-core/src/*"]
    }
  }
}
```

---

## 七、风险与对策

| 风险 | 可能性 | 对策 |
|------|--------|------|
| `FridaySyncCore implements ISyncCore` 时接口不匹配 | 中 | Phase 6 时 TS 编译器会精确报错，逐个补充缺失方法/属性 |
| `HiddenFileSync` 中 `plugin.app.vault.adapter` 用法不止 `list` | 中 | Phase 4.3 仔细检查全文，可能需要扩展 IVaultFileLister |
| import 路径批量替换遗漏 | 低 | 替换后立即运行 `tsc-check`，会明确报告未解析的模块 |
| PouchDB in-memory 测试在 Node 环境问题 | 低 | 已有 `pouchdb-adapter-memory` 依赖，参考现有 vitest 配置 |
| esbuild alias 配置导致产物路径错误 | 低 | 在 Phase 7 后增量测试产物，确认 Obsidian 插件可正常加载 |

---

## 八、验收标准

### 功能验收
- [ ] Obsidian 插件在桌面端功能完全正常（手工测试）
- [ ] Obsidian 插件在移动端功能完全正常（手工测试）
- [ ] CouchDB 同步正常工作（集成测试）

### 代码验收
- [ ] `npm test` 全部通过，无失败
- [ ] `npm run tsc-check` 零错误
- [ ] `npm run build` 产物正常
- [ ] `sync-core/` 目录内所有文件无 `import ... from 'obsidian'`（除 PlatformAPIs/obsidian/）
- [ ] `sync-core/` 目录内无直接 import `FridaySyncCore` 的运行时代码

### 发包就绪验收
- [ ] `sync-core/package.json` 配置完整（name, version, exports, dependencies）
- [ ] `sync-core/` 可独立运行 `npm test`（切入目录后）
- [ ] 测试覆盖率：features 模块 > 70%，core 工具函数 > 60%

---

## 九、时间估算

| Phase | 内容 | 预计工时 |
|-------|------|---------|
| 0 | 基线确认 | 0.5h |
| 1 | 创建包骨架 | 1h |
| 2 | 定义接口 + 接口测试 | 1.5h |
| 3 | 迁移 core/ | 1h |
| 4 | 迁移 features（含配套测试） | 4h |
| 5 | 创建 Obsidian 适配器 | 1h |
| 6 | 更新 Friday* 文件引用 | 2h |
| 7 | 删除旧目录 | 1h |
| 8 | 完善测试 + 发包准备 | 2h |
| **总计** | | **~14h（约 2 个工作日）** |

---

## 十、后续：正式发布为 NPM 包

当本仓库内的拆分验证完成后，正式发布仅需：

```bash
# 1. 切入 sync-core 目录
cd src/sync/sync-core

# 2. 配置 npm registry（如需私有发布）
# npm config set registry https://your-registry.com

# 3. 发布
npm publish --access public

# 4. 在本插件中替换本地路径为 npm 包
# package.json 中将本地 alias 替换为：
# "@mdfriday/sync-core": "^0.1.0"
```

发布后 `Friday*` 文件的 import 从 `./sync-core/src/...` 变为 `@mdfriday/sync-core`，
esbuild 和 tsconfig 中的 alias 即可删除。

