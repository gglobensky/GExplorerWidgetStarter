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

        <!-- ── First-run name prompt ──────────────────────────────────── -->
        <Transition name="slide-down">
            <div v-if="showNamePrompt && !props.editMode" class="name-prompt-panel">
                <div class="name-prompt-body">
                    <span class="name-prompt-label">Choose a display name for GExchange</span>
                    <div class="name-prompt-row">
                        <input
                            ref="namePromptInputRef"
                            v-model="namePromptValue"
                            class="name-prompt-input"
                            placeholder="Your name…"
                            maxlength="32"
                            @keydown.enter="commitNamePrompt"
                            @keydown.escape="dismissNamePrompt"
                        />
                        <button
                            class="pill-btn primary"
                            :disabled="!namePromptValue.trim()"
                            @click="commitNamePrompt"
                        >Set name</button>
                        <button class="pill-btn" @click="dismissNamePrompt">Skip</button>
                    </div>
                    <p class="name-prompt-note">
                        This is shown to other members. You can change it any time from the sidebar.
                    </p>
                    <p v-if="namePromptError" class="invite-error">{{ namePromptError }}</p>
                </div>
            </div>
        </Transition>

        <!-- ── Disambiguator prompt ───────────────────────────────────── -->
        <Transition name="slide-down">
            <div v-if="showDisambigPrompt && !props.editMode" class="name-prompt-panel">
                <div class="name-prompt-body">
                    <span class="name-prompt-label">
                        Someone in this room is also called <strong>{{ identity?.username }}</strong>.
                        Add a distinguisher?
                    </span>
                    <div class="disambig-options">
                        <button
                            v-for="opt in disambigOptions"
                            :key="opt.id"
                            class="disambig-btn"
                            :class="{ active: disambigChoice === opt.id }"
                            @click="selectDisambigOption(opt.id)"
                        >
                            <span class="disambig-preview">{{ previewDisambig(opt.id) }}</span>
                            <span class="disambig-label">{{ opt.label }}</span>
                        </button>
                    </div>
                    <div class="disambig-actions">
                        <button
                            v-if="disambigChoice"
                            class="pill-btn"
                            @click="regenerateDisambig"
                            v-gex-tooltip="'Generate a different one'"
                        >↺ Try another</button>
                        <button
                            class="pill-btn primary"
                            :disabled="!disambigChoice"
                            @click="commitDisambig"
                        >Use this</button>
                        <button class="pill-btn" @click="showDisambigPrompt = false">Not now</button>
                    </div>
                </div>
            </div>
        </Transition>

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
                            <span class="user-name">{{ identity?.username ?? 'You' }}</span>
                            <span class="you-tag">you</span>
                            <button
                                class="name-edit-btn"
                                v-gex-tooltip="'Change your name'"
                                @click="openNameEditor"
                            >
                                <svg viewBox="0 0 14 14" fill="none">
                                    <path d="M2 10.5L9.5 3l1.5 1.5-7.5 7.5H2v-1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                                </svg>
                            </button>
                        </li>
                        <li v-for="peerId in activePeerIds" :key="peerId" class="user-row">
                            <span class="dot online"/>
                            {{ peerNames[peerId] ?? peerId }}
                        </li>
                    </ul>

                    <Transition name="fade">
                        <div v-if="showNameEditor" class="name-editor">
                            <input
                                ref="nameEditorInputRef"
                                v-model="nameEditorValue"
                                class="name-prompt-input"
                                placeholder="New display name…"
                                maxlength="32"
                                @keydown.enter="commitNameEdit"
                                @keydown.escape="showNameEditor = false"
                            />
                            <p v-if="nameEditorError" class="invite-error">{{ nameEditorError }}</p>
                            <div class="name-editor-actions">
                                <button
                                    class="pill-btn primary"
                                    :disabled="!nameEditorValue.trim() || nameEditorSaving"
                                    @click="commitNameEdit"
                                >{{ nameEditorSaving ? 'Saving…' : 'Save' }}</button>
                                <button class="pill-btn" @click="showNameEditor = false">Cancel</button>
                            </div>
                        </div>
                    </Transition>
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
import { ref, computed, shallowRef, watch, onMounted, onUnmounted, inject } from 'vue'
import type { MeshPeer, UseChannelReturn, WidgetSdk } from 'gexplorer/widgets'

import { useIdentity } from './useIdentity'
import { useRooms }    from './useRooms'
import { useChat }     from './useChat'
import type { Room }   from './useRooms'

// ── Props ──────────────────────────────────────────────────────────────────────

const props = defineProps<{
    widgetDef?: any
    config?: any
    theme?: Record<string, string>
    context?: 'grid' | 'sidebar' | 'embedded' | 'dialog'
    width?: number
    height?: number
    showNav?: boolean
    gridSize?: { cols: number; rows: number }
    actions?: any
    sourceId?: string
    editMode?: boolean
    variant?: string
    resizePhase?: 'active' | 'idle'
    resizing?: boolean
    virtualFolder?: string
    gridPosition?: number
}>()

// ── SDK ────────────────────────────────────────────────────────────────────────

const sdk = inject<WidgetSdk>('widgetSdk')
const { createEdhtSession, useChannel } = sdk ?? {}
// ── DOM refs ───────────────────────────────────────────────────────────────────

const feedRef            = ref<HTMLElement | null>(null)
const inputRef           = ref<HTMLTextAreaElement | null>(null)
const pickerRef          = ref<HTMLElement | null>(null)
const searchInputRef     = ref<HTMLInputElement | null>(null)
const newRoomInputRef    = ref<HTMLInputElement | null>(null)
const namePromptInputRef = ref<HTMLInputElement | null>(null)
const nameEditorInputRef = ref<HTMLInputElement | null>(null)

// ── Board (plugin extension point) ────────────────────────────────────────────
// loadedComponent is populated when the board tab is activated.
// Kept as a stub here — the board plugin system wires it externally.

const showBoard        = ref(false)
const loadedComponent  = shallowRef<any>(null)

// ── Channel instances ──────────────────────────────────────────────────────────
//
// One ChannelSession per room.  The session owns EDHT, mesh strategy,
// chat bind/unbind, chatSessionId, peer tracking, and discovery-loop reconnect.
// ChatRoom.vue never touches chatSessionId — it calls channel.sendMessage().
//
// LIFECYCLE NOTE: useChannel's onUnmounted is NOT called internally because
// ensureChannel runs from async context after mount, when Vue's component
// instance is no longer active. Disposal is explicit via _disposeAllChannels().

const channels = new Map<string, UseChannelReturn>()
const channelsPending = new Set<string>()

// ── Sidebar ────────────────────────────────────────────────────────────────────

const showSidebar = ref(true)
function toggleSidebar() { showSidebar.value = !showSidebar.value }

// ── Identity ───────────────────────────────────────────────────────────────────

const identity$ = useIdentity({
    sdk,
    namePromptInputRef,
    nameEditorInputRef,
    onNameChanged: async () => {
        const id = {
            userId:    identity$.identity.value?.userId    ?? '',
            username:  (identity$.resolvedUsername.value   || identity$.identity.value?.userId) ?? 'Unknown',
            publicKey: identity$.identity.value?.publicKey ?? '',
            endpoint:  identity$.identity.value?.endpoint  ?? '',
        }
        for (const channel of channels.values())
            await channel.reannounce(id)
    },
})

const {
    identity,
    resolvedUsername,
    showNamePrompt,
    namePromptValue,
    namePromptError,
    commitNamePrompt,
    dismissNamePrompt,
    showNameEditor,
    nameEditorValue,
    nameEditorSaving,
    nameEditorError,
    openNameEditor,
    commitNameEdit,
    showDisambigPrompt,
    disambigChoice,
    disambigOptions,
    previewDisambig,
    selectDisambigOption,
    regenerateDisambig,
    commitDisambig,
} = identity$

// ── Rooms ──────────────────────────────────────────────────────────────────────

const rooms$ = useRooms({
    sdk,
    identity,
    searchInputRef,
    newRoomInputRef,
    onRoomSelected: (room) => ensureChannel(room),
})

const {
    rooms,
    activeRoom,
    loading,
    vaultToken,   // exposed for file-sharing / VFS layer
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
} = rooms$

// ── Chat ───────────────────────────────────────────────────────────────────────

const chat$ = useChat({
    sdk,
    feedRef,
    inputRef,
    getChannel:    () => activeRoom.value ? channels.get(activeRoom.value.roomId) : undefined,
    getScopeId:    () => activeRoom.value?.roomId,
    getSenderId:   () => identity.value?.userId,
    getSenderName: () => (resolvedUsername.value || identity.value?.userId) ?? 'You',
})

const {
    messages,
    draftText,
    sending,
    chatLoading,
    shiftToSend,
    sendMessage,
    loadHistory,
    clearMessages,
    onInputKeydown,
    autoResizeInput,
    shouldShowSender,
    shouldShowDateSep,
    formatTime,
    formatDate,
} = chat$

// ── Peer presence ──────────────────────────────────────────────────────────────

const activePeerIds = computed(() => {
    if (!activeRoom.value) return []
    const ch = channels.get(activeRoom.value.roomId)
    if (!ch) return []
    return [...ch.peers.value.keys()].filter(id => id !== identity.value?.userId)
})

const peerNames = computed<Record<string, string>>(() => {
    const result: Record<string, string> = {}
    for (const ch of channels.values())
        for (const [userId, username] of ch.peers.value)
            result[userId] = username
    return result
})

// ── Channel management ─────────────────────────────────────────────────────────

const MAX_PEERS = 0   // 0 or -1 = no limit

function buildCanConnect(room: Room) {
    return async (peer: MeshPeer): Promise<boolean> => {
        if (MAX_PEERS > 0) {
            const ch = channels.get(room.roomId)
            if (ch && ch.peers.value.size >= MAX_PEERS) return false
        }
        // TODO: ban list by peer.userId
        // TODO: pending-approval prompt for owner/admin
        return true
    }
}

async function ensureChannel(room: Room) {
    console.log('[GExchange] ensureChannel check —',
        'sessionSecret:', !!room.sessionSecret,
        'useChannel:', !!useChannel,
        'createEdhtSession:', !!createEdhtSession,
        'sdk.useChannel:', !!(sdk?.useChannel),    // ← add this
    )
    if (channels.has(room.roomId)) return
    if (channelsPending.has(room.roomId)) return
    if (!room.sessionSecret || !useChannel || !createEdhtSession) {
        console.warn('[GExchange] ensureChannel: missing sessionSecret, useChannel, or createEdhtSession')
        return
    }

    channelsPending.add(room.roomId)

    try {
        const channel = useChannel({
            scopeId:    room.roomId,
            identity: {
                userId:    identity.value?.userId    ?? '',
                username:  (resolvedUsername.value   || identity.value?.userId) ?? 'Unknown',
                publicKey: identity.value?.publicKey ?? '',
                endpoint:  identity.value?.endpoint  ?? '',
            },
            sdk,
            isHub:      room.isOwner,
            strategy:   'full',
            canConnect: buildCanConnect(room),
            // Client path only — cleared from vault after first successful connection
            bootstrapEndpoint:  room.bootstrapEndpoint,
            bootstrapPublicKey: room.bootstrapPublicKey,

            onPeerJoined: (peer: MeshPeer) => {
                if (
                    peer.userId   !== identity.value?.userId &&
                    peer.username &&
                    resolvedUsername.value &&
                    peer.username === resolvedUsername.value &&
                    !showDisambigPrompt.value
                ) {
                    showDisambigPrompt.value = true
                }
            },

            onPeerLeft: (_peer: MeshPeer) => { /* handled reactively via channel.peers */ },
        })

        // Register before awaiting EDHT so racing ensureChannel calls see it
        channels.set(room.roomId, channel)

        const secret = Uint8Array.from(atob(room.sessionSecret), c => c.charCodeAt(0))
        const edht   = await createEdhtSession({ sessionSecret: secret, scopeId: room.roomId })

        await edht.announce(_buildEdhtPayload())
        channel.wireEdht(edht)

        // Bootstrap: dial owner directly to seed the Kademlia routing table.
        // Only fires on the client path when bootstrapEndpoint is set.
        // On success, clear the one-time fields from vault.
        const bootstrapped = await channel.bootstrap()
        if (bootstrapped) {
            rooms$.clearBootstrap(room.roomId)
        }

        await edht.discover()

        channelsPending.delete(room.roomId)
        console.log(`[GExchange] Channel ready — room ${room.roomId.slice(0, 8)}…`)
    } catch (err) {
        channels.delete(room.roomId)
        channelsPending.delete(room.roomId)
        console.warn('[GExchange] Failed to start channel:', err)
    }
}

async function _disposeAllChannels() {
    for (const channel of channels.values())
        await channel.dispose()
    channels.clear()
    channelsPending.clear()
}

function _buildEdhtPayload(): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({
        endpoint:  identity.value?.endpoint  ?? '',
        publicKey: identity.value?.publicKey ?? '',
        userId:    identity.value?.userId    ?? '',
        username:  (resolvedUsername.value   || identity.value?.userId) ?? '',
    }))
}

// ── Picker outside-click ───────────────────────────────────────────────────────

function onDocClick(e: MouseEvent) {
    if (pickerRef.value && !pickerRef.value.contains(e.target as Node))
        closePicker()
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
console.log('Full sdk : ', sdk);
    document.addEventListener('mousedown', onDocClick)
    await identity$.load()
    await rooms$.load()

    const first = rooms.value[0]
    if (first) selectRoom(first)

    for (let i = 1; i < rooms.value.length; i++) {
        const room = rooms.value[i]
        setTimeout(() => ensureChannel(room), i * 200)
    }

    chat$.mount()
})

onUnmounted(async () => {
    document.removeEventListener('mousedown', onDocClick)
    chat$.unmount()
    await _disposeAllChannels()
    await rooms$.dispose()
})

// ── Watch active room ──────────────────────────────────────────────────────────
//
// selectRoom → onRoomSelected → ensureChannel already called.
// ensureChannel is idempotent — channels.has() guard makes second call a no-op.

watch(activeRoom, async (room) => {
    clearMessages()
    if (!room) return
    await ensureChannel(room)
    await loadHistory(room.roomId)
})
</script>

<style scoped>
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
.gex-root.no-room { grid-template-rows: 44px auto 1fr; }
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
.room-picker  { position: relative; min-width: 0; }
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
.chevron { width: 10px; height: 6px; color: var(--fg-dim); flex-shrink: 0; transition: transform .2s; }
.room-picker.open .chevron { transform: rotate(180deg); }
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
.dropdown-top { flex-shrink: 0; }
.search-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
}
.search-icon { width: 14px; height: 14px; color: var(--fg-muted); flex-shrink: 0; }
.room-search { flex: 1; background: transparent; border: none; outline: none; color: var(--fg); font-family: var(--font); font-size: 12px; }
.room-search::placeholder { color: var(--fg-muted); }
.dropdown-actions { display: flex; gap: 4px; padding: 6px 8px; }
.action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--fg-dim);
    cursor: pointer;
    font-family: var(--font);
    font-size: 11px;
    padding: 4px 8px;
    flex: 1;
    justify-content: center;
    transition: color .15s, border-color .15s;
}
.action-btn svg { width: 12px; height: 12px; flex-shrink: 0; }
.action-btn:hover { color: var(--fg); border-color: var(--accent); }
.dropdown-sep { height: 1px; background: var(--border); }
.room-list-scroll { overflow-y: auto; max-height: 220px; }
.room-empty { padding: 16px 12px; font-size: 12px; color: var(--fg-muted); text-align: center; }
.room-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    cursor: pointer;
    border-radius: 4px;
    margin: 2px 4px;
    transition: background .1s;
}
.room-row:hover  { background: var(--bg-3); }
.room-row.active { background: var(--accent-dim); }
.row-hash   { color: var(--accent); font-weight: 700; flex-shrink: 0; }
.row-name   { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.row-id     { font-size: 10px; color: var(--fg-muted); flex-shrink: 0; }
.row-closed { font-size: 10px; color: #e05555; flex-shrink: 0; }
.row-rename { background: transparent; border: none; color: var(--fg-muted); cursor: pointer; padding: 2px; opacity: 0; transition: opacity .1s; }
.row-rename svg { width: 12px; height: 12px; }
.room-row:hover .row-rename { opacity: 1; }
.row-rename:hover { color: var(--fg); }
.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--fg-dim);
    cursor: pointer;
    transition: color .15s, background .15s, border-color .15s;
    flex-shrink: 0;
}
.icon-btn svg { width: 16px; height: 16px; }
.icon-btn:hover { color: var(--fg); background: var(--bg-3); border-color: var(--border); }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 24px; text-align: center; }
.empty-glyph { font-size: 40px; color: var(--fg-muted); font-weight: 700; line-height: 1; }
.empty-title { font-size: 14px; font-weight: 600; margin: 0; }
.empty-sub   { font-size: 12px; color: var(--fg-dim); margin: 0; }
.empty-actions { display: flex; gap: 8px; }
.inline-create { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.new-room-input {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font-family: var(--font);
    font-size: 12px;
    padding: 6px 10px;
    outline: none;
    transition: border-color .15s;
}
.new-room-input:focus { border-color: var(--accent); }
.create-error { font-size: 11px; color: #e05555; margin: 0; }
.pill-btn {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg-dim);
    cursor: pointer;
    font-family: var(--font);
    font-size: 12px;
    padding: 5px 12px;
    transition: color .15s, border-color .15s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.pill-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--accent); }
.pill-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.pill-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
.pill-btn:disabled { opacity: .4; cursor: not-allowed; }
.chat-body { display: flex; min-height: 0; overflow: hidden; }
.chat-feed { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
.message { display: flex; flex-direction: column; gap: 2px; padding: 1px 0; }
.message.mine   { align-items: flex-end; }
.message.theirs { align-items: flex-start; }
.system-msg     { align-items: center; padding: 6px 0; }
.msg-sender { font-size: 10px; color: var(--fg-muted); padding: 0 4px; margin-bottom: 1px; }
.msg-sender.sender-you { color: var(--accent); }
.msg-bubble {
    display: inline-flex;
    align-items: flex-end;
    gap: 6px;
    max-width: 72%;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 6px 10px;
}
.mine .msg-bubble { background: var(--accent-dim); border-color: rgba(91,142,240,.25); flex-direction: row-reverse; }
.system-msg .msg-bubble { background: transparent; border: none; font-size: 11px; color: var(--fg-muted); padding: 0; }
.msg-text { font-size: 13px; line-height: 1.45; }
.msg-time { font-size: 10px; color: var(--fg-muted); flex-shrink: 0; margin-bottom: 1px; }
.muted    { color: var(--fg-muted); }
.date-sep { display: flex; align-items: center; justify-content: center; padding: 8px 0 4px; }
.date-sep span { font-size: 10px; color: var(--fg-muted); background: var(--bg); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border); }
.chat-sidebar {
    width: 180px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    background: var(--bg-2);
    overflow-y: auto;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.sidebar-section h4 { font-size: 10px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .06em; margin: 0 0 8px; }
.user-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.user-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fg-dim); min-width: 0; }
.user-row.self { color: var(--fg); }
.user-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--fg-muted); }
.dot.online { background: #4caf50; }
.you-tag { font-size: 9px; color: var(--accent); background: var(--accent-dim); border-radius: 3px; padding: 1px 4px; flex-shrink: 0; }
.name-edit-btn { background: transparent; border: none; color: var(--fg-muted); cursor: pointer; padding: 2px; opacity: 0; transition: opacity .1s; flex-shrink: 0; }
.name-edit-btn svg { width: 11px; height: 11px; }
.user-row.self:hover .name-edit-btn { opacity: 1; }
.name-edit-btn:hover { color: var(--fg); }
.name-editor { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--border); }
.name-editor-actions { display: flex; gap: 4px; }
.room-meta  { display: flex; flex-direction: column; gap: 6px; }
.meta-row   { display: flex; flex-direction: column; gap: 1px; }
.meta-label { font-size: 10px; color: var(--fg-muted); }
.meta-value { font-size: 11px; color: var(--fg-dim); }
.mono       { font-family: monospace; }
.chat-footer { border-top: 1px solid var(--border); background: var(--bg-2); display: flex; flex-direction: column; }
.plugin-tabs { display: flex; gap: 2px; padding: 4px 8px 0; border-bottom: 1px solid var(--border); }
.tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-muted);
    cursor: pointer;
    font-family: var(--font);
    font-size: 11px;
    padding: 4px 8px 5px;
    transition: color .15s, border-color .15s;
    margin-bottom: -1px;
}
.tab-btn.active { color: var(--fg); border-bottom-color: var(--accent); }
.tab-btn:hover:not(.active) { color: var(--fg-dim); }
.plugin-canvas { padding: 8px; }
.input-area { display: flex; flex-direction: column; gap: 4px; }
.chat-input {
    width: 100%;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
    line-height: 1.45;
    outline: none;
    padding: 7px 10px;
    resize: none;
    transition: border-color .15s;
    box-sizing: border-box;
}
.chat-input:focus { border-color: var(--accent); }
.chat-input:disabled { opacity: .5; cursor: not-allowed; }
.chat-input::placeholder { color: var(--fg-muted); }
.input-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.send-mode-toggle { display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; color: var(--fg-muted); }
.send-mode-toggle input { accent-color: var(--accent); }
.toggle-label { user-select: none; }
.send-btn { background: var(--accent); border: none; border-radius: 6px; color: #fff; cursor: pointer; padding: 6px 8px; display: flex; align-items: center; transition: filter .15s; }
.send-btn svg { width: 14px; height: 14px; }
.send-btn:hover:not(:disabled) { filter: brightness(1.15); }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }
.closed-banner { font-size: 11px; color: #e05555; text-align: center; padding: 4px 0 2px; }
.loading-state { font-size: 12px; color: var(--fg-muted); padding: 12px 0; text-align: center; }
.name-prompt-panel {
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
.name-prompt-body  { display: flex; flex-direction: column; gap: 8px; }
.name-prompt-label { font-size: 12px; color: var(--fg-dim); }
.name-prompt-row   { display: flex; gap: 6px; align-items: center; }
.name-prompt-input { flex: 1; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: var(--font); font-size: 12px; padding: 6px 10px; outline: none; transition: border-color .15s; }
.name-prompt-input:focus { border-color: var(--accent); }
.name-prompt-note { font-size: 10px; color: var(--fg-muted); margin: 0; line-height: 1.4; }
.disambig-options { display: flex; flex-direction: column; gap: 4px; }
.disambig-btn { display: flex; align-items: center; gap: 10px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; color: var(--fg-dim); cursor: pointer; font-family: var(--font); padding: 7px 10px; text-align: left; transition: border-color .15s, color .15s; }
.disambig-btn:hover  { border-color: var(--accent); color: var(--fg); }
.disambig-btn.active { border-color: var(--accent); background: var(--accent-dim); color: var(--fg); }
.disambig-preview { font-size: 13px; font-weight: 600; min-width: 90px; color: var(--accent); }
.disambig-label   { font-size: 11px; color: inherit; }
.disambig-actions { display: flex; gap: 6px; align-items: center; }
.invite-panel { position: absolute; top: 44px; left: 0; right: 0; z-index: 50; background: var(--bg-2); border-bottom: 1px solid var(--border); padding: 12px 14px; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
.invite-panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: var(--fg-dim); }
.invite-close { background: transparent; border: none; color: var(--fg-muted); cursor: pointer; font-size: 13px; padding: 2px 4px; line-height: 1; }
.invite-close:hover { color: var(--fg); }
.invite-body  { display: flex; flex-direction: column; gap: 8px; }
.invite-label { font-size: 11px; color: var(--fg-dim); }
.invite-expiry-row { display: flex; align-items: center; gap: 10px; }
.expiry-options { display: flex; gap: 4px; }
.expiry-btn { background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px; color: var(--fg-dim); font-family: var(--font); font-size: 11px; padding: 3px 8px; cursor: pointer; transition: all .15s; }
.expiry-btn.active { border-color: var(--accent); color: var(--accent); }
.expiry-btn:hover:not(.active) { color: var(--fg); }
.full-width { width: 100%; justify-content: center; }
.token-display { display: flex; gap: 8px; align-items: flex-start; }
.token-text { flex: 1; font-size: 10px; color: var(--fg-dim); background: var(--bg-3); border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px; word-break: break-all; line-height: 1.5; max-height: 60px; overflow-y: auto; }
.invite-error { font-size: 11px; color: #e05555; margin: 0; }
.invite-note  { font-size: 10px; color: var(--fg-muted); margin: 0; line-height: 1.4; }
.modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 300; }
.modal { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); width: 320px; box-shadow: 0 12px 40px rgba(0,0,0,.6); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600; }
.modal-body    { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.modal-sub     { font-size: 12px; color: var(--fg-dim); margin: 0; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.token-input { width: 100%; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: var(--font); font-size: 11px; padding: 8px 10px; resize: none; outline: none; transition: border-color .15s; box-sizing: border-box; line-height: 1.5; }
.token-input:focus { border-color: var(--accent); }
.loading-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.dropdown-enter-active, .dropdown-leave-active { transition: opacity .15s, transform .15s; }
.dropdown-enter-from,   .dropdown-leave-to     { opacity: 0; transform: translateY(-6px); }
.slide-down-enter-active, .slide-down-leave-active { transition: opacity .15s, transform .15s; }
.slide-down-enter-from,   .slide-down-leave-to     { opacity: 0; transform: translateY(-8px); }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from,   .fade-leave-to     { opacity: 0; }
</style>