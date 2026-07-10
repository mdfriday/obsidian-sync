# Timeout Fix Plan — `Request timeout after 30000ms`

**Date**: 2026-07-10  
**Status**: 待确认后执行

---

## 一、问题现象

```
plugin:mdfriday-sync:31896 [Friday Sync] Request error: Error: Request timeout after 30000ms
    at eval (plugin:mdfriday-sync:31875:59)
```

- **只在 desktop 上出现**
- **只在 Obsidian 冷启动（首次激活插件）时出现**，热重载后消失

---

## 二、根本原因分析

### 2.1 直接原因：`requestUrl` Electron IPC 冷启动延迟

当前代码（`obsidian-sync/src/sync/FridayServiceHub.ts`）的 PouchDB fetch 适配器使用 Obsidian 的 `requestUrl` API：

```typescript
const requestPromise = requestUrl({ url: reqUrl, ... });

const result = isChanges
    ? await requestPromise
    : await Promise.race([
        requestPromise,
        new Promise<never>((_, reject) =>
            window.setTimeout(
                () => reject(new Error("Request timeout after 30000ms")),
                30000
            )
        ),
    ]);
```

**`requestUrl` 与 `fetch` 的架构差异：**

```
fetch（原生）:
  Renderer Process → Chromium 网络栈 → CouchDB
  （Chromium 在 Obsidian 窗口创建时已初始化，无额外延迟）

requestUrl:
  Renderer Process → Electron IPC → Main Process → Node.js net 模块 → CouchDB
  （IPC 通道在冷启动时可能尚未就绪）
```

**冷启动时序（一个文件的情况也会触发）：**

1. Obsidian 启动，Renderer 加载插件，插件调用 `requestUrl`
2. `requestUrl` 通过 Electron IPC 向 Main Process 发送请求
3. Main Process 的 `net.request` 模块在冷启动时可能未完全初始化
4. IPC 请求在队列中等待，累计耗时超过 30s
5. `Promise.race` 的 30s 超时先触发 → `Error: Request timeout after 30000ms`

热重载后无问题的原因：IPC 通道在首次激活时已建立完成，后续请求立即执行。

**原始版本（`obsidian-friday-plugin`）无此问题的原因：**
- 使用原生 `fetch`，直接走 Chromium 网络栈（Obsidian 窗口就绪时已初始化）
- 不经过 Electron IPC，无冷启动等待

**注：`requestUrl` 的另一个特性（全缓冲响应）虽然不是单文件场景的主因，但在大型 vault 中会叠加放大超时风险：**

| API | 响应模式 | 大批量响应（`_bulk_get` 数 MB） |
|---|---|---|
| 原生 `fetch` | **流式** — headers 到达即 resolve | 几百ms 内 resolve |
| `requestUrl` | **全缓冲** — 完整 body 下载后才 resolve | 几十秒（视 vault 大小）|

### Obsidian 官方文档关于 `fetch` 的说明

查询 Obsidian 官方插件文档（2026-07-10），结论：

- `requestUrl` 的定义："Similar to `fetch()`, request a URL using HTTP/HTTPS, **without any CORS restrictions**" — 核心价值是 CORS 绕过，非性能
- Plugin Guidelines **未禁止使用 `fetch`**，也未要求必须使用 `requestUrl`
- Mobile 限制页面禁止的是 "Node.js API 和 Electron API"；`fetch` 是标准 Web API，**移动端可用**

但 CORS 的影响需要区分平台：

| 平台 | `fetch` CORS | `requestUrl` |
|---|---|---|
| Desktop (Electron) | ✅ 无限制（Electron renderer 不执行 CORS） | ✅ 无限制 |
| Mobile (iOS/Android) | ⚠️ 受 WebView CORS 限制 | ✅ 绕过 CORS |

**结论**：CouchDB 服务器已启用 CORS，所有平台（Desktop + Mobile）均可直接使用 `fetch`，与原始版本完全一致，无需 Desktop/Mobile 分支。


### 2.2 次要原因：`_changes` 心跳竞争条件

LiveSyncReplicator 为持续同步设置：
```typescript
{ live: true, retry: true, heartbeat: 30000, ...syncOptionBase }
```

PouchDB 内部逻辑（`pouchdb-adapter-http`）：
```javascript
const CHANGES_TIMEOUT_BUFFER = 5000;
// PouchDB 认为 _changes 的安全超时 = heartbeat + 5000 = 35000ms
if (requestTimeout - opts.heartbeat < CHANGES_TIMEOUT_BUFFER) {
    requestTimeout = opts.heartbeat + CHANGES_TIMEOUT_BUFFER; // 35000ms
}
params.feed = 'longpoll';
params.heartbeat = 30000;
```

即 CouchDB 会保持 `_changes` 长连接开启 30s（无变更时发送心跳包）。

当前代码的 `isChanges` 检测已正确豁免了 `_changes` 请求的超时。但若改用 `fetch` + 无 `isChanges` 豁免（如原始版本），则：
- `AbortController(30000ms)` vs CouchDB heartbeat(30000ms) = 精确竞争
- 冷启动时网络延迟 Δ > 0 → 心跳包在 AbortController 触发后才到达 → AbortError

**结论：** 使用 `fetch` 时必须保留 `isChanges` 豁免，这是对原始版本的改进。

### 2.3 信号被覆盖问题

PouchDB 内部为 `_changes` 创建了自己的 `AbortController`（`pouchdb-adapter-http` line 990），并将其 `signal` 通过 `opts.signal` 传给自定义 `fetch`：

```javascript
// pouchdb-adapter-http 内部
const controller = new AbortController();
const fetchOpts = { signal: controller.signal, method, body };
await fetchJSON(url, fetchOpts);  // 经过 ourFetch → 调用我们的 fetch
```

当前代码和原始版本均用自己的 `controller.signal` 覆盖了 `opts.signal`：

```typescript
// 原始版本
const response = await fetch(url, { 
    ...opts,                     // opts.signal = PouchDB 的 signal
    headers,
    signal: controller.signal    // ← 覆盖！PouchDB 的 signal 失效
});
```

**影响**：当 PouchDB 想取消 `_changes` 请求（如用户停止同步），其内部的 `controller.abort()` 不会作用到我们的 HTTP 请求，请求继续挂起。

**原始版本同样存在此问题**，PouchDB 的 `retry: true` + `opts.aborted` 标志位在实践中掩盖了影响。

正确做法：使用 `AbortSignal.any()` 合并两个信号：
```typescript
const signals = [opts?.signal, controller.signal].filter(Boolean) as AbortSignal[];
const combinedSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
```

`AbortSignal.any()` 在 Chrome 116+ / Electron 28+ 中可用，Obsidian Desktop 的 Electron 版本满足要求。

### 2.4 `requestUrl` 遗留问题：缺少 `throw: false`

`requestUrl` 默认在 HTTP 状态码 ≥ 400 时抛出异常（`throw: true`）。以下两处遗留了 `requestUrl` 调用且未设置 `throw: false`：

**① `FridayServiceHub.ts` — `getCustomFetchHandler()`**（line ~92）
```typescript
const result = await requestUrl({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    throw: false,  // ← 添加：4xx/5xx 返回响应对象而非抛出异常
});
```

**② `FridaySyncCore.ts` — 连接测试**（line ~2181）
```typescript
const response = await requestUrl({
    url: dbUrl,
    method: "GET",
    headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
    },
    throw: false,  // ← 添加：否则 404 分支永远无法执行
});
// 代码期望检查 response.status === 404，但 requestUrl 在 404 时会 throw
// 导致 404 分支永远无法执行
```

这两处虽与 timeout 问题无直接关系，但是正确性 bug。

### 2.5 代码 typo

`FridaySyncCore.ts` 第 251 行末尾有多余的 `q`：

```typescript
private _statusDisplay: SyncStatusDisplay | null = null;q  // ← 多余的 q
```

---

## 三、与原始版本的对照表

| 项目 | 原始版本（`obsidian-friday-plugin`） | 当前版本（`obsidian-sync`） | 需要修改 |
|---|---|---|---|
| PouchDB fetch API | 原生 `fetch`（所有平台） | `requestUrl` | ✅ 改回 `fetch` |
| 响应模式 | 流式 | 全缓冲 | ✅ 由 API 决定 |
| `_changes` 超时豁免 | 无（全部加超时） | 有（`isChanges` 检查） | 保持，更安全 |
| `opts.signal` 处理 | 被覆盖（bug） | 被覆盖（bug） | ✅ 用 `AbortSignal.any()` 修复 |
| `getCustomFetchHandler` `throw` | N/A（无此方法） | 缺 `throw: false` | ✅ 添加 `throw: false` |
| 连接测试 `throw` | N/A（不同实现） | 缺 `throw: false` | ✅ 添加 `throw: false` |
| 代码 typo | 无 | 有（`q`） | ✅ 删除 |

---

## 四、完整修复方案

### 修改文件一：`src/sync/FridayServiceHub.ts`

#### 变更点 A：PouchDB fetch 适配器（统一使用原生 `fetch`）

**位置**：`connect()` 方法内的 `fetch:` 函数（当前约 955-1015 行）

**修改策略**：CouchDB 服务器已启用 CORS，与原始版本（`obsidian-friday-plugin`）完全一致，所有平台统一使用原生 `fetch`，无需 Desktop/Mobile 分支。

相比原始版本的两处改进：
1. **`isChanges` 豁免**：`_changes` 请求跳过 AbortController 超时（原始版本对所有请求加超时，存在 heartbeat 竞争风险）
2. **`AbortSignal.any()`**：合并 PouchDB 的 `opts.signal` 和我们的超时信号（原始版本覆盖了 `opts.signal`，是一个 bug）

**修改后代码（完整）：**
```typescript
fetch: async (url: string | Request, opts?: RequestInit) => {
    const headers = new Headers(opts?.headers);
    // ... 添加 customHeaders 和 auth（保持不变）...

    const reqUrl = typeof url === 'string' ? url : url.url;

    // _changes long-poll 不能加客户端超时：
    //   CouchDB heartbeat=30s，AbortController(30s) 竞争 → 冷启动 AbortError
    const isChanges = reqUrl.includes('/_changes');

    // 使用原生 fetch（与原始版本 obsidian-friday-plugin 一致）
    // CouchDB 服务器已启用 CORS，无需 requestUrl 绕过
    const DEFAULT_HTTP_TIMEOUT = 30000;
    const timeoutController = new AbortController();
    const timeoutId = isChanges
        ? undefined
        : window.setTimeout(() => timeoutController.abort(), DEFAULT_HTTP_TIMEOUT);

    // AbortSignal.any() 合并 PouchDB 的 signal 和我们的超时 signal
    // 修复原始版本的 bug：原始版本覆盖了 opts.signal，导致 PouchDB 无法取消自己的请求
    const signals: AbortSignal[] = [];
    if (opts?.signal) signals.push(opts.signal);
    if (!isChanges) signals.push(timeoutController.signal);
    const combinedSignal = signals.length === 1
        ? signals[0]
        : signals.length > 1
            ? AbortSignal.any(signals)
            : undefined;

    try {
        const response = await fetch(url, {
            ...opts,
            headers,
            ...(combinedSignal ? { signal: combinedSignal } : {}),
        });
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        return response;
    } catch (ex: any) {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (ex.name === 'AbortError' && !isChanges) {
            console.error("[Friday Sync] Request timeout after", DEFAULT_HTTP_TIMEOUT, "ms:", reqUrl);
            throw new Error(`Request timeout after ${DEFAULT_HTTP_TIMEOUT}ms`);
        }
        console.error("[Friday Sync] Fetch error:", ex);
        throw ex;
    }
},
```

#### 变更点 B：`getCustomFetchHandler()` 添加 `throw: false`

**位置**：`getCustomFetchHandler()` 方法（当前约 88-106 行）

```typescript
const result = await requestUrl({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    throw: false,  // ← 添加
});
```

---

### 修改文件二：`src/sync/FridaySyncCore.ts`

#### 变更点 C：连接测试添加 `throw: false`

**位置**：约 2181 行的 `requestUrl` 调用

```typescript
const response = await requestUrl({
    url: dbUrl,
    method: "GET",
    headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
    },
    throw: false,  // ← 添加：否则 HTTP 404 时抛出异常，导致"Database not found"提示失效
});
```

#### 变更点 D：删除 typo `q`

**位置**：约 251 行

```typescript
// 修改前
private _statusDisplay: SyncStatusDisplay | null = null;q

// 修改后
private _statusDisplay: SyncStatusDisplay | null = null;
```

---

## 五、修改影响范围与风险评估

| 修改 | 影响范围 | 风险 |
|---|---|---|
| A：`fetch` 替代 `requestUrl`（所有平台） | PouchDB 所有 HTTP 请求 | 低。与原始版本完全对齐；CouchDB 已启用 CORS |
| A：`isChanges` 超时豁免 | `_changes` 长连接 | 零风险，比原始版本更安全 |
| A：`AbortSignal.any()` | 请求取消逻辑 | 极低，仅影响用户主动停止同步场景 |
| B：`throw: false` | AWS S3 等后端适配器 | 低。修复 4xx 异常抛出问题 |
| C：`throw: false` | 连接测试 UI 提示 | 低。修复 404 提示语不准确的 bug |
| D：typo 删除 | 无运行时影响 | 零 |

---

## 六、验证方法

修复后验证以下场景：

1. **Desktop 冷启动**：重启 Obsidian，激活插件 → 不再出现 `Request timeout after 30000ms`
2. **大型 vault 首次同步**：vault 含大量文件时进行初始同步 → 正常完成
3. **LiveSync 持续模式**：开启 LiveSync 后保持运行 30+ 分钟 → `_changes` 连接不被超时中断
4. **修改文件实时同步**：修改一个文件 → 对端实时收到变更
5. **连接测试**：设置页面"Test Connection"按钮，数据库不存在时 → 显示"Database not found"
6. **Mobile（如适用）**：移动端同步功能正常，无 CORS 错误
