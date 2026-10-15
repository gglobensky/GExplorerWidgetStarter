// gexchange/vfsHandler.ts
//
// VFS handler for the gexchange:// scheme.
// Implements listDir, getMetadata, copy, delete, open, extract, mkdir
// using the platform SecureStorage SDK — no backend IPC specific to GExchange.
//
// Loaded lazily by the platform when the VFS scheme is first accessed.
// The platform injects a scoped WidgetSdk when constructing this handler.
//
// VPATH CONVENTIONS:
//   Room directory : gexchange://{roomId}
//   File in room   : gexchange://{roomId}/{fileName}
//   Root           : gexchange:// or gexchange://
//
// VAULT LAYOUT:
//   Room configs   : vpath = "gexchange://config/{roomId}.room.json"
//   Room files     : vpath = "gexchange://{roomId}/{fileName}"
//
//   Separating configs under a "config/" prefix means listDir on a roomId
//   never accidentally surfaces config blobs as user files.

import type { WidgetSdk, AccessPointEntry } from 'gexplorer/widgets'

// ── Vault token — shared across all VFS ops ───────────────────────────────────
//
// Opened lazily on first use. Valid for the lifetime of the VFS provider
// registration (i.e. the app session). The widget's ChatRoom.vue opens its
// own vault token independently — they both point to the same vault on disk
// because they use the same widgetType + scopeId + derived key.

let _vaultToken: string | null = null
let _vaultOpenPromise: Promise<string> | null = null

// ── Extract temp file cache ────────────────────────────────────────────────────
//
// Tracks temp files produced by extract() so that:
//   1. Dragging the same vault file multiple times in quick succession reuses
//      the already-decrypted temp rather than unsealing again (dedup by sha256).
//   2. The file is only deleted once all active drags using it have finished
//      (refCount) and the TTL has expired.
//
// TTL_MS: how long to keep a temp file alive after the last drag releases it.
// 60 seconds is enough for the OS to complete the file copy after drop,
// and long enough to cover quick repeated drags of the same file.

const EXTRACT_TTL_MS = 60_000

interface ExtractCacheEntry {
    physicalPath: string
    refCount:     number      // active drags using this temp file
    expiresAt:    number      // ms timestamp — only delete when refCount=0 AND expired
    sweepTimer:   ReturnType<typeof setTimeout> | null
}

// keyed by blobSha256
const _extractCache = new Map<string, ExtractCacheEntry>()

function _extractCacheGet(sha256: string): ExtractCacheEntry | null {
    const entry = _extractCache.get(sha256)
    if (!entry) return null
    // If the temp file was already deleted (e.g. OS moved it), evict the entry
    return entry
}

function _extractCacheRelease(sha256: string, sdk: WidgetSdk) {
    const entry = _extractCache.get(sha256)
    if (!entry) return

    entry.refCount = Math.max(0, entry.refCount - 1)
    entry.expiresAt = Date.now() + EXTRACT_TTL_MS

    // Clear any existing sweep timer and reschedule
    if (entry.sweepTimer !== null) clearTimeout(entry.sweepTimer)

    entry.sweepTimer = setTimeout(async () => {
        const current = _extractCache.get(sha256)
        if (!current) return
        if (current.refCount > 0) return   // still in use — leave it
        if (Date.now() < current.expiresAt) return  // TTL extended by another release
        _extractCache.delete(sha256)
        await sdk.vaultUnsealCleanup!(current.physicalPath)
    }, EXTRACT_TTL_MS)
}

async function getVaultToken(sdk: WidgetSdk): Promise<string> {
    if (_vaultToken) return _vaultToken
    if (_vaultOpenPromise) return _vaultOpenPromise

    _vaultOpenPromise = (async () => {
        const keyBytes = await sdk.p2pDeriveKey!('vault-master-v1')
        const result   = await sdk.vaultOpen!({ scopeId: 'rooms', masterKey: keyBytes })
        _vaultToken    = result.vaultToken
        console.log('[vfsHandler] Vault open — vaultId:', result.vaultId)
        return _vaultToken
    })()

    return _vaultOpenPromise
}

// ── Handler factory ───────────────────────────────────────────────────────────

export default function createVfsHandler(sdk: WidgetSdk) {
    return {

        // ── listDir ──────────────────────────────────────────────────────────
        //
        // path = '' | '/' → list rooms (one entry per roomId directory)
        // path = '{roomId}' → list files in that room

        async listDir({ path }: { path: string }) {
            const token = await getVaultToken(sdk)
            const clean = path.replace(/^\/+|\/+$/g, '')

            // Root — list rooms derived from config blobs
            if (!clean) {
                const configs = await sdk.vaultList!(token, 'gexchange://config/')
                const rooms   = []

                for (const entry of configs) {
                    if (!entry.vpath.endsWith('.room.json')) continue
                    try {
                        const text   = await sdk.vaultUnsealText!(token, entry.blobSha256)
                        const config = JSON.parse(text)
                        rooms.push({
                            Name:       config.displayName ?? config.canonicalName,
                            FullPath:   `gexchange://${config.roomId}`,
                            Kind:       'dir',
                            ModifiedAt: config.createdAt ?? 0,
                            Meta: {
                                roomId:        config.roomId,
                                canonicalName: config.canonicalName,
                                isOwner:       config.isOwner,
                                isAdmin:       config.isAdmin,
                                isClosed:      config.isClosed,
                                closedReason:  config.closedReason,
                                sessionSecret: config.sessionSecret,
                            },
                        })
                    } catch (err) {
                        console.warn('[vfsHandler] Failed to read room config:', entry.vpath, err)
                    }
                }

                return { ok: true, entries: rooms }
            }

            // Room listing — files under gexchange://{roomId}/
            const roomId = clean.split('/')[0]
            const prefix = `gexchange://${roomId}/`
            const files  = await sdk.vaultList!(token, prefix)

            return {
                ok: true,
                entries: files.map(entry => ({
                    Name:       entry.displayName,
                    FullPath:   entry.vpath,
                    Kind:       'file',
                    Size:       entry.sizeOriginal,
                    ModifiedAt: entry.createdAt,
                    Meta: {
                        accessPointId: entry.accessPointId,
                        blobSha256:    entry.blobSha256,
                        blobState:     'local',
                    },
                })),
            }
        },

        // ── getMetadata ──────────────────────────────────────────────────────

        async getMetadata({ path }: { path: string }) {
            const clean = path.replace(/^\/+|\/+$/g, '')
            if (!clean) return { ok: true, exists: true, isDir: true,  rpath: null }
            const parts = clean.split('/')
            if (parts.length === 1)
                       return { ok: true, exists: true, isDir: true,  rpath: null }
            return         { ok: true, exists: true, isDir: false, rpath: null }
        },

        // ── copy (ingest a file into the vault) ──────────────────────────────
        //
        // src  = physical path on disk (from drag-drop)
        // dest = '{roomId}/{fileName}' — the VFS subpath

        async copy({ src, dest }: { src: string; dest: string }) {
            const token   = await getVaultToken(sdk)
            const parts   = dest.replace(/^\/+/, '').split('/')
            const roomId  = parts[0]
            const fileName = parts.slice(1).join('/') ||
                             src.split(/[\\/]/).pop() || 'file'
            const vpath   = `gexchange://${roomId}/${fileName}`

            const ap = await sdk.vaultSealAs!(token, src, vpath)

            return {
                ok:            true,
                accessPointId: ap.accessPointId,
                blobSha256:    ap.blobSha256,
                vpath:         ap.vpath,
            }
        },

        // ── delete ───────────────────────────────────────────────────────────

        async delete({ path }: { path: string }) {
            const token  = await getVaultToken(sdk)
            const clean  = path.replace(/^\/+/, '')
            const vpath  = `gexchange://${clean}`

            // Find the access point matching this vpath
            const parts  = clean.split('/')
            const roomId = parts[0]
            const prefix = `gexchange://${roomId}/`
            const files  = await sdk.vaultList!(token, prefix)
            const entry  = files.find(e => e.vpath === vpath)

            if (!entry) return { ok: false, error: 'File not found' }

            await sdk.vaultDelete!(token, entry.accessPointId)
            return { ok: true }
        },

        // ── open ─────────────────────────────────────────────────────────────
        //
        // Unseals to a temp file, registers a stream token, returns a gex:// URL.

        async open({ path }: { path: string }) {
            const token  = await getVaultToken(sdk)
            const clean  = path.replace(/^\/+/, '')
            const vpath  = `gexchange://${clean}`
            const parts  = clean.split('/')
            const roomId = parts[0]
            const prefix = `gexchange://${roomId}/`
            const files  = await sdk.vaultList!(token, prefix)
            const entry  = files.find(e => e.vpath === vpath)

            if (!entry) return { ok: false, error: 'File not found' }

            const { physicalPath } = await sdk.vaultUnseal!(
                token, entry.blobSha256, entry.displayName)

            // mintStreamHttp registers the physical path as a gex:// stream token
            // so the webview can open it without needing file:// access
            const { url } = await sdk.mintStreamHttp!(physicalPath)

            return { ok: true, blobPath: url }
        },

        // ── extract ──────────────────────────────────────────────────────────
        //
        // Used by the DnD native drag pipeline.
        // Unseals to a temp path and returns the physicalPath.
        // The caller (native.ts) is responsible for calling extractCleanup.

        async extract({ path, destDir }: { path: string; destDir?: string }) {
            const token  = await getVaultToken(sdk)
            const clean  = path.replace(/^\/+/, '')
            const vpath  = `gexchange://${clean}`
            const parts  = clean.split('/')
            const roomId = parts[0]
            const prefix = `gexchange://${roomId}/`
            const files  = await sdk.vaultList!(token, prefix)
            const entry  = files.find(e => e.vpath === vpath)

            if (!entry) return { ok: false, error: 'File not found' }

            // ── Temp file cache ───────────────────────────────────────
            // Reuse an already-decrypted temp if this blob was recently
            // extracted. Avoids re-decrypting on repeated drags of the
            // same file and keeps disk churn to a minimum.
            const cached = _extractCacheGet(entry.blobSha256)
            if (cached) {
                cached.refCount++
                cached.expiresAt = Date.now() + EXTRACT_TTL_MS
                if (cached.sweepTimer !== null) {
                    clearTimeout(cached.sweepTimer)
                    cached.sweepTimer = null
                }
                console.debug(`[vfsHandler] extract cache hit sha256=${entry.blobSha256.slice(0, 8)}…`)
                return { ok: true, physicalPath: cached.physicalPath }
            }

            const { physicalPath } = await sdk.vaultUnseal!(
                token, entry.blobSha256, entry.displayName)

            _extractCache.set(entry.blobSha256, {
                physicalPath,
                refCount:   1,
                expiresAt:  Date.now() + EXTRACT_TTL_MS,
                sweepTimer: null,
            })

            return { ok: true, physicalPath }
        },

        // ── extractCleanup ────────────────────────────────────────────
        //
        // Decrements the cache refCount for this temp file and schedules
        // deletion after TTL_MS once all active drags have released it.
        // Dragging the same vault file several times quickly only ever
        // produces one temp file on disk.

        extractCleanup(tempPath: string) {
            for (const [sha256, entry] of _extractCache) {
                if (entry.physicalPath === tempPath) {
                    _extractCacheRelease(sha256, sdk)
                    return
                }
            }
            // Not in cache (pre-cache drag) — delete immediately
            sdk.vaultUnsealCleanup!(tempPath).catch(() => {})
        },

        // ── mkdir (room creation signal) ──────────────────────────────────────
        //
        // Called when the VFS layer creates a new directory path.
        // Room creation is widget-driven from ChatRoom.vue — that component
        // generates the room config and seals it via vaultSealContentAs.
        // This handler is a no-op that keeps the VFS layer happy.

        async mkdir({ path }: { path: string }) {
            return { ok: true, path }
        },
    }
}