/**
 * SyncStatusDisplay - Status display module from livesync
 * 
 * This is a direct port of livesync's ModuleLog status display functionality
 */

import { Plugin, Notice, Platform, Menu, MenuItem } from "obsidian";
import { computed, reactive, reactiveSource, type ReactiveValue } from "octagonal-wheels/dataobject/reactive";
import type { DatabaseConnectingStatus } from "@mdfriday/sync-core/core/common/types";
import type { FridaySyncCore } from "./FridaySyncCore";
import { FileProgressTracker, type FileProgressState } from "./utils/FileProgressTracker";

export const MARK_DONE = "\u{2009}\u{2009}";

/**
 * Truncate long text for mobile display
 * Keeps important parts: direction (head) and filename (tail), omits middle path
 * 
 * Example: "DB:.git/objects/2f/8fb5836df82109160c5294a239af8e972a7written"
 *   -> "DB:.git/objects/2f/8f...972a7written"
 */
function truncateMiddleForMobile(text: string, maxLength: number = 60): string {
    if (!Platform.isMobile || text.length <= maxLength) {
        return text;
    }
    
    // Keep 40% at start (direction + beginning of path)
    // Keep 40% at end (filename)
    // Middle 20% replaced with "..."
    const headLength = Math.floor(maxLength * 0.4);
    const tailLength = Math.floor(maxLength * 0.4);
    
    const head = text.substring(0, headLength);
    const tail = text.substring(text.length - tailLength);
    
    return `${head}...${tail}`;
}

export class SyncStatusDisplay {
    private plugin: Plugin;
    private core: FridaySyncCore | null = null;
    
    // UI Elements (exactly matching livesync's DOM structure)
    statusBar?: HTMLElement;
    statusDiv?: HTMLElement;
    statusLine?: HTMLDivElement;
    messageArea?: HTMLDivElement;
    logMessage?: HTMLDivElement;
    logHistory?: HTMLDivElement;
    
    // ✨ Progress Bar Elements
    private progressBarContainer?: HTMLDivElement;
    private progressBarTrack?: HTMLDivElement;
    private progressBarFill?: HTMLDivElement;
    private progressBarLabel?: HTMLDivElement;
    
    // ✨ File Progress Tracker (替代旧的 ProgressTracker)
    private fileProgressTracker: FileProgressTracker;
    
    // Reactive sources
    statusBarLabels!: ReactiveValue<{ message: string; status: string }>;
    statusLog = reactiveSource("");  // Current log message to display below status line
    
    // Notification handling
    notifies: { [key: string]: { notice: Notice; count: number } } = {};
    
    // Animation frame handling
    nextFrameQueue: ReturnType<typeof requestAnimationFrame> | undefined = undefined;
    
    // Log message hide timer
    private logHideTimer?: number;
    
    /**
     * Get whether editor status should be shown from plugin settings
     * Mobile: Always show (no status bar on mobile)
     * Desktop: Respect user settings
     */
    private get shouldShowEditorStatus(): boolean {
        // Mobile always shows editor status (no status bar on mobile)
        if (Platform.isMobile) {
            return true;
        }
        // Desktop respects user settings
        const pluginWithSettings = this.plugin as unknown as { settings?: { showEditorStatusDisplay?: boolean } };
        return pluginWithSettings.settings?.showEditorStatusDisplay ?? false;
    }
    
    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.fileProgressTracker = new FileProgressTracker();
        
        // ✨ 监听文件进度状态变化
        this.fileProgressTracker.onStateChange((state) => {
            this.updateProgressBar(state);
        });
    }
    
    /**
     * Get file progress tracker (for FridaySyncCore to use)
     */
    getFileProgressTracker(): FileProgressTracker {
        return this.fileProgressTracker;
    }
    
    /**
     * Set the sync core reference
     */
    setCore(core: FridaySyncCore) {
        this.core = core;
    }
    
    /**
     * Initialize the status display
     * Note: Call setCore() before initialize() if you want reactive status updates
     * 
     * DOM structure (exactly matching livesync):
     * <div class="livesync-status">
     *   <div class="livesync-status-statusline">Sync: 💤 ↑ 41 ↓ 0</div>
     *   <div class="livesync-status-messagearea"></div>
     *   <div class="livesync-status-logmessage"></div>
     *   <div class="livesync-status-loghistory"></div>
     * </div>
     */
    initialize() {
        // Remove any existing status divs
        activeDocument.querySelectorAll(".livesync-status")?.forEach((e) => e.remove());
        
        // Create status div in workspace container (exactly matching livesync's structure)
        this.statusDiv = this.plugin.app.workspace.containerEl.createDiv({ cls: "livesync-status" });
        this.statusLine = this.statusDiv.createDiv({ cls: "livesync-status-statusline" });
        
        this.messageArea = this.statusDiv.createDiv({ cls: "livesync-status-messagearea" });
        this.logMessage = this.statusDiv.createDiv({ cls: "livesync-status-logmessage" });
        this.logHistory = this.statusDiv.createDiv({ cls: "livesync-status-loghistory" });
        
        // ✨ Create progress bar container (at the bottom, after all other elements)
        this.progressBarContainer = this.statusDiv.createDiv({ 
            cls: "livesync-status-progressbar" 
        });
        
        this.progressBarTrack = this.progressBarContainer.createDiv({ 
            cls: "livesync-progressbar-track" 
        });
        
        this.progressBarFill = this.progressBarTrack.createDiv({ 
            cls: "livesync-progressbar-fill" 
        });
        
        this.progressBarLabel = this.progressBarContainer.createDiv({ 
            cls: "livesync-progressbar-label" 
        });
        
        // Create status bar (bottom bar)
        this.statusBar = this.plugin.addStatusBarItem();
        this.statusBar.addClass("syncstatusbar");
        this.statusBar.addClass("clickable-statusbar");
        
        // Make status bar clickable
        this.statusBar.addEventListener('click', (e) => {
            this.showStatusBarMenu(e);
        });
        
        // Set up reactive observers (uses core if available)
        this.observeForLogs();
        
        // Position the status div after layout is ready
        this.plugin.app.workspace.onLayoutReady(() => {
            this.adjustStatusDivPosition();
        });
        
        // Register layout change event
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("layout-change", () => {
                this.adjustStatusDivPosition();
            })
        );
        
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("active-leaf-change", () => {
                this.adjustStatusDivPosition();
            })
        );
        
        // Apply initial visibility setting
        this.applyEditorStatusVisibility();
    }
    
    /**
     * Set up reactive observers for log display (from livesync's ModuleLog)
     */
    observeForLogs() {
        const padSpaces = `\u{2007}`.repeat(10);
        
        // Helper function to create padded counter labels
        function padLeftSpComputed(numI: ReactiveValue<number>, mark: string) {
            const formatted = reactiveSource("");
            let timer: number | undefined = undefined;
            let maxLen = 1;
            numI.onChanged((numX) => {
                const num = numX.value;
                const numLen = `${Math.abs(num)}`.length + 1;
                maxLen = maxLen < numLen ? numLen : maxLen;
                if (timer) window.clearTimeout(timer);
                if (num == 0) {
                    timer = window.setTimeout(() => {
                        formatted.value = "";
                        maxLen = 1;
                    }, 3000);
                }
                formatted.value = ` ${mark}${`${padSpaces}${num}`.slice(-maxLen)}`;
            });
            return computed(() => formatted.value);
        }
        
        // Create counter labels if core is available
        const replicationResultCount = this.core?.replicationResultCount ?? reactiveSource(0);
        const databaseQueueCount = this.core?.databaseQueueCount ?? reactiveSource(0);
        const storageApplyingCount = this.core?.storageApplyingCount ?? reactiveSource(0);
        const processing = this.core?.processing ?? reactiveSource(0);
        const totalQueued = this.core?.totalQueued ?? reactiveSource(0);
        const batched = this.core?.batched ?? reactiveSource(0);
        const requestCount = this.core?.requestCount ?? reactiveSource(0);
        const responseCount = this.core?.responseCount ?? reactiveSource(0);
        
        const labelReplication = padLeftSpComputed(replicationResultCount, `📥`);
        const labelDBCount = padLeftSpComputed(databaseQueueCount, `📄`);
        const labelStorageCount = padLeftSpComputed(storageApplyingCount, `💾`);
        
        const queueCountLabelX = reactive(() => {
            return `${labelReplication()}${labelDBCount()}${labelStorageCount()}`;
        });
        const queueCountLabel = () => queueCountLabelX.value;
        
        const requestingStatLabel = computed(() => {
            const diff = requestCount.value - responseCount.value;
            return diff != 0 ? "📲 " : "";
        });
        
        const replicationStat = this.core?.replicationStat ?? reactiveSource({
            sent: 0,
            arrived: 0,
            maxPullSeq: 0,
            maxPushSeq: 0,
            lastSyncPullSeq: 0,
            lastSyncPushSeq: 0,
            syncStatus: "NOT_CONNECTED" as DatabaseConnectingStatus,
        });
        
        const replicationStatLabel = computed(() => {
            const e = replicationStat.value;
            const sent = e.sent;
            const arrived = e.arrived;
            const maxPullSeq = e.maxPullSeq;
            const maxPushSeq = e.maxPushSeq;
            const lastSyncPullSeq = e.lastSyncPullSeq;
            const lastSyncPushSeq = e.lastSyncPushSeq;
            let pushLast = "";
            let pullLast = "";
            let w = "";
            
            const labels: Partial<Record<DatabaseConnectingStatus, string>> = {
                CONNECTED: "⚡",
                JOURNAL_SEND: "📦↑",
                JOURNAL_RECEIVE: "📦↓",
            };
            
            switch (e.syncStatus) {
                case "CLOSED":
                case "COMPLETED":
                case "NOT_CONNECTED":
                    w = "⏹";
                    break;
                case "STARTED":
                    w = "🌀";
                    break;
                case "PAUSED":
                    w = "💤";
                    break;
                case "CONNECTED":
                case "JOURNAL_SEND":
                case "JOURNAL_RECEIVE":
                    w = labels[e.syncStatus] || "⚡";
                    pushLast =
                        lastSyncPushSeq == 0
                            ? ""
                            : lastSyncPushSeq >= maxPushSeq
                              ? " (LIVE)"
                              : ` (${maxPushSeq - lastSyncPushSeq})`;
                    pullLast =
                        lastSyncPullSeq == 0
                            ? ""
                            : lastSyncPullSeq >= maxPullSeq
                              ? " (LIVE)"
                              : ` (${maxPullSeq - lastSyncPullSeq})`;
                    break;
                case "ERRORED":
                    w = "⚠";
                    break;
                default:
                    w = "?";
            }
            return { w, sent, pushLast, arrived, pullLast };
        });
        
        const labelProc = padLeftSpComputed(processing, `⏳`);
        const labelPend = padLeftSpComputed(totalQueued, `🛫`);
        const labelInBatchDelay = padLeftSpComputed(batched, `📬`);
        
        const waitingLabel = computed(() => {
            return `${labelProc()}${labelPend()}${labelInBatchDelay()}`;
        });
        
        const statusLineLabel = computed(() => {
            const { w, sent, pushLast, arrived, pullLast } = replicationStatLabel();
            const queued = queueCountLabel();
            const waiting = waitingLabel();
            const networkActivity = requestingStatLabel();
            return {
                message: `${networkActivity}Sync: ${w} ↑ ${sent}${pushLast} ↓ ${arrived}${pullLast}${waiting}${queued}`,
            };
        });
        
        const statusBarLabels = reactive(() => {
            const { message } = statusLineLabel();
            return {
                message: `${message}`,
                status: "",  // Not used anymore
            };
        });
        this.statusBarLabels = statusBarLabels;
        
        // Throttled update
        let updateTimer: number | undefined;
        const applyToDisplay = (label: typeof statusBarLabels.value) => {
            if (updateTimer) return;
            updateTimer = window.setTimeout(() => {
                updateTimer = undefined;
                this.applyStatusBarText();
            }, 20);
        };
        statusBarLabels.onChanged((label) => applyToDisplay(label.value));
    }
    
    /**
     * Adjust status div position to active leaf (from livesync's ModuleLog)
     * Positions the status display in the top-right corner of the active editor pane
     * The actual positioning is done via CSS (position: absolute, top: var(--header-height), text-align: right)
     */
    adjustStatusDivPosition() {
        const mdv = this.plugin.app.workspace.getMostRecentLeaf();
        if (mdv && this.statusDiv) {
            // Remove from current position
            this.statusDiv.remove();
            // Insert into the active leaf's container
            const container = mdv.view.containerEl;
            container.insertBefore(this.statusDiv, container.lastChild);
            
            // Apply visibility setting after position adjustment
            this.applyEditorStatusVisibility();
        }
    }
    
    /**
     * Apply status text to UI elements (matching livesync's behavior)
     * Shows:
     * - statusLine: "Sync: ⚡ ↑ 0 (LIVE) ↓ 3 (LIVE)"
     * - logMessage: Current log message (e.g., "Replication activated")
     * 
     * Mobile: Truncates long messages to prevent UI overlap
     */
    applyStatusBarText() {
        if (this.nextFrameQueue) {
            return;
        }
        this.nextFrameQueue = window.requestAnimationFrame(() => {
            this.nextFrameQueue = undefined;
            const { message } = this.statusBarLabels.value;
            const newMsg = message;
            const newLog = this.statusLog.value;
            
            // Update bottom status bar
            this.statusBar?.setText(newMsg.split("\n")[0]);
            
            // Update status line in editor (top right corner)
            if (this.statusLine) {
                this.statusLine.innerText = newMsg;
            }
            
            // Update log message below status line (like livesync)
            // Mobile: Truncate long messages to prevent overlap with icons
            if (this.logMessage) {
                this.logMessage.innerText = truncateMiddleForMobile(newLog);
            }
        });
    }
    
    /**
     * Add a log message (matching livesync's __addLog behavior)
     * 
     * Log levels (from livesync):
     * - LOG_LEVEL_DEBUG = 1    -> Skip (not shown in UI)
     * - LOG_LEVEL_VERBOSE = 2  -> Skip (not shown in UI)
     * - LOG_LEVEL_INFO = 32    -> Show in logMessage area (below status line)
     * - LOG_LEVEL_NOTICE = 64  -> Show in logMessage area + Notice popup
     * - LOG_LEVEL_URGENT = 128 -> Show in logMessage area + Notice popup
     * 
     * @param message - The log message
     * @param level - Log level
     * @param key - Optional key for Notice grouping
     */
    addLog(message: string, level: number = 32, key?: string) {
        // Filter out DEBUG and VERBOSE level messages (matching livesync's default behavior)
        // LOG_LEVEL_DEBUG = 1, LOG_LEVEL_VERBOSE = 2, LOG_LEVEL_INFO = 32
        if (level < 32) {
            // Debug/Verbose messages - don't show in UI (only in console)
            return;
        }
        
        // Update statusLog to display in logMessage area (below status line)
        // This matches livesync's behavior: statusLog.value = messageContent
        this.statusLog.value = message;
        this.applyStatusBarText();
        
        // Schedule log message clear after 3 seconds (like livesync)
        if (this.logHideTimer) {
            window.clearTimeout(this.logHideTimer);
        }
        this.logHideTimer = window.setTimeout(() => {
            this.statusLog.value = "";
            this.applyStatusBarText();
        }, 3000);
        
        // Only show Notice for LOG_LEVEL_NOTICE (64) and above
        if (level >= 64) {
            this.showNotice(message, key);
        }
    }
    
    /**
     * Show a notice
     */
    showNotice(message: string, key?: string, timeout = 5000) {
        if (!key) key = message;
        
        if (key in this.notifies) {
            const isShown = this.notifies[key].notice.messageEl?.isShown();
            if (!isShown) {
                this.notifies[key].notice = new Notice(message, 0);
            }
            
            if (key === message) {
                this.notifies[key].count++;
                this.notifies[key].notice.setMessage(`(${this.notifies[key].count}): ${message}`);
            } else {
                this.notifies[key].notice.setMessage(message);
            }
        } else {
            const notice = new Notice(message, 0);
            this.notifies[key] = {
                count: 0,
                notice: notice,
            };
        }
        
        // Schedule hide
        if (!key.startsWith("keepalive-") || message.indexOf(MARK_DONE) !== -1) {
            window.setTimeout(() => {
                if (this.notifies[key]) {
                    const notice = this.notifies[key].notice;
                    delete this.notifies[key];
                    try {
                        notice.hide();
                    } catch {
                        // NO OP
                    }
                }
            }, timeout);
        }
    }
    
    /**
     * Apply editor status visibility based on settings
     */
    applyEditorStatusVisibility() {
        if (this.statusDiv) {
            if (this.shouldShowEditorStatus) {
                this.statusDiv.show();
            } else {
                this.statusDiv.hide();
            }
        }
    }
    
    /**
     * Toggle editor status display visibility
     */
    async toggleEditorStatusDisplay() {
        interface PluginWithSettings { settings: { showEditorStatusDisplay: boolean }; saveSettings(): Promise<void>; }
        const plugin = this.plugin as unknown as PluginWithSettings;
        plugin.settings.showEditorStatusDisplay = !plugin.settings.showEditorStatusDisplay;
        await plugin.saveSettings();
        
        // Apply visibility immediately
        this.applyEditorStatusVisibility();
    }
    
    /**
     * Show context menu when clicking on status bar
     * Mobile: Simplified menu (no toggle option, always shows editor status)
     */
    private showStatusBarMenu(event: MouseEvent) {
        const menu = new Menu();
        
        // Menu item 1: Toggle editor status display (Desktop only)
        // Mobile always shows editor status, no need for this option
        if (Platform.isDesktop) {
            menu.addItem((item: MenuItem) => {
                item
                    .setTitle(
                        this.shouldShowEditorStatus 
                            ? '隐藏编辑器内状态' 
                            : '显示编辑器内状态'
                    )
                    .setIcon(this.shouldShowEditorStatus ? 'eye-off' : 'eye')
                    .onClick(async () => {
                        await this.toggleEditorStatusDisplay();
                    });
            });
            
            menu.addSeparator();
        }
        
        // Menu item 2: Reconnect if not connected
        const syncStatus = this.core?.replicationStat?.value?.syncStatus;
        if (syncStatus === 'NOT_CONNECTED' || syncStatus === 'ERRORED') {
            menu.addItem((item: MenuItem) => {
                item
                    .setTitle('重新连接同步')
                    .setIcon('refresh-cw')
                    .onClick(async () => {
                        if (this.core) {
                            await this.core.startSync();
                        }
                    });
            });
        }
        
        // Menu item 3: Open sync settings
        menu.addItem((item: MenuItem) => {
            item
                .setTitle('同步设置')
                .setIcon('settings')
                .onClick(() => {
                    const appWithSetting = this.plugin.app as unknown as {
                        setting: { open(): void; openTabById(id: string): void };
                    };
                    appWithSetting.setting.open();
                    appWithSetting.setting.openTabById('mdfriday');
                });
        });
        
        // Show menu at mouse position
        menu.showAtMouseEvent(event);
    }
    
    /**
     * Clean up
     */
    onunload() {
        // Remove status bar item
        if (this.statusBar) {
            this.statusBar.remove();
            this.statusBar = undefined;
        }
        
        // Remove status div
        if (this.statusDiv) {
            this.statusDiv.remove();
            this.statusDiv = undefined;
        }
        activeDocument.querySelectorAll(".livesync-status")?.forEach((e) => e.remove());
        
        // Clear status bar items with syncstatusbar class
        activeDocument.querySelectorAll(".syncstatusbar")?.forEach((e) => e.remove());
        
        // Hide all notifications
        for (const key in this.notifies) {
            try {
                this.notifies[key].notice.hide();
            } catch {
                // NO OP
            }
        }
        this.notifies = {};
        
        // Clear progress tracker
        this.fileProgressTracker?.reset();
        
        // Clear core reference
        this.core = null;
    }
    
    /**
     * Update progress bar display
     */
    private updateProgressBar(state: FileProgressState): void {
        if (!this.progressBarContainer || !this.progressBarFill || !this.progressBarLabel) {
            return;
        }
        
        const progress = this.fileProgressTracker.getOverallProgress();
        const displayText = this.fileProgressTracker.getDisplayText();
        
        // 空闲状态：隐藏进度条
        if (state.currentOperation === 'idle') {
            // Only animate fadeout if the progress bar was previously active
            if (this.progressBarContainer.hasClass("active")) {
                this.progressBarContainer.addClass("fadeout");
                window.setTimeout(() => {
                    this.progressBarContainer?.removeClass("active", "fadeout");
                }, 1000);
            } else {
                this.progressBarContainer.removeClass("active", "fadeout");
            }
            return;
        }
        
        // Show progress bar
        this.progressBarContainer.addClass("active");
        this.progressBarContainer.removeClass("fadeout");
        
        // ✨ 区分确定进度和不确定进度
        if (progress === -1) {
            // 不确定进度：显示滚动动画（实时同步场景）
            this.progressBarFill.addClass("indeterminate");
            this.progressBarFill.setCssStyles({ width: '' });  // CSS 动画控制宽度
            this.progressBarLabel.innerText = displayText;
        } else {
            // 确定进度：显示百分比（首次上传/下载场景）
            this.progressBarFill.removeClass("indeterminate");
            this.progressBarFill.setCssStyles({ width: `${progress}%` });
            this.progressBarLabel.innerText = displayText;
        }
        
        // Completed state
        if (progress >= 100) {
            this.progressBarFill.addClass("completed");
        } else {
            this.progressBarFill.removeClass("completed");
        }
    }
}
