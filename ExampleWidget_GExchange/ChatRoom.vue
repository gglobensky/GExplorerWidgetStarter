<template>
    <div class="gex-root" :class="{ 'no-room': !activeRoom }">

        <!-- ── Header ─────────────────────────────────────────────────── -->
        <header class="gex-header">
            <div class="header-left">
                <div class="room-picker" ref="pickerRef" :class="{ open: pickerOpen }">
                    <button class="room-trigger" @click="togglePicker">
                        <span class="room-hash">#</span>
                        <span class="room-name">{{ activeRoom?.displayName ?? 'Select a room' }}</span>
                        <span
                            class="room-id-badge"
                            v-if="activeRoom"
                            v-gex-tooltip="{
                                content: activeRoom.canonicalName,
                                detail: 'Original room name'
                            }"
                        >{{ activeRoom.roomId }}</span>
                        <svg class="chevron" viewBox="0 0 10 6" fill="none">
                            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>

                    <Transition name="dropdown">
                        <div class="room-dropdown" v-if="pickerOpen" @keydown.esc="closePicker">
                            <div class="dropdown-top">
                                <div class="search-row">
                                    <svg class="search-icon" viewBox="0 0 16 16" fill="none">
                                        <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.4"/>
                                        <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                                    </svg>
                                    <input
                                        ref="searchInputRef"
                                        v-model="roomFilter"
                                        class="room-search"
                                        placeholder="Find or create a room…"
                                        @keydown.enter="onSearchEnter"
                                    />
                                </div>
                                <div class="dropdown-actions">
                                    <button class="action-btn join-btn" @click="showJoinModal = true; closePicker()">
                                        <svg viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                                        Join room
                                    </button>
                                    <button
                                        class="action-btn create-btn"
                                        @click="canCreate ? createRoom() : focusCreateField()"
                                    >
                                        <svg viewBox="0 0 16 16" fill="none">
                                            <path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                                        </svg>
                                        {{ canCreate ? `Create "${roomFilter}"` : 'New room' }}
                                    </button>
                                </div>
                                <div class="dropdown-sep"/>
                            </div>

                            <div class="room-list-scroll">
                                <div v-if="filteredRooms.length === 0" class="room-empty">
                                    {{ roomFilter ? 'No rooms match' : 'No rooms yet' }}
                                </div>
                                <div
                                    v-for="room in filteredRooms"
                                    :key="room.roomId"
                                    class="room-row"
                                    :class="{ active: activeRoom?.roomId === room.roomId }"
                                    @click="selectRoom(room); closePicker()"
                                >
                                    <span class="row-hash">#</span>
                                    <span
                                        class="row-name"
                                        :data-rename-id="`gex-room-${room.roomId}`"
                                        :data-rename-value="room.displayName"
                                    >{{ room.displayName }}</span>
                                    <span
                                        class="row-id"
                                        v-gex-tooltip="{ content: room.canonicalName, detail: 'Original name' }"
                                    >{{ room.roomId }}</span>
                                    <span v-if="room.isClosed" class="row-closed">archived</span>
                                    <button
                                        class="row-rename"
                                        v-gex-tooltip="'Rename display name'"
                                        @click.stop="renameRoom(room)"
                                    >
                                        <svg viewBox="0 0 14 14" fill="none">
                                            <path d="M2 10.5L9.5 3l1.5 1.5-7.5 7.5H2v-1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </div>

            <div class="header-right">
                <button
                    class="icon-btn"
                    v-if="activeRoom?.isOwner || activeRoom?.isAdmin"
                    v-gex-tooltip="'Invite to room'"
                    @click="showInvitePanel = !showInvitePanel"
                >
                    <svg viewBox="0 0 16 16" fill="none">
                        <path d="M11 8a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.4"/>
                        <path d="M5 14c0-2.2 1.8-4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                        <path d="M1 8h4M3 6l2 2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="icon-btn" v-gex-tooltip="'Open in Items widget'" @click="openInItems">
                    <svg viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
                        <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
                        <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
                        <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
                    </svg>
                </button>
                <button class="icon-btn" @click="toggleSidebar" v-gex-tooltip="'Toggle participants'">
                    <svg viewBox="0 0 16 16" fill="none">
                        <circle cx="6" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/>
                        <path d="M1 13c0-2.8 2.2-4 5-4s5 1.2 5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                        <circle cx="12" cy="5" r="2" stroke="currentColor" stroke-width="1.3"/>
                        <path d="M14 13c0-1.8-1-3-2.5-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        </header>

        <!-- ── Invite panel ───────────────────────────────────────────── -->
        <Transition name="slide-down">
            <div v-if="showInvitePanel && activeRoom" class="invite-panel">
                <div class="invite-panel-header">
                    <span>Invite to <strong>#{{ activeRoom.displayName }}</strong></span>
                    <button class="invite-close" @click="showInvitePanel = false">✕</button>
                </div>
                <div class="invite-body">
                    <div class="invite-expiry-row">
                        <span class="invite-label">Valid for</span>
                        <div class="expiry-options">
                            <button
                                v-for="mins in [5, 15, 60]"
                                :key="mins"
                                class="expiry-btn"
                                :class="{ active: inviteExpiry === mins }"
                                @click="inviteExpiry = mins; inviteToken = ''"
                            >{{ mins }}m</button>
                        </div>
                    </div>
                    <button class="pill-btn primary full-width" @click="generateInvite">
                        Generate invite code
                    </button>
                    <div v-if="inviteToken" class="token-display">
                        <div class="token-text">{{ inviteToken }}</div>
                        <button class="pill-btn" @click="copyInvite">
                            {{ inviteCopied ? '✓ Copied' : 'Copy' }}
                        </button>
                    </div>
                    <p v-if="inviteError" class="invite-error">{{ inviteError }}</p>
                    <p class="invite-note">⚠ Anyone with this code can join until it expires.</p>
                </div>
            </div>
        </Transition>

        <!-- ── No room state ──────────────────────────────────────────── -->
        <div v-if="!activeRoom" class="empty-state">
            <div class="empty-glyph">#</div>
            <p class="empty-title">No room selected</p>
            <p class="empty-sub">Create a room or join one with an invite code</p>
            <div class="empty-actions">
                <button class="pill-btn primary" @click="showNewRoomInput = true">New room</button>
                <button class="pill-btn" @click="showJoinModal = true">Join with invite</button>
            </div>
            <div v-if="showNewRoomInput" class="inline-create">
                <input
                    ref="newRoomInputRef"
                    v-model="newRoomName"
                    class="new-room-input"
                    placeholder="room-name"
                    @keydown.enter="createRoomFromEmpty"
                    @keydown.esc="showNewRoomInput = false"
                />
                <button class="pill-btn primary" @click="createRoomFromEmpty" :disabled="!newRoomName.trim()">
                    Create
                </button>
            </div>
            <p v-if="createError" class="create-error">{{ createError }}</p>
        </div>

        <!-- ── Chat body ──────────────────────────────────────────────── -->
        <div v-else class="chat-body">
            <main class="chat-feed" ref="feedRef">
                <div class="message system-msg">
                    <span class="msg-text">Welcome to <strong>#{{ activeRoom.canonicalName }}</strong></span>
                </div>

                <template v-for="msg in messages" :key="msg.id">
                    <div v-if="shouldShowDateSep(msg, messages)" class="date-sep">
                        <span>{{ formatDate(msg.sentAt) }}</span>
                    </div>
                    <div
                        class="message"
                        :class="{
                            'mine':   msg.senderId === identity?.userId,
                            'theirs': msg.senderId !== identity?.userId,
                        }"
                    >
                        <div
                            v-if="shouldShowSender(msg, messages)"
                            class="msg-sender"
                            :class="{ 'sender-you': msg.senderId === identity?.userId }"
                        >
                            {{ msg.senderId === identity?.userId ? 'You' : msg.senderName }}
                        </div>
                        <div class="msg-bubble">
                            <span class="msg-text" style="white-space: pre-wrap">{{ msg.text }}</span>
                            <span class="msg-time">{{ formatTime(msg.sentAt) }}</span>
                        </div>
                    </div>
                </template>

                <div v-if="chatLoading" class="message system-msg">
                    <span class="msg-text muted">Loading history…</span>
                </div>
            </main>

            <aside class="chat-sidebar" v-if="showSidebar">
                <div class="sidebar-section">
                    <h4>Participants</h4>
                    <ul class="user-list">
                        <li class="user-row self">
                            <span class="dot online"/>
                            {{ identity?.username ?? 'You' }}
                            <span class="you-tag">you</span>
                        </li>
                        <li v-for="peerId in activePeerIds" :key="peerId" class="user-row">
                            <span class="dot online"/>
                            {{ peerNames[peerId] ?? peerId }}
                        </li>
                    </ul>
                </div>
                <div class="sidebar-section">
                    <h4>Room</h4>
                    <div class="room-meta">
                        <div class="meta-row">
                            <span class="meta-label">ID</span>
                            <span class="meta-value mono">{{ activeRoom.roomId }}</span>
                        </div>
                        <div class="meta-row">
                            <span class="meta-label">Created</span>
                            <span class="meta-value">{{ formatDate(activeRoom.createdAt) }}</span>
                        </div>
                        <div class="meta-row" v-if="activeRoom.isOwner">
                            <span class="meta-label">Role</span>
                            <span class="meta-value">Owner</span>
                        </div>
                    </div>
                </div>
            </aside>
        </div>

        <!-- ── Footer ─────────────────────────────────────────────────── -->
        <footer v-if="activeRoom" class="chat-footer">
            <div class="plugin-tabs">
                <button @click="showBoard = false" :class="{ active: !showBoard }" class="tab-btn">💬 Chat</button>
                <button @click="showBoard = true"  :class="{ active: showBoard  }" class="tab-btn">🛠️ Board</button>
            </div>
            <div class="plugin-canvas">
                <template v-if="!showBoard">
                    <div class="input-area">
                        <textarea
                            ref="inputRef"
                            v-model="draftText"
                            class="chat-input"
                            :placeholder="activeRoom.isClosed
                                ? 'This room is archived — read only'
                                : 'Type a message… (Shift+Enter to send)'"
                            :disabled="activeRoom.isClosed || sending"
                            rows="1"
                            @keydown="onInputKeydown"
                            @input="autoResizeInput"
                        />
                        <div class="input-actions">
                            <label
                                class="send-mode-toggle"
                                v-gex-tooltip="shiftToSend
                                    ? 'Shift+Enter sends · Enter = new line'
                                    : 'Enter sends · Shift+Enter = new line'"
                            >
                                <input type="checkbox" v-model="shiftToSend" />
                                <span class="toggle-label">⇧ send</span>
                            </label>
                            <button
                                class="send-btn"
                                :disabled="!draftText.trim() || activeRoom.isClosed || sending"
                                @click="sendMessage"
                                v-gex-tooltip="shiftToSend ? 'Send (Shift+Enter)' : 'Send (Enter)'"
                            >
                                <svg viewBox="0 0 16 16" fill="none">
                                    <path d="M2 8l12-6-5 6 5 6-12-6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div v-if="activeRoom.isClosed" class="closed-banner">
                        This room is archived — read only
                    </div>
                </template>
                <component v-else-if="showBoard && loadedComponent" :is="loadedComponent"/>
                <div v-else-if="showBoard" class="loading-state">Loading board…</div>
            </div>
        </footer>

        <!-- ── Join modal ─────────────────────────────────────────────── -->
        <Transition name="fade">
            <div v-if="showJoinModal" class="modal-backdrop" @click.self="closeJoinModal">
                <div class="modal">
                    <div class="modal-header">
                        <span>Join a room</span>
                        <button class="invite-close" @click="closeJoinModal">✕</button>
                    </div>
                    <div class="modal-body">
                        <p class="modal-sub">Paste an invite code below</p>
                        <textarea
                            v-model="joinToken"
                            class="token-input"
                            placeholder="eyJ2IjoxLCJtb2RlIjoib3Bl…"
                            rows="3"
                            @keydown.escape="closeJoinModal"
                        />
                        <p v-if="joinError" class="invite-error">{{ joinError }}</p>
                        <div class="modal-actions">
                            <button class="pill-btn" @click="closeJoinModal">Cancel</button>
                            <button
                                class="pill-btn primary"
                                :disabled="!joinToken.trim() || joinLoading"
                                @click="joinRoom"
                            >
                                {{ joinLoading ? 'Joining…' : 'Join room' }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- ── Loading overlay ────────────────────────────────────────── -->
        <div v-if="loading" class="loading-overlay">
            <div class="spinner"/>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, shallowRef, inject } from 'vue'
import { startRename } from 'gexplorer/widgets'
import type { WidgetSdk, ChatMessage } from 'gexplorer/widgets'
import type { EdhtSession } from 'gexplorer/widgets'

// ── Types ──────────────────────────────────────────────────────────────────────

// RoomConfig is a pure frontend type — stored as a sealed blob in the vault
// under vpath "gexchange://config/{roomId}.room.json".
interface RoomConfig {
    roomId:         string
    canonicalName:  string
    createdAt:      number
    ownerPublicKey: string
    sessionSecret:  string   // base64 — EDHT key material
    ownerEndpoint:  string   // direct TCP endpoint; replaced by DHT in Phase 2
    isOwner:        boolean
    isAdmin:        boolean
    isClosed:       boolean
    closedReason:   string
    accessPointId:  string   // vault access point for this config blob
    blobSha256:     string   // blob identity — used to update config on change
}

interface Room extends RoomConfig {
    displayName: string      // local override stored in localStorage
}

interface Identity {
    userId:    string
    username:  string
    publicKey: string
    endpoint:  string
}

// ── SDK ────────────────────────────────────────────────────────────────────────

const sdk = inject<WidgetSdk>('widgetSdk')
const {
    p2pGetIdentity,
    p2pDeriveKey,
    p2pCreateInvite,
    p2pAcceptInvite,
    p2pOpenChannel,
    onP2PMessage,
    createEdhtSession,
    vaultOpen,
    vaultClose,
    vaultSealContentAs,
    vaultUnsealText,
    vaultList,
    vaultDelete,
    chatBind,
    chatUnbind,
    chatSend,
    chatGetHistory,
    onChatMessage,
    onChatHistoryReady,
} = sdk ?? {}

// ── State ──────────────────────────────────────────────────────────────────────

const loading          = ref(false)
const rooms            = ref<Room[]>([])
const activeRoom       = ref<Room | null>(null)
const identity         = ref<Identity | null>(null)
const showSidebar      = ref(true)
const showBoard        = ref(false)
const pickerOpen       = ref(false)
const roomFilter       = ref('')
const showJoinModal    = ref(false)
const showNewRoomInput = ref(false)
const newRoomName      = ref('')
const createError      = ref('')
const loadedComponent  = shallowRef<any>(null)

const inviteToken     = ref('')
const inviteExpiry    = ref(15)
const inviteCopied    = ref(false)
const inviteError     = ref('')
const showInvitePanel = ref(false)
const joinToken       = ref('')
const joinError       = ref('')
const joinLoading     = ref(false)

// ── Chat state ─────────────────────────────────────────────────────────────────

const messages    = ref<ChatMessage[]>([])
const draftText   = ref('')
const sending     = ref(false)
const chatLoading = ref(false)
const shiftToSend = ref(true)

const feedRef  = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

// ── DOM refs ───────────────────────────────────────────────────────────────────

const pickerRef       = ref<HTMLElement | null>(null)
const searchInputRef  = ref<HTMLInputElement | null>(null)
const newRoomInputRef = ref<HTMLInputElement | null>(null)

// ── Vault state ────────────────────────────────────────────────────────────────

let vaultToken: string | null = null

// ── Chat session state ─────────────────────────────────────────────────────────

const chatSessions = ref(new Map<string, string>())  // roomId → chatSessionId

// ── EDHT state ─────────────────────────────────────────────────────────────────

const edhtSessions       = ref(new Map<string, EdhtSession>())
const edhtSessionsPending = new Set<string>()
const roomPeers          = ref<Map<string, Set<string>>>(new Map())
const peerNames          = ref<Record<string, string>>({})

const activePeerIds = computed(() => {
    if (!activeRoom.value) return []
    const peers = [...(roomPeers.value.get(activeRoom.value.roomId) ?? [])]
    return peers.filter(id => id !== identity.value?.userId)
})

// ── Local display name overrides ───────────────────────────────────────────────

const LOCAL_NAMES_KEY = 'gexchange:roomDisplayNames'

function loadLocalNames(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(LOCAL_NAMES_KEY) ?? '{}') } catch { return {} }
}
function saveLocalNames(names: Record<string, string>) {
    localStorage.setItem(LOCAL_NAMES_KEY, JSON.stringify(names))
}
function applyDisplayNames(configs: RoomConfig[]): Room[] {
    const localNames = loadLocalNames()
    return configs.map(r => ({
        ...r,
        displayName: localNames[r.roomId] ?? r.canonicalName,
    }))
}

// ── Computed ───────────────────────────────────────────────────────────────────

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

// ── Lifecycle ──────────────────────────────────────────────────────────────────

let unsubMessage:  (() => void) | null = null
let unsubHistory:  (() => void) | null = null
let unsubP2PMsg:   (() => void) | null = null

onMounted(async () => {
    await loadIdentity()
    await openVault()
    await loadRooms()

    const first = rooms.value[0]
    if (first) selectRoom(first)

    for (let i = 1; i < rooms.value.length; i++) {
        const room = rooms.value[i]
        setTimeout(() => ensureEdhtSession(room), i * 200)
    }

    unsubMessage = onChatMessage?.((msg) => {
        if (msg.scopeId === activeRoom.value?.roomId)
            appendMessage({ ...msg, roomId: msg.scopeId })
    }) ?? null

    unsubHistory = onChatHistoryReady?.((scopeId) => {
        if (scopeId === activeRoom.value?.roomId)
            loadHistory(scopeId)
    }) ?? null

    unsubP2PMsg = onP2PMessage?.((event) => {
        const session = edhtSessions.value.get(event.channelId)
        if (session) session.discover()
    }) ?? null
})

onUnmounted(async () => {
    unsubMessage?.()
    unsubHistory?.()
    unsubP2PMsg?.()
    document.removeEventListener('mousedown', onDocClick)
    await stopAllEdhtSessions()
    await stopAllChatSessions()
    if (vaultToken) {
        await vaultClose?.(vaultToken)
        vaultToken = null
    }
})

watch(activeRoom, async (room) => {
    messages.value = []
    if (!room) return
    await ensureChatSession(room)
    await loadHistory(room.roomId)
})

// ── Vault ──────────────────────────────────────────────────────────────────────

async function openVault() {
    if (!p2pDeriveKey || !vaultOpen) return
    try {
        const keyBytes = await p2pDeriveKey('vault-master-v1')
        const result   = await vaultOpen({ scopeId: 'rooms', masterKey: keyBytes })
        vaultToken     = result.vaultToken
        console.log('[GExchange] Vault open — vaultId:', result.vaultId)
    } catch (err) {
        console.warn('[GExchange] Failed to open vault:', err)
    }
}

// ── Room persistence ───────────────────────────────────────────────────────────

async function loadRooms() {
    if (!vaultToken || !vaultList || !vaultUnsealText) return
    loading.value = true
    try {
        // All room configs live under the config/ prefix
        const entries = await vaultList(vaultToken, 'gexchange://config/')
        const configs: RoomConfig[] = []

        for (const entry of entries) {
            if (!entry.vpath.endsWith('.room.json')) continue
            try {
                const text   = await vaultUnsealText(vaultToken, entry.blobSha256)
                const config = JSON.parse(text) as RoomConfig
                // Attach vault identity so we can update this config later
                config.accessPointId = entry.accessPointId
                config.blobSha256    = entry.blobSha256
                configs.push(config)
            } catch (err) {
                console.warn('[GExchange] Failed to read room config:', entry.vpath, err)
            }
        }

        rooms.value = applyDisplayNames(configs)
    } catch (err) {
        console.warn('[GExchange] Failed to load rooms:', err)
    } finally {
        loading.value = false
    }
}

async function saveRoomConfig(config: Omit<RoomConfig, 'accessPointId' | 'blobSha256'>): Promise<{ accessPointId: string; blobSha256: string }> {
    if (!vaultToken || !vaultSealContentAs)
        throw new Error('Vault not open')

    const json    = JSON.stringify(config, null, 2)
    // encodeURIComponent + unescape safely handles non-ASCII in btoa
    const content = btoa(unescape(encodeURIComponent(json)))
    const vpath   = `gexchange://config/${config.roomId}.room.json`

    const ap = await vaultSealContentAs(vaultToken, content, vpath)
    return { accessPointId: ap.accessPointId, blobSha256: ap.blobSha256 }
}

// ── Chat sessions ──────────────────────────────────────────────────────────────

async function ensureChatSession(room: Room) {
    if (chatSessions.value.has(room.roomId)) return
    if (!chatBind || !p2pOpenChannel) return

    try {
        let channelId: string

        if (room.isOwner) {
            // Hub — inbound connections arrive via PeerConnectionCoordinator
            channelId = room.roomId
        } else {
            const ch  = await p2pOpenChannel({
                endpoint:  room.ownerEndpoint,
                publicKey: room.ownerPublicKey,
                sessionId: room.roomId,
            })
            channelId = ch.channelId
        }

        const { chatSessionId } = await chatBind({
            channelId,
            scopeId:      room.roomId,
            senderName:   identity.value?.username ?? identity.value?.userId ?? 'Unknown',
            isHub:        room.isOwner,
            historyLimit: 500,
        })

        chatSessions.value.set(room.roomId, chatSessionId)
        console.log('[GExchange] Chat bound room:', room.roomId.slice(0, 8), 'session:', chatSessionId.slice(0, 8))
    } catch (err) {
        console.warn('[GExchange] Failed to bind chat for room:', room.roomId.slice(0, 8), err)
    }
}

async function stopAllChatSessions() {
    if (!chatUnbind) return
    for (const chatSessionId of chatSessions.value.values()) {
        try { await chatUnbind(chatSessionId) } catch { }
    }
    chatSessions.value.clear()
}

// ── Chat actions ───────────────────────────────────────────────────────────────

async function loadHistory(roomId: string) {
    if (!chatGetHistory) return
    chatLoading.value = true
    try {
        const msgs     = await chatGetHistory(roomId, 100)
        messages.value = msgs.map(m => ({ ...m, roomId: m.scopeId }))
        await nextTick()
        scrollToBottom()
    } catch (err) {
        console.warn('[GExchange] Failed to load history:', err)
    } finally {
        chatLoading.value = false
    }
}

async function sendMessage() {
    const text = draftText.value.trim()
    if (!text || !activeRoom.value || sending.value || !chatSend) return

    const chatSessionId = chatSessions.value.get(activeRoom.value.roomId)
    if (!chatSessionId) {
        console.warn('[GExchange] No chat session for room:', activeRoom.value.roomId.slice(0, 8))
        return
    }

    sending.value = true
    const optimisticId = `opt_${Date.now()}`

    const optimistic: ChatMessage = {
        id:         optimisticId,
        scopeId:    activeRoom.value.roomId,
        senderId:   identity.value?.userId ?? '',
        senderName: identity.value?.username ?? 'You',
        text,
        type:       'text',
        sentAt:     Date.now(),
    }
    appendMessage(optimistic)
    draftText.value = ''
    resetInputHeight()

    try {
        const result = await chatSend(chatSessionId, text)
        const idx    = messages.value.findIndex(m => m.id === optimisticId)
        if (idx >= 0) messages.value[idx] = {
            ...messages.value[idx],
            id:     result.messageId,
            sentAt: result.sentAt,
        }
    } catch (err) {
        console.warn('[GExchange] Failed to send message:', err)
        messages.value = messages.value.filter(m => m.id !== optimisticId)
    } finally {
        sending.value = false
        await nextTick()
        inputRef.value?.focus()
    }
}

function appendMessage(msg: ChatMessage) {
    if (messages.value.some(m => m.id === msg.id)) return
    messages.value.push(msg)
    nextTick(() => scrollToBottom())
}

function scrollToBottom() {
    if (feedRef.value) feedRef.value.scrollTop = feedRef.value.scrollHeight
}

// ── Input handling ─────────────────────────────────────────────────────────────

function onInputKeydown(e: KeyboardEvent) {
    if (shiftToSend.value) {
        if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); sendMessage() }
    } else {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    }
}

function autoResizeInput() {
    const el = inputRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function resetInputHeight() {
    if (inputRef.value) inputRef.value.style.height = 'auto'
}

// ── Message display helpers ────────────────────────────────────────────────────

function shouldShowSender(msg: ChatMessage, list: ChatMessage[]): boolean {
    const idx = list.indexOf(msg)
    if (idx === 0) return true
    const prev = list[idx - 1]
    return prev.senderId !== msg.senderId || (msg.sentAt - prev.sentAt) > 5 * 60 * 1000
}

function shouldShowDateSep(msg: ChatMessage, list: ChatMessage[]): boolean {
    const idx = list.indexOf(msg)
    if (idx === 0) return false
    const prev = list[idx - 1]
    return new Date(msg.sentAt).toDateString() !== new Date(prev.sentAt).toDateString()
}

function formatTime(ms: number): string {
    if (!ms || isNaN(ms)) return ''
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
}

function formatDate(ms: number): string {
    if (!ms || isNaN(ms)) return ''
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(ms))
}

// ── EDHT ───────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

async function ensureEdhtSession(room: Room) {
    if (edhtSessions.value.has(room.roomId)) return
    if (edhtSessionsPending.has(room.roomId)) return
    edhtSessionsPending.add(room.roomId)
    if (!room.sessionSecret || !createEdhtSession) return

    try {
        const secret = Uint8Array.from(atob(room.sessionSecret), c => c.charCodeAt(0))
        const s      = await createEdhtSession({ sessionSecret: secret, scopeId: room.roomId })

        const payload = encoder.encode(JSON.stringify({
            endpoint:  identity.value?.endpoint  ?? '',
            publicKey: identity.value?.publicKey ?? '',
            userId:    identity.value?.userId    ?? '',
            username:  identity.value?.username  ?? '',
        }))

        await s.announce(payload)

        s.onPeerDiscovered(async peer => {
            try {
                const info = JSON.parse(new TextDecoder().decode(peer.payload))

                if (info.endpoint && info.publicKey && p2pOpenChannel) {
                    try {
                        await p2pOpenChannel({
                            endpoint:  info.endpoint,
                            publicKey: info.publicKey,
                            sessionId: room.roomId,
                        })
                    } catch (err: any) {
                        if (!err?.message?.includes('already'))
                            console.warn('[GExchange] p2pOpenChannel failed:', err?.message)
                    }
                }

                if (info.userId) {
                    if (!roomPeers.value.has(room.roomId))
                        roomPeers.value.set(room.roomId, new Set())
                    roomPeers.value.get(room.roomId)!.add(info.userId)
                    peerNames.value[info.userId] = info.username || info.userId
                }
            } catch (err) {
                console.warn('[GExchange] Failed to parse EDHT peer payload:', err)
            }
        })

        s.onPeerLeft(_nodeId => { /* future: remove from roomPeers */ })

        await s.discover()
        edhtSessions.value.set(room.roomId, s)
        edhtSessionsPending.delete(room.roomId)
        console.log(`[GExchange] EDHT session ready for room ${room.roomId.slice(0, 8)}…`)
    } catch (err) {
        edhtSessionsPending.delete(room.roomId)
        console.warn('[GExchange] Failed to start EDHT session:', err)
    }
}

async function stopAllEdhtSessions() {
    for (const session of edhtSessions.value.values())
        await session.dispose()
    edhtSessions.value.clear()
    edhtSessionsPending.clear()
}

// ── Identity ───────────────────────────────────────────────────────────────────

async function loadIdentity() {
    if (!p2pGetIdentity) return
    try {
        const result   = await p2pGetIdentity()
        identity.value = {
            userId:    result.userId,
            username:  result.userId,
            publicKey: result.publicKey,
            endpoint:  result.endpoint,
        }
    } catch (err) {
        console.warn('[GExchange] Failed to load identity:', err)
    }
}

// ── Room actions ───────────────────────────────────────────────────────────────

function selectRoom(room: Room) {
    activeRoom.value = room
    ensureEdhtSession(room)
}

async function createRoom() {
    const name = roomFilter.value.trim()
    if (!name) return
    await doCreateRoom(name)
    closePicker()
}

async function createRoomFromEmpty() {
    const name = newRoomName.value.trim()
    if (!name) return
    createError.value = ''
    try {
        await doCreateRoom(name)
        showNewRoomInput.value = false
        newRoomName.value      = ''
    } catch (err: any) {
        createError.value = err.message
    }
}

async function doCreateRoom(name: string) {
    if (!identity.value) throw new Error('Identity not loaded')

    const createdAt     = Date.now()
    const sessionSecret = generateSecret()
    const roomId        = await deriveRoomId(identity.value.publicKey, name, createdAt)

    const config: Omit<RoomConfig, 'accessPointId' | 'blobSha256'> = {
        roomId,
        canonicalName:  name,
        createdAt,
        ownerPublicKey: identity.value.publicKey,
        sessionSecret,
        ownerEndpoint:  identity.value.endpoint,
        isOwner:        true,
        isAdmin:        true,
        isClosed:       false,
        closedReason:   '',
    }

    const { accessPointId, blobSha256 } = await saveRoomConfig(config)
    const room: Room = {
        ...config,
        accessPointId,
        blobSha256,
        displayName: name,
    }

    rooms.value.push(room)
    selectRoom(room)
}

function generateSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return btoa(String.fromCharCode(...bytes))
}

async function deriveRoomId(publicKey: string, name: string, createdAt: number): Promise<string> {
    const input   = `${publicKey}|${name}|${createdAt}`
    const encoded = new TextEncoder().encode(input)
    const hash    = await crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 8)
}

function openInItems() {
    if (!activeRoom.value) return
    console.log('[GExchange] Open in items:', `gexchange://${activeRoom.value.roomId}/`)
}

function focusCreateField() {
    nextTick(() => {
        if (searchInputRef.value) {
            searchInputRef.value.focus()
            roomFilter.value = 'new-room'
            nextTick(() => searchInputRef.value?.select())
        }
    })
}

// ── Invite ─────────────────────────────────────────────────────────────────────

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

async function joinRoom() {
    const token = joinToken.value.trim()
    if (!token || !p2pAcceptInvite || !identity.value) return
    joinError.value   = ''
    joinLoading.value = true
    try {
        const decoded = await p2pAcceptInvite(token)

        const config: Omit<RoomConfig, 'accessPointId' | 'blobSha256'> = {
            roomId:         decoded.sessionId,
            canonicalName:  decoded.sessionId,
            createdAt:      Date.now(),
            ownerPublicKey: decoded.publicKey,
            sessionSecret:  decoded.sessionSecret,
            ownerEndpoint:  decoded.endpoint,
            isOwner:        false,
            isAdmin:        false,
            isClosed:       false,
            closedReason:   '',
        }

        const { accessPointId, blobSha256 } = await saveRoomConfig(config)
        const room: Room = {
            ...config,
            accessPointId,
            blobSha256,
            displayName: config.canonicalName,
        }

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

// ── Picker ─────────────────────────────────────────────────────────────────────

function togglePicker() {
    pickerOpen.value = !pickerOpen.value
    if (pickerOpen.value) {
        roomFilter.value = ''
        nextTick(() => searchInputRef.value?.focus())
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

function onDocClick(e: MouseEvent) {
    if (pickerRef.value && !pickerRef.value.contains(e.target as Node))
        closePicker()
}
onMounted(() => document.addEventListener('mousedown', onDocClick))

// ── Rename ─────────────────────────────────────────────────────────────────────

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

// ── Sidebar ────────────────────────────────────────────────────────────────────

function toggleSidebar() { showSidebar.value = !showSidebar.value }

watch(showNewRoomInput, (v) => {
    if (v) nextTick(() => newRoomInputRef.value?.focus())
})
</script>

<style scoped>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.gex-root {
    --bg:       var(--surface-1,  #1a1a1f);
    --bg-2:     var(--surface-2,  #22222a);
    --bg-3:     var(--surface-3,  #2a2a35);
    --fg:       var(--text-1,     #e8e8f0);
    --fg-dim:   var(--text-2,     #9090a8);
    --fg-muted: var(--text-3,     #606078);
    --accent:   var(--color-accent, #7c6ff7);
    --border:   var(--border-1,   rgba(255,255,255,.08));
    --radius:   8px;
    font-family: var(--font, system-ui, sans-serif);
    font-size: 13px;
    color: var(--fg);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    overflow: hidden;
}
</style>