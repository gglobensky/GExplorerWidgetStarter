// types/widgets-sdk.d.ts
// Public API surface for gexplorer widget development.
// Copy this file into your widget project's types/ folder.

import type { Ref, ShallowRef } from 'vue'

declare module 'gexplorer/widgets' {

    import type { Ref, ShallowRef } from 'vue'

    // ── Capability-gated SDK ───────────────────────────────────────────────
    // Injected by WidgetHost. Never import directly — use inject():
    //
    //   import { inject } from 'vue'  // or /runtime/vue.js
    //   import type { WidgetSdk } from 'gexplorer/widgets'
    //   const sdk = inject<WidgetSdk>('widgetSdk')
    //   const { fsMove, fsListDirSmart } = sdk ?? {}

    export type WidgetSdk = {
        // Always available
        fsValidate?:     (path: string) => Promise<{ ok: boolean; exists?: boolean; isDir?: boolean; error?: string }>

        // Read cap
        fsListDirSmart?: (path: string, options?: FsListDirOptions) => Promise<FsListDirResult>
        shortcutsProbe?: (paths: string[]) => Promise<Record<string, string>>
        authorizeFileRefs?: (sourceWidgetType: string, sourceWidgetId: string, payload: any, caps?: string[]) => Promise<{ ok: boolean; reason?: string }>

        // Write cap
        fsWriteText?:  (path: string, text: string, overwrite?: boolean) => Promise<void>
        fsCopy?:       (items: Array<{ from: string; to: string }>) => Promise<void>
        fsMove?:       (items: Array<{ from: string; to: string }>) => Promise<void>
        fsRename?:     (oldPath: string, newPath: string) => Promise<{ ok: boolean; error?: string }>

        // Metadata cap
        fsDriveStats?:  (roots: string[]) => Promise<DriveStats[]>
        loadIconPack?:  () => Promise<void>

        // Media cap
        mintStreamHttp?:          (path: string, mimeHint?: string) => Promise<string>
        fileRefsToPlaylistItems?: (refs: FileRefData[], receiverWidgetType: string, receiverWidgetId: string) => Promise<PlaylistItem[]>

        // Network cap
        networkFetch?: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
            ok: boolean; status: number; statusText: string
            json: () => Promise<any>; text: () => Promise<string>
        }>

        // Clipboard cap
        clipboardCopyFiles?: (paths: string[]) => Promise<void>
        clipboardCutFiles?:  (paths: string[]) => Promise<void>
        clipboardGetFiles?:  () => Promise<ClipboardState>
    }

    // ── FS types ───────────────────────────────────────────────────────────

    export type FsListDirOptions = {
        sortBy?:        'name' | 'kind' | 'ext' | 'size' | 'modified'
        sortDir?:       'asc' | 'desc'
        filterExts?:    string[]
        activeOptions?: string[]
        chunked?:       boolean
        chunkSize?:     number
    }

    export type FsEntry = {
        Name:     string
        FullPath: string
        Kind:     'file' | 'dir'
        Size?:    number
        Modified?: string
        Ext?:     string
    }

    export type FsListDirResult = {
        ok:       boolean
        entries:  FsEntry[]
        error?:   string
    }

    export type DriveStats = {
        root:    string
        name:    string
        fsType:  string
        kind:    string
        total?:  number
        free?:   number
    }

    // ── Clipboard types ────────────────────────────────────────────────────

    export type ClipboardOperation = 'copy' | 'cut' | 'none'

    export type ClipboardState = {
        hasFiles:  boolean
        operation: ClipboardOperation
        paths:     string[]
        count:     number
        canPaste:  boolean
    }

    // ── DnD types ──────────────────────────────────────────────────────────

    export type GexDnDType = 'gex/file-refs' | 'gex/text' | 'gex/url' | 'gex/custom'

    export type GexDnDPayload<T = any> = {
        type:   GexDnDType | string
        data:   T
        source: { widgetType: string; widgetId: string }
        metadata?: Record<string, any>
    }

    export type FileRefData = {
        path:         string
        name:         string
        size?:        number
        mimeType?:    string
        isDirectory?: boolean
    }

    export type DnDValidator = (
        payload: GexDnDPayload,
        context: { widgetType: string; widgetId: string }
    ) => Promise<{ ok: boolean; reason?: string }>

    // ── Messaging ──────────────────────────────────────────────────────────

    export type ScopedMessaging = {
        send:    (to: string, topic: string, payload?: any) => void
        on:      (topic: string, handler: (msg: any) => void) => () => void
        cleanup: () => void
    }

    // ── Sortable / Selection ───────────────────────────────────────────────

    export type CreateSortableOptions = Record<string, any>
    export type SortableHandle = Record<string, any>
    export type ItemsAdapter  = Record<string, any>
    export type Mods          = Record<string, any>
    export type GeometryAdapter = Record<string, any>
    export type ScrollerAdapter = Record<string, any>
    export type Rect = { x: number; y: number; width: number; height: number }
    export type DropIntent = 'before' | 'after' | 'into'
    export type Cap = 'Read' | 'Write' | 'Metadata' | 'Media' | 'Network' | 'Clipboard' | 'Exec'

    // ── Drives ─────────────────────────────────────────────────────────────

    export type DriveSnapshot = {
        root:   string
        name:   string
        fsType: string
        kind:   string
    }

    // ── Favorites ──────────────────────────────────────────────────────────

    export type FavoriteEntry = {
        id:    string
        label: string
        path:  string
        icon?: string
    }

    export type FavoriteTreeNode = {
        id:       string
        label:    string
        children: FavoriteTreeNode[]
        entry?:   FavoriteEntry
    }

    export type FavoritesConfig = {
        entries: FavoriteEntry[]
    }

    // ── Playlist ───────────────────────────────────────────────────────────

    export type PlaylistItem = {
        id:    string
        src:   string
        name?: string
        type?: string
    }

    // ── Free utilities (import directly) ───────────────────────────────────

    export function createLinearSortable(options: CreateSortableOptions): SortableHandle
    export function useSortable(options: any): any
    export function useScrollHints(options: any): any
    export function useSnapResize(options: any): any
    export function createDragTrigger(options: any): any
    export function createSelectionEngine(adapter: ItemsAdapter): any
    export function createMarqueeDriver(adapter: GeometryAdapter): any
    export function fsValidate(path: string): Promise<{ ok: boolean; exists?: boolean; isDir?: boolean; error?: string }>
    export function iconFor(path: string): string
    export function ensureIconsFor(paths: string[]): Promise<void>
    export function createGexPayload<T>(type: GexDnDType | string, data: T, source: { widgetType: string; widgetId: string }, metadata?: Record<string, any>): GexDnDPayload<T>
    export function setGexPayload(dataTransfer: DataTransfer, payload: GexDnDPayload): void
    export function createDragPreview(options: { label: string; icon?: string; count?: number }): HTMLElement
    export function extractGexPayload(e: DragEvent): GexDnDPayload | null
    export function hasGexPayload(e: DragEvent): boolean
    export function authorizeFileRefs(widgetType: string, widgetId: string, payload: GexDnDPayload, caps?: string[]): Promise<{ ok: boolean; reason?: string }>
    export function authorizeDrop(widgetType: string, widgetId: string, payload: GexDnDPayload, validator: DnDValidator): Promise<{ ok: boolean; reason?: string }>
    export function fileRefsToPlaylistItems(refs: FileRefData[], receiverWidgetType: string, receiverWidgetId: string): Promise<PlaylistItem[]>
    export function setActiveDragPayload(payload: GexDnDPayload, sourceId: string): void
    export function clearActiveDragPayload(): void
    export function startNativeDrag(paths: string[], preview: { label: string; icon?: string; count?: number }, callbacks: { onDragOver?: (x: number, y: number) => void; onDragLeave?: () => void; onDrop?: () => void; onExternalResult?: (effect: string) => void }, x: number, y: number): () => void
    export function createWidgetMessaging(sourceId: string): ScopedMessaging
    export function subscribeDrives(callback: (drives: DriveSnapshot[]) => void): () => void
    export function getDrives(): DriveSnapshot[]
    export function getFavorites(): FavoritesConfig
    export function getGlobalFavorites(): FavoriteEntry[]
    export function addFavorite(entry: FavoriteEntry): void
    export function addFolder(node: FavoriteTreeNode): void
    export function removeFavorite(id: string): void
    export function removeFolder(id: string): void
    export function applyFavoritesMove(from: number, to: number): void
    export function getCurrentPath(): string | null
    export function createLifecycle(ownerId: string): any
    export function useAudio(): any
    export function registerWidgetMenus(widgetType: string, config: any): void
    export function startRename(options: any): any
    export function useDialog(): any
}