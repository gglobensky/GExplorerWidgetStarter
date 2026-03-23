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
/* ── Root ────────────────────────────────────────────────────────────────── */
.gex-root {
    --bg:         var(--surface-1,  #111);
    --bg-2:       var(--surface-2,  #171717);
    --bg-3:       var(--surface-3,  #1e1e1e);
    --border:     var(--border-1,   rgba(255,255,255,.07));
    --fg:         var(--text-1,     #e8e8e8);
    --fg-dim:     var(--text-2,     #777);
    --fg-muted:   var(--text-3,     #444);
    --accent:     var(--color-accent, #5b8ef0);
    --accent-dim: rgba(91,142,240,.15);
    --radius:     8px;
    --font:       var(--font-ui, system-ui, sans-serif);

    display: grid;
    grid-template-rows: 44px 1fr auto;
    height: 100%;
    min-height: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
    border-radius: var(--radius);
    overflow: hidden;
    position: relative;
}
.gex-root.no-room {
    grid-template-rows: 44px auto 1fr;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.gex-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    gap: 8px;
}
.header-left  { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.header-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

/* ── Room picker ─────────────────────────────────────────────────────────── */
.room-picker { position: relative; min-width: 0; }

.room-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--fg);
    cursor: pointer;
    padding: 4px 8px;
    font-family: var(--font);
    font-size: 13px;
    font-weight: 600;
    transition: background .15s, border-color .15s;
    max-width: 280px;
    min-width: 0;
}
.room-trigger:hover { background: var(--bg-3); border-color: var(--border); }
.room-picker.open .room-trigger { background: var(--bg-3); border-color: var(--accent); }

.room-hash    { color: var(--accent); font-weight: 700; flex-shrink: 0; }
.room-name    { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.room-id-badge {
    font-size: 10px;
    color: var(--fg-muted);
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    flex-shrink: 0;
    font-weight: 400;
}
.chevron {
    width: 10px; height: 6px;
    color: var(--fg-dim);
    flex-shrink: 0;
    transition: transform .2s;
}
.room-picker.open .chevron { transform: rotate(180deg); }

/* ── Dropdown ────────────────────────────────────────────────────────────── */
.room-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 280px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
    z-index: 200;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.dropdown-top  { flex-shrink: 0; }
.search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 6px;
}
.search-icon  { width: 14px; height: 14px; color: var(--fg-dim); flex-shrink: 0; }
.room-search {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
}
.room-search::placeholder { color: var(--fg-muted); }

.dropdown-actions {
    display: flex;
    gap: 6px;
    padding: 4px 10px 8px;
}
.action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-3);
    color: var(--fg-dim);
    font-family: var(--font);
    font-size: 11px;
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.action-btn svg { width: 12px; height: 12px; flex-shrink: 0; }
.action-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--accent); }
.action-btn:disabled  { opacity: .35; cursor: not-allowed; }
.create-btn:not(:disabled) { color: var(--accent); }
.join-btn:not(:disabled)   { color: #4caf6e; }

.dropdown-sep   { height: 1px; background: var(--border); }
.room-list-scroll { overflow-y: auto; max-height: 220px; padding: 4px 0; }
.room-empty { padding: 16px; text-align: center; color: var(--fg-muted); font-size: 12px; }

.room-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    cursor: pointer;
    transition: background .1s;
    position: relative;
}
.room-row:hover  { background: var(--bg-3); }
.room-row.active { background: var(--accent-dim); }
.row-hash  { color: var(--accent); font-weight: 700; flex-shrink: 0; }
.row-name  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-id    { font-size: 10px; color: var(--fg-muted); flex-shrink: 0; }
.row-closed {
    font-size: 10px;
    color: #e05555;
    background: rgba(224,85,85,.1);
    border: 1px solid rgba(224,85,85,.25);
    border-radius: 4px;
    padding: 1px 5px;
    flex-shrink: 0;
}
.row-rename {
    opacity: 0;
    background: transparent;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    transition: opacity .15s, color .15s;
    flex-shrink: 0;
}
.row-rename svg { width: 12px; height: 12px; }
.room-row:hover .row-rename { opacity: 1; }
.row-rename:hover { color: var(--accent); }

/* ── Icon buttons ────────────────────────────────────────────────────────── */
.icon-btn {
    background: transparent;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color .15s, background .15s;
}
.icon-btn svg  { width: 15px; height: 15px; }
.icon-btn:hover { color: var(--fg); background: var(--bg-3); }

/* ── Pill buttons ────────────────────────────────────────────────────────── */
.pill-btn {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--fg-dim);
    font-family: var(--font);
    font-size: 12px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all .15s;
}
.pill-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--fg-muted); }
.pill-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
}
.pill-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
.pill-btn:disabled { opacity: .4; cursor: not-allowed; }

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 24px;
    text-align: center;
}
.empty-glyph  { font-size: 48px; color: var(--fg-muted); line-height: 1; margin-bottom: 4px; }
.empty-title  { font-size: 15px; font-weight: 600; margin: 0; color: var(--fg); }
.empty-sub    { font-size: 12px; color: var(--fg-dim); margin: 0; }
.empty-actions { display: flex; gap: 8px; margin-top: 4px; }
.inline-create { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.new-room-input {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
    width: 160px;
    transition: border-color .15s;
}
.new-room-input:focus { border-color: var(--accent); }
.create-error { font-size: 11px; color: #e05555; margin: 0; }

/* ── Chat body ───────────────────────────────────────────────────────────── */
.chat-body {
    display: flex;
    overflow: hidden;
    min-height: 0;
    height: 100%;
}
.chat-feed {
    flex: 1;
    padding: 12px 16px;
    overflow-y: auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/* ── Messages ────────────────────────────────────────────────────────────── */
.message { display: flex; flex-direction: column; max-width: 72%; }
.message.mine   { align-self: flex-end; align-items: flex-end; }
.message.theirs { align-self: flex-start; align-items: flex-start; }

.msg-sender {
    font-size: 11px;
    color: var(--fg-muted);
    margin-bottom: 2px;
    padding: 0 4px;
}
.msg-sender.sender-you { color: var(--accent); opacity: .8; }

.msg-bubble {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 12px;
    line-height: 1.45;
    word-break: break-word;
}
.message.mine .msg-bubble {
    background: var(--accent);
    border-bottom-right-radius: 3px;
}
.message.theirs .msg-bubble {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-bottom-left-radius: 3px;
}

.msg-text  { font-size: 13px; flex: 1; }
.message.mine .msg-text   { color: #fff; }
.message.theirs .msg-text { color: var(--fg); }

.msg-time {
    font-size: 10px;
    flex-shrink: 0;
    margin-bottom: 1px;
    white-space: nowrap;
}
.message.mine .msg-time   { color: rgba(255,255,255,.55); }
.message.theirs .msg-time { color: var(--fg-muted); }

.system-msg {
    align-self: center;
    color: var(--fg-muted);
    font-size: 11px;
    font-style: italic;
    padding: 2px 0;
}

/* ── Date separator ──────────────────────────────────────────────────────── */
.date-sep {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--fg-muted);
    font-size: 11px;
    margin: 8px 0 4px;
}
.date-sep::before,
.date-sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.chat-sidebar {
    width: 200px;
    flex-shrink: 0;
    background: var(--bg-2);
    border-left: 1px solid var(--border);
    padding: 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
}
.sidebar-section h4 {
    margin: 0 0 8px;
    color: var(--fg-muted);
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: .08em;
    font-weight: 700;
}
.user-list { list-style: none; padding: 0; margin: 0; }
.user-row  { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; font-size: 12px; }
.user-row.self { color: var(--fg); }
.dot       { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot.online { background: #4caf6e; }
.you-tag {
    font-size: 10px;
    color: var(--fg-muted);
    background: var(--bg-3);
    border-radius: 3px;
    padding: 1px 4px;
    margin-left: auto;
}
.room-meta  { display: flex; flex-direction: column; gap: 6px; }
.meta-row   { display: flex; flex-direction: column; gap: 1px; }
.meta-label { font-size: 10px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .06em; }
.meta-value { font-size: 12px; color: var(--fg); }
.meta-value.mono { letter-spacing: .04em; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.chat-footer {
    background: var(--bg-2);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
}
.plugin-tabs {
    display: flex;
    gap: 2px;
    padding: 8px 12px 0;
}
.tab-btn {
    background: transparent;
    color: var(--fg-muted);
    border: none;
    padding: 5px 12px;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    font-family: var(--font);
    font-size: 12px;
    transition: all .15s;
}
.tab-btn.active { background: var(--bg-3); color: var(--fg); }
.tab-btn:hover:not(.active) { color: var(--fg-dim); }

.plugin-canvas { padding: 10px 12px; flex-shrink: 0; }

/* ── Input area ──────────────────────────────────────────────────────────── */
.input-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.chat-input {
    width: 100%;
    min-height: 56px;
    max-height: 160px;
    background: var(--bg-3);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    font-family: var(--font);
    font-size: 13px;
    resize: none;
    outline: none;
    transition: border-color .15s;
    box-sizing: border-box;
    line-height: 1.5;
}
.chat-input:focus   { border-color: var(--accent); }
.chat-input:disabled { opacity: .4; cursor: not-allowed; }

.input-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
}
.send-mode-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    color: var(--fg-muted);
    font-size: 11px;
    user-select: none;
}
.send-mode-toggle input { display: none; }
.toggle-label {
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    transition: all .15s;
}
.send-mode-toggle:has(input:checked) .toggle-label {
    border-color: var(--accent);
    color: var(--accent);
}
.send-btn {
    background: var(--accent);
    border: none;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    transition: filter .15s;
}
.send-btn svg { width: 14px; height: 14px; }
.send-btn:hover:not(:disabled) { filter: brightness(1.15); }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }

.closed-banner {
    font-size: 11px;
    color: #e05555;
    text-align: center;
    padding: 4px 0 2px;
}
.loading-state {
    font-size: 12px;
    color: var(--fg-muted);
    padding: 12px 0;
    text-align: center;
}
.mins { font-size: 10px; color: var(--fg-muted); }

/* ── Invite panel ────────────────────────────────────────────────────────── */
.invite-panel {
    position: absolute;
    top: 44px;
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    padding: 12px 14px;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.invite-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--fg-dim);
}
.invite-close {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    line-height: 1;
}
.invite-close:hover { color: var(--fg); }
.invite-body  { display: flex; flex-direction: column; gap: 8px; }
.invite-label { font-size: 11px; color: var(--fg-dim); }
.invite-expiry-row { display: flex; align-items: center; gap: 10px; }
.expiry-options { display: flex; gap: 4px; }
.expiry-btn {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg-dim);
    font-family: var(--font);
    font-size: 11px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all .15s;
}
.expiry-btn.active { border-color: var(--accent); color: var(--accent); }
.expiry-btn:hover:not(.active) { color: var(--fg); }
.full-width { width: 100%; justify-content: center; }
.token-display {
    display: flex;
    gap: 8px;
    align-items: flex-start;
}
.token-text {
    flex: 1;
    font-size: 10px;
    color: var(--fg-dim);
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 6px 8px;
    word-break: break-all;
    line-height: 1.5;
    max-height: 60px;
    overflow-y: auto;
}
.invite-error { font-size: 11px; color: #e05555; margin: 0; }
.invite-note  { font-size: 10px; color: var(--fg-muted); margin: 0; line-height: 1.4; }

/* ── Join modal ──────────────────────────────────────────────────────────── */
.modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
}
.modal {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 320px;
    box-shadow: 0 12px 40px rgba(0,0,0,.6);
}
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    font-weight: 600;
}
.modal-body    { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.modal-sub     { font-size: 12px; color: var(--fg-dim); margin: 0; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.token-input {
    width: 100%;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font-family: var(--font);
    font-size: 11px;
    padding: 8px 10px;
    resize: none;
    outline: none;
    transition: border-color .15s;
    box-sizing: border-box;
    line-height: 1.5;
}
.token-input:focus { border-color: var(--accent); }

/* ── Loading overlay ─────────────────────────────────────────────────────── */
.loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
}
.spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Transitions ─────────────────────────────────────────────────────────── */
.dropdown-enter-active,
.dropdown-leave-active { transition: opacity .15s, transform .15s; }
.dropdown-enter-from,
.dropdown-leave-to     { opacity: 0; transform: translateY(-6px); }

.slide-down-enter-active,
.slide-down-leave-active { transition: opacity .15s, transform .15s; }
.slide-down-enter-from,
.slide-down-leave-to     { opacity: 0; transform: translateY(-8px); }

.fade-enter-active,
.fade-leave-active { transition: opacity .15s; }
.fade-enter-from,
.fade-leave-to     { opacity: 0; }
</style>