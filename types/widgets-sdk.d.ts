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
        /**
         * A whole small text file: { text, encoding }. Decoded by the host: a byte order mark,
         * else UTF-8, else the system's ANSI code page (encoding: 'utf-8', 'utf-8-bom',
         * 'utf-16le', 'utf-16be', 'cp1252'...). maxBytes: default 2 MB, at most 8 MB; a larger
         * file fails, never cut short. A protected folder asks for administrator rights once.
         * Rejects with an Error whose `code` is E_NOT_FOUND, E_IS_FOLDER, E_TOO_LARGE,
         * E_ACCESS_DENIED, E_NEEDS_ELEVATION, E_ELEVATION_DECLINED or E_READ_FAILED.
         */
        fsReadText?: (path: string, opts?: { maxBytes?: number }) => Promise<{ text: string; encoding: string }>
        /**
         * Paged listing of a folder (sorted and filtered by the backend) or of a
         * VFS path. Starts loading at once; close() it (useListing does) when done.
         */
        openListing?: (path: string, options?: OpenListingOptions) => ListingSource

        // Write cap
        fsMkdir?: (path: string) => Promise<void>
        /**
         * Write cap. Writes a whole text file (UTF-8; bom: true starts it with a byte order
         * mark). overwrite false (the default): fails when the file exists. Rejects on failure.
         * After ui().saveFile() the widget already holds write consent there: pass overwrite: true
         * (the user confirmed replacing an existing file in the dialog).
         */
        fsWriteText?: (path: string, text: string, opts?: { overwrite?: boolean; bom?: boolean }) => Promise<void>
        /**
         * Copy / move files and folders. `to` is the full destination path of each
         * item (folder + name), never just the folder. Nothing is replaced: a taken
         * name gets a new one from the app naming pattern ("a (2).txt"); a copy onto
         * its own path makes a duplicate, a move onto its own path does nothing.
         * Shows the progress dialog for long jobs and a snackbar for renames and
         * failures; rejects if any item failed.
         */
        fsCopy?: (items: Array<{ from: string; to: string }>) => Promise<void>
        fsMove?: (items: Array<{ from: string; to: string }>) => Promise<void>
        /**
         * Read + Write caps. Copy / move a selection reference (any size, e.g. a
         * 'gex/file-selection' drop) from sourceDir into targetDir: one job, with
         * the same dialog, snackbar and Undo as fsCopy / fsMove.
         */
        fsTransfer?: (operation: 'copy' | 'move', selection: SelectionRef, sourceDir: string, targetDir: string, count: number) => Promise<unknown>
        /**
         * Read cap. The files of a 'gex/file-refs' or 'gex/file-selection' drop (a
         * selection resolved by the backend; rejects with code E_TOO_MANY above max,
         * default 10,000).
         */
        resolveDropRefs?: (payload: GexDnDPayload, max?: number) => Promise<FileRefData[]>
        /**
         * Read cap. Starts an OS drag of these items, as this widget (same
         * arguments as the old free startNativeDrag, now deprecated).
         * options.payload: what a drop inside GEM Shell receives ({ type, data }, e.g.
         * { type: 'gex/file-refs', data: refs }). The host adds the source (this widget
         * instance) and clears it when the drag ends: no setActiveDragPayload any more.
         */
        startNativeDrag?: (
            source: string[] | { selection: SelectionRef; count?: number },
            preview: { label: string; icon?: string; count?: number },
            callbacks: {
                onDragOver: (x: number, y: number) => void
                onDragLeave: () => void
                onDrop: (x: number, y: number) => void
                onExternalResult?: (effect: string) => void
            },
            x: number,
            y: number,
            options?: { cwd?: string; entries?: any[]; payload?: OwnedDragPayload }
        ) => Promise<{ cleanup: () => void; resolvedPaths: string[]; started: boolean }>
        /**
         * This widget instance's lifecycle, bound to the instance by the host
         * (replaces createLifecycle(ownerId)). Same object on every call.
         */
        lifecycle?: () => WidgetLifecycle
        /**
         * Messaging between widget instances, sent as this instance (replaces
         * createWidgetMessaging(sourceId)). A new handle per call: cleanup() it.
         */
        messaging?: () => ScopedMessaging
        /**
         * This instance's audio (the host's audio rack, bound to the instance: replaces
         * useAudio()). Handles are released when the instance unmounts, unless a background
         * job holds them (jobs().ensure(...).hold(handle)). Same object on every call.
         */
        audio?: () => WidgetAudio
        /**
         * This instance's background jobs: kinds declared in entry.ts `jobs`. A job outlives
         * the instance unmounting (its card shows in the operations tray meanwhile) and ends
         * with the instance's removal, the card's Stop, end(), or GEM Shell closing.
         * Same object on every call.
         */
        jobs?: () => WidgetJobs
        /**
         * This instance's message boxes and snackbars (examples: WidgetUi below). The host titles
         * a box with the widget's name ("Local Player — Clear the queue?") and shows the name
         * before a snackbar's text. Boxes open only while the instance is on screen, one at a
         * time, and close when it unmounts. Same object on every call.
         */
        ui?: () => WidgetUi
        fsRename?: (oldPath: string, newPath: string) => Promise<{ ok: boolean; error?: string }>

        /**
         * Renames in place as one move job (progress, Stop / Cancel, Undo, administrator
         * rights when the folder needs them, like fsMove). Resolves when the job ended:
         * the renames that did not happen are in `failed`. The widget's identity is
         * added by the app (no ticket argument).
         */
        renameApplyBatch?: (
            renames: { from: string; to: string }[]
        ) => Promise<RenameApplyResult>

        // Metadata cap
        fsDriveStats?: (roots: string[]) => Promise<DriveStats[]>
        loadIconPack?: () => Promise<void>

        // Media cap
        /**
         * Duration (ms) and tags of audio / video files, one item per path, in order (fields
         * absent: not known; Windows: the shell's properties; Linux: none yet). Never prompts.
         */
        mediaInfo?: (paths: string[]) => Promise<Array<{
            path: string
            durationMs?: number | null
            title?: string | null
            artist?: string | null
            album?: string | null
            year?: number | null
            width?: number | null
            height?: number | null
        }>>

        /** A stream URL for a file, for this widget. Rejects E_NOT_FOUND when the file is not there. */
        mintStreamHttp?: (path: string, mimeHint?: string) => Promise<{ url: string; mimeType?: string; expiresAt?: string }>

        /**
         * Playable items for files (stream URLs minted for this widget). opts.onFailed: a file
         * that can't be played (code E_NOT_FOUND, declined rights...) is reported and skipped;
         * without it, the first failure rejects the whole call.
         */
        fileRefsToPlaylistItems?: (
            refs: FileRefData[],
            receiverWidgetType: string,
            receiverWidgetId: string,
            opts?: { onFailed?: (ref: FileRefData, code: string, error: unknown) => void }
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
        /** Paths, or a ListSelection.toPayload() result (any size: a reference expanded by the backend). */
        clipboardCopyFiles?: (files: string[] | SelectionPayload) => Promise<void>
        clipboardCutFiles?: (files: string[] | SelectionPayload) => Promise<void>
        /** pathsLimit: return at most that many paths (`count` is always exact). */
        clipboardGetFiles?: (opts?: { pathsLimit?: number }) => Promise<ClipboardState>
        /**
         * Clipboard + Write caps. Pastes the OS clipboard into targetDir (copy, or
         * move after a cut), any count, as one backend job: progress dialog,
         * Stop / Cancel, new names for taken names, completion snackbar. Resolves
         * with the job, or undefined when there was nothing to paste; rejects if
         * items failed.
         */
        fsPasteClipboard?: (targetDir: string) => Promise<unknown | undefined>
        /**
         * Write cap. Deletes paths, or a selection (count + sample + payload,
         * any size, e.g. what the context menu gets): to the Trash, or
         * permanently. The host's own delete: confirmation, the operation's
         * dialog, locked files, Trash room, Undo.
         */
        fsDelete?: (
            items: string[] | { count: number; sample: Array<{ path: string; name: string; kind?: 'dir' | 'file' | 'link' }>; payload: () => Promise<SelectionPayload> },
            opts?: { permanent?: boolean }
        ) => Promise<unknown>

        // ── Favorites cap: the user's favorites (the host's shared format) ──
        getFavorites?: (sourceId: string) => Promise<FavoriteEntry[]>
        getGlobalFavorites?: () => Promise<FavoriteTreeNode[]>
        addFavorite?: (path: string, label?: string, parentFolderId?: string) => Promise<void>
        addFolder?: (label: string, parentFolderId?: string) => Promise<void>
        removeFavorite?: (path: string) => Promise<void>
        removeFolder?: (folderId: string) => Promise<void>
        reorderGlobalRootNodes?: (nodeIds: string[]) => Promise<void>
        applyFavoritesMove?: (spec: FavoritesMoveSpec) => Promise<void>

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
        | 'Favorites'

    // ── FS types ───────────────────────────────────────────────────────────

    export type FsEntry = {
        Name: string
        FullPath: string
        Kind: 'file' | 'dir'
        Size?: number
        Modified?: string
        Ext?: string
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
        | 'gex/file-selection'
        | 'gex/text'
        | 'gex/url'
        | 'gex/custom'

    /**
     * 'gex/file-selection' data: a large selection dragged as a reference into
     * the source's listing (no paths). resolveDropRefs(payload) gives the files;
     * fsTransfer moves / copies it as one job.
     */
    export interface FileSelectionData {
        selection: SelectionRef
        count: number
        /** The folder the items are in. */
        dir: string
        /** The first few (labels, previews). */
        sample: FileRefData[]
    }

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
    // ── Marquee ────────────────────────────────────────────────────────────
    // Coordinates are viewport-relative (the scroll element's padding box);
    // call driver.adjustForScroll(dy) from the scroll handler.

    export type Point = { x: number; y: number }
    export type Rect = { x: number; y: number; w: number; h: number }
    /** Inclusive [first, last] item indices. */
    export type IndexRange = readonly [number, number]

    /** DOM lists: every item's rect; drives an id engine (createSelectionEngine). */
    export type RectGeometry = {
        itemRects(): Array<{ id: string; rect: Rect }>
        pointFromClient(clientX: number, clientY: number): Point
        contentRect(): Rect
    }
    /** Virtual lists: index ranges under a rect; drives a RangeSelectionTarget (createListSelection). */
    export type IndexGeometry = {
        hitRanges(rect: Rect): IndexRange[]
        pointFromClient(clientX: number, clientY: number): Point
        contentRect(): Rect
    }
    export type GeometryAdapter = RectGeometry | IndexGeometry

    export type ScrollerAdapter = {
        scrollTop(): number
        maxScrollTop(): number
        scrollBy(dy: number): void
    }

    export type SelectionEngineLite = {
        replaceSelection(next: Iterable<string>, opts?: { reason?: string; focusId?: string | null; anchorId?: string | null }): void
        getSelected(): Set<string>
    }
    export type RangeSelectionTarget = {
        marqueeBegin(combine: 'replace' | 'add' | 'toggle'): void
        marqueeUpdate(ranges: IndexRange[]): void
        marqueeEnd(): void
        marqueeCancel(): void
    }

    export type MarqueeConfig = {
        enabled: boolean
        startThresholdPx?: number
        fps?: number
        guardTopPx?: number
        autoscroll?: { enabled: boolean; baseSpeed?: number; speedMultiplier?: number; maxDistancePx?: number }
        combine?: 'auto' | 'replace' | 'add' | 'toggle'
        policy?: 'windows' | 'mac'
    }
    export type MarqueeEvents = { rectChanged?: (rect: Rect | null) => void; log?: (e: any) => void }
    export type MarqueeDriver = {
        pointerDown(ev: PointerEvent, mods: { ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }): void
        pointerMove(ev: PointerEvent): void
        pointerUp(ev: PointerEvent): void
        recomputeNow(reason?: string): void
        adjustForScroll(dy: number): void
        cancel(): void
        destroy(): void
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
        /** The file streamed (its URL expires: renew it from here). */
        sourcePath?: string
        /** When the stream URL expires (ISO or ms), null: no expiry. */
        expiresAt?: string | number | null
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

    // ── Listings ───────────────────────────────────────────────────────────
    // A ListingSource is the row source behind any list-shaped widget. Get one
    // from sdk.openListing (folders, Read cap), createMemoryListing (your own
    // rows), or implement the interface yourself: useListing and
    // useVirtualList work with any implementation.
    //
    // Rows are addressed by index in the current order; `version` bumps on
    // every new order (sort, refresh), after which rows must be re-read.

    export type ListingSortKey = 'name' | 'ext' | 'size' | 'modified' | 'kind'
    export type ListingSortDir = 'asc' | 'desc'
    export interface ListingSort {
        key: ListingSortKey
        dir: ListingSortDir
        /** Folders ahead of files in both directions. Default true. */
        foldersFirst: boolean
    }
    export interface ListingFilter {
        /** Allowed extensions, lowercase without dot. Folders always pass. */
        exts?: string[]
        /** Windows: hide .exe files that are not GUI programs. */
        guiOnly?: boolean
        /** Include hidden entries (Hidden attribute on Windows, dot-names elsewhere). Default false. */
        showHidden?: boolean
        /** Keep only these kinds (a folder junction / symlink is a 'link'). Default: all. */
        kinds?: Array<'dir' | 'file' | 'link'>
    }
    export interface ListingEntry {
        Name: string
        FullPath: string
        Kind: 'dir' | 'file' | 'link'
        /** Lowercase with dot; '' for folders and extensionless files. */
        Ext: string
        Size: number | null
        ModifiedAt: number | null
        IconKey: string
        Hidden: boolean
        [extra: string]: any
    }
    export type ListingStatus = 'loading' | 'ready' | 'error' | 'closed'
    export interface ListingError { code: string; message: string }
    export interface ListingSnapshot {
        readonly status: ListingStatus
        readonly total: number
        /** Bumps on every new order. 0 = nothing loaded yet. */
        readonly version: number
        readonly sort: ListingSort
        readonly progress: { phase: 'scan' | 'sort'; scanned: number } | null
        /** Changed on disk; a refresh is scheduled. */
        readonly stale: boolean
        readonly error: ListingError | null
        /** Bumps when fetched rows arrive. */
        readonly rowsTick: number
        readonly basePath: string
        /**
         * True while a folder shown for the first time is still being read: the
         * rows so far in disk order (not sorted), total growing, status
         * 'loading'. Positions never change meanwhile; the sorted order then
         * replaces them as a new version. Absent = false.
         */
        readonly partial?: boolean
    }
    export type ListingListener = (snapshot: ListingSnapshot) => void
    export interface ListingSource {
        snapshot(): ListingSnapshot
        subscribe(listener: ListingListener): () => void
        /** Row at index in the current version; undefined while not loaded yet. */
        at(index: number): ListingEntry | undefined
        /** Rows on screen: loads what is missing around them (only the latest call counts). */
        ensure(start: number, end: number): void
        setSort(sort: Partial<ListingSort>): void
        /** Indices of names in the current order (-1 = absent). */
        find(names: string[]): Promise<number[]>
        /**
         * Rows [start, end) of the current order, fetched as needed. Rejects with
         * code 'E_VERSION' if the order changes meanwhile, or if `version` is given
         * and is no longer current.
         */
        rows(start: number, end: number, version?: number): Promise<ListingEntry[]>
        refresh(): void
        /** Defers refreshes until the returned release is called (batch operations). */
        holdRefresh?(): () => void
        /**
         * The backend listing a SelectionRef can point into; null for memory / VFS
         * listings. version: the backend's number for the order shown now.
         */
        backendListing?(): { listingId: string; version: number } | null
        close(): void
    }

    /**
     * A selection as the backend reads it: a reference into an open listing
     * (any size). Build it with ListSelection.toPayload().
     */
    export type SelectionRef = {
        listingId: string
        version?: number
        base: 'none' | 'all'
        /** set: a selection set held by the backend (large Shift / marquee ranges). */
        include?: { ranges?: Array<[number, number]>; names?: string[]; set?: string }
        exclude?: { ranges?: Array<[number, number]>; names?: string[] }
        count?: number
    }
    /** What operations take for a selection: a reference, or the paths. Spread it into a request. */
    export type SelectionPayload =
        | { selection: SelectionRef; paths?: undefined }
        | { paths: string[]; selection?: undefined }
    export interface OpenListingOptions {
        sort?: Partial<ListingSort>
        filter?: ListingFilter
        /** Stable consumer id (e.g. instance id): a new listing with the same owner replaces the old one. */
        owner?: string
        /** Reload when the folder changes on disk. Default true. */
        autoRefresh?: boolean
        /** On access denied, ask for elevated access and retry. Default true. */
        consent?: boolean
    }
    export interface MemoryListingOptions {
        sort?: Partial<ListingSort>
        filter?: ListingFilter
        basePath?: string
        /** Used by refresh() to reload the rows. */
        load?: () => Promise<any[]>
    }
    export interface MemoryListingSource extends ListingSource {
        /** Replaces the rows. */
        setRows(rows: any[]): void
        markStale(): void
    }
    export function createMemoryListing(rows: any[], options?: MemoryListingOptions): MemoryListingSource

    export type VirtualAnchor = { index: number; offset: number; edge: 'top' | 'bottom' }
    export type ScrollAlign = 'start' | 'center' | 'end' | 'nearest'
    export interface UseVirtualListOptions {
        scrollEl: Ref<HTMLElement | null>
        /** Hidden row with the same classes as a real row: its height is the row height. */
        sizerEl: Ref<HTMLElement | null>
        /** Element holding the rows; its CSS row-gap is used when `gap` is omitted. */
        rowsEl?: Ref<HTMLElement | null>
        count: Ref<number> | (() => number)
        gap?: number | (() => number)
        /** Px from the top of the scroll content to the first row. */
        contentOffset?: number | (() => number)
        /** Extra rows above and below the viewport. Default 6. */
        overscan?: number
        onRange?: (start: number, end: number) => void
    }
    /**
     * Windowing: every row has the same height; only rows in view (+ overscan)
     * are rendered. Handles lists taller than the browser's element limit.
     */
    export interface VirtualList {
        start: ComputedRef<number>
        end: ComputedRef<number>
        indices: ComputedRef<number[]>
        totalHeight: ComputedRef<number>
        offsetY: ComputedRef<number>
        rowPitch: ComputedRef<number>
        /** Row height without the gap. */
        rowHeight: Ref<number>
        /** Logical px of the viewport top into the rows (uncapped). */
        logicalTop: ComputedRef<number>
        viewportHeight: Ref<number>
        /** Logical y of a viewport-relative y. */
        logicalYAt(viewY: number): number
        /** Reads the scroll position now (normally updated once per frame). */
        syncScroll(): void
        scrollToIndex(index: number, align?: ScrollAlign): void
        /** Row under a clientY, -1 outside the rows. */
        indexAtClientY(clientY: number): number
        viewTopOfIndex(index: number): number
        isIndexVisible(index: number): boolean
        captureAnchor(prefer?: number | null): VirtualAnchor | null
        restoreAnchor(anchor: VirtualAnchor, index?: number): void
        measure(): void
    }
    export function useVirtualList(options: UseVirtualListOptions): VirtualList

    // ── Virtual geometry (marquee on a useVirtualList) ────────────────────
    export interface VirtualGeometryOptions {
        vlist: Pick<VirtualList, 'logicalYAt' | 'logicalTop' | 'rowPitch' | 'rowHeight' | 'syncScroll'>
        scrollEl: Ref<HTMLElement | null>
        /** Number of items (not visual rows). */
        count: () => number
        /** Items per visual row (grid). Default 1. */
        columns?: () => number
        /** Grid cell geometry, viewport-relative px. */
        cell?: () => { x0: number; width: number; gapX: number }
        /** Paged lists: source index of the list's first item; hit ranges come back as source indices. Default 0. */
        offset?: () => number
    }
    export interface VirtualGeometry extends IndexGeometry {
        /** Logical scroll distance since the last call: pass to driver.adjustForScroll in the scroll handler. */
        consumeScrollDelta(): number
    }
    export function createVirtualGeometry(options: VirtualGeometryOptions): VirtualGeometry

    // ── List selection (virtual lists over a ListingSource) ───────────────
    // Stores names (survives re-sorts); Ctrl+A is "all except". Fed by row
    // gestures, marquee ranges (it is a RangeSelectionTarget) and actions.
    // Actions are not bound to keys: map keys to them in your widget.
    export type CombineMode = 'replace' | 'add' | 'toggle'
    export type SelectMods = { ctrl: boolean; meta: boolean; shift: boolean; alt?: boolean }
    export type FocusAction = 'up' | 'down' | 'left' | 'right' | 'pageUp' | 'pageDown' | 'home' | 'end'
    export type SelectionLimit = { kind: 'range' | 'resolve'; count: number; max: number }
    export interface ListSelectionOptions {
        source: () => ListingSource | null
        /** Items per visual row (grid). Default 1. */
        columns?: () => number
        /** Items per page for pageUp / pageDown. Default 20. */
        pageSize?: () => number
        policy?: 'windows' | 'mac'
        /** Largest range turned into names in the frontend; larger ones become backend sets. Default 5,000. */
        localRange?: number
        /** Largest range on a source without a backend listing (no sets there). Default 50,000. */
        maxRange?: number
        /** Largest selection selectedPaths / selectedEntries read. Default 200,000. */
        maxResolve?: number
        dragThresholdPx?: number
        onLimit?: (limit: SelectionLimit) => void
        /** Focus moved by an action: scroll the index into view. */
        onFocusMove?: (index: number) => void
    }
    /**
     * selected(name) = add.has(name) || (!remove.has(name) && inBase(name)).
     * base 'none': `add` is the selection; 'all': everything except `remove`;
     * 'set': a backend selection set (large range), with the Ctrl-clicks since in add / remove.
     */
    export interface ListSelectionState {
        readonly base: 'none' | 'all' | 'set'
        readonly add: ReadonlySet<string>
        readonly remove: ReadonlySet<string>
        readonly focusId: string | null
        readonly anchorId: string | null
        /** A range / marquee is shown but not yet applied. */
        readonly pending: boolean
        readonly tick: number
    }
    export interface ListSelection extends RangeSelectionTarget {
        state(): ListSelectionState
        subscribe(listener: (s: ListSelectionState) => void): () => void
        isSelected(index: number): boolean
        /** Exact for names and "all"; for a set, known for the rows isSelected() evaluated (on screen). */
        isSelectedId(id: string): boolean
        count(): number
        focusIndex(): number | null
        anchorIndex(): number | null
        rowDown(index: number, mods: SelectMods): void
        rowMove(clientX: number, clientY: number): void
        rowUp(index: number): void
        dragStart(): void
        /** extend: Shift range from the anchor; keepSelection: move focus only (Ctrl). */
        focusMove(action: FocusAction, how?: { extend?: boolean; keepSelection?: boolean }): void
        toggleFocused(): void
        extendTo(to: number, combine?: CombineMode, from?: number): void
        selectAll(): void
        clear(): void
        setIds(ids: Iterable<string>, marks?: { focusId?: string | null; anchorId?: string | null }): void
        /** Waits for a range still being applied. */
        settle(): Promise<void>
        selectedPaths(): Promise<string[]>
        selectedEntries(): Promise<ListingEntry[]>
        /**
         * The selection for an operation, any size: a SelectionRef when the
         * listing has a backend listing, else the paths.
         */
        toPayload(): Promise<SelectionPayload>
        /**
         * Freezes the selection now and returns a payload maker: each call builds
         * the reference against the listing current at that moment (call it right
         * before sending, e.g. after a confirmation dialog; a folder refresh in
         * between is harmless since the selection is names). A backend set is
         * held until the maker is garbage-collected.
         */
        capture(): () => Promise<SelectionPayload>
        /** Up to `max` selected items without fetching (`preferred` first: e.g. the focused / visible rows). */
        sample(max: number, preferred?: ListingEntry[]): Array<{ path: string; name: string; kind?: ListingEntry['Kind'] }>
        destroy(): void
    }
    export function createListSelection(options: ListSelectionOptions): ListSelection

    /**
     * A tooltip shown by code in a tooltip zone (status such as "N selected").
     * zones: the widget's choice (wins); omitted: DEFAULT_TIP_ZONES (bottom-right,
     * later the user's choice). durationMs: hides that long after the last show /
     * update; omitted: until hide().
     */
    export type ZoneTipOptions = {
        content: string
        icon?: string
        tone?: 'normal' | 'refused' | 'warning'
        detail?: string
        shortcut?: string
        zones?: string[]
        durationMs?: number
        anchorEl?: HTMLElement
    }
    export type ZoneTipHandle = {
        update(options: ZoneTipOptions): void
        hide(): void
        readonly visible: boolean
    }
    export function showZoneTip(options: ZoneTipOptions): ZoneTipHandle
    export const DEFAULT_TIP_ZONES: readonly string[]

    export interface UseListingOptions {
        /** Keeps the view in place across re-sorts and refreshes. */
        vlist?: Pick<VirtualList, 'start' | 'end' | 'captureAnchor' | 'restoreAnchor' | 'scrollToIndex'>
        /** Name of the focused row (preferred anchor while visible). */
        focusName?: () => string | null | undefined
        /** Close a source when the ref moves to another. Default true. */
        closeReplaced?: boolean
        /** Close the source when the component goes away. Default true. */
        closeOnDispose?: boolean
    }
    export interface UseListingReturn {
        source: Ref<ListingSource | null>
        snapshot: Ref<ListingSnapshot>
        status: ComputedRef<ListingStatus>
        total: ComputedRef<number>
        version: ComputedRef<number>
        sort: ComputedRef<ListingSort>
        progress: ComputedRef<ListingSnapshot['progress']>
        stale: ComputedRef<boolean>
        error: ComputedRef<ListingError | null>
        basePath: ComputedRef<string>
        /** Row at index (reactive to arriving rows); undefined = placeholder. */
        rowAt(index: number): ListingEntry | undefined
        /** Resolves once no keep-my-place restore is running. */
        settled(): Promise<void>
    }
    export function useListing(
        source: Ref<ListingSource | null> | ListingSource,
        options?: UseListingOptions
    ): UseListingReturn
    export function useSnapResize(options: any): any
    export function createDragTrigger(options: any): any

    export function createSelectionEngine(
        options: any,
        adapter: any,
        callbacks?: any
    ): SelectionEngine

    /** Index geometry needs a RangeSelectionTarget, rect geometry an id engine (checked at creation). */
    export function createMarqueeDriver(
        config: MarqueeConfig,
        geometry: GeometryAdapter,
        scroller: ScrollerAdapter,
        target: SelectionEngineLite | RangeSelectionTarget,
        events?: MarqueeEvents
    ): MarqueeDriver

    /** Entry shape the icon helpers read (fs:listDir fields, lower-cased). */
    export type IconEntry = { iconKey?: string; kind?: string; ext?: string }
    /** Cached system icon (data URL) for entry.iconKey, else a pack icon or emoji. */
    export function iconFor(entry: IconEntry, size?: number): string
    /** Fetches missing system icons into the shared cache; resolves to how many were added. */
    export function ensureIconsFor(entries: readonly IconEntry[], size?: number): Promise<number>

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

    export function authorizeDrop(
        widgetType: string,
        widgetId: string,
        payload: GexDnDPayload,
        validator: DnDValidator
    ): Promise<{ ok: boolean; reason?: string }>

    /** What a drop inside GEM Shell receives from sdk.startNativeDrag (the host adds the source). */
    export type OwnedDragPayload = { type: GexDnDType | string; data: unknown; metadata?: Record<string, any> }
    // setActiveDragPayload / clearActiveDragPayload: removed 2026-10-10 (the widget named the
    // drag's source). Pass the payload to sdk.startNativeDrag (options.payload).

    // Removed (sandbox C3c, 2026-10-05): fsValidate, startNativeDrag,
    // createWidgetMessaging, createLifecycle, authorizeFileRefs,
    // fileRefsToPlaylistItems, resolveDropRefs. Use the SDK object's versions
    // (sdk.fsValidate, sdk.startNativeDrag, sdk.messaging(), sdk.lifecycle(),
    // sdk.authorizeFileRefs, sdk.fileRefsToPlaylistItems, sdk.resolveDropRefs):
    // the host binds them to your widget.

    export function subscribeDrives(callback: (drives: DriveSnapshot[]) => void): () => void
    export function getDrives(): DriveSnapshot[]

    // Favorites: through the SDK (getFavorites, addFavorite...: 'Favorites' cap).
    export type FavoritesMovePlacement = 'before' | 'after' | 'inside'
    export type FavoritesMoveSpec = {
        movedKind: 'folder' | 'item'
        movedKey: string        // folder.id or item.path
        targetKind: 'folder' | 'item'
        targetKey: string       // folder.id or item.path
        placement: FavoritesMovePlacement
    }

    export function getCurrentPath(): string | null
    // ── Lifecycle ──────────────────────────────────────────────────────────
    // State that outlives the component: a widget unmounts on tab switch (and
    // sidebar collapse) but its owner lives on until the host destroys it —
    // pane closed for good, tab closed, widget removed. Use your sourceId as
    // the owner id.
    //
    //   const life = createLifecycle(props.sourceId)
    //   const page = life.cell('page', 0)                       // same Ref after remount
    //   const src  = life.persistRef('listing', null, { dispose: s => s?.close() })
    export type LifecycleVisibility = 'visible' | 'collapsed'
    export type PersistOptions<T> = {
        /** Called with the current value when the owner is destroyed (close a listing, free a handle…). */
        dispose?: (value: T) => void
    }
    export type HydratePolicy = 'always' | 'once' | 'never'
    export interface LifecycleWorkerHandle {
        status: Readonly<Ref<string>>
        stats: Readonly<Ref<any>>
        pid: Readonly<Ref<number | null>>
        crashCount: Readonly<Ref<number>>
        isRunning: ComputedRef<boolean>
        isCrashed: ComputedRef<boolean>
        restart(): Promise<void>
        send(command: string, payload?: Record<string, any>): Promise<void>
        ping(): Promise<void>
    }
    export interface WidgetLifecycle {
        /** 'collapsed' while the host has the widget folded away (sidebar). */
        readonly visibility: Ref<LifecycleVisibility>
        onSuspend(fn: () => void): () => void
        onResume(fn: () => void): () => void
        /**
         * Runs once when the host destroys the owner. Survives unmount: register it
         * once (or use persistRef's `dispose`), or call the returned function on unmount.
         */
        onDestroy(fn: () => void): () => void

        /** Snapshot a ref on suspend, write it back on resume. */
        bindRef<T>(key: string, target: Ref<T>, opts?: { hydrate?: HydratePolicy }): () => void
        bindReactive<T extends object>(key: string, target: T, opts?: { hydrate?: HydratePolicy; deep?: boolean }): () => void
        snapshotNow(key?: string): void
        hydrateNow(key?: string): void

        /** The same Ref instance across unmount/remount until the owner is destroyed. */
        persistRef<T>(key: string, initial: T | (() => T), opts?: PersistOptions<T>): Ref<T>
        /** The same shallow-reactive object across unmount/remount. */
        persistReactive<T extends object>(key: string, initial: T | (() => T)): T
        cell<T>(key: string, initial: T | (() => T), opts?: PersistOptions<T>): Ref<T>
        defineCells<T extends Record<string, any>>(shape: T): { [K in keyof T]: Ref<T[K]> }
        group<T extends Record<string, any>>(ns: string, shape: T): { [K in keyof T]: Ref<T[K]> }

        /** Timers paused while suspended; return a disposer. */
        keepInterval(fn: () => void, ms: number): () => void
        keepTimeout(fn: () => void, ms: number): () => void

        /** Observe and command a background worker registered by this widget (call in setup()). */
        worker(workerId: string): LifecycleWorkerHandle
    }

    // ── Host actions (props.runAction) ────────────────────────────────────
    // The host passes runAction to every widget. setView merges a patch into
    // the widget's view config; the parent persists it like a layout change
    // (per folder for Items widgets).
    export type HostAction =
        | { type: 'nav'; to: string; replace?: boolean }
        | { type: 'open'; path: string }
        | { type: 'openUrl'; url: string; options?: { askUser?: boolean; title?: string } }
        | { type: 'setView'; patch: Record<string, unknown> }

    // ── Paging (view option rendered by the host) ─────────────────────────
    // Declare it in the manifest to get "Single page" / "Paged ▸" in the
    // Layout menu:  contexts: { grid: { layouts: [...], paging: { pageSizes: [100, 500], defaultPageSize: 500 } } }
    // The choice arrives in props.config.view.paging:
    //   undefined → not known yet (the host is still looking up the folder)
    //   null      → no choice recorded for this folder
    //   ViewPaging → the user's choice ('single' is an explicit choice too)
    export type WidgetPagingDef = { pageSizes: number[]; defaultPageSize: number }
    export type ViewPaging = { mode: 'single' | 'paged'; pageSize: number }

    // ── Pane chrome ────────────────────────────────────────────────────────
    // The host draws a strip around the widget (header mode: one row above
    // it; overlay mode: floating over its top row). Widgets add their own
    // controls to its slot:
    //
    //   const chrome = useWidgetChrome(() => isPaged.value)
    //   <Teleport v-if="chrome.target.value" :to="chrome.target.value">
    //     <Pager v-if="chrome.expanded.value" /> <Badge v-else />
    //   </Teleport>
    //
    // In overlay mode the slot is collapsed and click-through until the user
    // holds Ctrl in the focused pane; render a compact, passive form then.
    export type PaneChromeMode = 'header' | 'overlay'
    export type WidgetChrome = {
        /** 'header' or 'overlay' (the user's choice). */
        mode: Readonly<Ref<PaneChromeMode>>
        /** Element to <Teleport> controls into; null until the host has rendered it. */
        target: Readonly<Ref<HTMLElement | null>>
        /** Full controls when true (always in header mode); compact passive form when false. */
        expanded: Readonly<Ref<boolean>>
        /** Expands the controls now (overlay mode), e.g. before focusing an input in them. */
        reveal(): void
    }
    /**
     * Joins the host's pane chrome. `active` says whether the widget has controls
     * to show right now; the header only takes a row while it has content.
     * Throws outside a WidgetHost. Call in setup().
     */
    export function useWidgetChrome(active?: Ref<boolean> | ComputedRef<boolean> | (() => boolean) | boolean): WidgetChrome
    // ── Audio (sdk.audio()) ─────────────────────────────────────────────
    export type AudioCategory = 'music' | 'sfx' | 'voice' | 'custom'
    export interface AudioHandle {
        readonly id: string
        readonly ownerId: string
        readonly category: AudioCategory
        play(): Promise<void>
        pause(): void
        load(): void
        release(): void
        readonly paused: boolean
        readonly readyState: number
        readonly duration: number
        src: string
        currentTime: number
        volume: number
        muted: boolean
        loop: boolean
        playbackRate: number
        addEventListener: HTMLMediaElement['addEventListener']
        removeEventListener: HTMLMediaElement['removeEventListener']
    }
    export type AudioPlaylistItem = { id: string; src: string; name?: string; type?: string; sourcePath?: string; expiresAt?: string | number; [k: string]: unknown }
    /** A playlist of this instance: its key (and category, default 'music'). */
    export type AudioPlaylistSel = { key: string; category?: AudioCategory }
    export type AudioPlaylistState = { items: AudioPlaylistItem[]; currentIdx: number; repeat: 'off' | 'one' | 'all'; shuffle: boolean; dedupe: boolean; version: number }
    export interface WidgetAudio {
        prime(): Promise<void>
        /** This instance's element for <key> (the same one on every call while it lives). */
        acquireElement(opts: {
            key: string
            category?: AudioCategory
            suspendPolicy?: 'continue' | 'pause' | 'duck'
            initialProps?: Partial<{ src: string; loop: boolean; volume: number; muted: boolean; preload: 'auto' | 'metadata' | 'none' }>
        }): AudioHandle
        playOneShot(url: string, opts?: { volume?: number; category?: AudioCategory }): Promise<AudioHandle>
        release(handle: AudioHandle): void
        list(): unknown[]
        /** Renews this instance's expiring stream URLs (sdk.mintStreamHttp). null: none. */
        setRenewProvider(fn: ((a: { ownerId: string; sourcePath: string; mimeHint?: string }) =>
            Promise<{ url: string; expiresAt?: string | number; mimeType?: string }>) | null): void
        state: {
            primed: Readonly<Ref<boolean>>
            /** This instance's music playing now, or null. */
            nowPlaying: Readonly<Ref<{ id: string; ownerId: string; src?: string } | null>>
        }
        playlists: {
            register(sel: AudioPlaylistSel, items: AudioPlaylistItem[], opts?: { repeat?: 'off' | 'one' | 'all'; shuffle?: boolean; dedupe?: boolean; autoNext?: 'off' | 'linear' }): string
            setItems(sel: AudioPlaylistSel, items: AudioPlaylistItem[], opts?: { keepCurrent?: boolean; dedupe?: boolean }): void
            get(sel: AudioPlaylistSel): AudioPlaylistState | null
            setOptions(sel: AudioPlaylistSel, opts: { repeat?: 'off' | 'one' | 'all'; shuffle?: boolean; dedupe?: boolean }): void
            bindToHandle(sel: AudioPlaylistSel, handle: AudioHandle): void
            unbind(sel: AudioPlaylistSel): void
            playIndex(sel: AudioPlaylistSel, index: number, handle: AudioHandle): Promise<number>
            next(sel: AudioPlaylistSel, handle: AudioHandle): Promise<number>
            prev(sel: AudioPlaylistSel, handle: AudioHandle): Promise<number>
        }
    }

    // ── Background jobs (sdk.jobs(), entry.ts `jobs`) ─────────────────────
    /** entry.ts: `jobs: { <kind>: { card: Component } }`. */
    export type WidgetJobDeclaration = {
        /** Shown in the operations tray (inside the host's frame: title, Open, Stop) while no instance is mounted. */
        card?: any
        /**
         * After a crash, a lost window or the end of the session: 'none' (default), 'ask' (a card
         * asks: Open and resume / Resume when opened / Discard), 'resume' (resumed when the widget
         * is opened). Get it back with jobs().whenPending(kind, fn).
         */
        recovery?: 'none' | 'ask' | 'resume'
        /** The version of what checkpoint() saves (default 0). */
        stateVersion?: number
        /** Updated since the interruption: 'restart' (default: params only) or 'migrate' (old state, stale: true). */
        onNewVersion?: 'restart' | 'migrate'
        /** Recoverable only when the user keeps widgets' state after a restart (the job needs it). */
        requiresRestore?: boolean
        /** Closing GEM Shell ends it without a question: false only for now. */
        blocksClose?: false
    }
    export interface WidgetJob {
        readonly id: string
        readonly kind: string
        /** The title in the card's frame. */
        update(patch: { title?: string }): void
        /** Keeps a handle from this instance's sdk.audio() alive until the job ends, then releases it. */
        hold(handle: AudioHandle): void
        /**
         * The job needs the user (true) or no longer does (false): its card is marked and the
         * operations tray's flap wiggles until the tray is opened. A widget that is not on
         * screen can't open a message box: call for attention, and ask once it is opened.
         */
        attention(on: boolean): void
        /** How far it got (kinds with recovery; plain data, at most 16 KB): saved at most every 2 s, the latest wins. */
        checkpoint(state: unknown): void
        end(): void
        readonly alive: boolean
    }
    /** An interrupted job handed back by jobs().whenPending(). */
    export interface WidgetPendingJob {
        readonly kind: string
        readonly title: string
        readonly params: unknown
        /** Its last checkpoint, or null (none, or dropped: the widget was updated and its kind restarts). */
        readonly state: unknown
        /** The widget was updated since and its kind migrates: `state` is the old version's. */
        readonly stale: boolean
        readonly reason: 'crash' | 'handover' | 'session'
        readonly savedAt: number
        /** Starts the job again (same params); apply `state` yourself. */
        resume(opts?: { title?: string }): WidgetJob
        /** Forgets it. */
        discard(): void
    }
    export interface WidgetJobs {
        /** Starts a job of a declared kind, or returns this instance's running one. <params>: what it is (plain data, at most 16 KB), kept for its recovery. */
        ensure(kind: string, opts: { title: string; params?: unknown }): WidgetJob
        /** This instance's running job of <kind>, or null. */
        current(kind: string): WidgetJob | null
        /**
         * <fn> gets this instance's interrupted job of <kind> once it may be resumed (at once, or
         * when the user answers its card). Call in setup(); returns the unsubscribe (call it on unmount).
         */
        whenPending(kind: string, fn: (job: WidgetPendingJob) => void): () => void
    }

    export type RenameOptions = {
        /** Returns an error message, or null when the new name is valid. */
        validate?: (value: string) => string | null
        onCommit: (newValue: string) => void | Promise<void>
        onCancel?: () => void
        /** Select the whole text on focus (default true). */
        selectAll?: boolean
        /** Select only the name before the extension (default false). */
        selectBasename?: boolean
        /** Widget instance id: scopes the element search to this widget. */
        widgetId?: string
    }
    /** Inline rename over the element with data-rename-id === id (it must be rendered). */
    export function startRename(id: string, options: RenameOptions): Promise<void>

    /** Style hints a VFS provider declares for an entry (ghost, fetching...); null for plain files. */
    export type VfsStateStyle = {
        opacity?: number
        cursor?: string
        background?: string
        badge?: string
        badgeTitle?: string
        animated?: boolean
        dimName?: boolean
    }
    export function getEntryStyle(entry: any): VfsStateStyle | null
    // useDialog removed 2026-10-09: sdk.ui().openFiles / saveFile / pickFolder.

    export function useSlotProviders(slotId: string): ComputedRef<SlotProvider[]>

    // ── Message boxes and snackbars: sdk.ui() ───────────────────────────────
    // The free show / showOnce / dismiss were removed (2026-10-08): use sdk.ui().snack...
    export type SnackAction = { label: string; onClick?: () => void | Promise<void>; id?: string }
    export type SnackOptions = {
        /** Dedupe key. */
        id?: string
        text: string
        actions?: SnackAction[]
        /** Shows a "never show again" control. */
        neverLabel?: string
        /** Auto-dismiss after this many ms. */
        timeoutMs?: number
        dedupe?: 'skip' | 'replace' | 'bump'
    }
    export type SnackResult =
        | { type: 'action'; actionId?: string }
        | { type: 'timeout' }
        | { type: 'dismiss' }
        | { type: 'never' }
    export type MbVariant = 'info' | 'warning' | 'danger' | 'question'
    /** Where a content item goes: stacked under the message, or on the buttons' row (at its left). */
    export type MbRegion = 'body' | 'footer'
    export type MbAlign = 'start' | 'center' | 'end' | 'fill'
    type MbItemBase = { id?: string; region?: MbRegion; align?: MbAlign }
    /**
     * A built-in content item of a message box. Its value is in result.values[id]:
     * checkbox boolean, input string, choices the option id (null when none).
     */
    export type MbItem =
        | (MbItemBase & { type: 'text'; text: string; tone?: 'normal' | 'muted' | 'warning' })
        | (MbItemBase & { type: 'checkbox'; id: string; label: string; value?: boolean })
        | (MbItemBase & {
            type: 'input'; id: string; label?: string; value?: string; placeholder?: string
            /** An error message, or null when valid (shown under it once typed in; `requires` waits for null). */
            validate?: (value: string) => string | null
        })
        | (MbItemBase & { type: 'choices'; id: string; label?: string; options: Array<{ id: string; label: string; detail?: string }>; value?: string })
        | (MbItemBase & { type: 'list'; items: string[]; label?: string })
        | (MbItemBase & { type: 'progress'; total: number; done: number; note?: string; countLabel?: string })

    /** What a button's onClick returns: false keeps the box open; { failed } also disables that button (its tooltip says why). */
    export type MbClickResult = void | boolean | { failed: string }

    export type WidgetUiButton = {
        label: string
        /** What result.button says for this button (default: its label). */
        id?: string
        /** Runs before the box closes (see MbClickResult). While an async one runs, the buttons are disabled. */
        onClick?: () => MbClickResult | Promise<MbClickResult>
        /** Enter presses it; it has the focus when the box opens (unless it is a danger button). */
        default?: boolean
        /** Escape presses it. */
        cancel?: boolean
        /** Shown in the warning colour. */
        danger?: boolean
        /** Disabled until the content item with this id is satisfied (checked / valid / chosen). */
        requires?: string
        /** Tooltip. */
        title?: string
    }

    export type WidgetMessageBoxOptions = {
        /** Shown after the widget's name: "<Widget> — <title>". */
        title: string
        message?: string
        /** Smaller text under the message. */
        detail?: string
        variant?: MbVariant
        /** Built-in items, in order (no custom component). */
        content?: MbItem[]
        /** Up to 4. None: a single OK. */
        buttons?: WidgetUiButton[]
        /** Pixels (320–720). */
        width?: number
    }

    export type WidgetMessageBoxResult = {
        /** The clicked button's id (or label); null: closed without a button (unmounted, close(), not on screen). */
        button: string | null
        values: Record<string, unknown>
    }

    /** A box that can change while it is open (openMessageBox). */
    export interface WidgetMessageBox {
        result: Promise<WidgetMessageBoxResult>
        update(patch: Partial<Pick<WidgetMessageBoxOptions, 'message' | 'detail' | 'variant' | 'content' | 'buttons'>>): void
        close(): void
    }

    /**
     * sdk.ui(): this instance's message boxes and snackbars.
     *
     * Rules: a box opens only while the instance is on screen (else it resolves at once with
     * button null: call job.attention(true) instead); one box at a time per instance (the next
     * waits); the instance unmounts: its box closes (button null). Clicks, Enter and Escape count
     * only from the user.
     *
     * @example
     * const ui = sdk.ui!()
     *
     * // Tell, ask, ask for a text.
     * await ui.alert('The playlist was opened without its last 3 songs.')
     * if (await ui.confirm('Remove all 42 songs?', { title: 'Clear the queue', okLabel: 'Clear', danger: true })) clear()
     * const name = await ui.prompt('Name of the playlist:', { value: 'Evening', validate: v => v.trim() ? null : 'A name is needed.' })
     *
     * // "Don't ask again" on the buttons' row.
     * const r = await ui.messageBox({
     *     title: 'Replace the queue?',
     *     message: 'Playing this folder replaces the 12 songs in the queue.',
     *     content: [{ type: 'checkbox', id: 'remember', label: "Don't ask again", region: 'footer' }],
     *     buttons: [{ label: 'Cancel', cancel: true }, { label: 'Replace', id: 'replace', default: true }],
     * })
     * if (r.button === 'replace' && r.values.remember) prefs.askReplace = false
     *
     * // A button disabled until a box is checked; a list; a right-aligned checkbox.
     * await ui.messageBox({
     *     title: 'Enable sharing',
     *     content: [
     *         { type: 'text', text: 'Shared folders are visible to the peers of this room.' },
     *         { type: 'list', label: 'Folders', items: ['D:\\Music', 'D:\\Podcasts'] },
     *         { type: 'checkbox', id: 'ok', label: 'I understand', align: 'end' },
     *     ],
     *     buttons: [{ label: 'Cancel', cancel: true }, { label: 'Enable', default: true, requires: 'ok' }],
     * })
     *
     * // One of several options.
     * const pick = await ui.messageBox({
     *     title: 'Duplicate songs',
     *     content: [{ type: 'choices', id: 'how', value: 'skip', options: [
     *         { id: 'skip', label: 'Skip them' },
     *         { id: 'add', label: 'Add them again', detail: 'They will play twice.' },
     *     ] }],
     *     buttons: [{ label: 'Cancel', cancel: true }, { label: 'Continue', id: 'go', default: true }],
     * })
     *
     * // A check before closing: a failed try disables the button, the box stays.
     * await ui.messageBox({
     *     title: 'Connect',
     *     content: [{ type: 'input', id: 'url', label: 'Server', placeholder: 'https://…' }],
     *     buttons: [{ label: 'Cancel', cancel: true }, {
     *         label: 'Connect', default: true, requires: 'url',
     *         onClick: async () => (await tryConnect()) ? undefined : { failed: 'The server did not answer.' },
     *     }],
     * })
     *
     * // Progress in a box that changes while open.
     * const box = ui.openMessageBox({
     *     title: 'Scanning',
     *     content: [{ type: 'progress', total: files.length, done: 0 }],
     *     buttons: [{ label: 'Stop', id: 'stop', cancel: true }],
     * })
     * box.update({ content: [{ type: 'progress', total: files.length, done: 5, note: files[4] }] })
     * box.close()
     *
     * // Snackbars (ids are this widget's own).
     * const s = await ui.snack({ id: 'undo', text: 'Song removed.', actions: [{ label: 'Undo', id: 'undo' }] })
     * if (s.type === 'action') restore()
     * ui.snackOnce('hint.dragToQueue', { text: 'Tip: drag songs onto the queue to add them.' })
     */
    export interface WidgetUi {
        /**
         * Opens this widget's right-click menu at the event: call it from a 'contextmenu'
         * listener (only the user's own right-click, only while on screen; the menu closes
         * if the widget leaves the screen). The host names the widget: its own items
         * (manifest menus.items, back to its exposed onMenuItem), other widgets' actions for
         * that context (they get opts.selection as paths) and the user's own commands.
         *
         *   // entry.ts
         *   menuContexts: [{ id: 'player.track', label: 'Track in queue', icon: '🎵', subject: 'files' }],
         *   menus: { items: [
         *       { id: 'play',   label: 'Play',              icon: '▶', contexts: ['player.track'] },
         *       { id: 'remove', label: 'Remove from queue', icon: '✕', contexts: ['player.track'] },
         *   ] },
         *
         *   // Widget.vue
         *   <div class="row" @contextmenu="e => ui.contextMenu(e, { context: 'player.track', ref: t.id, selection: [t.path] })">
         *   function onMenuItem(m: WidgetMenuItemMessage) { if (m.itemId === 'remove') removeById(m.ref) }
         *   defineExpose({ onMenuItem })
         */
        contextMenu(event: MouseEvent, opts?: WidgetContextMenuOptions): Promise<void>
        alert(message: string, opts?: { title?: string; detail?: string; variant?: MbVariant; okLabel?: string }): Promise<void>
        /** true: OK. */
        confirm(message: string, opts?: { title?: string; detail?: string; okLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>
        /** The text, or null when cancelled. OK waits until validate() returns null. */
        prompt(message: string, opts?: {
            title?: string; detail?: string; label?: string; value?: string; placeholder?: string
            validate?: (value: string) => string | null; okLabel?: string; cancelLabel?: string
        }): Promise<string | null>
        messageBox(opts: WidgetMessageBoxOptions): Promise<WidgetMessageBoxResult>
        openMessageBox(opts: WidgetMessageBoxOptions): WidgetMessageBox
        snack(opts: SnackOptions): Promise<SnackResult>
        /** Shown until the user picks "never" (remembered for this widget type under <key>). */
        snackOnce(key: string, opts: SnackOptions): Promise<SnackResult>
        /** Dismisses this widget's snackbar <id>, or all of this widget's snackbars. */
        dismissSnack(id?: string): void
        /**
         * A short text after the widget's name in the header its place gives it (the
         * sidebar's): ui.setHeaderStatus('Song name') → "Local Player · Song name". It
         * scrolls when it doesn't fit; mostly seen while the widget is collapsed (the
         * header is all that shows). null clears it. At most 200 characters, one line.
         */
        setHeaderStatus(text: string | null): void
        /**
         * The host's file dialog, titled "<Widget> — <title>" (default "Open"): the files
         * chosen, null when cancelled. Only while the widget is on screen; closes when it
         * leaves. filters: [{ label: 'Audio', extensions: ['mp3', 'flac'] }].
         * access 'write': the widget may also write the files chosen (edit them in place),
         * those files only, while GEM Shell runs: what the user picks is the grant, no other
         * prompt (a folder needing administrator rights: the consent dialog asks once).
         */
        openFiles(opts?: { title?: string; startIn?: string; filters?: WidgetFileFilter[]; multiple?: boolean; access?: 'read' | 'write' }): Promise<string[] | null>
        /**
         * The host's save dialog: the full path chosen, null when cancelled. An existing file
         * was confirmed by the user ("Replace it?") and the widget may write THAT FILE (only),
         * while GEM Shell runs, with no other prompt: fsWriteText(path, text, { overwrite: true }).
         */
        saveFile(opts?: { title?: string; startIn?: string; filters?: WidgetFileFilter[]; suggestedName?: string }): Promise<string | null>
        /**
         * The host's folder dialog: the folder chosen, null when cancelled. access 'write': the
         * widget may write in it (and its subfolders: an export destination), while GEM Shell runs.
         */
        pickFolder(opts?: { title?: string; startIn?: string; access?: 'read' | 'write' }): Promise<string | null>
    }

    /** A "Type" choice of a file dialog: extensions without the dot ('mp3'). */
    export type WidgetFileFilter = { label: string; extensions: string[] }

    /** A listing's selection as a menu takes it (count, the first items, the operation payload). */
    export type MenuSelection = {
        count: number
        sample: Array<{ path: string; name: string; kind?: 'dir' | 'file' | 'link' }>
        payload: () => Promise<SelectionPayload>
    }

    export type WidgetContextMenuOptions = {
        /**
         * One of the widget's declared menuContexts ids ('player.track'), or a file context
         * ('file' | 'folder' | 'multi' | 'background'). Omitted: resolved from the selection.
         */
        context?: string
        /** What the click is about in the widget's own terms (a track id): given back to onMenuItem. */
        ref?: string
        /** The files the click is about: other widgets' actions and the user's commands work on them. */
        selection?: MenuSelection | string[]
        /** The folder the widget shows (file widgets). */
        path?: string
        /** The visible entries, to tell a folder from a file (file widgets). */
        entries?: Array<{ FullPath: string; Kind?: string }>
        /** Default: the place the host gave the widget (the Layout submenu). */
        area?: 'grid' | 'sidebar' | 'toolbar' | 'embedded'
        /** The widget's config (the Layout submenu shows the current layout). */
        widgetConfig?: any
        /** Called once when the menu closes (after the chosen item ran), or right away when nothing shows. */
        onClose?: () => void
    }

    /**
     * One of the manifest's menus.items. id: short ('remove'), named '<widgetType>.<id>' by the
     * host. contexts: the widget's declared menuContexts (or file contexts) it shows in; the
     * order of the list is the default layout. when: declarative conditions only.
     */
    export type WidgetMenuItemDecl = {
        id: string
        type?: 'command' | 'separator'
        label?: string
        icon?: string
        contexts: string[]
        when?: Record<string, unknown>
    }

    /** What the widget's exposed onMenuItem receives when one of its items is chosen. */
    export type WidgetMenuItemMessage = {
        /** The short id from menus.items. */
        itemId: string
        /** The context the menu was opened for. */
        context: string
        /** The ref passed to contextMenu(), if any. */
        ref?: string
    }
}

// ── Shared UI components (registered by GEM Shell; use them in templates) ──
//
//   <gex-marquee :text="title" />
//     One line that scrolls when it doesn't fit its box (ellipsis + tooltip with
//     prefers-reduced-motion). Props: text, speed (px/s, 35), direction ('left' |
//     'right'), paused (e.g. while resizing), tip (full text in a tooltip, true).
//     Emits overflow(boolean). Style it through .gex-marquee.
//
//   <gex-fold-header v-model:folded="queueFolded" label="Queue" :status="`${n} songs`">
//     <template #actions><button>…</button></template>
//   </gex-fold-header>
//     A thin title strip: double-click (or Enter / Space) folds / unfolds; its tooltip
//     says so (`hint` replaces it). Hide what it heads when folded. Actions on the
//     right don't fold. The same strip heads every widget in the sidebar.
//     Style it through .gex-fold-header (height: --gex-fold-header-h, 18px).
declare module 'vue' {
    export interface GlobalComponents {
        'gex-marquee': import('vue').DefineComponent<{
            text: string; speed?: number; direction?: 'left' | 'right'; paused?: boolean; tip?: boolean
        }>
        'gex-fold-header': import('vue').DefineComponent<{
            label: string; status?: string | null; folded?: boolean; hint?: string; paused?: boolean
        }>
    }
}