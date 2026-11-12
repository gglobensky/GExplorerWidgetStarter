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
         * 2026-10-30 ('Geolocation' declared): the user's CITY, never this computer's position: its name, region,
         * country and the city's own coordinates (offline from GeoNames). Only right after the user's own click or key
         * press in this widget, and with their consent (the shell's dialog). Rejects with an Error whose `code` is
         * a GeolocateErrorCode; on 'os-off' the shell itself offers the system's location settings.
         */
        geolocate?: () => Promise<GeoCity>
        /**
         * 2026-11-01 ('AppLinks' declared, with `links`): an installed app's links (steam://rungameid/620...).
         *   const r = await sdk.appLinks!().open('steam://rungameid/620')   // straight from a click or key press
         * open: only right after the user's own click or key press in this widget; only a link matching one of
         * the TEMPLATES declared for its scheme (GEM Shell 2026-11-03: "steam://rungameid/{id}", nothing added after
         * the id); the user is asked once per scheme and set of templates (the shell's consent dialog, naming the
         * app and listing them). Some schemes are never opened (http(s), file, ms-*, search-ms...: openUrl / openPath).
         * available(scheme): an app on this computer opens that declared scheme's links (no prompt, nothing opened).
         */
        appLinks?: () => WidgetAppLinks
        /**
         * 2026-11-12 ('Web' declared, with `domains` and / or `userAdded: true`): a site's pages as it serves them, in a
         * frame kept over an element of yours (README "A web page in your widget").
         *   const s = await sdk.web!().surface(frameEl, { url: 'https://www.lemonde.fr/' })
         *   if (!('ok' in s)) s.onNavigate(url => ...)
         * One consent per domain (its subdomains included); addDomain only right after the user's click or key press.
         */
        web?: () => WidgetWeb
        /**
         * 2026-11-01 ('Apps' declared): the programs installed on this computer, read-only, and starting a Microsoft
         * Store app (an Xbox game) by its id.
         *   const r = await sdk.installedApps!().list()                 // asks the user once
         *   if (r.ok) for (const app of r.apps) console.log(app.name, app.publisher, app.installLocation)
         *   await sdk.installedApps!().launch('Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft')   // from a click
         * list: the desktop programs (Windows' uninstall entries: system components and updates left out), cached
         * 2 minutes ({ refresh: true }: now). A folder in it gives no file access: ask for Read as for any folder.
         * Store apps aren't listed yet: find the ones you know (a game's MicrosoftGame.config) and launch them.
         * launch: only right after the user's own click or key press in this widget; the user is asked once per app,
         * with the name Windows shows for it; 'not-installed' when Windows doesn't know that app id.
         */
        installedApps?: () => WidgetInstalledApps
        /**
         * GEM Shell 2026-11-06 ('Terminal' declared): console sessions, the strongest permission there is (a console
         * runs any command as the user). README "A console".
         *   const t = sdk.terminal!()
         *   const s = await t.shells()                                  // ids and names, never paths; asks nothing
         *   const r = await t.open({ shell: 'pwsh', cwd: 'C:\\Users\\me', cols: 80, rows: 24 })   // from a click
         *   if (r.ok) { r.session.onData(d => term.write(d)); term.onData(d => r.session.write(d)) }
         *   const release = t.captureKeys(termElement)                  // Ctrl+C, Ctrl+R, Esc… reach you there
         * open: only right after the user's own click or key press in this widget; the user is asked once (and asked
         * again before Allow). sessions(): this copy's live sessions, after a remount (session.replay() gives the last
         * output to draw again). Moving a session to a folder: session.cd(path) ONLY (GEM Shell quotes the folder for
         * that shell and types it while the session waits at its prompt: 'busy' otherwise); never write a path into a
         * session yourself. Output carries OSC 133;A (the prompt starts) and OSC 9;9;"<folder>" (where the shell is),
         * genuine: GEM Shell drops every other folder or prompt mark and OSC 52 (clipboard). Copy with
         * clipboardSetText on a gesture. Links in the output: open them with openUrl on the user's click only.
         * Sessions keep running while you're hidden; while one runs something, the tray shows a card with Stop.
         */
        terminal?: () => WidgetTerminal
        /**
         * GEM Shell 2026-11-06 ('Performance' declared; the process list and following a process: 'Processes' too): the
         * computer's resources, read-only. info(); watch({ sets, intervalMs, pid? }, onSample) → a watch (change, stop,
         * onSample, onEnded). Asked the first time (no click needed). The backend reads only what some watch shows:
         * stop or narrow yours when you show less. README "The computer's resources".
         */
        monitor?: () => WidgetMonitor
        /**
         * GEM Shell 2026-11-07 ('Develop' declared): GEM Forge's own; GEM Shell refuses it to every other widget.
         * build(files) compiles and bundles a project's files into a widget's bundle (never run).
         */
        dev?: () => WidgetDev
        /**
         * 2026-10-30: the values of the settings this widget declares (entry.ts `settings`), which the user sets on its
         * page in GEM Shell's Settings (drawn by the shell). One set for every copy of the widget. Only for widgets
         * declaring settings. Same object on every call.
         */
        settings?: () => WidgetSettings
        /**
         * 2026-10-31: GEM Shell's file preferences, set by the user in Settings ▸ Files & drives, for every widget
         * alike: show hidden files, show protected system files. Read-only and reactive: watch it and list again
         * (pass them to openListing's filter: showHidden / showProtected). Absent on older shells. Same object on
         * every call.
         */
        prefs?: () => Readonly<WidgetShellPrefs>
        /**
         * GEM Shell 2026-11-06: the OS GEM Shell runs on, from its backend (the browser's user agent isn't reliable in
         * GEM Shell's web view). No capability. Absent on older shells.
         */
        platform?: () => 'win32' | 'darwin' | 'linux'
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
         * (the GExplorer moving its own view to a folder excepted, and, GEM Shell 2026-11-06, a `role: 'navigable'`
         * widget placed in a hub's grid moving its own pane to a folder); otherwise refused and written to the
         * security log.
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
         * GEM Shell 2026-11-05 (H4b). Read capability. SHA-256 and MD5 of one file (one read for both; ask for one
         * with sha256 / md5: false), progress as it reads (bytes, total; -1: unknown): { result, cancel() }. result
         * resolves { sha256?, md5?, stopped } (stopped: cancelled) or rejects with an Error whose `code` is E_NOT_FOUND,
         * E_IS_FOLDER, E_BUSY (4 at a time per widget), E_ACCESS_DENIED, E_ELEVATION_DECLINED, E_READ_FAILED. A file
         * in a protected folder asks for administrator rights there once. Older GEM Shell: absent.
         */
        fsHash?: (path: string, opts?: { sha256?: boolean; md5?: boolean; onProgress?: (done: number, total: number) => void }) => FsHashRun
        /**
         * GEM Shell 2026-11-05 (H4b). Metadata capability. Properties of items, one per path, in order: size, size on
         * disk, dates, attributes, link; a single path also gets its owner and permissions. Never prompts (a
         * protected item: `limited`). A folder's size: not yet (the indexer, later: folderSize stays null).
         */
        fsProperties?: (paths: string[]) => Promise<FsPropertiesItem[]>
        /**
         * GEM Shell 2026-11-05 (H4b). Write capability. Read-only (files) and hidden (Windows) of one item: a Write
         * grant on it is asked once ("This file" suggested); refused by its own permissions: GEM Shell offers
         * "Retry as administrator". Rejects with an Error whose `code` is E_PERMISSION, E_NOT_FOUND, E_UNSUPPORTED,
         * E_ACCESS_DENIED, E_ELEVATION_DECLINED or E_FAILED.
         */
        fsSetAttributes?: (path: string, attrs: { readOnly?: boolean; hidden?: boolean }) => Promise<void>
        /**
         * GEM Shell 2026-11-05 (H4c). Metadata capability. Who may do what with one item: owner, rows (explicit and
         * inherited), your own access, what its drive can do (features). Never prompts. Rejects with an Error whose
         * `code` is E_NOT_FOUND, E_ACCESS_DENIED or E_READ_FAILED. Older GEM Shell: absent.
         */
        fsPermissions?: (path: string) => Promise<FsPermissions>
        /**
         * GEM Shell 2026-11-05 (H4c). Permissions capability. Changes them in one call: `entries` replace the item's
         * explicit rows; `ownerId`, `inherit` (Windows), `unixMode` (Linux). The Permissions grant is asked on the
         * item's folder once; GEM Shell asks before a risky change and offers "Retry as administrator". Rejects with
         * an Error whose `code` is E_CANCELLED (the user kept them), E_PERMISSION, E_NOT_FOUND, E_UNSUPPORTED,
         * E_BAD_REQUEST, E_ACCESS_DENIED, E_INVALID_OWNER (H4c-4: Windows refused the owner, administrator rights
         * declined or not offered; `part`: 'owner'), E_ELEVATION_DECLINED or E_FAILED. Nothing is written when it
         * fails (one write). Risks accepted through confirmPermissionChange aren't asked again.
         */
        fsSetPermissions?: (path: string, change: FsPermissionsChange) => Promise<void>
        /**
         * GEM Shell 2026-11-05 (H4c). Permissions capability. People and groups whose name holds <query>: the
         * built-in ones, this computer's, then the domain's when the PC is joined (directoryUnreachable: it didn't
         * answer in time). An empty query: the built-in ones. The grant is asked on <forPath> the first time.
         */
        searchPrincipals?: (query: string, forPath: string, limit?: number) => Promise<{ items: FsPrincipal[]; directoryUnreachable: boolean }>
        /** GEM Shell 2026-11-05 (H4c). Permissions capability. A typed name ("DOMAIN\\name", "Everyone") as a principal; null: unknown. */
        resolvePrincipal?: (name: string, forPath: string) => Promise<FsPrincipal | null>
        /**
         * GEM Shell 2026-11-05 (H4c-4). Permissions capability. GEM Shell's risk question NOW, for a draft the user
         * just changed (<change>: the whole draft, as fsSetPermissions would get it): true, go on (no risk, or
         * accepted: Save won't ask again for it); false, the user kept them: undo that LAST choice only. The
         * Permissions grant is asked first (once). Rejects with an Error whose `code` is E_PERMISSION. Nothing written.
         */
        confirmPermissionChange?: (path: string, change: FsPermissionsChange) => Promise<boolean>
        /**
         * 2026-11-01: a path with folder variables made a real one ("%PROGRAMDATA%\\Epic", "%APPDATA%\\CurseForge",
         * "~/x" on Linux): the known folder variables only. As given when there are none. Read capability.
         */
        expandPath?: (text: string) => Promise<string>
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
         * NEW (GEM Shell 2026-11-05). Write cap. Writes a whole binary file (a picture you saved): a Uint8Array, an
         * ArrayBuffer or a Blob (canvas.toBlob), at most 256 MB. overwrite false (the default): fails when the file
         * exists. The grant asked is for the file itself (a file picked in ui().saveFile, or handed to a picture
         * editor, is granted alone: no prompt). Rejects on failure.
         */
        fsWriteBytes?: (path: string, data: Uint8Array | ArrayBuffer | Blob, opts?: { overwrite?: boolean }) => Promise<void>
        /**
         * NEW (GEM Shell 2026-11-05). Read cap. A whole file's bytes as a Blob (`type`: its MIME type). maxBytes:
         * default 64 MB, at most 256 MB (rejects, code E_TOO_LARGE). A file in a protected folder asks for
         * administrator rights there once. A picture to show: `URL.createObjectURL(blob)` (GEM Shell's pages show
         * blob: and data: pictures, not a loopback stream's); your canvas stays readable. Rejects with an Error
         * whose `code` says why (E_NOT_FOUND, E_IS_FOLDER, E_TOO_LARGE, E_ACCESS_DENIED...).
         */
        fsReadBytes?: (path: string, opts?: { maxBytes?: number; type?: string }) => Promise<Blob>
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
         * NEW (GEM Shell 2026-11-05). Your own window, when GEM Shell runs your widget in one (the window context: a
         * picture editor opened by "Edit picture", `role: 'picture-editor'`); null anywhere else. README "A picture
         * editor". Same object on every call.
         */
        window?: () => WidgetWindow | null
        /**
         * NEW (GEM Shell 2026-11-05, P4b). Text in a picture, recognised on this computer (Windows' own recognition:
         * nothing leaves the computer). No capability: your own pixels. recognize(png, { language }): the text, its
         * lines and words (boxes in the picture's pixels); no language: the user's choice (Settings ▸ Pictures), else
         * their Windows languages. Rejects with an Error whose `code` is a TextErrorCode. One recognition at a time
         * for all of GEM Shell (the next waits). For zones over a picture: the ink kit's readInkText. README
         * "Text in a picture". Same object on every call.
         */
        text?: () => WidgetText
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
        mediaInfo?: (paths: string[]) => Promise<MediaInfoItem[]>

        /**
         * An image asset (2026-10-14): the host decodes, resizes and re-encodes it (JPEG / PNG, no
         * metadata) and serves it from the app's own origin at a stable URL: put `url` in <img src>
         * as is; a canvas drawing it stays readable. Keep `assetId` with it (to delete it).
         *   { type: 'file', path }         an image file (JPEG, PNG, GIF, BMP, TIFF), read as this widget
         *   { type: 'thumbnail', path }    the OS's thumbnail of any file: a video's frame, a photo,
         *                                  an album's cover (size: the box asked of the OS, ≤ 1024)
         *   { type: 'icon', path | appId } (2026-11-02) a program's icon (its .exe, a shortcut, an .ico) or a
         *                                  Store app's (appId: after sdk.installedApps was allowed), always
         *                                  PNG with its transparency, its empty margin trimmed (size ≤ 256;
         *                                  an icon only drawn small comes back small: see width / height)
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
         * (same path, size, date, options) comes from the cache, across sessions; so does an image made from an
         * unchanged file (2026-11-01). 'persistent': kept until deleted, within the
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
         * An answer that isn't 2xx REJECTS (it never resolves with ok: false): the Error's message is
         * "HTTP <status>: <statusText>" (or the refusal's reason), and since GEM Shell 2026-11-03 it carries
         * `status` and `statusText` too (0 / '' when no answer came: refused, offline, timed out):
         *   try { const r = await sdk.networkFetch!(url) } catch (e: any) { if (e.status === 404) ... }
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
         * NEW (GEM Shell 2026-11-05). Clipboard cap. Puts a picture (PNG bytes) on the clipboard, replacing what was
         * there: every program can paste it. Only right after the user's own click or key press in your widget
         * (a command's key counts): rejects otherwise, and the security log notes it. At most 256 MB.
         */
        clipboardSetImage?: (png: Uint8Array | ArrayBuffer | Blob, opts?: { text?: string }) => Promise<void>
        /**
         * NEW (GEM Shell 2026-11-05, P4b). Clipboard cap. Puts text on the clipboard, replacing what was there (text
         * read in a picture). The same rule as clipboardSetImage: only right after the user's own click or key press
         * in your widget. 4 million characters at most. clipboardSetImage's opts.text: the picture and its text in
         * ONE clipboard entry (a text editor pastes the text, a picture editor the picture).
         */
        clipboardSetText?: (text: string) => Promise<void>
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
        /** 2026-10-30: the user's city (sdk.geolocate), never this computer's position. */
        | 'Geolocation'
        /** 2026-11-01: an installed app's links (sdk.appLinks), declared with `links: AppLinkDecl[]`. */
        | 'AppLinks'
        /** 2026-11-01: the installed programs (sdk.installedApps): the list, and starting a Store app. */
        | 'Apps'
        /** 2026-11-12: web surfaces (sdk.web), declared with `domains` and / or `userAdded: true`. */
        | 'Web'
        /** 2026-11-05 (H4c): change who may use files and folders, search people and groups (sdk.fsSetPermissions...). */
        | 'Permissions'
        /** 2026-11-06: console sessions (sdk.terminal): they run any command as the user. */
        | 'Terminal'
        /** 2026-11-06: the computer's numbers (sdk.monitor): CPU per core, memory, disks, network, GPU, GEM Shell's own use. */
        | 'Performance'
        /** 2026-11-06: the processes that run and following one (sdk.monitor watches with 'processes' or a pid). */
        | 'Processes'
        /** 2026-11-07: build widgets from a project's files (sdk.dev). GEM Forge's only: refused to any other widget. */
        | 'Develop'

    /** sdk.terminal()'s shells: ids ('cmd', 'powershell', 'pwsh', 'bash', 'wsl:<distro>') and names. */
    export type TerminalShellInfo = { id: string; label: string; version?: string }
    /**
     * Why a console call failed: no-gesture (open: not right after a click or key press in the widget), declined (no
     * Terminal permission, or the user said no), unavailable (no consoles on this system), bad-argument (an unknown shell,
     * a folder that doesn't exist), limit (16 consoles per copy, 32 in all), busy (cd: a program is running or text is
     * half typed), unsafe-name (cd: a folder name that can't be typed safely in that shell), ended, failed.
     */
    export type TerminalReason = 'no-gesture' | 'declined' | 'unavailable' | 'bad-argument' | 'limit' | 'failed' | 'busy' | 'unsafe-name' | 'ended'
    export type TerminalFailure = { ok: false; reason: TerminalReason; error: string }
    export type TerminalShellsResult = { ok: true; available: boolean; reason?: string; shells: TerminalShellInfo[] } | TerminalFailure
    export type TerminalSession = {
        readonly id: string
        readonly shell: string
        /** The folder it started in; where it is now comes in the output (OSC 9;9). */
        readonly startedIn: string
        /** Running something (a process besides the shell). */
        readonly busy: boolean
        readonly ended: boolean
        readonly exitCode: number | null
        /** Input as typed. Never a path: use cd(). */
        write(data: string): void
        resize(cols: number, rows: number): void
        cd(path: string): Promise<{ ok: true } | TerminalFailure>
        /** The last output kept (256 K characters), to draw the screen again after a remount. */
        replay(): Promise<string>
        kill(): Promise<void>
        onData(fn: (data: string) => void): () => void
        onExit(fn: (code: number) => void): () => void
        onBusy(fn: (busy: boolean) => void): () => void
    }
    export type MonitorSet = 'cpu' | 'memory' | 'disks' | 'network' | 'gpu' | 'self' | 'processes'

    export type MonitorReason = 'declined' | 'unavailable' | 'bad-argument' | 'limit' | 'failed' | 'ended'
    export type MonitorFailure = { ok: false; reason: MonitorReason; error: string; needs?: 'Performance' | 'Processes' }

    export type MonitorInfo = {
        os: string
        cpuName: string
        logicalCores: number
        totalMemory: number
        disks: string[]
        adapters: Array<{ id: string; name: string; kind: string; linkBits: number }>
        /** The display adapters' names (a GPU sample is named after one when there is one GPU). */
        gpus: string[]
    }

    export type MonitorProcess = {
        pid: number
        ppid: number
        /** The image name only ("chrome.exe"). */
        name: string
        /** 0–100, of the whole computer. */
        cpu: number
        priv: number
        ws: number
        read: number
        write: number
        threads: number
        handles: number
        /** 0–100 (its busiest GPU engine) and its dedicated video memory: with the 'gpu' set only. */
        gpu: number
        gpuMem: number
    }

    /** A process and the ones it started, summed ('self': GEM Shell; follow: a pid). */
    export type MonitorTree = Omit<MonitorProcess, 'ppid'> & { count: number; parts: MonitorProcess[] }

    export type MonitorSample = {
        at: number
        cpu?: { total: number; kernel: number; cores: number[] }
        memory?: {
            total: number; available: number; committed: number; commitLimit: number; cached: number
            pagedPool: number; nonPagedPool: number; processes: number; threads: number; handles: number
        }
        disks?: Array<{ name: string; read: number; write: number; active: number; queue: number }>
        network?: Array<{ id: string; name: string; received: number; sent: number; linkBits: number }>
        gpu?: Array<{ name: string; total: number; engines: Record<string, number>; dedicated: number; shared: number }>
        /** The busiest first, 1 024 at most. */
        processes?: MonitorProcess[]
        self?: MonitorTree
        /** The followed process; { pid, gone: true } once it ended. */
        follow?: MonitorTree | { pid: number; gone: true }
    }

    export type MonitorWatchOptions = { sets: MonitorSet[]; intervalMs?: number; pid?: number }

    export type MonitorWatch = {
        readonly id: string
        readonly sets: readonly MonitorSet[]
        readonly intervalMs: number
        readonly pid: number | null
        /** Ended: stopped, the instance removed, or a permission taken back (onEnded says why). */
        readonly ended: boolean
        /** Other sets, interval or process (Processes asked first when they need it). */
        change(opts: MonitorWatchOptions): Promise<{ ok: true } | MonitorFailure>
        stop(): Promise<void>
        onSample(fn: (s: MonitorSample) => void): () => void
        onEnded(fn: (reason: string) => void): () => void
    }

    /** sdk.dev() (GEM Forge): a project's file, its text or (a picture, a font) its bytes in base64. Paths relative, with /. */
    export type DevFile = { path: string; text?: string; base64?: string }
    /** A problem of a build: 1-based line and column; rule: the packaging check's rule, or 'keys'. */
    export type DevProblem = { file: string; line: number; column: number; text: string; rule?: string }
    export type DevBuildResult = {
        ok: boolean
        /** The id entry.ts declares ('' when it can't be read). */
        type: string
        /** The bundle (index.js), or null when the build has errors. */
        code: string | null
        errors: DevProblem[]
        warnings: DevProblem[]
        /** For each packaging rule found: what it means and the fix. */
        notes: string[]
        ms: number
        /**
         * GEM Shell 2026-11-08: a dev run's source map (a build with { project } only): esbuild's map of index.js (its
         * sources: '../src/<path>', node_modules' under '…/node_modules/'), the lines put before esbuild's first one,
         * and each .vue file's compiled module (a .vue file's positions in the map are its compiled module's).
         */
        sourceMap?: { map: string; lineOffset: number; compiled: Record<string, string> }
    }
    export type DevRunResult =
        | { ok: true; type: string; build: number; reopened: number }
        | { ok: false; error: string; code?: string }
    export type WidgetDev = {
        /**
         * The packaging check, the .vue files compiled, the bundle made by GEM Shell's esbuild: the starter's build,
         * in GEM Shell. Only the project's files, vue and gexplorer/widgets (and, with packagesFrom, its npm packages). 300 files, 8 MB.
         * { project } (GEM Shell 2026-11-07): a build to run(): its id becomes 'dev-<project>', its name
         * "<name> (being edited)". Without it: the widget as it will be installed.
         */
        /**
         * GEM Shell 2026-11-07: options.packagesFrom, the project's folder: its npm packages (node_modules, filled by
         * packages()) are bundled, their licences added to the notices. Without it, an npm import is an error.
         */
        build(files: DevFile[], options?: { project?: string; packagesFrom?: string }): Promise<DevBuildResult>
        /**
         * GEM Shell 2026-11-07: a { project } build's bundle run as widget 'dev-<project>' (its own identity,
         * 'dev:<project>': its permissions are asked as for any widget and last while GEM Shell runs, or until end()).
         * Its open windows are reopened on the new build (reopened: how many).
         */
        run(project: string, code: string): Promise<DevRunResult>
        /** The project in a window of its own: right after the user's own click or key press in GEM Forge. */
        openWindow(project: string, options?: { title?: string }): Promise<{ ok: true } | { ok: false; error: string }>
        /** The project's bundle and permissions gone (done for you when this copy of GEM Forge is removed). */
        end(project: string): Promise<{ ok: boolean; error?: string }>
        /**
         * GEM Shell 2026-11-07: a project you ran, shown by GEM Shell over <el> (an element of your own box) in a real
         * placement: its own copy with context 'grid' (default: el's size), 'sidebar' (a column, 280 px at most) or
         * 'toolbar' (a 36 px strip). It follows el, is clipped to your box, and remounts on every run(). You never
         * touch its DOM; your menus and popovers draw above it. GEM Shell 2026-11-07: <el> may also be in one of your own
         * windows (sdk.ui().openWindow): drawn just above that window, clipped to it. openWindow's { title }: after the
         * project's name in the window's header and on its card in the operations tray.
         */
        preview(el: HTMLElement, project: string, options?: DevPreviewOptions): Promise<{ ok: true; preview: DevPreviewHandle } | { ok: false; error: string }>
        /** What the projects you ran write to the console, and their uncaught errors. Returns the release. */
        onConsole(fn: (m: DevConsoleMessage) => void): () => void
        /**
         * GEM Shell 2026-11-07: a project folder watched with its subfolders: after a burst of changes calms,
         * { changes, overflow } (paths relative, with /; overflow: read it all again). node_modules, .git, dist, bin,
         * obj and editors' temporary files are left out. Read the files with openListing / fsReadText (declare Read).
         */
        watch(folder: string, onChange: (e: { changes: DevChange[]; overflow: boolean }) => void): Promise<{ ok: true; stop: () => void } | { ok: false; error: string }>
        /**
         * GEM Shell 2026-11-07: a bundle built WITHOUT { project } installed as the user's widget <type>, after GEM
         * Shell's own question; right after the user's own click or key press in GEM Forge. An update loads at once
         * (GEM Shell 2026-11-07): its copies on screen remount with it (lifecycle data kept), its windows reopen.
         */
        install(type: string, code: string): Promise<DevInstallResult>
        /**
         * GEM Shell 2026-11-07: whether <type> is a widget: 'yours' (the user installed it: update or uninstall it),
         * 'builtin' (comes with GEM Shell: its name can't be used), 'none'. No question.
         */
        installed?(type: string): Promise<DevInstalledState>
        /**
         * GEM Shell 2026-11-07: a widget the user installed removed, after GEM Shell's own question; right after the
         * user's own click or key press in GEM Forge. Never a built-in one. A copy already running keeps going until
         * GEM Shell restarts.
         */
        uninstall?(type: string): Promise<DevUninstallResult>
        /**
         * GEM Shell 2026-11-07: a project's npm packages, by the npm of Node.js on the computer (in <folder>: its
         * package.json, its node_modules). 'version': Node's and npm's versions (no question). 'install' (what
         * package.json lists), 'add' (names, or name@version: saved in package.json), 'remove': right after the user's
         * click or key press, after GEM Shell's question and the folder's Write grant. Install scripts never run.
         */
        packages?(op: DevPackagesOp, folder?: string, names?: string[]): Promise<DevPackagesResult>
        /**
         * GEM Shell 2026-11-07: TypeScript over the project's files, in the page (loaded the first time: a few MB, once
         * per GEM Shell run). sync() the files (unsaved edits included) before asking; offsets are the file's own
         * (in a .vue file: its <script> blocks are read, the template isn't). Disposed with this copy of GEM Forge.
         */
        language?(): Promise<{ ok: true; service: DevLanguageService } | { ok: false; error: string }>
        /**
         * GEM Shell 2026-11-08: Prettier in the page (loaded the first time: about 2 MB, once per GEM Shell run). Texts
         * in, texts out: no file is read or written. The parser comes from the path's extension; options: Prettier's
         * formatting options only (endOfLine 'auto' unless given).
         */
        prettier?(): Promise<{ ok: true; service: DevPrettierService } | { ok: false; error: string }>
    }
    export type DevPrettierOptions = {
        printWidth?: number; tabWidth?: number; useTabs?: boolean; semi?: boolean; singleQuote?: boolean
        jsxSingleQuote?: boolean; quoteProps?: 'as-needed' | 'consistent' | 'preserve'
        trailingComma?: 'all' | 'es5' | 'none'; bracketSpacing?: boolean; bracketSameLine?: boolean
        objectWrap?: 'preserve' | 'collapse'; arrowParens?: 'always' | 'avoid'; proseWrap?: 'always' | 'never' | 'preserve'
        htmlWhitespaceSensitivity?: 'css' | 'strict' | 'ignore'; vueIndentScriptAndStyle?: boolean
        endOfLine?: 'lf' | 'crlf' | 'cr' | 'auto'; singleAttributePerLine?: boolean; experimentalTernaries?: boolean
    }
    /** Prettier couldn't read the text (a syntax error: 1-based line and column when known). */
    export type DevPrettierError = { ok: false; error: string; line?: number; column?: number }
    /** GEM Shell 2026-11-08: sdk.dev().prettier()'s service. */
    export type DevPrettierService = {
        /** Prettier's version (GEM Shell's). */
        version: string
        /** Whether Prettier formats this kind of file (.ts .js .vue .css .scss .less .html .md .json .yaml…). */
        supports(path: string): boolean
        /** The file <path>'s text formatted. */
        format(path: string, text: string, options?: DevPrettierOptions): Promise<{ ok: true; text: string } | DevPrettierError>
        /** Whether the text is formatted already (Prettier's --check). */
        check(path: string, text: string, options?: DevPrettierOptions): Promise<{ ok: true; formatted: boolean } | DevPrettierError>
    }
    export type DevPackagesOp = 'version' | 'install' | 'add' | 'remove'
    export type DevPackagesResult =
        | { ok: true; node?: string; npm?: string; output?: string }
        | { ok: false; error: string; code?: string; output?: string; cancelled?: boolean }
    /** GEM Shell 2026-11-07: sdk.dev().language()'s service (TypeScript). Paths relative, with /; offsets in the file's text. */
    export type DevLanguageService = {
        /** TypeScript's version. */
        readonly version: string
        /**
         * The project's files as they are now (.ts .js .vue .json .d.ts; 300 files, 2 MB each, 8 MB in all). aliases:
         * a module name and the project file it is ('gexplorer/widgets' -> 'widgets-sdk.d.ts'); untyped: npm packages
         * whose imports are any. packages (GEM Shell 2026-11-08): the npm packages' own types read from node_modules
         * ('node_modules/<name>/….d.ts' and package.json; 4000 files, 32 MB; the same array again: not read again).
         */
        sync(files: { path: string; text: string }[], options?: { aliases?: Record<string, string>; untyped?: string[]; packages?: { path: string; text: string }[] }): { ok: boolean; error?: string }
        completions(path: string, offset: number): { isMember: boolean; items: DevCompletion[] } | null
        /** 2026-11-08: edits: an auto-import's import to add (an item with module). */
        completionDetails(path: string, offset: number, item: DevCompletion): { detail: string; documentation: string; edits?: DevLanguageEdit[] } | null
        hover(path: string, offset: number): { from: number; to: number; text: string; documentation: string } | null
        /** TypeScript's problems in the file (syntax and types), as you type. */
        problems(path: string): DevLanguageProblem[]
        /** Where the name at offset is declared: a project file (path), or outside it (external: 'lib.dom.d.ts', 'vue'). */
        definition(path: string, offset: number): { path?: string; external?: string; from: number; to: number }[]
        /** GEM Shell 2026-11-08: TypeScript's formatting (indentation, spaces; quotes and semicolons as written): edits
         *  on the file's text, in order (apply them from the last one to the first). A .vue file: inside its scripts only. */
        format?(path: string, options?: { indent?: number; tabs?: boolean }): { from: number; to: number; text: string }[]
        /** GEM Shell 2026-11-08: whether the name at offset can be renamed (its name and place), or why not. */
        renameInfo?(path: string, offset: number): { ok: true; name: string; from: number; to: number } | { ok: false; error: string }
        /** GEM Shell 2026-11-08: the edits renaming it in the project's files (a .vue file's scripts; its template: yours). */
        rename?(path: string, offset: number, newName: string): { ok: true; edits: DevLanguageEdit[] } | { ok: false; error: string }
        /** GEM Shell 2026-11-08: its references in the project's files (its declaration marked). */
        references?(path: string, offset: number): { path: string; from: number; to: number; definition: boolean }[]
        /** GEM Shell 2026-11-08: the call's signatures around offset (while typing its arguments). */
        signature?(path: string, offset: number): DevSignatureHelp | null
        /** GEM Shell 2026-11-08: the packages' type files still being prepared (parsed between frames); 0: ready. */
        preparing?(): number
        dispose(): void
    }
    /** GEM Shell 2026-11-08: a change in one of the project's files (offsets in its text). */
    export type DevLanguageEdit = { path: string; from: number; to: number; text: string }
    /** GEM Shell 2026-11-08: signature help; parameter: the argument the cursor is in. */
    export type DevSignatureHelp = {
        active: number
        parameter: number
        items: { prefix: string; parameters: { text: string; documentation: string }[]; separator: string; suffix: string; documentation: string }[]
    }
    export type DevCompletion = {
        name: string
        /** GEM Shell 2026-11-08: another module's export (an auto-import): completionDetails' edits add its import. */
        module?: string
        /** TypeScript's kind: 'method', 'property', 'function', 'var', 'keyword'… */
        kind: string
        modifiers: string
        sort: string
        insert?: string
        /** The range the completion replaces, when not the word before the cursor. */
        replace?: { from: number; to: number }
        source?: string
        data?: unknown
    }
    export type DevLanguageProblem = { from: number; to: number; severity: 'error' | 'warning' | 'info'; text: string; code: number }
    export type DevInstalledState = 'yours' | 'builtin' | 'none'
    export type DevUninstallResult = { ok: true; removed: boolean } | { ok: false; error: string; cancelled?: boolean }
    export type DevChange = { path: string; kind: 'created' | 'changed' | 'deleted' }
    export type DevInstallResult = { ok: true; type: string; replaced: boolean } | { ok: false; error: string; cancelled?: boolean }
    export type DevPreviewContext = 'grid' | 'sidebar' | 'toolbar'
    export type DevPreviewOptions = { context?: DevPreviewContext; width?: number; height?: number }
    export type DevPreviewHandle = {
        /** Another context or size (width / height null: the default again). false: it was closed. */
        set(options: { context?: DevPreviewContext; width?: number | null; height?: number | null }): boolean
        close(): void
    }
    export type DevConsoleMessage = { project: string; level: 'log' | 'info' | 'warn' | 'error' | 'debug'; text: string; at: number }

    export type WidgetMonitor = {
        info(): Promise<{ ok: true; available: boolean; reason?: string; info?: MonitorInfo } | MonitorFailure>
        watch(opts: MonitorWatchOptions, onSample?: (s: MonitorSample) => void): Promise<{ ok: true; watch: MonitorWatch } | MonitorFailure>
    }

    export type WidgetTerminal = {
        shells(opts?: { refresh?: boolean }): Promise<TerminalShellsResult>
        /** cwd '' or left out (GEM Shell 2026-11-06): the user's home folder. */
        open(opts: { shell: string; cwd?: string; cols: number; rows: number }): Promise<{ ok: true; session: TerminalSession } | TerminalFailure>
        sessions(): Promise<TerminalSession[]>
        /**
         * The console's keys inside <el>: while the USER put the focus there (a press in it, Tab into it) and a
         * session is live, every key reaches you, Ctrl / Alt combos and Esc included, and none of your commands or
         * GEM Shell's runs. Except the actions GEM Shell keeps (leave the pane, focus the next / previous pane, the
         * cheat sheet: on the user's keys), unless you claim that key (entry.ts keyboard.claims). Returns the release.
         */
        captureKeys(el: HTMLElement): () => void
    }

    /** sdk.geolocate()'s answer: a city and the CITY's coordinates. */
    export type GeoCity = {
        name: string
        region?: string
        country?: string
        /** ISO 3166-1 alpha-2 ("CA"). */
        countryCode: string
        latitude: number
        longitude: number
    }
    /**
     * Why sdk.geolocate() failed (the Error's `code`): no-gesture (not right after a click or key press in the widget),
     * declined (the user said no), os-off (the system's location is off), unavailable (no position, no city table,
     * or no location on this system yet), timeout, error.
     */
    export type GeolocateErrorCode = 'no-gesture' | 'declined' | 'os-off' | 'unavailable' | 'timeout' | 'error'

    /**
     * entry.ts, 2026-11-01: { cap: 'AppLinks', reason: '…', links: AppLinkDecl[] }. scheme: lower-case letters,
     * digits, + . - ; label: the app's name in the consent dialog and Settings ▸ Permissions.
     * templates (GEM Shell 2026-11-03): the exact shapes of the links the widget opens, at most 8 per scheme, 200
     * characters each: literal text, and {id} for one id (1 to 128 of A-Z a-z 0-9 . _ : - or %3A; no / ? & # = +):
     *   ['steam://rungameid/{id}', 'com.epicgames.launcher://apps/{id}?action=launch&silent=true']
     * A link must match one whole: nothing can be added after the id (launch arguments, other commands). The backend
     * checks it too, against the templates the user approved. prefixes (2026-11-01, deprecated): each read as
     * "<prefix>{id}", with a console warning.
     */
    /**
     * launch (2026-11-02): the app has a launcher command in GEM Shell (today only 'battlenet'): appLinks().launch(scheme,
     * code) starts its game through the app's own program (Battle.net.exe --exec="launch <code>"), the same permission
     * as its links.
     */
    export type AppLinkDecl = { scheme: string; templates?: string[]; /** @deprecated templates */ prefixes?: string[]; label?: string; launch?: boolean }
    /**
     * An entry of entry.ts `capabilities` (the plain string 'Read' is the same as { cap: 'Read' }). reason: shown in
     * GEM Shell's questions. together (GEM Shell 2026-11-06, H10): asked in ONE question with your other `together`
     * ones, the first time you need any of them (README "Several permissions in one question"). Only STANDING
     * permissions can be grouped: Network, Geolocation, Terminal, AppLinks (each declared scheme), Apps (the list).
     * Scoped ones (Read, Write, Metadata, Exec, Permissions: about a folder or a file) are asked when the path is known:
     * `together` on them is ignored, with a console warning.
     */
    export type WidgetCapabilityDecl = { cap: string; reason?: string; together?: boolean; links?: AppLinkDecl[] }
    /**
     * entry.ts contexts.grid sizes (GEM Shell 2026-11-06; README "Your size in a hub"). width / height in px: what
     * your content needs (minSize) or can use (maxSize), turned into cells with the hub's cell size when the user adds
     * or resizes you (rounded up). cols / rows: cells (deprecated: a cell's size changes with the window).
     */
    export type GridSizeDecl = { width?: number; height?: number; /** @deprecated use px */ cols?: number; /** @deprecated use px */ rows?: number }
    /** Your starting size: a share of the hub's grid ('50%') or px; cols / rows deprecated. */
    export type GridDefaultSizeDecl = { width?: number | `${number}%`; height?: number | `${number}%`; /** @deprecated */ cols?: number; /** @deprecated */ rows?: number }
    /**
     * Why sdk.appLinks().open() didn't open: no-gesture (not right after a click or key press in the widget),
     * not-declared (no declared prefix fits), declined (the user said no, or revoked it), not-registered (no app
     * on this computer opens the scheme: the app isn't installed), bad-argument (not a usable link), failed.
     */
    export type AppLinkReason = 'no-gesture' | 'not-declared' | 'declined' | 'not-registered' | 'bad-argument' | 'failed'
    export type AppLinkResult = { ok: true } | { ok: false; reason: AppLinkReason; error?: string }
    export interface WidgetAppLinks {
        open(uri: string): Promise<AppLinkResult>
        available(scheme: string): Promise<boolean>
        /**
         * 2026-11-02 (older GEM Shells: absent): starts a game through a store's own program, for a store with no link
         * that does (Battle.net: battlenet:// only opens its page). scheme declared with launch: true; code: the store's
         * launch code (Battle.net: 2 to 8 letters or digits, "Pro", "WoW", "Fen"). Same rules as open().
         */
        launch?(scheme: string, code: string): Promise<AppLinkResult>
    }

    /**
     * 2026-11-12: sdk.web(). entry.ts: { cap: 'Web', reason: '…', domains?: string[], userAdded?: boolean, together?: boolean }.
     * Reasons: not-allowed (not one of your domains, or a user-added one not added yet), no-gesture (addDomain without
     * the user's click or key press), declined (the user said no, or revoked it), bad-argument (not a usable address or
     * domain), failed.
     */
    export type WebReason = 'not-allowed' | 'no-gesture' | 'declined' | 'bad-argument' | 'failed'
    export type WebResult = { ok: true } | { ok: false; reason: WebReason; error?: string }
    export interface WebSurface {
        /** The page shown now (its last top-level address). */
        readonly url: string
        /** One of your domains only (not a site the user only continued to from the bar). */
        load(url: string): Promise<WebResult>
        back(): void
        forward(): void
        reload(): void
        /** Your surface's own address, after every page change. Returns the unsubscribe. */
        onNavigate(cb: (url: string) => void): () => void
        /** Ends it (GEM Shell also does when your widget's instance goes). */
        dispose(): void
    }
    export interface WidgetWeb {
        surface(el: HTMLElement, opts: { url: string }): Promise<WebSurface | { ok: false; reason: WebReason; error?: string }>
        /** userAdded only, right after the user's click or key press in your widget: the consent dialog for that domain. */
        addDomain(domain: string): Promise<WebResult & { domain?: string }>
    }

    /** One program of sdk.installedApps().list() (a desktop program's uninstall entry). */
    export type InstalledApp = {
        /** Stable: 'win32:<hive>:<uninstall key name>', or 'store:<app id>'. */
        id: string
        /** 'desktop': an uninstall entry; 'store' (2026-11-01): a packaged app (a Store app, an Xbox game). */
        kind: 'desktop' | 'store'
        /** A Store app's id ("<package family name>!<app id>"), what launch() takes; its folder is installLocation. */
        appId?: string
        name: string
        publisher?: string
        version?: string
        installLocation?: string
        /** yyyy-mm-dd */
        installDate?: string
        sizeKb?: number
        /** The program (or icon file) the entry names, an .exe or .ico path, without its ",0". */
        displayIcon?: string
        /** The entry's key name ('Uplay Install 635', 'Steam App 620'), never a registry path. */
        uninstallKey: string
    }
    /**
     * Why sdk.installedApps() refused: no-gesture (launch, not right after a click or key press in the widget),
     * declined (the user said no), not-installed (no such Store app), bad-argument (not an app id: "<package
     * family name>!<app id>"), unsupported (not on this system yet: Linux), failed.
     */
    export type InstalledAppsReason = 'no-gesture' | 'declined' | 'not-installed' | 'bad-argument' | 'unsupported' | 'failed'
    export interface WidgetInstalledApps {
        list(opts?: { refresh?: boolean }): Promise<{ ok: true; apps: InstalledApp[] } | { ok: false; reason: InstalledAppsReason; error?: string }>
        launch(appId: string): Promise<{ ok: true } | { ok: false; reason: InstalledAppsReason; error?: string }>
    }

    // ── Widget settings (entry.ts `settings`, 2026-10-30) ─────────────────
    // Declared fields; GEM Shell draws them on the widget's page in Settings, checks and stores the values (one set
    // per widget type), and hands them over through sdk.settings().
    export type WidgetSettingValue = boolean | string | number | string[] | Array<{ key: string; value: string }>
    export type WidgetSettingShowWhen = { key: string; equals?: unknown; in?: unknown[]; truthy?: boolean }
    type WidgetSettingBase = { key: string; label: string; hint?: string; showWhen?: WidgetSettingShowWhen }
    /** One field of entry.ts `settings.fields` (a key: a letter, then letters, digits, _ or -; 40 at most). */
    export type WidgetSettingField =
        | (WidgetSettingBase & { type: 'toggle'; default?: boolean })
        | (WidgetSettingBase & { type: 'choice'; choices: Array<{ value: string | number; label: string }>; default?: string | number })
        /** A dynamic choice of widget types currently providing an extension point. */
        | (WidgetSettingBase & { type: 'provider'; point: string; default?: string; automaticLabel?: string; builtinLabel?: string })
        | (WidgetSettingBase & { type: 'number'; min?: number; max?: number; step?: number; unit?: string; slider?: boolean; default?: number })
        | (WidgetSettingBase & { type: 'text'; maxLength?: number; placeholder?: string; default?: string })
        | (WidgetSettingBase & { type: 'path'; kind?: 'folder' | 'file' | 'any'; default?: string })
        | (WidgetSettingBase & { type: 'color'; default?: string })
        | (WidgetSettingBase & { type: 'list'; item?: 'text' | 'path'; kind?: 'folder' | 'file' | 'any'; maxItems?: number; default?: string[] })
        | (WidgetSettingBase & { type: 'keyValue'; keyLabel?: string; valueLabel?: string; maxItems?: number; default?: Array<{ key: string; value: string }> })
        /**
         * A button on the widget's page: runs the handler of every open instance (sdk.settings().onAction(key, fn)).
         * whenClosed 'queue' (2026-11-01): with no instance open, the button asks for it; the first instance that
         * opens runs it once, a moment after it registers the handler (a request older than 3 days is dropped).
         */
        | (WidgetSettingBase & { type: 'action'; buttonLabel?: string; whenClosed?: 'queue' })
        /**
         * One of the widget's secrets (2026-11-01; sdk.secrets(): they belong to the widget type, every instance
         * uses them). GEM Shell's page shows whether it is saved, and enters (its own box), replaces or forgets it,
         * with no instance open. name and hosts as in secrets().prompt. It has no value in `values`: when the user
         * saves or forgets it there, the instances hear onChange(values, <this field's key>).
         */
        | (WidgetSettingBase & { type: 'secret'; name: string; hosts: string[]; kind?: 'value' | 'client-credentials'; tokenUrl?: string })
    /** entry.ts `settings`. */
    export type WidgetSettingsDecl = {
        fields: WidgetSettingField[]
        groups?: Array<{ title: string; description?: string; keys: string[] }>
    }
    /** sdk.prefs() (2026-10-31): GEM Shell's file preferences, the user's, read-only. */
    export interface WidgetShellPrefs {
        /** Show files and folders marked hidden. */
        showHidden: boolean
        /** Show protected system files (hidden AND system: desktop.ini, $Recycle.Bin…). */
        showProtected: boolean
    }

    export interface WidgetSettings {
        /** Read-only and reactive: every declared field's value (its default until the user changes it). */
        readonly values: Readonly<Record<string, WidgetSettingValue>>
        /** Resolves once the stored values are read (values holds the defaults before). */
        readonly ready: Promise<void>
        /** After the user changed one (key) or several (null: a reset). Returns: stop listening. */
        onChange(fn: (values: Readonly<Record<string, WidgetSettingValue>>, key: string | null) => void): () => void
        /**
         * The handler of an action field; the button is enabled while an instance has one. Returns: remove it.
         * It may answer { message } (2026-11-01): shown under the button on the settings page ("Looking up 24 games").
         */
        onAction(key: string, fn: () => void | { message?: string } | Promise<void | { message?: string }>): () => void
    }

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
        ready: boolean
        total: number
        free: number
        used: number
        error?: string
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
        /**
         * Another program offers the files without paths (Input Director, an Outlook attachment, a zip folder's
         * files): `paths` holds their top-level NAMES (never a path to use), the operation is "copy", a read limited
         * to folders matches none. fsPasteClipboard pastes them as usual.
         */
        virtual?: boolean
        /** With virtual: the program offering them ("Input Director"). */
        source?: string
        /** No files but a picture (a screenshot...): fsPasteClipboard saves it as a PNG file; paths holds its name. */
        image?: boolean
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
        /** Omit the target to broadcast; the shell still seals this instance as the sender. */
        send: (to: string | undefined, topic: string, payload?: any) => void
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

    // CHANGED (GEM Shell 2026-11-03): the sortable's types as the shell has them (widgets/sortable/index.ts, engine.ts);
    // they were loose stand-ins, and DropIntent was wrong (a string where the shell gives { targetId, placement }).
    export type SortableId = string | number
    export type SortableOrientation = 'vertical' | 'horizontal'
    export type CreateSortableOptions<T = any> = {
        identity: (item: T) => SortableId
        getRef?: (item: T) => HTMLElement | null
        orientation?: SortableOrientation | (() => SortableOrientation)
        dragThresholdPx?: number
        scrollContainer?: HTMLElement | (() => HTMLElement | null) | null
        containerClassOnDrag?: string
        rowSelector?: string
        rowIdAttr?: string
        autoScroll?: { marginPx?: number; maxSpeedPxPerSec?: number }
        globalCursor?: string
        /** Items that accept a drop "inside" (folders). */
        isContainer?: (item: T) => boolean
        onDragStart?: (item: T, startX: number, startY: number) => void
        onPreview?: (intent: DropIntent | null, blocked: boolean, clientX: number, clientY: number) => void
        onCommit?: (ordered: T[], intent: DropIntent) => void
        onBlocked?: (item: T, intent: DropIntent | null, clientX: number, clientY: number) => void
        /** GEM Shell's drag ghost for the dragged item (colours and text). */
        ghost?: { describe: (item: T) => { bg: string; border: string; color: string; label: string; subLabel?: string } }
        onUpdate?: () => void
    }
    export type SortableHandle = Record<string, any>
    /** useSortable's options: the sortable's, and `container` (a ref to the scroll container) instead of scrollContainer. */
    export type UseSortableOptions<T = any> = Omit<CreateSortableOptions<T>, 'onUpdate'> & { container?: Ref<HTMLElement | null> }
    export type UseSortableReturn<T = any> = {
        /** The list to draw: during a drag, a live preview of the move. */
        displayList: Readonly<Ref<T[]>>
        isDragging: Readonly<Ref<boolean>>
        draggingId: Readonly<Ref<SortableId | null>>
        /** From @pointerdown on a row: its index in displayList. */
        startDrag(displayIdx: number, event: PointerEvent | MouseEvent): void
    }
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

    /** Where a dragged item would land, relative to the item under the pointer (CHANGED GEM Shell 2026-11-03: as the shell gives it). */
    export type DropPlacement = 'before' | 'after' | 'inside'
    export type DropIntent = { targetId: SortableId; placement: DropPlacement }

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
        /** Widget type that registered this provision. */
        widgetType: string
        /** Stable widgetType + point key. */
        key: string
        /** Legacy alias used by older providers. */
        id?: string
        label?: string
        component?: any
        props?: Record<string, any>
        order?: number
        [key: string]: any
    }

    // ── Free utilities and composables ─────────────────────────────────────

    export function createLinearSortable<T>(items: T[], options: CreateSortableOptions<T>): SortableHandle
    export function useSortable<T>(source: Ref<T[]>, options: UseSortableOptions<T>): UseSortableReturn<T>
    export function useScrollHints(options: any): any

    // ── Ink kit: drawing on pictures and sketches (NEW 2026-11-05, GEM Shell H1; from Corkboard's ink.ts) ───
    // Strokes are data in their surface's units: the <svg>'s viewBox (1000 wide: ink scales with the picture; or the
    // picture's own pixels). A freehand stroke is exactly Corkboard's Stroke ({ c, w, pts, p? }): saved ink reads as it is.
    // `c` is a colour KEY your look resolves (yours: 'k' | 'b' | 'r' | 'hl', or a CSS colour). README "Drawing on pictures".
    /** [x, y, pressure 0..1]. */
    export type InkPoint = [number, number, number]
    /** Freehand: one smoothed path for a mouse; a pen's (p: 1) segments whose width follows the pressure. */
    export type InkLine = { k?: undefined; c: string; w: number; pts: InkPoint[]; p?: 1 }
    export type InkShapeKind = 'arrow' | 'rect' | 'ellipse'
    /** Dragged from a to b (Shift: a square / a circle, an arrow at 45° steps). */
    export type InkShape = { k: InkShapeKind; c: string; w: number; a: [number, number]; b: [number, number] }
    /** Placed with a click; `y` is the baseline. */
    export type InkText = { k: 'text'; c: string; size: number; x: number; y: number; text: string }
    export type InkStroke = InkLine | InkShape | InkText
    export type InkLook = {
        /** A colour key to a CSS colour (a var(...) is fine; flattenInk resolves it). */
        color: (c: string) => string
        /** Keys drawn as a highlighter (wide, see-through). Default: 'hl'. */
        highlighter?: (c: string) => boolean
    }
    export type InkMode = 'draw' | 'erase' | InkShapeKind | 'text'
    /** What one gesture did (added or erased), for undoInk. */
    export type InkUndo = { arr: InkStroke[]; add?: InkStroke; removed?: { s: InkStroke; i: number }[] }
    /** What a press turned out to be: a right-press that erased is not a click for your context menu. */
    export type InkGesture = { right: boolean; moved: boolean; removed: number }
    export type InkOptions = {
        mode: InkMode
        /** The colour key for what is drawn. */
        color: string
        look: InkLook
        /** Width at 1:1 in CSS px. Defaults: mouse 2.6, pen 3.2, highlighter 18, shapes 3. */
        width?: number
        /** Text size at 1:1 in CSS px. Default 18. */
        textSize?: number
        /** A stroke was added or strokes erased: save, and keep the undo entry. */
        done: (u: InkUndo) => void
        gesture?: (g: InkGesture) => void
        /** Text mode: the words to place there (show your own box); null or empty: nothing. */
        askText?: (at: { clientX: number; clientY: number }) => Promise<string | null>
    }
    export type FlattenOptions = {
        /** The strokes' surface width in its units (your <svg>'s viewBox width). */
        units: number
        /** A part of the picture to keep, in the picture's pixels. */
        crop?: { x: number; y: number; width: number; height: number }
        /** Default 'image/png'. */
        type?: string
    }
    /** Starts a stroke / shape / text / erase on `svg` from a pointerdown (erase also: the right button, a pen's eraser end). */
    export function beginInk(e: PointerEvent, svg: SVGSVGElement, arr: InkStroke[], o: InkOptions): void
    /** Draws `arr` into `svg` (its content replaced). */
    export function drawInk(svg: SVGSVGElement | null, arr: InkStroke[], look: InkLook): void
    /** Takes back one gesture (redraw after). */
    export function undoInk(u: InkUndo): void
    /** The picture with its strokes drawn into the pixels (PNG by default), optionally cropped. `image` must be loaded. */
    export function flattenInk(image: HTMLImageElement | ImageBitmap | HTMLCanvasElement, arr: InkStroke[], look: InkLook, opts: FlattenOptions): Promise<Blob>
    /** A freehand stroke's SVG path. */
    export function inkPathD(p: InkPoint[]): string

    // ── Ink kit: text zones (NEW GEM Shell 2026-11-05, P4b) ───
    // A part you turn on: rectangles over the picture, read with the reader you give readInkText (your
    // sdk.text().recognize). Without a reader there is no text recognition (Corkboard doesn't use it).
    // Zones are outlines only (never drawn into the pixels), in the surface's units as the strokes.
    /** A rectangle over the picture, in the surface's units. */
    export type InkZone = { x: number; y: number; width: number; height: number }
    export type InkZoneOptions = {
        /** A zone was added, or removed by a right-press on it (`i`: its index before). */
        done: (u: { zones: InkZone[]; add?: InkZone; removed?: { z: InkZone; i: number } }) => void
        /** The smallest zone kept, in CSS px at 1:1. Default 6. */
        minSize?: number
    }
    export type InkTextReader = (png: Blob) => Promise<{ text: string }>
    export type InkTextOptions = {
        /** The strokes' surface width in its units (as flattenInk). */
        units: number
        /** The parts to read; none or empty: the whole picture (or `crop`). */
        zones?: InkZone[]
        /** With no zone: the part to read, in the picture's pixels. */
        crop?: { x: number; y: number; width: number; height: number }
        /** Your reader: (png) => sdk.text!().recognize(png). */
        read: InkTextReader
        /** The picture as shown, with its strokes (default), or without them (false). */
        withInk?: boolean
    }
    export type InkTextPart = { zone: InkZone | null; text: string }
    /** Starts a zone on `svg` from a pointerdown (dragged corner to corner); a right-press on a zone removes it. */
    export function beginInkZone(e: PointerEvent, svg: SVGSVGElement, zones: InkZone[], o: InkZoneOptions): void
    /** Shows `zones` in `svg` (its content replaced), numbered in reading order. Redraw when the zoom changes. */
    export function drawInkZones(svg: SVGSVGElement | null, zones: InkZone[]): void
    /** Zones top to bottom, then left to right on a row: readInkText's order. */
    export function inkZoneOrder(zones: InkZone[]): InkZone[]
    /**
     * The text zone by zone in reading order (each trimmed); `text`: the parts joined by a blank line. Small zones
     * are enlarged and given a white margin first. Rejects with your reader's error.
     */
    export function readInkText(image: HTMLImageElement | ImageBitmap | HTMLCanvasElement, arr: InkStroke[], look: InkLook, opts: InkTextOptions): Promise<{ text: string; parts: InkTextPart[] }>

    // ── Grid layout: the hubs' own engine (NEW 2026-11-02, GEM Corkboard) ───
    // The layout maths GEM Shell uses to push widgets aside on a hub, for a widget laying its own things
    // out on a grid of cells (the Corkboard's stacks). Pure functions: rectangles in, rectangles out,
    // nothing mutated, nothing kept. The pointer gesture, the pixels and the drawing stay yours:
    //   const snap = gridSnapshot(stacks.map(s => ({ id: s.id, rect: s.rect })))
    //   const next = gridDrag(snap, columns, draggedId, { col, row })   // every item, none overlapping
    //   const grown = gridResize(snap, columns, id, 'se', 1, 1, { maxCols: 2, maxRows: 2 }) // or null
    //   const spot = gridFirstFree(snap, columns, 1, 1, pageFirstRow)
    // Rows grow downward as needed: a widget showing pages reads rows past a page as the next ones.
    // A rect that isn't whole cells (negative, a zero span, fractions) throws.
    export type GridRect = { col: number; row: number; colSpan: number; rowSpan: number }
    export type GridItem = { id: string; rect: GridRect }
    export type GridSnapshot = { byId: Map<string, GridRect>; order: string[] }
    export type GridHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
    export type GridSizeLimits = { minCols?: number; minRows?: number; maxCols?: number; maxRows?: number }
    /** Items as a snapshot (copies), ordered top → bottom, then left → right. */
    export function gridSnapshot(items: readonly GridItem[]): GridSnapshot
    /**
     * `id` dropped with its top-left on `cell`: it lands there (kept within the columns), the items it covers
     * are pushed along `intent`'s lane ('h', default: the same row, then the rows below; 'v': the same column),
     * chain reactions resolved. Every item is in the result.
     */
    export function gridDrag(snap: GridSnapshot, columns: number, id: string, cell: { col: number; row: number },
        opts?: { intent?: 'h' | 'v'; maxBottomRow?: number }): Map<string, GridRect>
    /** Resizing `id` from `handle` by whole cells, within `limits`: the new layout, others pushed aside; null when the size can't change. */
    export function gridResize(snap: GridSnapshot, columns: number, id: string, handle: GridHandle, dCols: number, dRows: number,
        limits?: GridSizeLimits, opts?: { intent?: 'h' | 'v' }): Map<string, GridRect> | null
    /** The first free spot for a new colSpan × rowSpan item, rows top → bottom from `fromRow`, cells left → right. */
    export function gridFirstFree(snap: GridSnapshot, columns: number, colSpan?: number, rowSpan?: number, fromRow?: number): GridRect

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
         * 2026-10-31: include protected system files (hidden AND system on Windows). Honoured only while the user
         * shows them (sdk.prefs().showProtected); otherwise ignored. Default false.
         */
        showProtected?: boolean
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
     * zones: the widget's choice (wins); omitted: DEFAULT_TIP_ZONES (CHANGED 2026-11-12: the top right of the
     * main view, below the toolbar; later the user's choice). durationMs: hides that long after the last show /
     * update; omitted: until hide().
     * anchorEl (NEW 2026-11-12): pass your widget's root. While one of GEM Shell's questions is open (the file
     * dialog, a message box, a permission question) the tip is hidden unless its anchor is inside that question,
     * and shows again when it closes; with no anchor it's hidden behind every question.
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
    /**
     * A pointerdown handler that calls `start` once the pointer moved past `thresholdPx` (default 4) with the
     * button held (CHANGED GEM Shell 2026-11-03: the signature as the shell has it).
     */
    export function createDragTrigger(
        start: (downEvt: PointerEvent | MouseEvent) => void,
        opts?: {
            thresholdPx?: number
            /** Primary button only (mouse). Default true. */
            primaryOnly?: boolean
            /** Where a drag may not start: selectors / classes (default: buttons, inputs, links...). */
            gate?: { denySelectors?: string[]; allowSelectors?: string[]; denyClass?: string; allowClass?: string; includeDefaultInteractive?: boolean }
            /** Swallow the click that follows a drag. Default true. */
            suppressClickAfterDrag?: boolean
        },
    ): (downEvt: PointerEvent | MouseEvent) => void

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
    //
    // THE RULE (2026-11-06): every cell is DATA or a RESOURCE.
    //   DATA      cell / persistRef / persistReactive without `dispose`: PLAIN DATA ONLY (strings, finite numbers,
    //             booleans, null, arrays and plain objects of those). GEM Shell saves it when it puts the widget away
    //             (hibernation) and hands it back when it comes again.
    //   RESOURCE  persistRef(key, init, { dispose }): anything else (a store object with methods, a function, a
    //             class instance, a Map, a handle, a watch). Never saved: rebuilt from `init` when the widget comes
    //             back, `dispose` runs when the owner is destroyed.
    // Something else in a data cell is left out when the widget is put away and the USER sees "<Widget>: part of its
    // state can't be kept, so it will start without it." GEM Shell warns in the console when such a cell is created
    // ([lifecycle] … the key, why and this fix). GEM Monitor's live.ts is an example of a resource cell.
    export type LifecycleVisibility = 'visible' | 'collapsed'
    export type PersistOptions<T> = {
        /** Called with the current value when the owner is destroyed (close a listing, free a handle…). */
        dispose?: (value: T) => void
        /**
         * Never written to disk when GEM Shell puts the widget away (hibernation): kept in memory while GEM Shell runs,
         * gone after a restart. For what is big (a widget may save 8 MB for the next start), already in the widget's
         * own documents, only true while it runs (a job's progress), or private. Default false.
         */
        transient?: boolean
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

        /** The same Ref instance across unmount/remount until the owner is destroyed. With `dispose`: a resource (never saved); without: plain data only (THE RULE above). */
        persistRef<T>(key: string, initial: T | (() => T), opts?: PersistOptions<T>): Ref<T>
        /** The same shallow-reactive object across unmount/remount. Plain data only (THE RULE above); a resource: persistRef with dispose. */
        persistReactive<T extends object>(key: string, initial: T | (() => T), opts?: { transient?: boolean }): T
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
    /**
     * A header value naming one of the widget's secrets; format holds one {} (default '{}').
     * part (2026-11-01): a client-credentials secret's client id ('clientId') or the access token GEM Shell got
     * for it ('token'); the client secret itself is never sent but to the token address.
     */
    export type SecretRef = { secret: string; format?: string; part?: 'clientId' | 'token' }

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
        /**
         * 'client-credentials' (2026-11-01): an app's client id and client secret (Twitch's, for IGDB). GEM Shell
         * asks for both, checks them at tokenUrl (OAuth client_credentials) before saving, and gets the access
         * tokens itself, a new one at expiry or after a 401. Requests name the parts (SecretRef part).
         */
        kind?: 'value' | 'client-credentials'
        /** With kind 'client-credentials': where they are traded for tokens (https, fixed when asked). */
        tokenUrl?: string
    }

    export interface WidgetSecrets {
        /** Asks the user; resolves when they save or close it (or the widget leaves the screen). */
        prompt(opts: SecretPromptOptions): Promise<{ saved: boolean }>
        /** hint: the value's last 4 characters (none for values under 8 characters). */
        status(name: string): Promise<{ set: boolean; hint?: string; hosts?: string[]; label?: string; updatedAt?: number; kind?: 'value' | 'client-credentials'; tokenHeld?: boolean }>
        delete(name: string): Promise<boolean>
    }

    // ── Image assets (sdk.mediaImageCreate) ───────────────────────────────
    export type MediaImageSource =
        | { type: 'file'; path: string }
        | { type: 'thumbnail'; path: string; size?: number }
        | { type: 'icon'; path?: string; appId?: string; size?: number }
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
        /**
         * 2026-10-31: a cache room beyond the 500 MB every widget has: MB (more than 500, at most 2048), and why
         * (shown on its page). Not asked: the cache cleans itself (unused 30 days, or beyond the room). The user
         * sees the usage and may clear it (Settings); the room itself is the widget's.
         */
        cache?: { mb: number; reason?: string }
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

    /**
     * NEW (2026-10-31): entry.ts `role`. `'explorer'`: a file explorer, like the GExplorer (`items`). It works in
     * panes only (never offered for the sidebar or the toolbar). One installed explorer is GEM Shell's DEFAULT: folder
     * tabs, the file dialog and every "open a folder" use it. Another one runs only where the user places it, a hub's
     * grid, marked as not the default. Other values are ignored (with a console warning).
     */
    export type WidgetRoleDeclaration = {
        /**
         * NEW (GEM Shell 2026-11-05): `'picture-editor'`: GEM Shell's picture editor. It runs in a window of its own
         * (placement.context 'window', sdk.window()), opened by "Edit picture" with ONE picture handed to it; never
         * offered for a hub's grid, the sidebar or the toolbar (for now). README "A picture editor".
         *
         * NEW (GEM Shell 2026-11-06): `'navigable'`: not a file explorer, but a folder of its own the user drives
         * like a pane's (a console). Placed in a hub's grid, it is a pane: click to focus it, the path bar shows
         * and moves its folder, so do its Back / Forward / Up, Favorites and Quick Links. In the sidebar or the
         * toolbar it is an ordinary widget. Expose WidgetNavigableExpose from Widget.vue. README "A navigable widget".
         */
        role?: 'explorer' | 'picture-editor' | 'navigable'
    }

    /**
     * NEW (GEM Shell 2026-11-06): what a `role: 'navigable'` widget exposes (`defineExpose`). Only where it is a pane
     * (a hub's grid).
     */
    export type WidgetNavigableExpose = {
        /**
         * The user moved your pane: the path bar, Back / Forward / Up, a favorite, Quick Links, another widget
         * opening a folder "in the focused pane". Also once when you mount, with the pane's current place. It can be
         * a page ("home:", "sys:…") or a folder you can't use: then stay where you are and say where with
         * sdk.navigate(yourFolder, { replace: true }). select: a name GEM Shell asked to reveal (ignore it if you
         * show no files). Going to the folder you're already in: nothing to do.
         */
        applyExternalCwd(locator: string, opts?: { select?: string }): void
        /** Where you are now (GEM Shell asks; null: not known yet). */
        getNavState?(): { cwd: string | null }
    }

    /** NEW (GEM Shell 2026-11-05): what GEM Shell handed your window (sdk.window().opened). */
    export type WidgetWindowOpen = {
        /**
         * 'file': a file of the user's ("Edit picture"). 'screenshot' (GEM Shell 2026-11-05): GEM Shell's private
         * copy of a screenshot from the clipboard, deleted when your window closes: there is no original to save
         * over; save it with ui().saveFile, starting in `saveIn`.
         */
        kind: 'file' | 'screenshot'
        /**
         * The file's full path. Your widget may read it and write it (that file only: no folder, no file beside it)
         * as long as GEM Shell runs: the user handed it ("Edit picture"). Save anything else through ui().saveFile.
         */
        path: string
        /** Its name. */
        name: string
        /** Writing it needs administrator rights: fsWriteBytes asks (the consent dialog, then your helper). */
        needsElevation: boolean
        /** A screenshot: the folder the user saves screenshots in (Settings ▸ Pictures); start Save as there. */
        saveIn?: string
    }

    /** NEW (GEM Shell 2026-11-05): your changes, for the window GEM Shell frames (setDraft). */
    export type WidgetWindowDraft = {
        /** Something changed (read refs: GEM Shell follows it). */
        dirty: () => boolean
        /** Saves; throw to keep the changes (the window stays open, your message shown). */
        save: () => Promise<void> | void
        /** Back to what was there. */
        discard: () => void
    }

    /** NEW (GEM Shell 2026-11-05): sdk.window(), your own window (the window context). */
    // ── Text in a picture (NEW GEM Shell 2026-11-05, P4b): sdk.text() ───
    /** A word and its box, in the picture's pixels. */
    export type TextWord = { text: string; x: number; y: number; width: number; height: number }
    export type TextLine = { text: string; words: TextWord[] }
    /** The language used (a BCP-47 tag), the text (one line per line), its lines (top to bottom). */
    export type TextRecognition = { language: string; text: string; lines: TextLine[] }
    export type TextLanguage = { tag: string; name: string }
    /** E_NO_LANGUAGE: no language with text recognition installed in Windows (or the one asked isn't). */
    export type TextErrorCode = 'E_UNAVAILABLE' | 'E_NO_LANGUAGE' | 'E_BAD_PICTURE' | 'E_TOO_LARGE' | 'E_TIMEOUT' | 'E_FAILED'
    export type WidgetText = {
        /** PNG, JPEG or BMP bytes, 32 MB at most. */
        recognize(picture: Uint8Array | ArrayBuffer | Blob, opts?: { language?: string }): Promise<TextRecognition>
        /** The languages Windows recognises text in (empty: none, or unavailable). */
        languages(): Promise<TextLanguage[]>
        /** The user's choice in Settings ▸ Pictures ('' = Automatic). */
        preferred(): string
    }

    export type WidgetWindow = {
        /** What GEM Shell handed you; null: nothing. */
        readonly opened: Readonly<WidgetWindowOpen> | null
        /** What you kept (keep) before GEM Shell closed, back when the user chose Resume; null otherwise. */
        readonly restored: unknown
        /** The window's title, after your widget's name (which you can't change). 80 characters. */
        setTitle(title: string): void
        /**
         * Your changes. Closing the window with changes asks the user Save / Discard / Stay (Save runs save); Ctrl+S
         * saves; GEM Shell's own close question counts them. null: none.
         */
        setDraft(draft: WidgetWindowDraft | null): void
        /**
         * Plain data (JSON, 2 MB at most) to come back with after a restart while changes aren't saved: the user is
         * offered "Unsaved edit of <title> — Resume / Discard", and Resume opens your window again with it as
         * `restored`. Kept encrypted. null: nothing kept. Throws when it isn't plain data or is too large.
         * While something is kept, closing GEM Shell with your changes offers "Keep for later" (GEM Shell
         * 2026-11-05): GEM Shell closes, your changes neither saved nor discarded, and they come back as above.
         */
        keep(data: unknown): void
        /** Closes the window (with changes not saved: the user's question first). true: closed. */
        close(): Promise<boolean>
    }

    /** What sdk.navigate / openPath / openUrl / setView resolve to. */
    export type WidgetViewResult = { ok: true } | { ok: false; reason: 'no-gesture' | 'not-on-screen' | 'bad-argument' }

    // ── The props every widget gets (WidgetHost) ──────────────────────────
    //   const props = defineProps<WidgetProps>()
    // Going somewhere, opening a file or a web link, saving a view setting: the SDK (sdk.navigate / openPath /
    // openUrl / setView / reveal), not a prop. CHANGED (2026-10-31, GEM Shell E5): a widget draws inside its own box;
    // menus and panels outside it go through sdk.ui().menu / sdk.ui().openPopover / message boxes (README "Drawing
    // outside your box"). inject<Ref<HTMLElement | null>>('widgetOverlay') (the widget's own layer, where a <Teleport>
    // of its lands) draws under every shell dialog and, from E5c, is clipped to the widget's box plus 24 px.
    export type WidgetPlacement = {
        /** 'window' (GEM Shell 2026-11-05): a window of your own (sdk.window()). */
        context: 'grid' | 'sidebar' | 'toolbar' | 'embedded' | 'dialog' | 'window'
        /**
         * The layout chosen in the Layout menu (`config.view.layout`), else the first layout the widget declares
         * for this place, else 'list' (2026-10-31).
         */
        layout: string
        /**
         * CHANGED (2026-10-31): the widget's own box, for laying itself out. Information only: the user sizes
         * widgets by dragging in Edit Layout, never through a widget.
         * - `width` / `height`: CSS px, measured in every place (the pane's header row left out), updated as it is
         *   resized; missing until first measured.
         * - `cols` / `rows`: grid cells, in a hub's grid and folder panes only.
         */
        size: { width?: number; height?: number; cols?: number; rows?: number }
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
         * is opened). Get it back with jobs().whenPending(kind, fn). A normal app close still ends
         * the journal unless restartOnLaunch is enabled.
         */
        recovery?: 'none' | 'ask' | 'resume'
        /** The version of what checkpoint() saves (default 0). */
        stateVersion?: number
        /** Updated since the interruption: 'restart' (default: params only) or 'migrate' (old state, stale: true). */
        onNewVersion?: 'restart' | 'migrate'
        /** Recoverable only when the user keeps widgets' state after a restart (the job needs it). */
        requiresRestore?: boolean
        /** Keep this recoverable job across a normal app close and reclaim it automatically at the next launch. Requires `recovery: 'resume'` and a card. */
        restartOnLaunch?: boolean
        /** Closing GEM Shell ends it without a question: false only for now. */
        blocksClose?: false
    }
    export interface WidgetJob {
        readonly id: string
        readonly kind: string
        /** Updates the card title and, while relevant, a reason to confirm before quitting GEM Shell. */
        update(patch: { title?: string; closeWarning?: string | null }): void
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
         * user's own click or key press, on screen); null when refused. One chain per instance (a new
         * top-level one closes the last); clicking the anchor again closes it, so do a click elsewhere, Esc, and the
         * anchor leaving the page.
         * LEVELS (GEM Shell 2026-10-31): an anchor inside one of your open popovers (a row of a menu you
         * opened) opens a child level next to it: the parent stays, a new child of the same parent replaces
         * the previous one, closing a level closes those under it, a click in any level counts as inside the
         * chain, Esc closes the deepest; 8 levels at most. `parent` overrides it. Drag and drop between your
         * levels works (they are all your elements). `style` restyles the frame (not for 'center', which
         * keeps GEM Shell's frame and title). The component gets props.close() besides opts.props, and
         * inject('widgetSdk') gives it this instance's SDK; a click in it counts as the widget's own
         * gesture. This is the way out of a clipping place: a widget's own <Teleport> lands in its overlay layer, clipped
         * to its box plus 24 px from GEM Shell E5c (README "Drawing outside your box").
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
            /**
             * GEM Shell 2026-10-31: its level. Absent: automatic (an anchor inside one of your open popovers
             * opens a child of it, else a top-level one). One of your popover handles: a child of that one.
             * null: top level (your other popovers close).
             */
            parent?: WidgetPopoverHandle | null
            /** GEM Shell 2026-10-31: the frame's look. Ignored for 'center'. */
            style?: WidgetPopoverStyle
            /**
             * GEM Shell 2026-10-31: a hover submenu (child levels only). Opening it needs no fresh click while the
             * pointer is over your open popover; it closes by itself once the pointer has been off it, its children
             * and its parent for a moment. Opening it again on the same row leaves it open (no toggle).
             */
            hover?: boolean
            /**
             * GEM Shell 2026-11-06: a console lives in it (README "A console", the toolbar). A click in it counts as a
             * click in your box however long it stays open (a plain popover's counts only for a minute after a click in
             * your box), and Escape while the focus is in it is yours (it closes on Escape elsewhere, a click outside,
             * the anchor again, close()). Only with the Terminal capability, top-level and beside its anchor (not
             * 'center', not a child level); otherwise ignored, with a console warning.
             */
            console?: boolean
        }): WidgetPopoverHandle | null
        /**
         * GEM Shell 2026-11-05: your component in a WINDOW GEM Shell frames: its header ("<your widget's name> —
         * title", which you can't change) is the drag handle and has Fold (into the operations tray: a card with Show
         * and Close) and Close. It stays until closed, your instance removed, or Escape in it; several at once (8 per
         * instance); kept on screen, under GEM Shell's dialogs. Opening one: the same rule as openPopover (right
         * after the user's own click or key in your widget, while on screen). The component gets props.close() and
         * inject('widgetSdk'); a click in it counts as your widget's own gesture. null: refused. Older GEM Shell:
         * absent (check `ui.openWindow`).
         *
         *   ui.openWindow?.({ component: Details, props: { path }, title: name, width: 420, height: 520 })
         */
        openWindow?(opts: WidgetWindowOptions): WidgetWindowHandle | null
        /**
         * GEM Shell 2026-11-05: FILE EXPLORERS ONLY (entry.ts role: 'explorer'). GEM Shell's Properties entries (your
         * file menu, other widgets' file menus) hand the items to your instance, with the user's click as your own
         * gesture: show them (openWindow), reading them as yourself. The latest call wins; returns the unsubscribe
         * (call it on unmount). Not an explorer: a warning, nothing happens. Older GEM Shell: absent.
         */
        onPropertiesRequest?(fn: (req: WidgetPropertiesRequest) => void): () => void
        /**
         * GEM Shell 2026-11-05: shows the Properties of <paths> (1..1000) through GEM Shell, as its menu entries do:
         * a file explorer draws them (yours, when your widget is one; else the default explorer open). Right after
         * the user's own click or key in your widget, while on screen. opts.count: how many in all (paths a sample);
         * opts.folder: <paths> is the folder shown. false: refused, or no explorer open (GEM Shell says so). Older
         * GEM Shell: absent.
         */
        showProperties?(paths: string[], opts?: { count?: number; folder?: boolean }): Promise<boolean>
        /**
         * GEM Shell 2026-10-31: a drag ghost GEM Shell draws at the pointer, for a drag that leaves your box
         * (your own elements can't be drawn outside it: README "Drawing outside your box"). Only while the user
         * holds the button they pressed in your widget (null otherwise): call it from your drag's start. It
         * follows the pointer by itself and closes by itself on release; close() it earlier when your drag
         * ends otherwise. Text only (label, subLabel: 80 characters; icon: 4). Hidden while GEM Shell is
         * asking the user something. Older GEM Shell: absent (check `ui.dragGhost`).
         *
         *   const ghost = ui.dragGhost?.({ label: fav.label, icon: '★', offset: { x: 12, y: 8 } })
         *   // ...on drop or cancel: ghost?.close()
         */
        dragGhost?(opts: {
            label: string
            subLabel?: string
            /** A short text icon: 4 characters at most. */
            icon?: string
            /** From the pointer to the ghost's top-left corner, px, each -120..120. Default 12, 12. */
            offset?: { x?: number; y?: number }
            /** Its look (sanitised): colours, border colour, radius 0..16. */
            style?: { background?: string; color?: string; borderColor?: string; radius?: number }
        }): {
            update(patch: { label?: string; subLabel?: string; icon?: string }): void
            close(): void
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
        /**
         * NEW (GEM Shell 2026-11-07): your unsaved work, as a placed widget (a hub, the sidebar, the toolbar). Closing
         * GEM Shell then asks: Save and close (your save()), Close without saving (discard()), Cancel; and Keep for
         * later when keepable() says you bring the changes back yourself (your lifecycle data). No save bar, no
         * question when the user only leaves the page. One per instance (a new call replaces it); null when nothing
         * is pending. A widget window uses props.setDraft (its footer) instead.
         *   ui.setDraft({ dirty: () => changed.value, save: () => saveAll(), discard: () => revert() })
         */
        setDraft?(draft: WidgetPlacedDraft | null): boolean
        /**
         * NEW (GEM Shell 2026-11-07): the user's naming pattern for a taken name (Settings ▸ New items: "a (2).txt",
         * "a (Copy 2).txt", a timestamp…), as GEM Shell applies it. No capability.
         */
        namingPattern?(): Promise<NamingToken[]>
        /**
         * NEW (GEM Shell 2026-11-07): a hub's grid as the user has it: columns (12), rows in the visible height
         * (Settings ▸ Layout), the gap between cells in px. No capability.
         */
        hubGrid?(): { columns: number; rows: number; gap: number }
    }

    /** NEW (GEM Shell 2026-11-07): a naming pattern's parts (timestamp: a .NET date format, e.g. "yyyy-MM-dd HH'h'mm"). */
    export type NamingToken =
        | { type: 'basename' }
        | { type: 'literal'; value: string }
        | { type: 'increment'; start?: number }
        | { type: 'timestamp'; format: string }

    /** NEW (GEM Shell 2026-11-07): what sdk.ui().setDraft takes. */
    export type WidgetPlacedDraft = {
        /** Something not saved (read refs: GEM Shell follows it). */
        dirty: () => boolean
        /** Saves; throw to keep the changes (your message is shown). */
        save: () => Promise<void> | void
        /** Drops the changes. */
        discard: () => void
        /** You bring these changes back after a restart (your lifecycle data): closing offers "Keep for later". */
        keepable?: () => boolean
        /** After your widget's name in the question (60 characters). */
        label?: string | (() => string)
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

    /**
     * sdk.mediaInfo(): what the OS knows of a media file (Windows: the shell's properties; Linux: none yet); absent /
     * null: not known. GEM Shell 2026-11-05: the stream and photo details too.
     */
    export type MediaInfoItem = {
        path: string
        durationMs?: number | null
        title?: string | null
        artist?: string | null
        album?: string | null
        year?: number | null
        /** A video's frame, else (2026-11-05) an image's size. */
        width?: number | null
        height?: number | null
        /** Bits per second. */
        videoBitrate?: number | null
        /** Frames per second. */
        frameRate?: number | null
        /** The video's four-character code ('H264', 'HEVC'...). */
        videoFourCc?: string | null
        audioBitrate?: number | null
        audioChannels?: number | null
        sampleRateHz?: number | null
        bitDepth?: number | null
        cameraMake?: string | null
        cameraModel?: string | null
        /** Unix ms (UTC). */
        dateTaken?: number | null
        exposureSeconds?: number | null
        fNumber?: number | null
        iso?: number | null
        focalLengthMm?: number | null
    }

    /** GEM Shell 2026-11-05: one item of sdk.fsProperties(). Dates: Unix ms (UTC); null: not known. */
    export type FsPropertiesItem = {
        path: string
        /** false: not there. */
        exists?: boolean | null
        isDir?: boolean
        isLink?: boolean
        linkTarget?: string | null
        /** A file's size; null: a folder or not known. */
        size?: number | null
        sizeOnDisk?: number | null
        /** A folder's size and contents come with GEM Shell's indexer (later): always null for now. */
        folderSize?: number | null
        created?: number | null
        modified?: number | null
        accessed?: number | null
        attributes?: {
            readOnly: boolean; hidden: boolean; system: boolean; archive: boolean; compressed: boolean; encrypted: boolean
            sparse: boolean; offline: boolean; temporary: boolean; notIndexed: boolean; reparse: boolean
        } | null
        /** One path asked: its owner and access list (Windows), or its mode ("rwxr-xr-x", elsewhere). */
        owner?: string | null
        access?: { who: string; allow: boolean; rights: string; inherited: boolean }[] | null
        mode?: string | null
        /** A protected item: only its size and dates (from the administrator helper). */
        limited?: boolean
        /** This item could not be read. */
        error?: string
        message?: string
    }

    /** GEM Shell 2026-11-05: sdk.fsHash(). */
    export type FsHashRun = {
        readonly result: Promise<{ sha256?: string; md5?: string; stopped: boolean }>
        cancel(): void
    }

    /** GEM Shell 2026-11-05 (H4c): the five levels, the same words on every OS; 'special': none of them (kept as is). */
    export type PermissionLevel = 'none' | 'read' | 'readRun' | 'readWrite' | 'full' | 'special'

    /** A user, a group or a special one (Everyone, SYSTEM, "everyone else"); id: the OS's (a SID; Unix: "owner" / "group" / "others"). */
    export type FsPrincipal = {
        id: string
        name: string
        kind: 'user' | 'group' | 'special'
        source: 'local' | 'domain' | 'builtin' | 'resolved' | 'posix'
    }

    export type FsPermissionEntry = {
        who: FsPrincipal
        level: PermissionLevel
        deny: boolean
        inherited: boolean
        /** Folders: 'this' | 'all' | 'thisAndSubfolders' | 'thisAndFiles' | 'subfoldersAndFiles' | 'subfolders' | 'files' | 'custom'. */
        appliesTo: string
        /** The OS's raw values (Windows): send them back as they are for a Special row (or 'custom') left alone. */
        rights: number
        inheritanceFlags: number
        propagationFlags: number
    }

    /** GEM Shell 2026-11-05 (H4c): sdk.fsPermissions(). */
    export type FsPermissions = {
        owner: FsPrincipal | null
        /** Unix's owning group (null on Windows). */
        group: FsPrincipal | null
        entries: FsPermissionEntry[]
        /** Windows: inheritance from the folder is on. */
        inherits: boolean
        /** What the user running GEM Shell may do with it (null: not known). */
        yourAccess: PermissionLevel | null
        /** Unix: "0755". */
        unixMode: string | null
        features: { supported: boolean; addPrincipals: boolean; deny: boolean; inheritance: boolean; changeOwner: boolean; search: boolean; unixBits: boolean }
        /**
         * H4c-4: the ids the user may make the owner WITHOUT administrator rights (Windows: the user and the groups
         * that may own things); null / absent: anyone (an elevated GEM Shell) or not known. Others: "needs admin".
         */
        ownerChoices?: string[] | null
        /**
         * H4c-6: one line per person or group, from THEIR OWN rows that apply to the item (not their groups'): level,
         * their real access; fromFolder, what its folder gives them (null: nothing); setHere, the item has rows of its
         * own for them; lowered, one of those denies part of what they'd have. Older GEM Shell: absent.
         */
        people?: { who: FsPrincipal; level: PermissionLevel; fromFolder: PermissionLevel | null; setHere: boolean; lowered: boolean }[]
    }

    /** GEM Shell 2026-11-05 (H4c): sdk.fsSetPermissions()'s change. entries: the EXPLICIT rows as wanted (they replace them). */
    export type FsPermissionsChange = {
        entries?: { principalId: string; level: PermissionLevel; deny?: boolean; appliesTo?: string; rights?: number; inheritanceFlags?: number; propagationFlags?: number }[]
        ownerId?: string
        inherit?: boolean
        unixMode?: number
        /**
         * H4c-6: per person, their real access as wanted (null: their own rows go, the folder's apply again): GEM
         * Shell writes the rows it takes (Windows: an allowed row, a denied row for what the folder gives beyond it,
         * every right denied for 'none'). Applied after `entries`.
         */
        people?: { principalId: string; level: Exclude<PermissionLevel, 'special'> | null }[]
    }

    /** GEM Shell 2026-11-05: sdk.ui().openWindow's options. */
    export type WidgetWindowOptions = {
        component: Component
        props?: Record<string, unknown>
        /** After your widget's name in GEM Shell's header (80 characters). */
        title?: string
        /** px; kept within 240..960 × 140..900 and GEM Shell's window. Default 380 × 440. */
        width?: number
        height?: number
        /** Opens beside this element of yours (else centred, cascading). */
        anchor?: HTMLElement
        /** A corner grip to resize it. Default false. */
        resizable?: boolean
        /** Keeps its place (and size, when resizable) across restarts under this key of yours. Default: not kept. */
        remember?: string
        onClose?: () => void
        /**
         * GEM Shell 2026-11-05: GEM Shell's Discard / Save footer, always shown, for the whole window. Your component
         * then gets props.setDraft(draft | null): register ONE draft for everything it edits (every tab):
         *   props.setDraft({ dirty: () => changed.value, save: async () => { ... }, discard: () => { ... } })
         * dirty is read reactively (read refs in it). save throws to keep the changes (its message shown in the
         * footer). Closing the window with changes asks Save / Discard / Stay; Ctrl+S saves it; GEM Shell's own close
         * question counts it. Call props.setDraft(null) on unmount.
         */
        saveFooter?: boolean
    }

    /** GEM Shell 2026-11-05: what a window's content gives props.setDraft (openWindow saveFooter). */
    export type WidgetWindowDraft = {
        dirty: () => boolean
        save: () => Promise<void> | void
        discard: () => void
    }

    /** GEM Shell 2026-11-05: what sdk.ui().openWindow returns. */
    export type WidgetWindowHandle = {
        close(): void
        /** Replaces the content's props: pass them all (close is kept). */
        update(props: Record<string, unknown>): void
        setTitle(title: string): void
        /** Into the operations tray (a card: Show / Close). */
        fold(): void
        /** Back from the tray, on top. */
        show(): void
        readonly folded: boolean
        readonly open: boolean
    }

    /** GEM Shell 2026-11-05: what GEM Shell asks an explorer to show (sdk.ui().onPropertiesRequest). */
    export type WidgetPropertiesRequest = {
        /** The items (a sample when many: count says how many there are), or the folder shown (folder: true). */
        paths: string[]
        count: number
        folder: boolean
        /** Asked from another widget's file menu: its name. */
        from?: string
    }

    /** GEM Shell 2026-10-31: what sdk.ui().openPopover returns (also its `parent` option). */
    export type WidgetPopoverHandle = {
        close(): void
        /** Replaces the content's props: pass them all (close is kept). */
        update(props: Record<string, unknown>): void
    }

    /**
     * GEM Shell 2026-10-31: a popover frame's look (sdk.ui().openPopover `style`). Colours are CSS colours or theme
     * variables ('var(--surface-1)'); numbers in px, clamped; anything else is dropped. Size, position, stacking and
     * the close rules stay GEM Shell's.
     */
    export type WidgetPopoverStyle = {
        background?: string
        color?: string
        borderColor?: string
        /** 0..3 */
        borderWidth?: number
        /** 0..16 */
        radius?: number
        shadow?: 'none' | 'small' | 'normal' | 'large'
        /** 0..16 */
        padding?: number
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

    /**
     * NEW (2026-11-02): one of the manifest's mouse gestures: entry.ts
     * `gestures: [{ id: 'scribble', name: 'Scribble on a note', description: '...', input: 'Alt+Drag' }]`.
     * What your widget does with the mouse, listed beside your commands in Keyboard shortcuts and the cheat
     * sheet (F1, "Works here"), where the user can star it. Never bound to a key and never run by GEM Shell:
     * your widget reads the pointer itself, as before.
     *   id: letters, digits, . _ - ; not one of your commands' ids. name and description: required (plain text).
     *   input: up to three of Ctrl / Alt / Shift, then one of Click, DoubleClick, RightClick, MiddleClick, Drag,
     *   RightDrag, Wheel, LongPress ('Alt+Drag', 'RightDrag', 'Shift+Click'); shown as "Alt + drag".
     * At most 40. Pointer events keep their real modifiers (only keyboard events hide shortcut combos).
     */
    export type WidgetGestureDecl = {
        id: string
        name: string
        description: string
        input: string
    }

    /**
     * NEW (GEM Shell 2026-11-06): entry.ts `keyboard: { claims: ['Ctrl+C', 'Ctrl+V', 'Esc'] }`, with the Terminal
     * capability only: the keys your console can't do without. While its captureKeys element has the user's focus, a
     * claimed key that is also bound to an action GEM Shell keeps (leave the pane, focus the next / previous pane, the
     * cheat sheet) goes to you, and the user is told once that the shell's action won't work there. Claims that would
     * leave no key to leave or move the focus are cut ("Focus the next pane" keeps its keys). At most 32.
     * NEW (GEM Shell 2026-11-07), with the Develop capability (an editor: GEM Forge): a claimed key that is one of
     * GEM Shell's commands (Ctrl+S, Alt+Up) may be a default key of your command marked whileTyping; it runs your
     * command only while the user types in your widget, and stays the shell's everywhere else. GEM Shell 2026-11-08:
     * it may also be the default of a command NOT marked whileTyping (F2 on your list's item, Delete): it runs while the
     * user's focus is in your widget and they aren't typing there. Never claimable: Esc,
     * F1, F6, Shift+F6, Ctrl+W, Ctrl+T, Ctrl+Shift+T, Ctrl+(Shift+)Tab, Ctrl+(Shift+)PageUp / PageDown, Alt+F4.
     */
    export type WidgetKeyboardDecl = { claims: string[] }

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
//   <gex-scroll-area axis="x" fill>                        (NEW 2026-11-03: sideways)
//     <button v-for="t in items" class="pill">…</button>
//   </gex-scroll-area>
//     Its children side by side (a flex row: --gsa-gap between them, --gsa-align for their
//     vertical alignment, center), a thin strip left and right while they don't fit (a
//     chevron when that way can scroll, a click scrolls a page; a line at the end); the
//     mouse wheel scrolls it sideways. `fill` takes the room left in a flex row. The height
//     props (max-height, min-rows, min-height) are the vertical area's only.
//     edges="overlay" (either axis): the edges float over the content, mid-height (sideways)
//     or mid-width, instead of taking room beside it (faded at the end, not hidden). Restyle
//     them through --gsa-overlay-w / -h / -radius / -bg / -bg-hover, or draw them yourself:
//       <template #before="{ disabled, scroll }"><button :disabled="disabled" @click="scroll">‹</button></template>
//       <template #after="{ disabled, scroll }"><button :disabled="disabled" @click="scroll">›</button></template>
//     (shown while it overflows; before = left / top, after = right / bottom; `active`: a drag is held over it).
//     Dragging (a button held, or an HTML drag such as files) and resting on an edge for a moment scrolls that
//     way, faster the longer it stays (2026-11-04); your own #before / #after edges get it too.
//     :page-ratio (0.8) and :min-page-step (px, 80): how far a click scrolls.
//     The ref's el is the scrolling element: center an item with el.scrollTo({ left, behavior }).
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
            // NEW (2026-11-03): sideways, floating edges, the page step
            axis?: 'y' | 'x'; edges?: 'strip' | 'overlay'; pageRatio?: number; minPageStep?: number
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
