// types/widgets-sdk.d.ts
// Public API surface for GExplorer widget development.
// Copy this file into your widget project's types/ folder.

import type { ComputedRef, Ref } from 'vue'

declare module 'gexplorer/widgets' {

    // ── Capability-gated SDK ───────────────────────────────────────────────
    // Injected by WidgetHost. Never import an app SDK instance directly — use:
    //
    //   import { inject } from 'vue' // or /runtime/vue.js
    //   import type { WidgetSdk } from 'gexplorer/widgets'
    //
    //   const sdk = inject<WidgetSdk>('widgetSdk')
    //
    // The SDK is capability-gated by the widget's entry.ts declaration.
    // Low-level P2P/mesh/EDHT internals are intentionally not public.

    export type WidgetSdk = {
        widgetType?: string

        // Always available / utility
        fsValidate?: (path: string) => Promise<{
            ok: boolean
            exists?: boolean
            isDir?: boolean
            error?: string
        }>

        configRead?: <T = any>(name: string) => Promise<T | null>
        configWrite?: (name: string, data: any) => Promise<void>

        fsWatch?: (path: string, onChange: () => void) => () => void

        shortcutsProbe?: (paths: string[]) => Promise<Record<string, string>>

        authorizeFileRefs?: (
            sourceWidgetType: string,
            sourceWidgetId: string,
            payload: any,
            caps?: string[]
        ) => Promise<{ ok: boolean; reason?: string }>

        renamePreview?: (
            files: string[],
            matchPattern: string,
            replacePattern: string,
            options?: RenamePreviewOptions
        ) => Promise<RenamePreviewResult[]>

        openEntry?: (entry: any) => Promise<void>
        openFolder?: (entry: any) => Promise<void>

        // Read cap
        fsListDirSmart?: (path: string, options?: FsListDirOptions) => Promise<FsListDirResult>

        // Write cap
        fsMkdir?: (path: string) => Promise<void>
        fsWriteText?: (path: string, text: string, overwrite?: boolean) => Promise<void>
        fsCopy?: (items: Array<{ from: string; to: string }>) => Promise<void>
        fsMove?: (items: Array<{ from: string; to: string }>) => Promise<void>
        fsRename?: (oldPath: string, newPath: string) => Promise<{ ok: boolean; error?: string }>

        renameApplyBatch?: (
            renames: { from: string; to: string }[],
            ticket?: { widgetHash: string }
        ) => Promise<RenameApplyResult>

        // Metadata cap
        fsDriveStats?: (roots: string[]) => Promise<DriveStats[]>
        loadIconPack?: () => Promise<void>

        // Media cap
        mintStreamHttp?: (path: string, mimeHint?: string) => Promise<string>

        fileRefsToPlaylistItems?: (
            refs: FileRefData[],
            receiverWidgetType: string,
            receiverWidgetId: string
        ) => Promise<PlaylistItem[]>

        // Network cap
        networkFetch?: (
            url: string,
            options?: {
                method?: string
                headers?: Record<string, string>
                body?: string
            }
        ) => Promise<{
            ok: boolean
            status: number
            statusText: string
            json: () => Promise<any>
            text: () => Promise<string>
        }>

        // Clipboard cap
        clipboardCopyFiles?: (paths: string[]) => Promise<void>
        clipboardCutFiles?: (paths: string[]) => Promise<void>
        clipboardGetFiles?: () => Promise<ClipboardState>

        // P2P / SP2P public identity + invite APIs
        p2pGetIdentity?: () => Promise<P2PIdentity>
        p2pDeriveKey?: (context: string) => Promise<string>
        p2pSetUsername?: (username: string) => Promise<{ displayName: string }>

        p2pCreateInvite?: (
            sessionId: string,
            options?: {
                sessionSecret?: string
                validityMinutes?: number
            }
        ) => Promise<P2PInvite>

        p2pAcceptInvite?: (token: string) => Promise<AcceptedP2PInvite>

        // High-level public channel API.
        // Widgets use this instead of EDHT, mesh, raw P2P, or relay primitives.
        useChannel?: (options: PublicChannelOptions) => UseChannelReturn

        // SecureStorage cap
        vaultOpen?: (opts: {
            scopeId: string
            masterKey: string
        }) => Promise<{ vaultToken: string; vaultId: string }>

        vaultClose?: (vaultToken: string) => Promise<void>

        vaultSealAs?: (
            vaultToken: string,
            sourcePath: string,
            vpath: string
        ) => Promise<AccessPointEntry>

        vaultSealContentAs?: (
            vaultToken: string,
            content: string,
            vpath: string
        ) => Promise<AccessPointEntry>

        vaultUnseal?: (
            vaultToken: string,
            blobSha256: string,
            fileName: string
        ) => Promise<{ physicalPath: string }>

        vaultUnsealCleanup?: (physicalPath: string) => Promise<void>

        vaultUnsealText?: (
            vaultToken: string,
            blobSha256: string
        ) => Promise<string>

        vaultList?: (
            vaultToken: string,
            vpathPrefix?: string
        ) => Promise<AccessPointEntry[]>

        vaultDelete?: (
            vaultToken: string,
            accessPointId: string
        ) => Promise<void>

        // Chat cap
        // These are high-level public chat APIs.
        // Sending should generally go through ChannelSession.sendMessage().
        chatGetHistory?: (scopeId: string, limit?: number) => Promise<ChatMessage[]>
        chatSearch?: (scopeId: string, query: string, limit?: number) => Promise<ChatMessage[]>
        onChatMessage?: (handler: (msg: ChatMessage) => void) => () => void
        onChatHistoryReady?: (handler: (scopeId: string) => void) => () => void
    }

    // ── Capability types ───────────────────────────────────────────────────

    export type Cap =
        | 'Read'
        | 'Write'
        | 'Metadata'
        | 'Media'
        | 'Network'
        | 'Clipboard'
        | 'Exec'
        | 'P2P'
        | 'SP2P'
        | 'P2PDirect'
        | 'SecureStorage'
        | 'Chat'

    // ── FS types ───────────────────────────────────────────────────────────

    export type FsListDirOptions = {
        sortBy?: 'name' | 'kind' | 'ext' | 'size' | 'modified'
        sortDir?: 'asc' | 'desc'
        filterExts?: string[]
        activeOptions?: string[]
        chunked?: boolean
        chunkSize?: number
    }

    export type FsEntry = {
        Name: string
        FullPath: string
        Kind: 'file' | 'dir'
        Size?: number
        Modified?: string
        Ext?: string
    }

    export type FsListDirResult = {
        ok: boolean
        entries: FsEntry[]
        error?: string
    }

    export type DriveStats = {
        root: string
        name: string
        fsType: string
        kind: string
        total?: number
        free?: number
    }

    // ── Rename types ───────────────────────────────────────────────────────

    export type RenamePreviewOptions = Record<string, any>
    export type RenamePreviewResult = Record<string, any>
    export type RenameApplyResult = Record<string, any>

    // ── Clipboard types ────────────────────────────────────────────────────

    export type ClipboardOperation = 'copy' | 'cut' | 'none'

    export type ClipboardState = {
        hasFiles: boolean
        operation: ClipboardOperation
        paths: string[]
        count: number
        canPaste: boolean
    }

    // ── DnD types ──────────────────────────────────────────────────────────

    export type GexDnDType =
        | 'gex/file-refs'
        | 'gex/text'
        | 'gex/url'
        | 'gex/custom'

    export type GexDnDPayload<T = any> = {
        type: GexDnDType | string
        data: T
        source: {
            widgetType: string
            widgetId: string
        }
        metadata?: Record<string, any>
    }

    export type FileRefData = {
        path: string
        name: string
        size?: number
        mimeType?: string
        isDirectory?: boolean
    }

    export type DnDValidator = (
        payload: GexDnDPayload,
        context: { widgetType: string; widgetId: string }
    ) => Promise<{ ok: boolean; reason?: string }>

    // ── Messaging ──────────────────────────────────────────────────────────

    export type ScopedMessaging = {
        send: (to: string, topic: string, payload?: any) => void
        on: (topic: string, handler: (msg: any) => void) => () => void
        cleanup: () => void
    }

    // ── P2P / SP2P public types ────────────────────────────────────────────

    export type P2PIdentity = {
        userId: string
        publicKey: string
        displayName: string
        isNameSet: boolean
    }

    export type P2PInvite = {
        token: string
        sessionId: string
        sessionSecret: string
        rendezvousKey: string
    }

    export type AcceptedP2PInvite = {
        rendezvousKey: string
        publicKey: string
        userId: string
        sessionId: string
        sessionSecret: string
    }

    export type ChannelTransportMode =
        /**
         * Maximum-privacy mode.
         *
         * Uses split-path SP2P routing. Peers should not learn each other's
         * IP/UDP endpoints through this channel mode.
         */
        | 'sp2p'

        /**
         * Lower-overhead direct P2P mode.
         *
         * Uses the normal direct authenticated/encrypted P2P channel path.
         * This mode may expose peer IPs/endpoints and should require explicit
         * user consent before being offered.
         */
        | 'direct-p2p'

    export type ChannelIdentity = {
        userId: string
        username: string
        publicKey: string
    }

    export type MeshStrategyType =
        | 'full'
        | 'hub'
        | 'hub-spoke'
        | 'manual'
        | string

    export type MeshPeer = {
        userId: string
        username?: string
        publicKey?: string

        /**
         * Direct endpoint data is intentionally not part of the stable public
         * widget contract. In SP2P mode, widgets should not rely on endpoints.
         */
        endpoint?: never

        [key: string]: unknown
    }

    export type StreamReliability = 'fast' | 'reliable'

    export type StreamConfig = {
        reliability?: StreamReliability
        ordered?: boolean
        maxSize?: number
        [key: string]: unknown
    }

    export type SP2PStatusSeverity =
        | 'info'
        | 'ok'
        | 'warn'
        | 'error'

    export type SP2PStatusCode =
        | 'transport.created'
        | 'edht.waiting'
        | 'peer.presence.missing'
        | 'peer.pipeline.starting'
        | 'route.requested'
        | 'route.received'
        | 'route.preparing'
        | 'route.ready'
        | 'route.degraded'
        | 'route.recovered'
        | 'route.rotation.requested'
        | 'route.rotation.ready'
        | 'voice.ready'
        | 'offline'

    export type PublicSP2PStatusEvent = {
        at: number
        code: SP2PStatusCode
        severity: SP2PStatusSeverity
        message: string
    }

    export type SP2PRelayStatus = {
        ready?: boolean
        degraded?: boolean
        peerCount?: number

        /**
         * Public relay status intentionally avoids endpoints, route maps,
         * full hop lists, and raw route metadata.
         */
        [key: string]: unknown
    }

    export type VoicePeerState = {
        speaking?: boolean
        muted?: boolean
        volume?: number
        [key: string]: unknown
    }

    export type PublicChannelOptions = {
        scopeId: string
        identity: ChannelIdentity
        sessionSecret: Uint8Array
        buildPresence: () => {
            publicKey: string
            userId: string
            username: string
        }

        isHub?: boolean
        strategy?: MeshStrategyType

        canConnect?: (peer: MeshPeer) => boolean | Promise<boolean>
        onPeerJoined?: (peer: MeshPeer) => void
        onPeerLeft?: (peer: MeshPeer) => void
        onNameCollision?: (peer: MeshPeer) => void

        historyLimit?: number
        voice?: boolean

        /**
         * Explicit transport selector.
         *
         * sp2p:
         *   Maximum-privacy split-path routing.
         *
         * direct-p2p:
         *   Lower-overhead direct encrypted/authenticated P2P. May expose peer
         *   IP/endpoints and should only be used with clear user consent.
         */
        transportMode: ChannelTransportMode

        redundancy?: 0 | 1 | 2
        streams?: Record<string, StreamConfig>
    }

    export type ChannelSession = {
        readonly scopeId: string
        readonly peers: Ref<Map<string, string>>
        readonly isConnected: Ref<boolean>
        readonly queuedCount: Ref<number>

        sendMessage: (text: string) => Promise<{
            messageId: string
            sentAt: number
        }>

        sendStream: (name: string, bytes: Uint8Array) => void
        reannounce: () => Promise<void>
        dispose: () => Promise<void>

        /**
         * Proactively initiate a rendezvous/connection to a known peer identity.
         *
         * In SP2P mode this must not expose peer transport endpoints to widgets.
         */
        connectToPeer: (userId: string, publicKey: string) => Promise<void>

        startCall?: (stream: MediaStream) => Promise<void>
        endCall?: () => Promise<void>

        setPeerVolume?: (userId: string, volume: number) => void
        mutePeer?: (userId: string, muted: boolean) => void

        startMonitor?: (stream: MediaStream) => Promise<void>
        stopMonitor?: () => Promise<void>

        callActive?: Ref<boolean>
        transmitting?: Ref<boolean>
        activePeers?: Ref<Map<string, VoicePeerState>>
        monitorSelf?: Ref<boolean>

        relayStatus?: Ref<SP2PRelayStatus>
        sp2pStatus?: Ref<PublicSP2PStatusEvent | null>
        sp2pStatusHistory?: Ref<PublicSP2PStatusEvent[]>
    }

    export type UseChannelReturn = ChannelSession & {
        whenHubReady: Promise<void>
        whenEdhtReady: Promise<void>
    }

    // ── Chat types ─────────────────────────────────────────────────────────

    export type ChatMessage = {
        id: string
        scopeId: string
        senderId: string
        senderName: string
        text: string
        type: string
        sentAt: number
        receivedAt?: number
    }

    // ── SecureStorage / VFS types ──────────────────────────────────────────

    export type AccessPointEntry = {
        accessPointId: string
        vpath: string
        blobSha256: string
        displayName: string
        sizeOriginal: number
        sizeSealed: number
        createdAt: number
    }

    // ── Sortable / Selection ───────────────────────────────────────────────

    export type CreateSortableOptions = Record<string, any>
    export type SortableHandle = Record<string, any>
    export type ItemsAdapter = Record<string, any>
    export type Mods = Record<string, any>
    export type GeometryAdapter = Record<string, any>
    export type ScrollerAdapter = Record<string, any>

    export type Rect = {
        x: number
        y: number
        width: number
        height: number
    }

    export type DropIntent = 'before' | 'after' | 'into'

    export type SelectionEngine = {
        destroy: () => void
        replaceSelection: (ids: string[], meta?: Record<string, any>) => void
        rowDownId: (id: string, mods?: {
            shift?: boolean
            ctrl?: boolean
            meta?: boolean
            alt?: boolean
        }) => void
        rowUpId: (id: string) => void
        [key: string]: any
    }

    // ── Drives ─────────────────────────────────────────────────────────────

    export type DriveSnapshot = {
        root: string
        name: string
        fsType: string
        kind: string
    }

    // ── Favorites ──────────────────────────────────────────────────────────

    export type FavoriteEntry = {
        id: string
        label: string
        path: string
        icon?: string
    }

    export type FavoriteTreeNode = {
        id: string
        label: string
        children: FavoriteTreeNode[]
        entry?: FavoriteEntry
    }

    export type FavoritesConfig = {
        entries: FavoriteEntry[]
    }

    // ── Playlist ───────────────────────────────────────────────────────────

    export type PlaylistItem = {
        id: string
        src: string
        name?: string
        type?: string
    }

    // ── Slot providers ─────────────────────────────────────────────────────

    export type SlotProvider = {
        id: string
        label?: string
        component?: any
        props?: Record<string, any>
        order?: number
        [key: string]: any
    }

    // ── Free utilities and composables ─────────────────────────────────────

    export function createLinearSortable(options: CreateSortableOptions): SortableHandle
    export function useSortable(options: any): any
    export function useScrollHints(options: any): any
    export function useSnapResize(options: any): any
    export function createDragTrigger(options: any): any

    export function createSelectionEngine(
        options: any,
        adapter: any,
        callbacks?: any
    ): SelectionEngine

    export function createMarqueeDriver(adapter: GeometryAdapter): any

    export function fsValidate(path: string): Promise<{
        ok: boolean
        exists?: boolean
        isDir?: boolean
        error?: string
    }>

    export function iconFor(path: string): string
    export function ensureIconsFor(paths: string[]): Promise<void>

    export function createGexPayload<T>(
        type: GexDnDType | string,
        data: T,
        source: { widgetType: string; widgetId: string },
        metadata?: Record<string, any>
    ): GexDnDPayload<T>

    export function setGexPayload(dataTransfer: DataTransfer, payload: GexDnDPayload): void
    export function extractGexPayload(e: DragEvent): GexDnDPayload | null
    export function hasGexPayload(e: DragEvent): boolean

    export function createDragPreview(options: {
        label: string
        icon?: string
        count?: number
    }): HTMLElement

    export function authorizeFileRefs(
        widgetType: string,
        widgetId: string,
        payload: GexDnDPayload,
        caps?: string[]
    ): Promise<{ ok: boolean; reason?: string }>

    export function authorizeDrop(
        widgetType: string,
        widgetId: string,
        payload: GexDnDPayload,
        validator: DnDValidator
    ): Promise<{ ok: boolean; reason?: string }>

    export function fileRefsToPlaylistItems(
        refs: FileRefData[],
        receiverWidgetType: string,
        receiverWidgetId: string
    ): Promise<PlaylistItem[]>

    export function setActiveDragPayload(payload: GexDnDPayload, sourceId: string): void
    export function clearActiveDragPayload(): void

    export function startNativeDrag(
        paths: string[],
        preview: { label: string; icon?: string; count?: number },
        callbacks: {
            onDragOver?: (x: number, y: number) => void
            onDragLeave?: () => void
            onDrop?: () => void
            onExternalResult?: (effect: string) => void
        },
        x: number,
        y: number
    ): () => void

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

    export function useSlotProviders(slotId: string): ComputedRef<SlotProvider[]>
}