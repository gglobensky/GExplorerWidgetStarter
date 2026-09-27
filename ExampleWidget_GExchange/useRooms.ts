// src/widgets/gexchange/useRooms.ts
//
// Manages room persistence and actions for GExchange.
//
// RESPONSIBILITIES:
//   - Vault open/close (owns the vault lifecycle)
//   - Load/save room configs from the encrypted vault
//   - Create rooms (generates secret, derives roomId, saves config)
//   - Join rooms via invite token
//   - Generate/copy invite tokens
//   - Local display name overrides (localStorage)
//   - Room rename
//
// NOTE ON VAULT SCOPE:
//   The vault token is intentionally exposed so that the file-sharing layer
//   (VFS handler, seeder, drag-drop) can use it directly without routing
//   through this composable. The vault is the foundation for the whole
//   room filesystem — not just room config storage.
//
// DEPENDENCIES:
//   sdk      — needs P2P + SecureStorage caps
//   identity — needed for doCreateRoom (derives roomId from publicKey)

import { ref, computed, nextTick, watch, type Ref } from 'vue'
import { startRename } from 'gexplorer/widgets'
import type { WidgetSdk } from 'gexplorer/widgets'
import type { Identity } from './useIdentity'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomConfig {
    roomId:        string
    canonicalName: string
    createdAt:     number    
    /**
     * Joined rooms have a sessionSecret and can start a channel.
     * Pending rooms have accepted an opaque invite but are waiting for room
     * admission/bootstrap.
     */
    admissionStatus?: RoomAdmissionStatus

    /**
     * Empty while admissionStatus === 'pending'.
     * Filled once the encrypted bootstrap response provides the room secret.
     */
    sessionSecret: string

    pendingAdmission?: PendingRoomAdmission
    isOwner:       boolean
    isAdmin:       boolean
    isClosed:      boolean
    closedReason:  string
    accessPointId: string
    blobSha256:    string

    /**
     * Stable room-owner identity hint, captured from the invite.
     *
     * This is not a network endpoint and does not expose peer transport details.
     * It is intentionally persisted so joined clients can re-kick SP2P
     * rendezvous after app restart, room reload, sleep/wake, or stale EDHT
     * state.
     *
     * Undefined for rooms where isOwner === true.
     */
    bootstrapUserId?:    string
    bootstrapPublicKey?: string
}

export type RoomAdmissionStatus = 'joined' | 'pending'

export interface PendingRoomAdmission {
    format: 'gex-room-invite-v3'

    acceptedAt: number
    rawToken: string

    inviteId: string
    admissionRendezvousKey: string
    issuedAt: number
    expiresAt: number
    pendingTtlMs: number

    issuerUserId: string
    issuerPublicKey: string
    roomName?: string
    claimId: string
    invitePrivateJwk: JsonWebKey
}

export interface Room extends RoomConfig {
    displayName: string
}

export type CreateRoomInviteOptions = {
    validityMinutes?: number
}

export type CreateRoomInviteResult = {
    token: string
    inviteId?: string
    expiresAt?: number
    pendingTtlMs?: number
    admissionRendezvousKey?: string
    inviteIssuedEventId?: string
}

// ── Local name storage ────────────────────────────────────────────────────────

const LOCAL_NAMES_KEY = 'gexchange:roomDisplayNames'

function loadLocalNames(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(LOCAL_NAMES_KEY) ?? '{}') } catch { return {} }
}

function saveLocalNames(names: Record<string, string>) {
    localStorage.setItem(LOCAL_NAMES_KEY, JSON.stringify(names))
}

function applyDisplayNames(configs: RoomConfig[]): Room[] {
    const localNames = loadLocalNames()
    return configs.map(r => ({ ...r, displayName: localNames[r.roomId] ?? r.canonicalName }))
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseRoomsOptions {
    /** Public app-provided SDK dependency. Keep injected; do not import app internals. */
    sdk:      WidgetSdk
    identity: Ref<Identity | null>
    /**
     * Creates a room invite through the channel/runtime layer.
     *
     * useRooms intentionally does not know whether this is an old direct token,
     * an opaque v3 admission token, EDHT-backed, SP2P-backed, etc.
     */
    createInvite?: (
        room: Room,
        options?: CreateRoomInviteOptions,
    ) => Promise<CreateRoomInviteResult>
    /** Called when a room is selected — ChatRoom.vue wires ensureChannel here. */
    onRoomSelected?: (room: Room) => void
    /** Refs for UI focus management */
    searchInputRef?:  Ref<HTMLInputElement | null>
    newRoomInputRef?: Ref<HTMLInputElement | null>
}

// ── Return type ───────────────────────────────────────────────────────────────

export interface UseRoomsReturn {
    // ── State ──────────────────────────────────────────────────────────────
    rooms:          Ref<Room[]>
    activeRoom:     Ref<Room | null>
    loading:        Ref<boolean>

    /** Exposed so file-sharing layer can use the vault directly. */
    vaultToken:     Ref<string | null>

    // ── Room picker ────────────────────────────────────────────────────────
    roomFilter:       Ref<string>
    pickerOpen:       Ref<boolean>
    filteredRooms:    ReturnType<typeof computed<Room[]>>
    canCreate:        ReturnType<typeof computed<boolean>>
    togglePicker:     () => void
    closePicker:      () => void
    onSearchEnter:    () => void

    // ── Room actions ───────────────────────────────────────────────────────
    selectRoom:        (room: Room) => void
    createRoom:        () => Promise<void>
    createRoomFromEmpty: () => Promise<void>
    newRoomName:       Ref<string>
    showNewRoomInput:  Ref<boolean>
    createError:       Ref<string>
    openInItems:       () => void
    focusCreateField:  () => void
    renameRoom:        (room: Room) => void
    /**
    * Create a room with an explicit name — no user input required.
    * Used by ChatRoom.vue when creating private rooms from the participant list.
    * Returns the created Room so the caller can generate invites immediately.
    */
    createNamedRoom: (name: string) => Promise<Room>

    // ── Invite ─────────────────────────────────────────────────────────────
    inviteToken:    Ref<string>
    inviteExpiry:   Ref<number>
    inviteCopied:   Ref<boolean>
    inviteError:    Ref<string>
    showInvitePanel: Ref<boolean>
    generateInvite: () => Promise<void>
    copyInvite:     () => Promise<void>

    // ── Join modal ─────────────────────────────────────────────────────────
    showJoinModal:  Ref<boolean>
    joinToken:      Ref<string>
    joinError:      Ref<string>
    joinLoading:    Ref<boolean>
    joinRoom:       () => Promise<void>
    closeJoinModal: () => void

    // ── Lifecycle ───────────────────────────────────────────────────────────
    /** Call from onMounted — opens vault and loads rooms. */
    load:    () => Promise<void>
    /** Call from onUnmounted — closes vault. */
    dispose: () => Promise<void>
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useRooms(options: UseRoomsOptions): UseRoomsReturn {
    const {
        sdk,
        identity,
        onRoomSelected,
        createInvite,
        searchInputRef,
        newRoomInputRef,
    } = options
    const {
        p2pDeriveKey,
        p2pSubmitAdmissionClaim,
        p2pWatchBootstrap,
        vaultOpen,
        vaultClose,
        vaultSealContentAs,
        vaultUnsealText,
        vaultList,
    } = sdk

    // ── State ─────────────────────────────────────────────────────────────

    const rooms          = ref<Room[]>([])
    const activeRoom     = ref<Room | null>(null)
    const loading        = ref(false)
    const vaultToken     = ref<string | null>(null)

    const roomFilter      = ref('')
    const pickerOpen      = ref(false)
    const showNewRoomInput = ref(false)
    const newRoomName     = ref('')
    const createError     = ref('')

    const inviteToken    = ref('')
    const inviteExpiry   = ref(15)
    const inviteCopied   = ref(false)
    const inviteError    = ref('')
    const showInvitePanel = ref(false)

    const showJoinModal  = ref(false)
    const joinToken      = ref('')
    const joinError      = ref('')
    const joinLoading    = ref(false)

    // ── Computed ──────────────────────────────────────────────────────────

    const filteredRooms = computed(() => {
        const q = roomFilter.value.trim().toLowerCase()
        if (!q) return rooms.value
        return rooms.value.filter(r =>
            r.displayName.toLowerCase().includes(q) ||
            r.canonicalName.toLowerCase().includes(q) ||
            r.roomId.toLowerCase().includes(q)
        )
    })

    const canCreate = computed(() => {
        const q = roomFilter.value.trim()
        return q.length > 0 && !rooms.value.some(r => r.canonicalName === q)
    })

    // ── Vault ─────────────────────────────────────────────────────────────

    async function _openVault() {
        if (!p2pDeriveKey || !vaultOpen) return
        try {
            const keyBytes  = await p2pDeriveKey('vault-master-v1')
            const result    = await vaultOpen({ scopeId: 'rooms', masterKey: keyBytes })
            vaultToken.value = result.vaultToken
        } catch (err) {
            console.warn('[GExchange] Failed to open vault:', err)
        }
    }

    async function _closeVault() {
        if (!vaultToken.value) return
        await vaultClose?.(vaultToken.value)
        vaultToken.value = null
    }

    // ── Room persistence ──────────────────────────────────────────────────

    async function _loadRooms() {
        if (!vaultToken.value || !vaultList || !vaultUnsealText) return
        loading.value = true
        try {
            const entries = await vaultList(vaultToken.value, 'gexchange://config/')
            const configs: RoomConfig[] = []

            for (const entry of entries) {
                if (!entry.vpath.endsWith('.room.json')) continue
                try {
                    const text   = await vaultUnsealText(vaultToken.value!, entry.blobSha256)
                    const config = JSON.parse(text) as RoomConfig

                    config.admissionStatus ??= config.sessionSecret ? 'joined' : 'pending'

                    config.accessPointId = entry.accessPointId
                    config.blobSha256    = entry.blobSha256
                    configs.push(config)
                } catch (err) {
                    console.warn('[GExchange] Failed to read room config:', entry.vpath, err)
                }
            }

            // After building configs array, before assigning to rooms.value
            const seen = new Set<string>()
            const deduped = configs.filter(c => {
                if (seen.has(c.roomId)) return false
                seen.add(c.roomId)
                return true
            })
            
            rooms.value = applyDisplayNames(deduped)

            // Resume bootstrap pollers for any rooms still pending
            for (const room of rooms.value) {
                if (room.admissionStatus === 'pending')
                    _startBootstrapPoller(room)
            }

        } catch (err) {
            console.warn('[GExchange] Failed to load rooms:', err)
        } finally {
            loading.value = false
        }
    }

    async function _saveRoomConfig(
        config: Omit<RoomConfig, 'accessPointId' | 'blobSha256'>,
        existingAccessPointId?: string   // pass when updating, omit when creating
    ): Promise<{ accessPointId: string; blobSha256: string }> {
        if (!vaultToken.value || !vaultSealContentAs)
            throw new Error('Vault not open')

        // Delete the old blob before writing the new one.
        // Without this, vaultList returns both and the room appears twice.
        if (existingAccessPointId && sdk.vaultDelete) {
            try {
                await sdk.vaultDelete(vaultToken.value, existingAccessPointId)
            } catch (err) {
                console.warn('[GExchange] Failed to delete old vault entry before update:', err)
                // Non-fatal — the read-time dedup still covers us, but the ghost entry remains
            }
        }

        const json    = JSON.stringify(config, null, 2)
        const content = btoa(unescape(encodeURIComponent(json)))
        const vpath   = `gexchange://config/${config.roomId}.room.json`
        const ap      = await vaultSealContentAs(vaultToken.value, content, vpath)
        return { accessPointId: ap.accessPointId, blobSha256: ap.blobSha256 }
    }

    // ── Room actions ──────────────────────────────────────────────────────

    function selectRoom(room: Room) {
        activeRoom.value = room

        if (room.admissionStatus === 'pending') {
            return
        }

        onRoomSelected?.(room)
    }

    async function createRoom() {
        const name = roomFilter.value.trim()
        if (!name) return
        await _doCreateRoom(name)
        closePicker()
    }

    async function createRoomFromEmpty() {
        const name = newRoomName.value.trim()
        if (!name) return
        createError.value = ''
        try {
            await _doCreateRoom(name)
            showNewRoomInput.value = false
            newRoomName.value      = ''
        } catch (err: any) {
            createError.value = err.message
        }
    }

    async function _doCreateRoom(name: string) {
        if (!identity.value) throw new Error('Identity not loaded')

        const createdAt     = Date.now()
        const sessionSecret = _generateSecret()
        const roomId        = await _deriveRoomId(identity.value.publicKey, name, createdAt)

        const config: Omit<RoomConfig, 'accessPointId' | 'blobSha256'> = {
            roomId,
            canonicalName: name,
            createdAt,
            sessionSecret,
            admissionStatus: 'joined',
            isOwner:       true,
            isAdmin:       true,
            isClosed:      false,
            closedReason:  '',
        }

        const { accessPointId, blobSha256 } = await _saveRoomConfig(config)
        const room: Room = { ...config, accessPointId, blobSha256, displayName: name }
        rooms.value.push(room)
        selectRoom(room)
    }

    function openInItems() {
        if (!activeRoom.value) return
        console.log('[GExchange] Open in items:', `gexchange://${activeRoom.value.roomId}/`)
    }

    function focusCreateField() {
        nextTick(() => {
            if (searchInputRef?.value) {
                searchInputRef.value.focus()
                roomFilter.value = 'new-room'
                nextTick(() => searchInputRef.value?.select())
            }
        })
    }

    function renameRoom(room: Room) {
        startRename(`gex-room-${room.roomId}`, {
            onCommit: (newName) => {
                if (!newName.trim()) return
                const localNames        = loadLocalNames()
                localNames[room.roomId] = newName.trim()
                saveLocalNames(localNames)
                const r = rooms.value.find(x => x.roomId === room.roomId)
                if (r) r.displayName = newName.trim()
                if (activeRoom.value?.roomId === room.roomId)
                    activeRoom.value = { ...activeRoom.value, displayName: newName.trim() }
            },
            onCancel:  () => {},
            selectAll: true,
            validate:  (v) => v.trim() ? null : 'Name cannot be empty',
        })
    }

   async function createNamedRoom(name: string): Promise<Room> {
       await _doCreateRoom(name)
       // _doCreateRoom pushes the new room and selects it —
       // the last entry in rooms.value is the one just created.
       const room = rooms.value[rooms.value.length - 1]
       if (!room) throw new Error('createNamedRoom: room not found after creation')
       return room
   }

    // ── Invite ────────────────────────────────────────────────────────────

    async function generateInvite() {
        if (!activeRoom.value) return

        inviteError.value  = ''
        inviteToken.value  = ''
        inviteCopied.value = false

        if (!createInvite) {
            inviteError.value = 'Room invite creation is unavailable.'
            return
        }

        try {
            const result = await createInvite(activeRoom.value, {
                validityMinutes: inviteExpiry.value,
            })

            inviteToken.value = result.token
        } catch (err: any) {
            inviteError.value = err?.message ?? String(err)
        }
    }

    async function copyInvite() {
        if (!inviteToken.value) return
        try {
            await navigator.clipboard.writeText(inviteToken.value)
            inviteCopied.value = true
            setTimeout(() => { inviteCopied.value = false }, 2000)
        } catch { }
    }

    // ── Join ──────────────────────────────────────────────────────────────

    async function joinRoom() {
        const token = joinToken.value.trim()

        if (!token || !identity.value)
            return

       if (!p2pSubmitAdmissionClaim) {
            joinError.value = 'Room admission is unavailable.'
            return
        }
 
        joinError.value   = ''
        joinLoading.value = true
 
        try {
            const admission = await p2pSubmitAdmissionClaim({
                rawToken:         token,
                joinerUserId:     identity.value.userId,
                joinerPublicKey:  identity.value.publicKey,
                joinerDisplayName: (identity.value as any).displayName,
            })
 
            const existing = rooms.value.find(r => r.roomId === admission.roomId)

            if (existing) {
                if (existing.admissionStatus === 'pending') {
                    selectRoom(existing)
                    showJoinModal.value = false
                    joinToken.value = ''
                    return
                }
 
                throw new Error('You have already joined this room.')
            }
 
            const canonicalName =
                admission.roomName?.trim() ||
                `pending-${admission.roomId}`
 
            const config: Omit<RoomConfig, 'accessPointId' | 'blobSha256'> = {
                roomId:          admission.roomId,
                canonicalName,
                createdAt:       Date.now(),
                sessionSecret:   '',
                admissionStatus: 'pending',
                isOwner:         false,
                isAdmin:         false,
                isClosed:        false,
                closedReason:    '',
 
                bootstrapUserId:   admission.issuerUserId,
                bootstrapPublicKey: admission.issuerPublicKey,
 
                pendingAdmission: {
                    format:     'gex-room-invite-v3',
                    acceptedAt: Date.now(),
                    rawToken:   token,
 
                    inviteId:               admission.inviteId,
                    admissionRendezvousKey: admission.admissionRendezvousKey,
                    issuedAt:               admission.issuedAt,
                    expiresAt:              admission.expiresAt,
                    pendingTtlMs:           admission.pendingTtlMs,
                    issuerUserId:           admission.issuerUserId,
                    issuerPublicKey:        admission.issuerPublicKey,
                    roomName:               admission.roomName,
                    claimId:                admission.claimId,
                    invitePrivateJwk:       admission.invitePrivateJwk,
                },
            }

            const { accessPointId, blobSha256 } = await _saveRoomConfig(config)

            const room: Room = {
                ...config,
                accessPointId,
                blobSha256,
                displayName: canonicalName,
            }

            rooms.value.push(room)
            _startBootstrapPoller(room)
            selectRoom(room)

            showJoinModal.value = false
            joinToken.value = ''
        } catch (err: any) {
            joinError.value = err?.message ?? String(err)
        } finally {
            joinLoading.value = false
        }
    }

    function _startBootstrapPoller(room: Room): void {
        const pending = room.pendingAdmission
        if (!pending?.claimId || !pending?.invitePrivateJwk) return
        if (!p2pWatchBootstrap) return

        const pendingUntil = pending.expiresAt + pending.pendingTtlMs

        p2pWatchBootstrap({
            claimId:                pending.claimId,
            admissionRendezvousKey: pending.admissionRendezvousKey,
            pendingUntil,
            invitePrivateJwk:       pending.invitePrivateJwk,
            onResult: (result) => {
                if (result.status === 'arrived') {
                    _onBootstrapArrived(room.roomId, result.sessionSecret)
                        .catch(err => console.warn('[GExchange] _onBootstrapArrived failed:', err))
                } else {
                    console.warn('[GExchange] Bootstrap poll ended:', result.status, {
                        roomId: room.roomId,
                    })
                }
            },
        })
    }

    async function _onBootstrapArrived(roomId: string, sessionSecret: Uint8Array): Promise<void> {
        const room = rooms.value.find(r => r.roomId === roomId)
        if (!room) return

        const secretBase64 = btoa(String.fromCharCode(...sessionSecret))

        const updated: Omit<RoomConfig, 'accessPointId' | 'blobSha256'> = {
            ...room,
            sessionSecret:   secretBase64,
            admissionStatus: 'joined',
            pendingAdmission: undefined,
        }

        const { accessPointId, blobSha256 } = await _saveRoomConfig(updated, room.accessPointId)

        const updatedRoom: Room = {
            ...updated,
            accessPointId,
            blobSha256,
            displayName: room.displayName,
        }

        const idx = rooms.value.findIndex(r => r.roomId === roomId)
        if (idx !== -1) rooms.value[idx] = updatedRoom
        if (activeRoom.value?.roomId === roomId) activeRoom.value = updatedRoom

        console.info('[GExchange] Bootstrap arrived — room joined', { roomId })

        if (activeRoom.value?.roomId === roomId)
            onRoomSelected?.(updatedRoom)
    }

    function closeJoinModal() {
        showJoinModal.value = false
        joinToken.value     = ''
        joinError.value     = ''
    }

    // ── Picker ────────────────────────────────────────────────────────────

    function togglePicker() {
        pickerOpen.value = !pickerOpen.value
        if (pickerOpen.value) {
            roomFilter.value = ''
            nextTick(() => searchInputRef?.value?.focus())
        }
    }

    function closePicker() {
        pickerOpen.value = false
        roomFilter.value = ''
    }

    function onSearchEnter() {
        if (filteredRooms.value.length === 1) {
            selectRoom(filteredRooms.value[0])
            closePicker()
        } else if (canCreate.value) {
            createRoom()
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    async function load() {
        await _openVault()
        await _loadRooms()
    }

    async function dispose() {
        await _closeVault()
    }

    // ── Watch ─────────────────────────────────────────────────────────────

    watch(showNewRoomInput, (v) => {
        if (v) nextTick(() => newRoomInputRef?.value?.focus())
    })

    // ── Helpers ───────────────────────────────────────────────────────────

    function _generateSecret(): string {
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        return btoa(String.fromCharCode(...bytes))
    }

    async function _deriveRoomId(publicKey: string, name: string, createdAt: number): Promise<string> {
        const input   = `${publicKey}|${name}|${createdAt}`
        const encoded = new TextEncoder().encode(input)
        const hash    = await crypto.subtle.digest('SHA-256', encoded)
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 8)
    }

    return {
        rooms,
        activeRoom,
        loading,
        vaultToken,

        roomFilter,
        pickerOpen,
        filteredRooms,
        canCreate,
        togglePicker,
        closePicker,
        onSearchEnter,

        selectRoom,
        createRoom,
        createRoomFromEmpty,
        newRoomName,
        showNewRoomInput,
        createError,
        openInItems,
        focusCreateField,
        renameRoom,
        createNamedRoom,

        inviteToken,
        inviteExpiry,
        inviteCopied,
        inviteError,
        showInvitePanel,
        generateInvite,
        copyInvite,

        showJoinModal,
        joinToken,
        joinError,
        joinLoading,
        joinRoom,
        closeJoinModal,

        load,
        dispose,
    }
}