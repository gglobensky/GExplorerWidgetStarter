// types/widgets-sdk.d.ts
// Public API surface for GExplorer widget development.
// Copy this file into your widget project's types/ folder.

import type { Component, ComputedRef, Ref } from 'vue'

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
        /**
         * Where the junction / symbolic link at `path` points (one level, as Explorer shows it), and
         * whether the target exists. Reads the link only: never a prompt. Not .lnk shortcuts.
         */
        fsLinkTarget?: (path: string) => Promise<{ isLink: boolean; target: string | null; targetExists: boolean | null; targetIsDir: boolean }>

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
        /**
         * Shows a file in a GExplorer pane: selected, scrolled into view, the keyboard on the list. Where: the
         * focused GExplorer pane, else the tab goes to the file's folder (as navigation does); newTab: a folder
         * tab of its own (one already showing that folder is reused). Only right after the user's own click or
         * key press in this widget: otherwise refused ('no-gesture') and written to the security log. A folder
         * path shows that folder selected in its parent. 'not-found': nothing at that path.
         */
        reveal?: (path: string, options?: { newTab?: boolean }) => Promise<{ ok: true } | { ok: false; reason: 'no-gesture' | 'not-found' | 'not-a-file' }>
        /**
         * Where this widget sends the user (the runAction prop they replaced is gone). Each resolves to { ok: true } or
         * { ok: false, reason: 'no-gesture' | 'not-on-screen' | 'bad-argument' }.
         *   navigate   a place: one location (a folder, a hub "home:", a sys: page) or 2-4 folders side by side
         *              (an array). One folder: the focused GExplorer pane, else the whole tab (the GExplorer
         *              itself: its own pane). A page or folders side by side a pane would have taken: the user
         *              is asked (this whole tab, or its tab); a split tab with no pane focused: asked too (a pane,
         *              the whole tab, its tab). In the file dialog: the dialog (one folder only). newTab: its tab
         *              (one already showing that place is reused); replace: no new history entry.
         *   openPath   opens a file or a program with the system (a program needs this widget's Exec grant); in the
         *              file dialog, picks the file.
         *   openUrl    a web link in the user's browser: the user is always asked first, naming this widget.
         *   setView    saves a patch of this placement's view settings (a plain object, at most 8 KB of JSON).
         *              { save: false } (2026-10-27): shows it without saving it: the host's menus and buttons
         *              agree with what the widget shows (a layout it chose itself), nothing is written now;
         *              it is kept if a later setting is saved.
         * navigate, openPath and openUrl only right after the user's own click or key press in this widget
         * (the GExplorer moving its own view to a folder excepted); otherwise refused and written to the security log.
         * openFolder(entry) goes to the folder; openEntry(entry) opens a file (gesture rule) or goes to the
         * folder a shortcut leads to.
         */
        navigate?: (to: string | string[], options?: { newTab?: boolean; replace?: boolean }) => Promise<WidgetViewResult>
        openPath?: (path: string) => Promise<WidgetViewResult>
        openUrl?: (url: string, options?: { title?: string }) => Promise<WidgetViewResult>
        setView?: (patch: Record<string, unknown>, options?: { save?: boolean }) => Promise<WidgetViewResult>

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
        /** Creates an absolute physical folder, or a widget-VFS folder from an explicit/relative VFS path. */
        fsMkdir?: (path: string) => Promise<void>
        /**
         * Write cap (2026-10-29). Creates a new folder in parentDir under the next free name ("New folder",
         * "New folder (2)"...: the host picks it, as GEM Shell's New Folder) and resolves with its path; asks
         * for the Write grant there first when missing. Real folders only (not your VFS).
         */
        fsNewFolder?: (parentDir: string) => Promise<string>
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
         * This instance's videos (the host's video rack, 2026-10-25): <video> elements GEM Shell
         * owns, shown in the widget with <gex-video-surface :video="handle">. A video held by a
         * background job (jobs().ensure(...).hold(handle)) keeps playing, parked in the shell, while
         * the widget is unmounted, and the remounted widget gets the same element back with
         * find(key), still playing. Unheld videos are released when the instance unmounts.
         * At most 2 videos live at once across all widgets. Same object on every call.
         */
        video?: () => WidgetVideo
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
        /**
         * NEW (2026-10-28): the keys of this widget's own commands (entry.ts commands, by their short id), for
         * text that isn't a button's tooltip: a canvas, a status line, "press Space to...". Buttons use
         * v-gex-command instead (see WidgetCommandDecl). Read-only: the user binds keys in Keyboard shortcuts.
         *   const keys = sdk.keys!()
         *   const playKeys = ref(keys.of('play-pause'))            // ['Space']
         *   onUnmounted(keys.onChange(() => { playKeys.value = keys.of('play-pause') }))
         * Same object on every call; onChange's handlers stop with the instance.
         */
        keys?: () => WidgetKeys
        /**
         * Network cap. This instance's secrets (API tokens...): the user types one in a frame the
         * page can't read, the host stores it protected and adds it to requests that name it, for
         * the hosts it was saved for, over https; the widget never gets the value:
         *   const { saved } = await sdk.secrets!().prompt({ name: 'tmdb', label: 'TMDB API Read Access Token',
         *       hosts: ['api.themoviedb.org'], container: el })   // container: optional (else a shell box)
         *   sdk.networkFetch!(url, { headers: { Authorization: { secret: 'tmdb', format: 'Bearer {}' } } })
         * A request naming it for another host is refused (E_SECRET_HOST, in the security log); an
         * unset one: E_SECRET_UNSET. Requests carrying a secret follow no redirect.
         */
        secrets?: () => WidgetSecrets
        /**
         * Location cap. What the path bar shows: the focused pane's folder, or the tab's location
         * when no pane is focused. Another widget's virtual folder is given as its scheme only
         * (gexchange://). To follow changes: onHostChange('location', ...).
         */
        getCurrentPath?: () => string
        /**
         * Tells this instance when something the host owns changed:
         * - 'favorites' (Favorites cap): that they changed, not how: re-read them.
         *     sdk.onHostChange?.('favorites', () => void reload())
         * - 'location' (Location cap): { locator, cause, own }; own: your widget asked for this
         *   navigation and the shell went there ({ ignoreOwn: true } skips those).
         *     sdk.onHostChange?.('location', e => reveal(e.locator))
         * - 'clipboard' (Clipboard cap): the OS clipboard changed, whichever app changed it; never
         *   its contents (read them with clipboardGetFiles if you care, e.g. to fade cut rows).
         * - 'drives' (no capability): the drive list changed; read getDrives().
         * Every event has rev (a per-topic counter, to drop stale async reads).
         * Throws without the topic's capability. Released when the widget unmounts (the returned
         * function stops earlier). Several changes within a frame arrive as one event.
         */
        onHostChange?: <T extends HostTopic>(
            topic: T,
            handler: (event: HostChangeEvent<T>) => void,
            options?: HostChangeOptions,
        ) => () => void
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

        /**
         * An image asset (2026-10-14): the host decodes, resizes and re-encodes it (JPEG / PNG, no
         * metadata) and serves it from the app's own origin at a stable URL: put `url` in <img src>
         * as is; a canvas drawing it stays readable. Keep `assetId` with it (to delete it).
         *   { type: 'file', path }         an image file (JPEG, PNG, GIF, BMP, TIFF), read as this widget
         *   { type: 'thumbnail', path }    the OS's thumbnail of any file: a video's frame, a photo,
         *                                  an album's cover (size: the box asked of the OS, ≤ 1024)
         *   { type: 'bytes', data }        e.g. a frame of a <video crossorigin="anonymous"> playing a
         *                                  mintStreamHttp URL, drawn to a canvas, canvas.toBlob()
         *   { type: 'url', url, headers? } an https image (a poster), fetched by the host: needs the
         *                                  Network capability (the user's permission is asked once,
         *                                  as networkFetch). Addresses on this computer or the local
         *                                  network are refused (E_PRIVATE_ADDRESS). With storage
         *                                  'cache', the same url + headers + options is fetched once.
         * storage 'cache' (default): this widget's own 500 MB room (2026-10-27; other widgets never
         * push its images out), its least recently shown going first beyond it, and anything unused
         * for 30 days. When an <img> fails to load, make it again. A thumbnail of an unchanged file
         * (same path, size, date, options) comes from the cache, across sessions. 'persistent': kept until deleted, within the
         * widget's room: 200 MB, more if entry.ts asks for it (`storage: { assets: { mb, reason } }`,
         * up to 10240) and the user agrees (asked once, the first time it is needed).
         * Rejects with an Error whose `code` is: E_NOT_FOUND, E_IS_FOLDER, E_NOT_IMAGE, E_FORMAT
         * (WebP, SVG...), E_TOO_LARGE (over 32 MB or 80 megapixels), E_NO_THUMBNAIL, E_UNAVAILABLE,
         * E_NEEDS_ELEVATION, E_ELEVATION_DECLINED, E_QUOTA (usedBytes, limitBytes, neededBytes),
         * E_NEEDS_NETWORK (permission refused), E_PRIVATE_ADDRESS, E_HTTP, E_TIMEOUT, E_NETWORK,
         * E_UNSUPPORTED (no image support on this system yet: Linux), E_BAD_REQUEST, E_FAILED.
         */
        mediaImageCreate?: (source: MediaImageSource, options?: MediaImageOptions) => Promise<MediaImage>
        /** Deletes one of this widget's image assets. Resolves false when it did not exist. */
        mediaImageDelete?: (assetId: string) => Promise<boolean>
        /**
         * Stills of a video at chosen times, decoded by the host with ffmpeg in its own process
         * (never in the WebView: no decoder to tear down before playback), as image assets:
         *   const { frames } = await sdk.mediaVideoFramesCreate!({ path, timesMs: [60_000, 600_000] },
         *       { width: 320, height: 180 })
         *   for (const f of frames) if (f.image) img.src = f.image.url   // else f.error: this frame only
         * 1..24 times per call, at most 1920 px a side. Per frame: E_NO_FRAME (past the end), E_CODEC,
         * E_TIMEOUT, E_QUOTA. The whole call rejects with E_NOT_FOUND, E_IS_FOLDER, E_UNAVAILABLE
         * (a folder needing administrator rights), E_UNSUPPORTED (the host has no ffmpeg),
         * E_BAD_REQUEST. storage 'cache' (default): the same file, time and options are decoded once.
         */
        mediaVideoFramesCreate?: (source: { path: string; timesMs: number[] }, options?: MediaImageOptions) => Promise<{ frames: MediaVideoFrame[] }>
        /**
         * Media cap (2026-10-25). What a video holds (container, codecs, profile, bit depth, audio and
         * subtitle tracks) and how it can play in GEM Shell on THIS machine, decided with what its
         * graphics hardware decodes and what crashed it before. Read by ffprobe in its own process; cached
         * per file. Rejects { code }: E_NOT_FOUND, E_UNAVAILABLE (folder needing administrator rights),
         * E_UNSUPPORTED (no ffmpeg), E_TIMEOUT, E_CODEC.
         */
        mediaProbe?: (path: string) => Promise<MediaProbe>

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
        /**
         * An http(s) request made by the host for this widget (its network permission is asked once).
         * Only public internet addresses: this computer, the local network and cloud metadata addresses
         * are refused (error 'E_PRIVATE_ADDRESS: ...'). At most 3 redirects, 30 s.
         */
        networkFetch?: (
            url: string,
            options?: {
                method?: string
                /** A value may name a secret: { secret: 'tmdb', format: 'Bearer {}' } (sdk.secrets()). */
                headers?: Record<string, string | SecretRef>
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
        /**
         * pathsLimit: return at most that many paths (`count` is always exact).
         * inFolder (2026-10-29): only the paths directly inside that folder (`matched`: how many), e.g.
         * to fade a folder's cut rows without reading a huge cut. under: only the paths anywhere below
         * those folders (16 at most). A read limited to folders needs no Clipboard grant from the user;
         * reading every path on the clipboard does (the consent dialog).
         */
        clipboardGetFiles?: (opts?: { pathsLimit?: number; inFolder?: string; under?: string[] }) => Promise<ClipboardState>
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
        // A favorite opens a place: one location, or 2-4 folders side by side (sdk.navigate takes the same).
        getGlobalFavorites?: () => Promise<FavoriteTreeNode[]>
        /**
         * { added: false }: that place already is a favorite (its id), nothing changed; throws when <locations>
         * is not a place. opts.allowDuplicate (2026-10-28): added anyway, only when the user chose so ("Keep both").
         */
        addFavorite?: (locations: string[], label?: string, parentFolderId?: string, opts?: { allowDuplicate?: boolean }) => Promise<{ added: boolean; id: string }>
        addFolder?: (label: string, parentFolderId?: string) => Promise<void>
        /** By the favorite's id. */
        removeFavorite?: (id: string) => Promise<void>
        /**
         * Changes a favorite: its name (empty: the default name), the place it opens, the folder it is in
         * (null: the top level; moved to the end). A new place another favorite already opens throws, the
         * error's code 'E_DUPLICATE' (existingId, existingLabel), unless opts.allowDuplicate (the user's choice).
         */
        updateFavorite?: (id: string, patch: { label?: string; locations?: string[]; parentFolderId?: string | null }, opts?: { allowDuplicate?: boolean }) => Promise<void>
        renameFolder?: (folderId: string, label: string) => Promise<void>
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
        /** See which folder you're browsing (sdk.getCurrentPath, the 'location' host topic). */
        | 'Location'

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
        /** With inFolder: how many of the clipboard's paths are directly in that folder. */
        matched?: number
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

    /**
     * The scroll element along its scroll axis. axis (2026-10-30): 'x' for a list that scrolls sideways
     * (a 'columns' ListFlow): the methods then mean scrollLeft / its max / a scroll along x. Default 'y'.
     */
    export type ScrollerAdapter = {
        scrollTop(): number
        maxScrollTop(): number
        scrollBy(dy: number): void
        axis?: 'x' | 'y' | (() => 'x' | 'y')
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

    export type DriveType = 'fixed' | 'removable' | 'floppy' | 'optical' | 'network' | 'ram' | 'unknown'
    export type DriveMedia = 'present' | 'none' | 'unknown'
    export type DriveRole = 'data' | 'system' | 'policy-hidden'

    export type DriveSnapshot = {
        /** "E:\" */
        root: string
        /** "E:" */
        name: string
        /** The volume's name, when it has one and the drive is ready. */
        label?: string
        /** What to show: "Backup (E:)", or "E:" without a label. */
        display: string
        fsType?: string
        type: DriveType
        /** present | none (an empty DVD drive / card reader) | unknown (a floppy: not probed until opened) */
        media: DriveMedia
        ready: boolean
        /** data, or system when the user shows system partitions (getDrives never returns policy-hidden ones) */
        role: DriveRole
    }

    // ── Favorites ──────────────────────────────────────────────────────────

    /**
     * The favorites tree (getGlobalFavorites): items and folders, in the user's order. An item opens a place
     * (locations: one, or 2-4 folders side by side) and is known by its id.
     */
    export type FavoriteTreeItem = {
        id: string
        kind: 'item'
        label: string
        locations: string[]
    }
    export type FavoriteTreeFolder = {
        id: string
        kind: 'folder'
        label: string
        children: FavoriteTreeNode[]
    }
    export type FavoriteTreeNode = FavoriteTreeItem | FavoriteTreeFolder

    export type FavoritesConfig = {
        view?: { dense?: boolean; showIcons?: boolean }
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
        /**
         * Keep only these kinds. Default: all. 'link': every link; 'dirLink': folder links only
         * (junctions, directory symlinks). A folder tree asks ['dir', 'dirLink'].
         */
        kinds?: Array<'dir' | 'file' | 'link' | 'dirLink'>
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
        /**
         * The System attribute (Windows; false elsewhere). Folder listings set it; absent = false.
         * Hidden + System is what the OS keeps out of sight ($Recycle.Bin, System Volume Information).
         */
        System?: boolean
        /**
         * Links only: 'dir' (a junction / directory symlink: opens as a folder) or 'file' (a file
         * symlink, a .lnk shortcut). Whether the target still exists: fsLinkTarget(path).
         */
        LinkTarget?: 'dir' | 'file'
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
        /**
         * Reload now. `user: true` only when the user asked (a Refresh command): in a
         * folder whose access was denied it asks again (consent dialog, then the
         * Windows prompt). Automatic refreshes leave it out and never ask.
         */
        refresh(opts?: { user?: boolean }): void
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
        /**
         * 2026-10-30: the scroll axis. Default 'y'. 'x': lines are columns (scrollLeft, the sizer's width,
         * column-gap); every member below then means "along the main axis".
         */
        axis?: FlowAxis | (() => FlowAxis)
    }
    /**
     * Windowing: every row has the same height; only rows in view (+ overscan)
     * are rendered. Handles lists taller than the browser's element limit.
     * With axis 'x' the rows are columns (see UseVirtualListOptions.axis).
     */
    export interface VirtualList {
        axis: ComputedRef<FlowAxis>
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
        // 2026-10-30: axis-neutral names (same values as the vertical ones).
        /** The viewport's other dimension (width on 'y', height on 'x'): what lanes fit into. */
        viewportCross: Ref<number>
        lineSize: Ref<number>
        linePitch: ComputedRef<number>
        viewportSize: Ref<number>
        logicalStart: ComputedRef<number>
        totalSize: ComputedRef<number>
        offset: ComputedRef<number>
        logicalAt(viewPos: number): number
        viewStartOfIndex(index: number): number
        /** Line under a client point, -1 outside the lines. */
        indexAtClient(clientX: number, clientY: number): number
        /** Lines that fit in the viewport (at least 1). */
        linesInView: ComputedRef<number>
        /** The scroll content's style (its size along the axis). */
        contentStyle: ComputedRef<Record<string, string>>
        /** The rendered block's style (translateX / translateY). */
        blockStyle: ComputedRef<Record<string, string>>
    }
    export function useVirtualList(options: UseVirtualListOptions): VirtualList

    // ── List flow (2026-10-30): rows or columns ───────────────────────────
    // A column-major list that scrolls sideways is a row-major list with the
    // axes swapped. A line is a step along the scroll axis (a row, or a
    // column); a lane is a slot across it. index = line * lanes + lane in
    // both orders, so indices stay contiguous: selection ranges, marquee
    // ranges and the rendered block need nothing new (CSS places the cells:
    // grid-auto-flow row or column). Give useVirtualFlow, createVirtualGeometry
    // and createListSelection the same flow.
    /** 'rows': left to right, then down (scrolls y). 'columns': top to bottom, then right (scrolls x). */
    export type FlowOrder = 'rows' | 'columns'
    export type FlowAxis = 'x' | 'y'
    export interface ListFlow {
        readonly order: FlowOrder
        /** The scroll axis: 'y' for rows, 'x' for columns. */
        readonly axis: FlowAxis
        /** Items across one line; at least 1. */
        readonly lanes: number
        lines(count: number): number
        lineOf(index: number): number
        laneOf(index: number): number
        firstOfLine(line: number): number
        /**
         * Where a key moves the focus. Rows: Up / Down a line, Left / Right an item. Columns: Left / Right
         * a column, Up / Down an item. Page keys: `page` lines. A line step back past the start keeps the
         * lane; past the end: the last item. -1 for an empty list.
         */
        step(index: number | null, key: FocusAction, count: number, page?: number): number
    }
    export interface ListFlowOptions {
        /** Default 'rows'. Live: read on each use. */
        order?: () => FlowOrder
        /** Default 1. Live. */
        lanes?: () => number
    }
    export function createListFlow(options?: ListFlowOptions): ListFlow
    /** How many cells of `cell` px, `gap` px apart, fit in `space` px (at least 1). */
    export function lanesFor(space: number, cell: number, gap?: number): number

    /** Cross-axis cell geometry, viewport-relative px (left / width on rows, top / height on columns). */
    export type FlowLane = { start: number; size: number; gap: number }
    export interface UseVirtualFlowOptions {
        scrollEl: Ref<HTMLElement | null>
        /** One hidden cell: its size along the axis is the line size. */
        sizerEl: Ref<HTMLElement | null>
        rowsEl?: Ref<HTMLElement | null>
        flow: ListFlow
        /** Number of ITEMS. */
        count: Ref<number> | (() => number)
        /** Px between lines. */
        gap?: number | (() => number)
        contentOffset?: number | (() => number)
        overscan?: number
        /** For itemAtClient on more than one lane. */
        lane?: () => FlowLane
        /** The rendered ITEM range [first, end) (e.g. listing.ensure). */
        onRange?: (first: number, end: number) => void
    }
    /** Windowing in items over a ListFlow (a useVirtualList of lines underneath). */
    export interface VirtualFlow {
        /** The line windowing: place-keeping (useListing's vlist), geometry, measures. */
        lines: VirtualList
        axis: ComputedRef<FlowAxis>
        lanes: ComputedRef<number>
        first: ComputedRef<number>
        end: ComputedRef<number>
        /** The rendered items, contiguous. */
        items: ComputedRef<number[]>
        /** Lines per viewport (createListSelection's pageSize). */
        pageLines: ComputedRef<number>
        contentStyle: ComputedRef<Record<string, string>>
        blockStyle: ComputedRef<Record<string, string>>
        scrollToItem(index: number, align?: ScrollAlign): void
        isItemVisible(index: number): boolean
        /** null in a gap, outside the lines or past the last item. */
        itemAtClient(clientX: number, clientY: number): number | null
        measure(): void
    }
    export function useVirtualFlow(options: UseVirtualFlowOptions): VirtualFlow

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
        /** 2026-10-30: the flow (wins over columns). On 'columns' the rect's axes are swapped. */
        flow?: ListFlow
        /** 2026-10-30: cross-axis cell geometry with `flow` (wins over cell). */
        lane?: () => FlowLane
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
        /** Items per visual row (grid). Default 1. Same as a 'rows' flow of that many lanes. */
        columns?: () => number
        /** 2026-10-30: how items flow; the arrow keys follow it (wins over columns). */
        flow?: ListFlow
        /** Lines (rows, or columns on a 'columns' flow) per page for pageUp / pageDown. Default 20. */
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
    /**
     * v-gex-tooltip's value (or a plain string: the label). NEW (2026-10-28) command: one of this widget's
     * commands (entry.ts, its short id): what's left out comes from it when the tooltip shows (content = its
     * name, detail = its description ('' leaves it out), shortcut = the keys the user chose).
     */
    export type TooltipOptions = {
        content?: string
        icon?: string
        tone?: 'normal' | 'refused' | 'warning'
        detail?: string
        shortcut?: string
        command?: string
        zones?: string[]
    }

    /** sdk.keys() (2026-10-28): this widget's own commands' keys, as people read them ("Space", "Ctrl+←"). */
    export interface WidgetKeys {
        /** The keys of one of this widget's commands (its short id); [] when it has none. */
        of(id: string): readonly string[]
        /** <fn> after the user changes keys (read them again with of()); the returned function stops it. */
        onChange(fn: () => void): () => void
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

    // Host change topics (sdk.onHostChange)
    export type HostTopic = 'favorites' | 'location' | 'clipboard' | 'drives'
    /** Why the location changed. */
    export type NavCause = 'navigate' | 'back' | 'forward' | 'focus' | 'tab' | 'restore'
    export type HostTopicPayloads = {
        favorites: Record<string, never>
        location: {
            /** What the path bar shows (another widget's virtual folder: its scheme only). */
            locator: string
            cause: NavCause
            /** Your widget asked for this navigation, and the shell went where it asked. */
            own: boolean
        }
        /** The OS clipboard changed (any app). Read it through the clipboard API if you care. */
        clipboard: Record<string, never>
        /** The drive list changed (a drive, a disc, a label, the system-partitions setting): getDrives(). */
        drives: Record<string, never>
    }
    export type HostChangeEvent<T extends HostTopic = HostTopic> =
        HostTopicPayloads[T] & { topic: T; rev: number }
    export type HostChangeOptions = {
        /** Skip the events this widget caused (location). */
        ignoreOwn?: boolean
    }

    /** The drives to show (free). Changes: sdk.onHostChange('drives', () => ...). */
    export function getDrives(): DriveSnapshot[]

    // Favorites: through the SDK (getGlobalFavorites, addFavorite...: 'Favorites' cap).
    export type FavoritesMovePlacement = 'before' | 'after' | 'inside'
    export type FavoritesMoveSpec = {
        movedKind: 'folder' | 'item'
        movedKey: string        // the node's id
        targetKind: 'folder' | 'item'
        targetKey: string       // the node's id
        placement: FavoritesMovePlacement
    }

    // getCurrentPath: now sdk.getCurrentPath() ('Location' cap, 2026-10-15).
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

    // ── Secrets (sdk.secrets()) ───────────────────────────────────────────
    /** A header value naming one of the widget's secrets; format holds one {} (default '{}'). */
    export type SecretRef = { secret: string; format?: string }

    export type SecretPromptOptions = {
        /** The secret's name for this widget: lowercase letters, digits, . _ - (64 at most). */
        name: string
        /** What the user is asked for, 120 characters at most. */
        label: string
        /** The only hosts it is ever sent to (internet host names), 10 at most. */
        hosts: string[]
        /** Where the entry frame goes (full width, ~90 px high). It warns when it is covered, faded
         *  or transformed (the user checks the dots appear as they type). None: a shell box, the
         *  safest place: snackbars and tooltips wait while it is open, and entry pauses while
         *  anything covers it. */
        container?: HTMLElement
    }

    export interface WidgetSecrets {
        /** Asks the user; resolves when they save or close it (or the widget leaves the screen). */
        prompt(opts: SecretPromptOptions): Promise<{ saved: boolean }>
        /** hint: the value's last 4 characters (none for values under 8 characters). */
        status(name: string): Promise<{ set: boolean; hint?: string; hosts?: string[]; label?: string; updatedAt?: number }>
        delete(name: string): Promise<boolean>
    }

    // ── Image assets (sdk.mediaImageCreate) ───────────────────────────────
    export type MediaImageSource =
        | { type: 'file'; path: string }
        | { type: 'thumbnail'; path: string; size?: number }
        | { type: 'bytes'; data: Blob | ArrayBuffer | Uint8Array }
        | { type: 'url'; url: string; headers?: Record<string, string | SecretRef> }

    export type MediaImageOptions = {
        /** The box (px); either may be absent. Never enlarged; at most 4096 px a side. */
        width?: number
        height?: number
        /** Both sides given: 'cover' (default) fills the box, cropped at the centre; 'contain' fits inside. */
        fit?: 'cover' | 'contain'
        /** 'jpeg' (default) or 'png' (keeps transparency). */
        format?: 'jpeg' | 'png'
        /** 'cache' (default) or 'persistent'. */
        storage?: 'cache' | 'persistent'
    }

    export type MediaImage = {
        assetId: string
        /** Same-origin and stable: <img :src="url">. */
        url: string
        mimeType: string
        width: number
        height: number
        bytes: number
        storage: 'cache' | 'persistent'
    }

    /**
     * sdk.mediaProbe(): 'direct' plays as it is; 'remux' only the container is foreign (AVI, TS...);
     * 'audio' its sound can't be decoded (AC-3, DTS, TrueHD...); 'video' its picture can't be decoded
     * here (HEVC without a hardware decoder for its profile, 10-bit H.264, MPEG-2, DivX...); 'none'
     * nothing playable. Until GEM Shell converts (coming), anything but 'direct' won't play fully.
     */
    export type MediaVerdict = 'direct' | 'remux' | 'audio' | 'video' | 'none'
    export type MediaProbe = {
        /** ffmpeg's container names ("matroska,webm", "mov,mp4,m4a,3gp,3g2,mj2", "avi"...). */
        container: string
        durationMs: number | null
        bitRate: number | null
        video: { codec: string; profile: string | null; bitDepth: number; pixelFormat: string | null; width: number; height: number; fps: number | null } | null
        audio: { codec: string; profile: string | null; channels: number | null; language: string | null; title: string | null; default: boolean }[]
        /** image: bitmap subtitles (PGS, VobSub) the WebView can't show. */
        subtitles: { codec: string; language: string | null; title: string | null; default: boolean; image: boolean }[]
        /**
         * The picture's decoder profile ('hevc-main10', 'h264'...), whether this machine's graphics decode
         * it, whether the WebView can without them, and whether it stopped GEM Shell here before (unsafe).
         */
        decode: { profile: string; hardware: 'yes' | 'no' | 'unknown'; software: boolean; unsafe: boolean; /** The adapter judged ("1: NVIDIA ... (why)"). */ adapter?: string | null } | null
        verdict: MediaVerdict
        /** One short sentence per problem, for the user. */
        reasons: string[]
        /**
         * Played through the shell's video rack (sdk.video()), GEM Shell converts it while it plays:
         * 'remux' (container), 'audio' (sound to AAC), 'video' (picture decoded in software and re-encoded
         * to H.264); null when it plays as it is or can't be converted. A <video> of the widget's own gets
         * no conversion.
         */
        conversion?: 'remux' | 'audio' | 'video' | null
    }
    export type MediaVideoFrame = {
        requestedMs: number
        /** The time of the frame decoded (seeks are exact). */
        actualMs?: number
        image?: MediaImage
        /** This frame only. */
        error?: string
        message?: string
    }

    /** entry.ts `storage`: room beyond what every widget has (asked of the user once, when needed). */
    export type WidgetStorageRequest = {
        /** Persistent image assets: MB (more than 200, at most 10240), and why (shown to the user). */
        assets?: { mb: number; reason?: string }
    }

    // ── Credits (entry.ts license / about / credits / notices) ────────────
    // Shown on GEM Shell's About page (Settings → About GEM Shell → Widgets). Part of the bundle,
    // so the identity hash covers them. A malformed entry is left out (console error), the widget
    // still loads. Markdown is GEM Shell's safe subset: headings, paragraphs, lists, quotes, code,
    // tables, **bold** *italic* ~~struck~~ `code`, [links](https://…); no HTML, no images. Links
    // open only after the user agrees.
    //
    //   import tmdbLogo from './assets/tmdb.png'
    //   export default {
    //     id: 'media-library', …,
    //     license: 'MIT',
    //     about: 'Browse your movies on video-store shelves. [Source](https://github.com/…)',
    //     credits: [{ name: 'TMDB', url: 'https://www.themoviedb.org', logo: tmdbLogo,
    //                 text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' }],
    //   }
    //
    // `notices` is written by the widget build (one per npm package bundled, with its licence
    // text); entries an author adds (code copied in by hand) are kept before them.
    export type WidgetCredit = {
        /** At most 120 characters. */
        name: string
        /** Markdown, at most 8000 characters. */
        text?: string
        /** https only. */
        url?: string
        /** An imported PNG or JPEG (a data: URL once built), at most about 256 KB. */
        logo?: string
    }

    export type WidgetNotice = {
        name: string
        version?: string
        /** SPDX id or expression. */
        license: string
        url?: string
        /** The licence text, verbatim (shown as plain text). */
        text?: string
        /** A NOTICE file, verbatim. */
        notice?: string
    }

    /** entry.ts fields about the widget and the work it uses. */
    export type WidgetCreditsDeclaration = {
        /** The widget's own licence: an SPDX id or expression ('MIT', 'Apache-2.0'). */
        license?: string
        /** Markdown, at most 20000 characters: what the widget is, its author, its links. */
        about?: string
        /** At most 24. */
        credits?: WidgetCredit[]
        notices?: WidgetNotice[]
    }

    /** What sdk.navigate / openPath / openUrl / setView resolve to. */
    export type WidgetViewResult = { ok: true } | { ok: false; reason: 'no-gesture' | 'not-on-screen' | 'bad-argument' }

    // ── The props every widget gets (WidgetHost) ──────────────────────────
    //   const props = defineProps<WidgetProps>()
    // Going somewhere, opening a file or a web link, saving a view setting: the SDK (sdk.navigate / openPath /
    // openUrl / setView / reveal), not a prop. Menus and dialogs a widget teleports go into
    // inject<Ref<HTMLElement | null>>('widgetOverlay') (the widget's own layer), not body.
    export type WidgetPlacement = {
        context: 'grid' | 'sidebar' | 'toolbar' | 'embedded' | 'dialog'
        /** The layout chosen in the Layout menu (or the widget's `variant`). */
        layout: string
        /** Sidebar: pixels; elsewhere: grid cells. */
        size: { width?: number; height?: number } | { cols?: number; rows?: number }
        phase: 'active' | 'idle'
        resizing: boolean
        resizePhase?: 'active' | 'idle'
    }

    export interface WidgetProps {
        /** The widget's settings (`data`, `view`), from its defaults and the user's changes. */
        config?: any
        theme?: Record<string, string>
        placement: WidgetPlacement
        editMode?: boolean
        /** This placement's owner id: lifecycle, messaging, state are keyed on it. */
        sourceId: string
    }

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
        /** (2026-10-28) What it plays now ('' none), its network state (3: no source), its last error (null: none). */
        readonly currentSrc: string
        readonly networkState: number
        readonly error: MediaError | null
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

    // ── Video (sdk.video()) ─────────────────────────────────────────────
    /** Why a video was released: release(), made room for a newer one (2 at most), its widget unmounted unheld, its widget removed. */
    export type VideoReleaseReason = 'released' | 'evicted' | 'unmounted' | 'destroyed'
    /** A file's tracks, as the shell's video rack knows them (VideoHandle.tracks). */
    export type MediaTracks = {
        audio: { index: number; codec: string; channels: number | null; language: string | null; title: string | null; default: boolean }[]
        /** image: a picture subtitle (PGS, VobSub), drawn into the picture by a conversion; vtt: a text one, shown as a <track>. */
        subtitles: { index: number; codec: string; language: string | null; title: string | null; default: boolean; image: boolean; vtt: string | null }[]
    }
    export interface VideoHandle {
        readonly id: string
        readonly ownerId: string
        /** The name given to acquire(). */
        readonly key: string
        /**
         * The shell's <video>: set src / controls / attributes, listen to its events, call play().
         * Show it with <gex-video-surface :video="handle">; don't move it in the DOM yourself.
         */
        readonly element: HTMLVideoElement
        /** No surface shows it (the widget is unmounted, or no surface is mounted). */
        readonly parked: boolean
        /** False once released. */
        readonly alive: boolean
        /**
         * Keep decoding the picture while parked. Default false: while parked only the sound is
         * decoded (when the WebView supports it: WidgetVideo.canPauseDecoding()); the picture comes
         * back from the previous keyframe when a surface shows it again (a short hitch).
         */
        decodeWhileParked: boolean
        /** The picture is not being decoded right now. */
        readonly pictureSuspended: boolean
        /**
         * Shown in the system's picture-in-picture window right now (GEM Shell 2026-10-25 and later;
         * undefined before, when rack videos had picture-in-picture disabled). Ask for it with
         * `element.requestPictureInPicture()` from a user gesture. The window survives the widget
         * leaving the screen (the element only moves into the shell's keeper), its picture keeps
         * decoding even parked, and the 2-video cap releases it last. The rest is the widget's
         * business: the video is released with the widget unless a job holds it, as for sound.
         */
        readonly pictureInPicture?: boolean
        /**
         * GEM Shell converts its stream while it plays ('remux' | 'audio' | 'video': the file can't play as
         * it is here), or null. Set `element.src` to a loopback stream (sdk.mintStreamHttp) as usual: the
         * shell decides, and `src` / `currentSrc` keep answering that URL either way.
         */
        readonly conversion: 'remux' | 'audio' | 'video' | null
        /** The file's audio and subtitle tracks, once known (a GEM Shell stream); null before, or for other sources. */
        readonly tracks: MediaTracks | null
        /** The audio track playing (index in tracks.audio), or null. */
        readonly audioTrack: number | null
        /** The subtitle track shown (index in tracks.subtitles), or null: none. */
        readonly subtitleTrack: number | null
        /**
         * Plays another audio track: the WebView switches itself when it can, else GEM Shell converts with that
         * track. The place and play / pause are kept.
         */
        selectAudioTrack(index: number): void
        /** Shows a subtitle track (null: none): a text one as a <track>, a picture one drawn in by a conversion. */
        selectSubtitleTrack(index: number | null): void
        /** Called when the tracks become known or the choice changes. Returns the unsubscribe. */
        onTracksChange(fn: () => void): () => void
        /** Called once when it is released. Returns the unsubscribe. */
        onRelease(fn: (reason: VideoReleaseReason) => void): () => void
        release(): void
    }
    export interface WidgetVideo {
        /** This instance's video <key>: the living one (same element, maybe still playing), or a new one (the least recently used video is released past 2). */
        acquire(opts: { key: string; decodeWhileParked?: boolean }): VideoHandle
        /** This instance's living video <key>, or null. */
        find(key: string): VideoHandle | null
        release(handle: VideoHandle): void
        list(): VideoHandle[]
        /** Parked videos can stop decoding their picture in this WebView (Blink AudioVideoTracks). */
        canPauseDecoding(): boolean
        /** How many videos may live at once across all widgets (2). */
        readonly maxVideos: number
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
        /**
         * Keeps a handle from this instance's sdk.audio() or sdk.video() alive until the job ends,
         * then releases it (a held video keeps playing, parked, while the widget is unmounted).
         */
        hold(handle: AudioHandle | VideoHandle): void
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
        /** The starting text (else the element's data-rename-value, else its text). */
        value?: string
        /** px: how wide the box may grow while typing (default: up to the window's edge). */
        maxWidth?: number
    }
    /**
     * Inline rename over an element: the element itself, or the one with data-rename-id === id (it
     * must be rendered). Pass the element when the widget is shown in several places (its copies
     * share ids). The box takes the element's width and font and grows with the text; its height
     * is the element's row: its closest [data-rename-row] (or .row). Enter / a click away commits
     * (after validate: the default checks a Windows file name), Esc cancels.
     *
     *   startRename(labelEl, { value: folder.label, validate: v => v.trim() ? null : 'A name is needed.',
     *                          onCommit: name => sdk.renameFolder(folder.id, name) })
     */
    export function startRename(target: string | HTMLElement, options: RenameOptions): Promise<void>

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
    /** One choice of ui.menu(). */
    export type WidgetMenuItem = { id: string; label: string; disabled?: boolean; title?: string }

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
         *
         * A context with `subject: 'files'` also gets GEM Shell's own file items after the widget's
         * (2026-10-26): Open, Open with ▸, Show in folder, Copy path, Copy folder path. The shell picks
         * them and their labels; they act FOR this widget on opts.selection, which the shell filters
         * first: local file paths only, and no executables (.exe, .bat, .lnk, …) unless the widget
         * declares the Exec capability. Files left out are dropped from the whole menu, silently.
         */
        contextMenu(event: MouseEvent, opts?: WidgetContextMenuOptions): Promise<void>
        /**
         * GEM Shell's Open with list for a file (2026-10-26; undefined on older shells): the programs
         * that open it, ranked (the default marked), then "Other program…" (the shell's picker). At the
         * click (at: the MouseEvent) or under a button (at: an element of this widget); same rules as
         * menu(): only right after the user's own click in the widget, only while on screen. The program
         * picked opens the file for this widget (checked as it: an executable needs the Exec capability
         * and the user's permission). 'refused': no gesture, off screen, not a local file, or an
         * executable without Exec.
         *
         *   <button @click="e => ui.openWith?.(movie.path, e.currentTarget as HTMLElement)">Open with…</button>
         */
        openWith?(path: string, at: MouseEvent | HTMLElement): Promise<'opened' | 'cancelled' | 'refused'>
        /**
         * A small menu of choices (flat: no submenus), drawn by the shell and kept on screen: at the
         * click (at: the MouseEvent, a 'contextmenu' one included) or under a button (at: an element of
         * this widget). Resolves with the id chosen, or null (cancelled, or refused: only right after
         * the user's own click or key press in the widget, only while it is on screen; it closes if
         * the widget leaves the screen). Labels are plain text (80 characters), at most 30 items.
         * The choice counts as the widget's own gesture: sdk.navigate / reveal / openPath may follow.
         *
         *   const id = await ui.menu(ev.currentTarget as HTMLElement, [
         *       { id: 'rename', label: 'Rename…' },
         *       { id: 'delete', label: 'Delete', title: 'Moves it to the Recycle Bin' },
         *   ])
         *   if (id === 'rename') startRename()
         */
        menu(at: MouseEvent | HTMLElement, items: WidgetMenuItem[], opts?: { preferred?: string; label?: string }): Promise<string | null>
        /**
         * NEW (2026-10-29): one of the widget's submenus declared with its entries (menus.items children) as a
         * flat menu at the click or under a button, as the user arranged it in Settings › Context Menu (order,
         * hidden entries, "Disable when…"); sub-lists become headed groups. The chosen entry's id, or null.
         *   const id = await ui.declaredMenu(chip, 'filter', { slots, state, states })
         */
        declaredMenu?(at: MouseEvent | HTMLElement, submenuId: string, opts?: WidgetDeclaredMenuOptions): Promise<string | null>
        /**
         * The widget's own component in the host's overlay, next to opts.anchor (an element of this
         * widget): never clipped by the widget's place, kept on screen. Same rules as menu() (the
         * user's own click or key press, on screen); null when refused. One per instance (a new one
         * closes the last); clicking the anchor again closes it, so do a click elsewhere, Esc, and the
         * anchor leaving the page. The component gets props.close() besides opts.props, and
         * inject('widgetSdk') gives it this instance's SDK; a click in it counts as the widget's own
         * gesture. Widgets never teleport elements themselves: this is the way out of a clipping place.
         *
         *   ui.openPopover({ anchor: ev.currentTarget as HTMLElement, component: ColorPicker, props: { value } })
         */
        openPopover(opts: {
            anchor: HTMLElement
            component: Component
            props?: Record<string, unknown>
            /** 'center' (2026-10-27): in the middle of the window over a dimmed page, like a message box; the title bar reads "<widget name> — title". */
            placement?: 'below' | 'above' | 'right' | 'left' | 'center'
            maxWidth?: number
            maxHeight?: number
            onClose?: () => void
            /** placement 'center': the title after the widget's name (the host writes the name). */
            title?: string
        }): {
            close(): void
            /** Replaces the content's props: pass them all (close is kept). */
            update(props: Record<string, unknown>): void
        } | null
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
        openFiles(opts?: { title?: string; startIn?: string; filters?: WidgetFileFilter[]; multiple?: boolean; access?: 'read' | 'write'; acceptLabel?: string; signal?: AbortSignal }): Promise<string[] | null>
        /**
         * The host's save dialog: the full path chosen, null when cancelled. An existing file
         * was confirmed by the user ("Replace it?") and the widget may write THAT FILE (only),
         * while GEM Shell runs, with no other prompt: fsWriteText(path, text, { overwrite: true }).
         */
        saveFile(opts?: { title?: string; startIn?: string; filters?: WidgetFileFilter[]; suggestedName?: string; signal?: AbortSignal }): Promise<string | null>
        /**
         * The host's folder dialog: the folder chosen, null when cancelled. The folder highlighted,
         * or with none highlighted the folder shown (button "Select this folder"). acceptLabel:
         * the button's text instead ("Add to library"). access 'write': the widget may write in
         * it (and its subfolders: an export destination), while GEM Shell runs.
         */
        pickFolder(opts?: { title?: string; startIn?: string; access?: 'read' | 'write'; acceptLabel?: string; signal?: AbortSignal }): Promise<string | null>
        /**
         * Immersive playback: dismisses the host's hover tooltips and shows none until the
         * returned release() is called, or this instance leaves the screen. Fullscreen (a
         * <video>'s own) does the same without a call.
         */
        quietMode(): () => void
        /**
         * THE FILES WIDGET ONLY (other widgets get false: they take part through "Open with").
         * The shell's Create link dialog, prefilled with what the widget suggests: the user checks it and
         * creates the link, or not. Widgets never write links themselves. Saved on the Desktop by default
         * (the user can choose another place). Resolves true when something was created; false when
         * cancelled, or at once when the widget is not on screen. Where it was saved is not told.
         *   await ui.createLink({ targets: [song.path], name: song.title })
         *   await ui.createLink({ url: 'https://www.themoviedb.org/movie/603', name: 'The Matrix on TMDB' })
         */
        createLink(prefill?: WidgetCreateLinkPrefill): Promise<boolean>
        /**
         * THE FILES WIDGET ONLY. After a 'dnd:drop' with link: true (Alt held): shortcuts in <folder> to the
         * items just dropped on this instance (the host's copy of the drop; once, within seconds).
         * Resolves with the number made.
         */
        createLinksFromDrop(folder: string): Promise<number>
    }

    /** What sdk.ui().createLink suggests: targets (full paths, one link each, at most 20) or a web address. */
    export type WidgetCreateLinkPrefill = {
        targets?: string[]
        /** http / https only. */
        url?: string
        name?: string
        /** A program's arguments (shown in the dialog's command preview before anything is created). */
        arguments?: string
        /** The shortcut's comment. */
        description?: string
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
        /**
         * NEW (2026-10-27): the entries of the widget's declared submenus (menus.items with type
         * 'submenu'), by the submenu's id, for this menu only (its live state: ticks, the user's own
         * entries). A choice reaches onMenuItem({ itemId: <entry id> }). One nested level at most, 40
         * entries a list, labels 80 characters, ids letters / digits / . _ - only.
         *   ui.contextMenu(e, { submenus: { filter: [
         *     { id: 'show', label: 'Show', children: [{ id: 'show.all', label: 'Everything', checked: true }, ...] },
         *     { separator: true },
         *     { id: 'clear', label: 'Clear filter' },
         *   ] } })
         */
        submenus?: Record<string, WidgetMenuNode[]>
        /**
         * NEW (2026-10-29): for submenus declared with their entries (menus.items children), what fills their
         * slots for this menu, by slot id. Flat lists; entry ids start with the slot's prefix ('type.list' ->
         * 'type.') and aren't declared entries'. A choice reaches onMenuItem({ itemId }).
         *   ui.contextMenu(e, { slots: { 'type.list': [{ id: 'type.pictures', label: 'Pictures', checked: false }] } })
         */
        slots?: Record<string, WidgetMenuNode[]>
        /**
         * NEW (2026-10-29): the live state of declared entries for this menu, by entry id: a tick, greyed, a
         * label showing the current value (Settings › Context Menu keeps the declared one), a tooltip.
         *   ui.contextMenu(e, { state: { 'show.all': { checked: true }, sort: { label: 'Sort: Name ↑' } } })
         */
        state?: Record<string, WidgetMenuEntryState>
        /**
         * NEW (2026-10-28): which of the widget's menu situations (entry.ts menuStates) are true now.
         * Items the user set to "Disable when…" one of them in sys:context-menus (or whose default,
         * menus.items disableWhen / hideWhen, names one) are greyed with the reason, or left out.
         * Undeclared ids are ignored; the widget's layout (widgetConfig.view.layout) counts by itself
         * as 'layout:<id>'. The widget can't grey anything by itself: only these rules decide.
         *   // entry.ts
         *   menuStates: [{ id: 'narrow', label: 'Narrow view' }],
         *   menus: { items: [{ id: 'minimize-all', label: 'Minimize all', contexts: ['tree.folder'], disableWhen: ['narrow'] }] },
         *   // Widget.vue
         *   ui.contextMenu(e, { context: 'tree.folder', states: narrow ? ['narrow'] : [] })
         */
        states?: string[]
    }

    /** NEW (2026-10-29): sdk.ui().declaredMenu's options (the same slots / state / states as contextMenu's). */
    export type WidgetDeclaredMenuOptions = {
        slots?: Record<string, WidgetMenuNode[]>
        state?: Record<string, WidgetMenuEntryState>
        states?: string[]
        /** The menu's accessible name. Default: the submenu's label. */
        label?: string
        /** For "layout:<id>" situations in rules. */
        widgetConfig?: unknown
    }

    /** NEW (2026-10-29): a declared submenu entry's state for one menu (WidgetContextMenuOptions.state). */
    export type WidgetMenuEntryState = { checked?: boolean; disabled?: boolean; label?: string; title?: string }

    /**
     * NEW (2026-10-29): an entry of a submenu declared with its entries (menus.items children). The user can
     * reorder and hide them in Settings › Context Menu, never add to them. Ids: letters, digits, . _ - (unique in
     * the submenu); 40 entries a list; one nested level.
     *   { id, label, title?, disableWhen?, hideWhen? }     a choice: onMenuItem({ itemId: id })
     *   { id, label, type: 'submenu', children: [...] }   a sub-list
     *   { type: 'separator' }
     *   { slot, label }                                    filled per menu (contextMenu opts.slots[slot]); label:
     *                                                      what the editor shows for it
     */
    export type WidgetMenuEntryDecl = {
        id?: string
        type?: 'command' | 'submenu' | 'separator'
        label?: string
        title?: string
        slot?: string
        children?: WidgetMenuEntryDecl[]
        disableWhen?: string[]
        hideWhen?: string[]
    }

    /** NEW (2026-10-28): a widget's menu situation (entry.ts menuStates): id (letters, digits, - _), label. */
    export type MenuStateDecl = { id: string; label: string }

    /**
     * NEW (2026-10-27): an entry of a declared submenu (WidgetContextMenuOptions.submenus). `checked`
     * on any entry of a list shows the list as a choice (ticks).
     */
    export type WidgetMenuNode = {
        id?: string
        label?: string
        checked?: boolean
        disabled?: boolean
        title?: string
        separator?: boolean
        children?: WidgetMenuNode[]
    }

    /**
     * One of the manifest's menus.items. id: short ('remove'), named '<widgetType>.<id>' by the
     * host. contexts: the widget's declared menuContexts (or file contexts) it shows in; the
     * order of the list is the default layout. when: declarative conditions only.
     */
    export type WidgetMenuItemDecl = {
        id: string
        /** 'submenu' (2026-10-27): its entries come with each right-click (contextMenu opts.submenus[id]). */
        type?: 'command' | 'separator' | 'submenu'
        /** NEW (2026-10-29): a submenu declared with its entries (WidgetMenuEntryDecl); then opts.slots / state. */
        children?: WidgetMenuEntryDecl[]
        label?: string
        icon?: string
        contexts: string[]
        when?: Record<string, unknown>
        /**
         * NEW (2026-10-28): defaults for the user's "Disable when…": greyed while one of these situations
         * is true (the widget's menuStates ids, or 'layout:<id>'); hideWhen: left out instead (wins over
         * disableWhen). The user can change it per item in sys:context-menus.
         */
        disableWhen?: string[]
        hideWhen?: string[]
    }

    /**
     * One of the manifest's commands (key mapper, 2026-10-24): entry.ts
     * `commands: [{ id: 'play-pause', name: 'Play / pause', description: '...', keys: ['Space'] }]`.
     * Named '<widgetType>.<id>' by the host and run while the widget has the user's focus: the host
     * calls the widget's exposed `onCommand(id)` (defineExpose({ onCommand })).
     *   id: letters, digits, . _ - ; name and description: required (the description is what the
     *   user reads in the Keyboard shortcuts page: what the command does, plainly).
     *   keys: at most 2 defaults, as written: 'Ctrl+Shift+K', 'Alt+Left', 'F2', 'Space', 'Delete'.
     *   Ctrl / Alt / Shift; no Win / Meta. A key the shell's own commands use is refused as a default.
     *   whileTyping: also while the focus is in a text field (default: no).
     *
     * A button for a command (2026-10-28): v-gex-command, one attribute. A click runs it (your onCommand(id),
     * as its keys do); its tooltip shows its name, its description and the keys the user chose (they follow
     * changes); aria-keyshortcuts is set. Texts you give win (detail: '' leaves the description out):
     *   <button v-gex-command="'play-pause'">⏯</button>
     *   <button v-gex-command="{ id: 'play-pause', content: playing ? 'Pause' : 'Play' }">⏯</button>
     * No @click on that element (it would run twice). A button that does something else when clicked and
     * only shows a command's keys: v-gex-tooltip="{ content: 'Remove', command: 'remove-track' }".
     * Only this widget's commands: GEM Shell knows the button's widget (never from the id).
     */
    export type WidgetCommandDecl = {
        id: string
        name: string
        description: string
        keys?: string[]
        whileTyping?: boolean
        /**
         * 'hovered' (2026-10-29): the command also runs for your widget when it is under the mouse (it
         * needn't have the focus: parts that open on a click, like Favorites' pills). Your onCommand finds
         * what is hovered itself (an element matching ':hover'). The hovered widget's command runs before the
         * focused one's, only while the mouse moved in the last seconds.
         */
        when?: 'hovered'
    }

    /** <gex-scroll-area>'s ref (the template ref of the component; see Shared UI components below). */
    export interface GexScrollAreaRef {
        /** The scrolling element (its children are the default slot's rows). */
        readonly el: HTMLElement | null
        scrollByPage(dir: -1 | 1): void
        readonly hasOverflow: boolean
        readonly atStart: boolean
        readonly atEnd: boolean
        /** Measure again (the hints and the minimum follow sizes and added rows by themselves). */
        update(): void
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
//
//   <gex-scroll-area ref="area" :min-rows="2">
//     <template #head><div class="col-header">…</div></template>
//     <div v-for="row in rows" class="row">…</div>
//     <template #foot><div class="tools">…</div></template>
//   </gex-scroll-area>
//     What scrolls, with no scrollbar: a thin strip at the top and the bottom while it
//     overflows (an arrow when that way can scroll, a click scrolls a page; a line at the
//     end). head / foot stay put, outside the strips. As tall as its content, shrinking when
//     its place is short (put it in a flex column, the rest flex: 0 0 auto); `fill` takes the
//     room left instead; `max-height` (px) stops it. `min-rows` / `min-height` (px): never
//     smaller than that (or its content, when shorter); the widget's place keeps the widget
//     tall enough for it (the sidebar's minimum height). The ref (GexScrollAreaRef, from
//     'gexplorer/widgets') gives the scrolling element (el) for sortables, measuring and
//     scrollIntoView.
//     In the sidebar, a widget that scrolls this way declares contexts.sidebar.scroll: 'self'
//     (else the shell scrolls the whole widget): it is as tall as its content, up to the
//     user's maximum, and only its scroll areas shrink.
//
//   <gex-video-surface :video="handle" />
//     Shows a video of sdk.video() (2026-10-25): fills its place, the video contained and
//     letterboxed in black. Mounting moves the shell's <video> in; unmounting moves it back
//     into the shell's keeper in the same task, so a held video keeps playing. Style the
//     element through `.gex-video-surface > video` (the defaults have no weight).
declare module 'vue' {
    export interface GlobalComponents {
        'gex-marquee': import('vue').DefineComponent<{
            text: string; speed?: number; direction?: 'left' | 'right'; paused?: boolean; tip?: boolean
        }>
        'gex-fold-header': import('vue').DefineComponent<{
            label: string; status?: string | null; folded?: boolean; hint?: string; paused?: boolean
        }>
        'gex-scroll-area': import('vue').DefineComponent<{
            enabled?: boolean; fill?: boolean; maxHeight?: number; minRows?: number; minHeight?: number
        }>
        'gex-video-surface': import('vue').DefineComponent<{
            video: import('gexplorer/widgets').VideoHandle | null | undefined
        }>
        // NEW (2026-10-29): the shell's path field (README "A path field"): the path bar's predictions; it lists and
        // checks as your widget (your Read capability). Emits update:modelValue, enter (the text), valid (a GexPathCheck).
        'gex-path-input': import('vue').DefineComponent<{
            modelValue?: string; kind?: 'folder' | 'file' | 'any'; showFiles?: boolean; exts?: string[]
            mustExist?: boolean; lazy?: boolean; placeholder?: string; inputId?: string; disabled?: boolean; mono?: boolean
            'onUpdate:modelValue'?: (value: string) => void
            onEnter?: (value: string) => void
            onValid?: (check: GexPathCheck) => void
        }>
    }
}

/** NEW (2026-10-29): what <gex-path-input must-exist> found (its @valid). */
type GexPathCheck = {
    /** It exists, and is what the field asks for (kind). */
    ok: boolean
    exists: boolean
    isDir: boolean
    /** As typed. */
    typed: string
    /** Where it leads (folder variables expanded). */
    expanded: string
    /** Variables left as typed (not folder variables). */
    unknown: string[]
    /** The check line. */
    message: string
}
