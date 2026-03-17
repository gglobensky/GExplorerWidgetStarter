<template>
    <div class="gex-root" :class="{ 'no-room': !activeRoom }">

        <!-- ── Header ─────────────────────────────────────────────────── -->
        <header class="gex-header">
            <div class="header-left">
                <!-- Room picker -->
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
                <!-- Welcome message -->
                <div class="message system-msg">
                    <span class="msg-text">Welcome to <strong>#{{ activeRoom.canonicalName }}</strong></span>
                </div>

                <!-- Chat messages -->
                <template v-for="msg in messages" :key="msg.id">
                    <!-- Date separator when date changes -->
                    <div
                        v-if="shouldShowDateSep(msg, messages)"
                        class="date-sep"
                    >
                        <span>{{ formatDate(msg.sentAt) }}</span>
                    </div>

                    <div
                        class="message"
                        :class="{
                            'mine':   msg.senderId === identity?.userId,
                            'theirs': msg.senderId !== identity?.userId,
                        }"
                    >
                        <!-- Show sender name when it changes or after a gap -->
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

                <!-- Typing / loading indicator -->
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
                <button @click="showBoard = false" :class="{ active: !showBoard }" class="tab-btn">
                    💬 Chat
                </button>
                <button @click="showBoard = true" :class="{ active: showBoard }" class="tab-btn">
                    🛠️ Board
                </button>
            </div>
            <div class="plugin-canvas">
                <template v-if="!showBoard">
                    <div class="input-area">
                        <textarea
                            ref="inputRef"
                            v-model="draftText"
                            class="chat-input"
                            :placeholder="activeRoom.isClosed ? 'This room is archived — read only' : 'Type a message… (Shift+Enter to send)'"
                            :disabled="activeRoom.isClosed || sending"
                            rows="1"
                            @keydown="onInputKeydown"
                            @input="autoResizeInput"
                        />
                        <div class="input-actions">
                            <label
                                class="send-mode-toggle"
                                v-gex-tooltip="shiftToSend ? 'Shift+Enter sends · Enter = new line' : 'Enter sends · Shift+Enter = new line'"
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
import { startRename, WidgetSdk } from 'gexplorer/widgets'
import type { ChatMessage } from 'gexplorer/widgets'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Room {
    roomId:        string
    canonicalName: string
    displayName:   string
    createdAt:     number
    isOwner:       boolean
    isAdmin:       boolean
    isClosed:      boolean
    closedReason:  string
}

interface Identity {
    userId:    string
    username:  string
    publicKey: string
}

// ── SDK ────────────────────────────────────────────────────────────────────────

const sdk = inject<WidgetSdk>('widgetSdk')
const {
    fsListDirSmart,
    fsMkdir,
    p2pCreateInvite,
    p2pAcceptInvite,
    p2pGetIdentity,
    sendMessage:    sdkSendMessage,
    getHistory:     sdkGetHistory,
    onChatMessage:  sdkOnChatMessage,
    onChatHistory:  sdkOnChatHistory,
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
const shiftToSend = ref(true)   // true = Shift+Enter sends, Enter = newline

const feedRef  = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

// ── Refs ───────────────────────────────────────────────────────────────────────

const pickerRef       = ref<HTMLElement | null>(null)
const searchInputRef  = ref<HTMLInputElement | null>(null)
const newRoomInputRef = ref<HTMLInputElement | null>(null)

// ── Local display name overrides ───────────────────────────────────────────────

const LOCAL_NAMES_KEY = 'gexchange:roomDisplayNames'

function loadLocalNames(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(LOCAL_NAMES_KEY) ?? '{}') } catch { return {} }
}
function saveLocalNames(names: Record<string, string>) {
    localStorage.setItem(LOCAL_NAMES_KEY, JSON.stringify(names))
}
function applyDisplayNames(raw: Omit<Room, 'displayName'>[]): Room[] {
    const localNames = loadLocalNames()
    return raw.map(r => ({
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

let unsubMessage: (() => void) | null = null
let unsubHistory: (() => void) | null = null

onMounted(async () => {
    await Promise.all([loadIdentity(), loadRooms()])
    if (rooms.value.length > 0 && !activeRoom.value)
        selectRoom(rooms.value[0])

    // Subscribe to incoming chat messages from peers via SDK
    unsubMessage = sdkOnChatMessage?.(null, (msg) => {
        if (msg.roomId === activeRoom.value?.roomId)
            appendMessage(msg)
    }) ?? null

    // Subscribe to history arrival — reload when peer delivers history
    unsubHistory = sdkOnChatHistory?.(null, (roomId) => {
        if (roomId === activeRoom.value?.roomId)
            loadHistory(roomId)
    }) ?? null
})

onUnmounted(() => {
    unsubMessage?.()
    unsubHistory?.()
    document.removeEventListener('mousedown', onDocClick)
})

// Reload history when active room changes
watch(activeRoom, async (room) => {
    messages.value = []
    if (room) await loadHistory(room.roomId)
})

// ── Chat actions ───────────────────────────────────────────────────────────────

async function loadHistory(roomId: string) {
    chatLoading.value = true
    try {
        const res = await sdkGetHistory?.(roomId, 100)
        if (res?.ok) {
            messages.value = res.messages
            await nextTick()
            scrollToBottom()
        }
    } catch (err) {
        console.warn('[GExchange] Failed to load history:', err)
    } finally {
        chatLoading.value = false
    }
}

async function sendMessage() {
    const text = draftText.value.trim()
    if (!text || !activeRoom.value || sending.value) return

    sending.value = true
    const optimisticId = `opt_${Date.now()}`

    // Optimistic — show immediately before backend confirms
    const optimistic: ChatMessage = {
        id:         optimisticId,
        roomId:     activeRoom.value.roomId,
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
        const res = await sdkSendMessage?.(activeRoom.value.roomId, text)
        if (res?.ok && res.msg) {
            // Replace optimistic with real message (has canonical backend ID)
            const idx = messages.value.findIndex(m => m.id === optimisticId)
            if (idx >= 0) messages.value[idx] = res.msg
        }
    } catch (err) {
        console.warn('[GExchange] Failed to send message:', err)
        // Remove optimistic on failure
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
    if (feedRef.value)
        feedRef.value.scrollTop = feedRef.value.scrollHeight
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

// ── Data loading ───────────────────────────────────────────────────────────────

async function loadIdentity() {
    try {
        const result = await p2pGetIdentity?.()
        if (result) identity.value = result
    } catch (err) {
        console.warn('[GExchange] Failed to load identity:', err)
    }
}

async function loadRooms() {
    loading.value = true
    try {
        const res = await fsListDirSmart?.('.', {})
        rooms.value = applyDisplayNames(
            (res?.entries ?? []).map((e: any) => ({
                roomId:        e.Meta?.roomId        ?? '',
                canonicalName: e.Meta?.canonicalName ?? e.Name ?? '',
                createdAt:     e.Meta?.createdAt     ?? e.ModifiedAt ?? 0,
                isOwner:       !!(e.Meta?.isOwner),
                isAdmin:       !!(e.Meta?.isAdmin),
                isClosed:      !!(e.Meta?.isClosed),
                closedReason:  e.Meta?.closedReason  ?? '',
            }))
        )
    } catch (err) {
        console.warn('[GExchange] Failed to load rooms:', err)
    } finally {
        loading.value = false
    }
}

// ── Room actions ───────────────────────────────────────────────────────────────

function selectRoom(room: Room) { activeRoom.value = room }

async function createRoom() {
    const name = roomFilter.value.trim()
    if (!name) return
    await doCreateRoom(name)
    closePicker()
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

async function createRoomFromEmpty() {
    const name = newRoomName.value.trim()
    if (!name) return
    createError.value = ''
    try {
        await doCreateRoom(name)
        showNewRoomInput.value = false
        newRoomName.value = ''
    } catch (err: any) {
        createError.value = err.message
    }
}

async function doCreateRoom(name: string) {
    await fsMkdir?.(name)
    await loadRooms()
    const created = rooms.value.find(r => r.canonicalName === name)
    if (created) selectRoom(created)
}

function openInItems() {
    if (!activeRoom.value) return
    console.log('[GExchange] Open in items:', `gexchange://${activeRoom.value.roomId}/`)
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
            const localNames = loadLocalNames()
            localNames[room.roomId] = newName.trim()
            saveLocalNames(localNames)
            const r = rooms.value.find(x => x.roomId === room.roomId)
            if (r) r.displayName = newName.trim()
            if (activeRoom.value?.roomId === room.roomId)
                activeRoom.value = { ...activeRoom.value, displayName: newName.trim() }
        },
        onCancel:   () => {},
        selectAll:  true,
        validate:   (v) => v.trim() ? null : 'Name cannot be empty',
    })
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

function toggleSidebar() { showSidebar.value = !showSidebar.value }

// ── Invite ─────────────────────────────────────────────────────────────────────

async function generateInvite() {
    if (!activeRoom.value) return
    inviteError.value  = ''
    inviteToken.value  = ''
    inviteCopied.value = false
    try {
        const result = await p2pCreateInvite?.(
            activeRoom.value.roomId,
            activeRoom.value.canonicalName,
            { mode: 'open', validityMinutes: inviteExpiry.value }
        )
        if (!result) throw new Error('P2P capability not available')
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
    if (!token) return
    joinError.value   = ''
    joinLoading.value = true
    try {
        const result = await p2pAcceptInvite?.(token)
        if (!result) throw new Error('P2P capability not available')
        await loadRooms()
        const joined = rooms.value.find(r => r.roomId === result.roomId)
        if (joined) selectRoom(joined)
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

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatDate(ms: number): string {
    if (!ms || isNaN(ms)) return ''
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(ms))
}

watch(showNewRoomInput, (v) => {
    if (v) nextTick(() => newRoomInputRef.value?.focus())
})
</script>

<style scoped>
/* ── Reset & root ──────────────────────────────────────────────────────────── */
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
    --font:     var(--font-ui, system-ui, sans-serif);

    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
    position: relative;
    overflow: hidden;
}

/* ── Header ───────────────────────────────────────────────────────────────── */
.gex-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    height: 44px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
    flex-shrink: 0;
    z-index: 10;
}
.header-left, .header-right { display: flex; align-items: center; gap: 4px; }
.icon-btn {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--fg-dim);
    cursor: pointer;
    transition: background .15s, color .15s;
}
.icon-btn:hover { background: var(--bg-3); color: var(--fg); }
.icon-btn svg { width: 15px; height: 15px; }

/* ── Room picker ──────────────────────────────────────────────────────────── */
.room-picker { position: relative; }
.room-trigger {
    display: flex; align-items: center; gap: 5px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
    font-weight: 600;
    padding: 4px 8px;
    cursor: pointer;
    transition: background .15s;
    max-width: 220px;
}
.room-trigger:hover { background: var(--bg-3); }
.room-hash { color: var(--accent); font-weight: 700; }
.room-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.room-id-badge {
    font-size: 10px;
    color: var(--fg-muted);
    font-family: monospace;
    background: var(--bg-3);
    border-radius: 3px;
    padding: 1px 4px;
}
.chevron { width: 10px; height: 6px; color: var(--fg-muted); flex-shrink: 0; }
.room-picker.open .chevron { transform: rotate(180deg); }

.room-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 260px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
    z-index: 200;
    overflow: hidden;
}
.dropdown-top { padding: 8px 8px 0; }
.search-row {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 8px;
    margin-bottom: 6px;
}
.search-icon { width: 13px; height: 13px; color: var(--fg-muted); flex-shrink: 0; }
.room-search {
    flex: 1; background: transparent; border: none;
    color: var(--fg); font-family: var(--font); font-size: 12px; outline: none;
}
.dropdown-actions { display: flex; gap: 4px; margin-bottom: 6px; }
.action-btn {
    flex: 1; display: flex; align-items: center; gap: 4px; justify-content: center;
    background: var(--bg-3); border: 1px solid var(--border); border-radius: 5px;
    color: var(--fg-dim); font-family: var(--font); font-size: 11px;
    padding: 5px 6px; cursor: pointer; transition: all .15s;
}
.action-btn:hover { color: var(--fg); border-color: var(--accent); }
.action-btn svg { width: 12px; height: 12px; }
.dropdown-sep { height: 1px; background: var(--border); margin: 0 -8px; }
.room-list-scroll { max-height: 200px; overflow-y: auto; padding: 4px; }
.room-empty { font-size: 11px; color: var(--fg-muted); text-align: center; padding: 12px; }
.room-row {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 6px; border-radius: 5px; cursor: pointer;
    transition: background .1s;
}
.room-row:hover, .room-row.active { background: var(--bg-3); }
.row-hash { color: var(--accent); font-weight: 700; font-size: 12px; }
.row-name { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-id { font-size: 10px; color: var(--fg-muted); font-family: monospace; }
.row-closed { font-size: 10px; color: #e05555; }
.row-rename {
    width: 20px; height: 20px; opacity: 0;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: var(--fg-muted); cursor: pointer;
    border-radius: 3px; transition: opacity .15s, background .15s;
}
.row-rename svg { width: 12px; height: 12px; }
.room-row:hover .row-rename { opacity: 1; }
.row-rename:hover { background: var(--bg); color: var(--fg); }

/* ── Empty state ──────────────────────────────────────────────────────────── */
.empty-state {
    grid-row: 2 / 5;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; padding: 32px; text-align: center;
}
.empty-glyph { font-size: 48px; color: var(--fg-muted); line-height: 1; }
.empty-title { font-size: 15px; font-weight: 600; }
.empty-sub   { font-size: 12px; color: var(--fg-dim); }
.empty-actions { display: flex; gap: 8px; margin-top: 4px; }
.inline-create { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.new-room-input {
    background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px;
    color: var(--fg); font-family: var(--font); font-size: 12px;
    padding: 6px 10px; outline: none; transition: border-color .15s;
}
.new-room-input:focus { border-color: var(--accent); }
.create-error { font-size: 11px; color: #e05555; }

/* ── Pill buttons ─────────────────────────────────────────────────────────── */
.pill-btn {
    display: inline-flex; align-items: center; gap: 5px;
    background: var(--bg-3); border: 1px solid var(--border); border-radius: 20px;
    color: var(--fg-dim); font-family: var(--font); font-size: 12px;
    padding: 5px 12px; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.pill-btn:hover:not(:disabled) { color: var(--fg); border-color: rgba(255,255,255,.15); }
.pill-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.pill-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
.pill-btn:disabled { opacity: .4; cursor: not-allowed; }

/* ── Chat body ────────────────────────────────────────────────────────────── */
.chat-body {
    display: flex;
    overflow: hidden;
    min-height: 0;
}
.chat-feed {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scroll-behavior: smooth;
}

/* ── Messages ─────────────────────────────────────────────────────────────── */
.message { display: flex; flex-direction: column; max-width: 80%; }
.message.mine   { align-self: flex-end; align-items: flex-end; }
.message.theirs { align-self: flex-start; align-items: flex-start; }
.system-msg     { align-self: center; align-items: center; }

.msg-sender {
    font-size: 11px;
    color: var(--fg-muted);
    margin-bottom: 2px;
    padding: 0 4px;
}
.msg-sender.sender-you { color: var(--accent); opacity: .7; }

.msg-bubble {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    background: var(--bg-3);
    border-radius: 12px;
    padding: 6px 10px;
    max-width: 100%;
}
.message.mine .msg-bubble {
    background: var(--accent);
    border-bottom-right-radius: 4px;
}
.message.theirs .msg-bubble {
    border-bottom-left-radius: 4px;
}
.system-msg .msg-bubble {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 10px;
}

.msg-text {
    font-size: 13px;
    line-height: 1.45;
    word-break: break-word;
}
.msg-text.muted { color: var(--fg-muted); }
.message.mine .msg-text { color: #fff; }

.msg-time {
    font-size: 10px;
    color: rgba(255,255,255,.4);
    flex-shrink: 0;
    align-self: flex-end;
    margin-bottom: 1px;
}
.message.theirs .msg-time { color: var(--fg-muted); }

/* ── Date separator ───────────────────────────────────────────────────────── */
.date-sep {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0 4px;
    align-self: stretch;
}
.date-sep::before,
.date-sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
}
.date-sep span {
    font-size: 10px;
    color: var(--fg-muted);
    white-space: nowrap;
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
.chat-sidebar {
    width: 160px; flex-shrink: 0;
    border-left: 1px solid var(--border);
    overflow-y: auto;
    padding: 10px 0;
}
.sidebar-section { padding: 0 10px 12px; }
.sidebar-section h4 {
    font-size: 10px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; color: var(--fg-muted);
    margin-bottom: 6px;
}
.user-list { list-style: none; display: flex; flex-direction: column; gap: 2px; }
.user-row {
    display: flex; align-items: center; gap: 5px;
    font-size: 12px; padding: 2px 4px; border-radius: 4px;
}
.dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    background: var(--fg-muted);
}
.dot.online { background: #4caf7d; }
.you-tag {
    font-size: 9px; color: var(--fg-muted);
    background: var(--bg-3); border-radius: 3px; padding: 1px 4px;
    margin-left: auto;
}
.room-meta { display: flex; flex-direction: column; gap: 4px; }
.meta-row { display: flex; flex-direction: column; gap: 1px; }
.meta-label { font-size: 10px; color: var(--fg-muted); }
.meta-value { font-size: 11px; }
.meta-value.mono { font-family: monospace; font-size: 10px; }

/* ── Footer ───────────────────────────────────────────────────────────────── */
.chat-footer {
    border-top: 1px solid var(--border);
    background: var(--bg-2);
    flex-shrink: 0;
}
.plugin-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
}
.tab-btn {
    flex: 1; padding: 6px; font-size: 11px;
    background: transparent; border: none; color: var(--fg-dim);
    font-family: var(--font); cursor: pointer; transition: all .15s;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-btn:hover:not(.active) { color: var(--fg); }
.plugin-canvas { padding: 8px 10px; }

/* ── Input area ───────────────────────────────────────────────────────────── */
.input-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.chat-input {
    width: 100%;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
    padding: 7px 10px;
    resize: none;
    outline: none;
    transition: border-color .15s;
    min-height: 36px;
    max-height: 120px;
    line-height: 1.45;
}
.chat-input:focus { border-color: var(--accent); }
.chat-input:disabled { opacity: .4; cursor: not-allowed; }
.chat-input::placeholder { color: var(--fg-muted); }

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
    user-select: none;
}
.send-mode-toggle input[type="checkbox"] { display: none; }
.toggle-label {
    font-size: 10px;
    color: var(--fg-muted);
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    cursor: pointer;
    transition: all .15s;
}
.send-mode-toggle input:checked + .toggle-label {
    color: var(--accent);
    border-color: var(--accent);
}
.send-btn {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent);
    border: none; border-radius: 6px;
    color: #fff; cursor: pointer;
    transition: filter .15s, opacity .15s;
    flex-shrink: 0;
}
.send-btn:hover:not(:disabled) { filter: brightness(1.1); }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }
.send-btn svg { width: 14px; height: 14px; }
.closed-banner {
    font-size: 11px; color: #e05555;
    text-align: center; padding: 4px 0 2px;
}

/* ── Loading overlay ──────────────────────────────────────────────────────── */
.loading-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 100;
}
.spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Invite panel ─────────────────────────────────────────────────────────── */
.invite-panel {
    position: absolute; top: 44px; left: 0; right: 0; z-index: 50;
    background: var(--bg-2); border-bottom: 1px solid var(--border);
    padding: 12px 14px; box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.invite-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; font-size: 12px; color: var(--fg-dim);
}
.invite-close {
    background: transparent; border: none; color: var(--fg-muted);
    cursor: pointer; font-size: 13px; padding: 2px 4px; line-height: 1;
}
.invite-close:hover { color: var(--fg); }
.invite-body { display: flex; flex-direction: column; gap: 8px; }
.invite-label { font-size: 11px; color: var(--fg-dim); }
.invite-expiry-row { display: flex; align-items: center; gap: 10px; }
.expiry-options { display: flex; gap: 4px; }
.expiry-btn {
    background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px;
    color: var(--fg-dim); font-family: var(--font); font-size: 11px;
    padding: 3px 8px; cursor: pointer; transition: all .15s;
}
.expiry-btn.active  { border-color: var(--accent); color: var(--accent); }
.expiry-btn:hover:not(.active) { color: var(--fg); }
.full-width { width: 100%; justify-content: center; }
.token-display { display: flex; gap: 8px; align-items: flex-start; }
.token-text {
    flex: 1; font-size: 10px; color: var(--fg-dim); font-family: var(--font);
    background: var(--bg-3); border: 1px solid var(--border); border-radius: 5px;
    padding: 6px 8px; word-break: break-all; line-height: 1.5;
    max-height: 60px; overflow-y: auto;
}
.invite-error { font-size: 11px; color: #e05555; margin: 0; }
.invite-note  { font-size: 10px; color: var(--fg-muted); margin: 0; line-height: 1.4; }

/* ── Join modal ───────────────────────────────────────────────────────────── */
.modal-backdrop {
    position: absolute; inset: 0; background: rgba(0,0,0,.6);
    display: flex; align-items: center; justify-content: center; z-index: 300;
}
.modal {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: var(--radius); width: 320px;
    box-shadow: 0 12px 40px rgba(0,0,0,.6);
}
.modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-bottom: 1px solid var(--border);
    font-size: 13px; font-weight: 600;
}
.modal-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.modal-sub  { font-size: 12px; color: var(--fg-dim); margin: 0; }
.token-input {
    width: 100%; background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 6px; color: var(--fg); font-family: var(--font); font-size: 11px;
    padding: 8px 10px; resize: none; outline: none; transition: border-color .15s;
    box-sizing: border-box; line-height: 1.5;
}
.token-input:focus { border-color: var(--accent); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* ── Transitions ──────────────────────────────────────────────────────────── */
.dropdown-enter-active, .dropdown-leave-active { transition: opacity .15s, transform .15s; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
.slide-down-enter-active, .slide-down-leave-active { transition: opacity .15s, transform .15s; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-8px); }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>