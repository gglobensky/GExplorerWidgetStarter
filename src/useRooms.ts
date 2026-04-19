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
    sessionSecret: string   // base64 — EDHT key material
    isOwner:       boolean
    isAdmin:       boolean
    isClosed:      boolean
    closedReason:  string
    accessPointId: string
    blobSha256:    string

    /**
     * Hub's userId and public key stored at join time.
     * Used once to initiate SP2P rendezvous with the hub via connectToPeer —
     * after that eDHT presence discovery handles reconnection normally.
     * Cleared from the vault config after the first successful connection.
     * Undefined for rooms where isOwner === true (no bootstrap needed).
     */
    bootstrapEndpoint?:  string
    bootstrapPublicKey?: string
}

export interface Room extends RoomConfig {
    displayName: string
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
    sdk:      WidgetSdk // TODO: I believe we shouldnt have to provide the sdk for sdk methods anymore. It was redundant
    identity: Ref<Identity | null>
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
    const { sdk, identity, onRoomSelected, searchInputRef, newRoomInputRef } = options
    const {
        p2pDeriveKey,
        p2pCreateInvite,
        p2pAcceptInvite,
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
        if (!activeRoom.value || !p2pCreateInvite) return
        inviteError.value  = ''
        inviteToken.value  = ''
        inviteCopied.value = false
        try {
            const result      = await p2pCreateInvite(activeRoom.value.roomId, {
                sessionSecret:   activeRoom.value.sessionSecret,
                validityMinutes: inviteExpiry.value,
            })
            inviteToken.value = result.token
        } catch (err: any) {
            inviteError.value = err.message
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
        if (!token || !p2pAcceptInvite || !identity.value) return
        joinError.value   = ''
        joinLoading.value = true
        try {
            const decoded       = await p2pAcceptInvite(token)
            const canonicalName = decoded.sessionId

            const config: Omit<RoomConfig, 'accessPointId' | 'blobSha256'> = {
                roomId:        decoded.sessionId,
                canonicalName,
                createdAt:     Date.now(),
                sessionSecret: decoded.sessionSecret,
                isOwner:       false,
                isAdmin:       false,
                isClosed:      false,
                closedReason:  '',
                // Kept only until the first successful direct connection.
                // ensureChannel clears these from vault once bootstrap completes.
                bootstrapEndpoint:  decoded.userId,
                bootstrapPublicKey: decoded.publicKey,
            }

            const { accessPointId, blobSha256 } = await _saveRoomConfig(config)
            const room: Room = { ...config, accessPointId, blobSha256, displayName: canonicalName }
            rooms.value.push(room)
            selectRoom(room)
            showJoinModal.value = false
            joinToken.value     = ''
        } catch (err: any) {
            joinError.value = err.message
        } finally {
            joinLoading.value = false
        }
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

    // ── Bootstrap cleanup ─────────────────────────────────────────────────
    //
    // Called by ChatRoom.vue after the first direct TCP connection succeeds.
    // Removes the one-time bootstrap fields from both the in-memory room
    // object and the vault config so they don't persist as a stale address.

    async function clearBootstrap(roomId: string) {
        const room = rooms.value.find(r => r.roomId === roomId)
        if (!room || (!room.bootstrapEndpoint && !room.bootstrapPublicKey)) return

        // Clear in memory first so the UI never reads stale values
        room.bootstrapEndpoint  = undefined
        room.bootstrapPublicKey = undefined

        // Persist the updated config back to vault
        try {
            const { accessPointId, blobSha256 } = await _saveRoomConfig({
                roomId:        room.roomId,
                canonicalName: room.canonicalName,
                createdAt:     room.createdAt,
                sessionSecret: room.sessionSecret,
                isOwner:       room.isOwner,
                isAdmin:       room.isAdmin,
                isClosed:      room.isClosed,
                closedReason:  room.closedReason,
                // bootstrapEndpoint and bootstrapPublicKey intentionally omitted
            }, room.accessPointId)
            room.accessPointId = accessPointId
            room.blobSha256    = blobSha256
            console.log(`[GExchange] Bootstrap fields cleared — room ${roomId.slice(0, 8)}…`)
        } catch (err) {
            console.warn(`[GExchange] Failed to clear bootstrap fields for room ${roomId.slice(0, 8)}…:`, err)
        }
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

        clearBootstrap,
        load,
        dispose,
    }
}