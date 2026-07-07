import type { Plugin } from 'obsidian';
import type { IDomEventRegistrar } from '@mdfriday/sync-core/interfaces/IPluginAdapters';

/**
 * Wraps Obsidian's Plugin.registerDomEvent as IDomEventRegistrar.
 *
 * Obsidian automatically removes all registered DOM events when the plugin
 * unloads, so this adapter preserves that lifecycle management.
 */
export class ObsidianDomEventRegistrar implements IDomEventRegistrar {
    constructor(private plugin: Plugin) {}

    registerDomEvent(
        el: EventTarget,
        type: string,
        handler: EventListenerOrEventListenerObject
    ): void {
        // Obsidian's registerDomEvent expects HTMLElement, but EventTarget is compatible.
        this.plugin.registerDomEvent(
            el as HTMLElement,
            type as keyof HTMLElementEventMap,
            handler as EventListener
        );
    }
}

