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
            
                <!-- ── Participants ──────────────────────────────────────────── -->
                <div class="sidebar-section">
                    <div class="sidebar-participants-header">
                        <h4>
                            Participants
                            <span class="peer-count" v-if="activePeerIds.length > 0">
                                {{ activePeerIds.length }}
                            </span>
                        </h4>
                        <div class="sidebar-header-actions">
                            <!-- Group call — calls everyone in the room, no new room -->
                            <button
                                class="sidebar-action-btn"
                                :class="{ active: activeChannel?.callActive?.value }"
                                :disabled="activePeerIds.length === 0"
                                @click="toggleGroupCall"
                                v-gex-tooltip="activeChannel?.callActive?.value ? 'End call' : 'Start group call'"
                            >
                                <svg viewBox="0 0 16 16" fill="none">
                                    <path d="M3 3c0 0 1-1 2 0l2 2c1 1 0 2 0 2s-1 1 0 2l2 2c1 1 2 0 2 0s1-1 2 0l1 1c1 1 0 3-1 3C5 16 0 11 0 4 0 3 2 2 3 3z"
                                        stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                                    <path v-if="activeChannel?.callActive?.value"
                                        d="M10 2l4 4M14 2l-4 4"
                                        stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                            </button>
                            <!-- Selection hint — shows when peers are selected -->
                            <span
                                class="selection-hint"
                                v-if="selectedPeerIds.size > 0"
                            >{{ selectedPeerIds.size }} selected</span>
                        </div>
                    </div>
            
                    <ul class="user-list" @keydown="onPeerListKeydown">
            
                        <!-- Self row — always first, never selectable -->
                        <li class="user-row self">
                            <span class="dot" :class="{ online: true, speaking: false }"/>
                            <span class="user-name">{{ identity?.username ?? 'You' }}</span>
                            <span class="you-tag">you</span>
                            <button
                                class="name-edit-btn"
                                v-gex-tooltip="'Change your name'"
                                @click="openNameEditor"
                            >
                                <svg viewBox="0 0 14 14" fill="none">
                                    <path d="M2 10.5L9.5 3l1.5 1.5-7.5 7.5H2v-1.5z"
                                        stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                                </svg>
                            </button>
                        </li>
            
                        <!-- Peer rows — selectable, with action buttons -->
                        <li
                            v-for="peerId in activePeerIds"
                            :key="peerId"
                            class="user-row peer"
                            :class="{
                                selected: selectedPeerIds.has(peerId),
                                speaking: activeChannel?.activePeers?.value?.get(peerId)?.speaking,
                            }"
                            @mousedown="onPeerMouseDown(peerId, $event)"
                            @mouseup="onPeerMouseUp(peerId)"
                        >
                            <span class="dot" :class="{
                                online: true,
                                speaking: activeChannel?.activePeers?.value?.get(peerId)?.speaking,
                            }"/>
                            <span class="user-name">{{ peerNames[peerId] ?? peerId.slice(0, 8) }}</span>
            
                            <!-- Per-peer actions — visible on hover or when selected -->
                            <div class="peer-actions">
                                <!-- Private call → creates a room then calls -->
                                <button
                                    class="peer-action-btn"
                                    v-gex-tooltip="'Private call'"
                                    @click.stop="createPrivateRoomWith(
                                        selectedPeerIds.has(peerId) && selectedPeerIds.size > 1
                                            ? [...selectedPeerIds]
                                            : [peerId],
                                        true
                                    )"
                                >
                                    <svg viewBox="0 0 16 16" fill="none">
                                        <path d="M3 3c0 0 1-1 2 0l2 2c1 1 0 2 0 2s-1 1 0 2l2 2c1 1 2 0 2 0s1-1 2 0l1 1c1 1 0 3-1 3C5 16 0 11 0 4 0 3 2 2 3 3z"
                                            stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                                <!-- Private chat → creates a room without calling -->
                                <button
                                    class="peer-action-btn"
                                    v-gex-tooltip="selectedPeerIds.has(peerId) && selectedPeerIds.size > 1
                                        ? `Private room with ${selectedPeerIds.size} people`
                                        : 'Private room'"
                                    @click.stop="createPrivateRoomWith(
                                        selectedPeerIds.has(peerId) && selectedPeerIds.size > 1
                                            ? [...selectedPeerIds]
                                            : [peerId],
                                        false
                                    )"
                                >
                                    <svg viewBox="0 0 16 16" fill="none">
                                        <rect x="1" y="2" width="14" height="10" rx="2"
                                            stroke="currentColor" stroke-width="1.3"/>
                                        <path d="M4 12l2 3" stroke="currentColor" stroke-width="1.3"
                                            stroke-linecap="round"/>
                                        <path d="M4 6h8M4 9h5"
                                            stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                                    </svg>
                                </button>
                            </div>
                        </li>
                    </ul> 

                    <!-- Creating private room indicator -->
                    <div v-if="creatingPrivateRoom" class="creating-indicator">
                        <span class="spinner-small"/>
                        Creating room…
                    </div>
                                
                    <!-- Name editor (unchanged) -->
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
            
                <!-- ── Room meta (unchanged) ─────────────────────────────────── -->
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
                <button
                    @click="showBoard = false"
                    :class="{ active: !showBoard }"
                    class="tab-btn"
                >💬 Chat</button>
                <button
                    v-for="p in boardProviders"
                    :key="p.key"
                    @click="showBoard = true; activeBoardKey = p.key"
                    :class="{ active: showBoard && activeBoardKey === p.key }"
                    class="tab-btn"
                >{{ p.props?.label ?? '🛠️ Board' }}</button>
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
               <template v-else-if="showBoard && activeBoard">
                   <component :is="activeBoard.component" v-bind="activeBoard.props" />
               </template>
               <div v-else-if="showBoard" class="loading-state">
                   No boards available
               </div>
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
        
        <!-- ── Call modal ──────────────────────────────────────────────── -->
        <IncomingCallModal
            :incomingCall="incomingCall"
            :outgoingCall="outgoingCall"
            :callAnswered="callAnswered"
            @accept="acceptCall"
            @decline="declineCall"
            @cancel="stopRinging"
        />

        <!-- ── Loading overlay ────────────────────────────────────────── -->
        <div v-if="loading" class="loading-overlay">
            <div class="spinner"/>
        </div>
    </div>
</template>
<script setup lang="ts">
import { ref, computed, shallowRef, watch, onMounted, onUnmounted, inject, provide, type ComputedRef  } from 'vue'
import type { MeshPeer, UseChannelReturn, WidgetSdk, ChatMessage } from 'gexplorer/widgets'

import { useIdentity } from './useIdentity'
import { useRooms }    from './useRooms'
import { useChat }     from './useChat'
import type { Room }   from './useRooms'
import type { EdhtSession } from 'gexplorer/widgets'
import { useSlotProviders } from 'gexplorer/widgets'
import { createSelectionEngine } from 'gexplorer/widgets'
import type { SelectionEngine } from 'gexplorer/widgets'
import { useCallState } from './useCallState'
import IncomingCallModal from './IncomingCallModal.vue'
import { useAudioChain } from './useAudioChain'
import type { UseAudioChainReturn } from './useAudioChain'

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

// ── Board ──────────────────────────────────────────────────────────────────────
const showBoard    = ref(false)
const boardProviders = useSlotProviders('gexchange.board')

// Active board — the currently selected provider from the tab bar.
// Defaults to the first provider when providers become available.
const activeBoardKey = ref<string | null>(null)

watch(boardProviders, (providers) => {
    if (providers.length > 0 && !activeBoardKey.value)
        activeBoardKey.value = providers[0].key
}, { immediate: true })

const activeBoard = computed(() =>
    boardProviders.value.find(p => p.key === activeBoardKey.value) ?? null
)

// ── Audio chain ────────────────────────────────────────────────────────────────
//
// Owns the mic stream and full effect chain for the lifetime of the component.
// VoicePanel injects this — it never owns audio directly.

const audioChain = useAudioChain(sdk)
provide('gex:audioChain', audioChain)

// ── Channel + EDHT instances ───────────────────────────────────────────────────
//
// Two maps, one responsibility each:
//
//   edhtSessions  — EDHT sessions created by announceRoom().
//                   Owner rooms are announced on mount before any channel setup.
//                   When ensureChannel runs, it reuses the existing session so
//                   we don't double-create or lose the already-stored blobs.
//                   Entries are removed when a channel takes ownership (wireEdht).
//                   Remaining entries (announced but never activated) are disposed
//                   on unmount.
//
//   channels      — Full UseChannelReturn instances (mesh + chatBind + edht).
//                   Present for every room that has had ensureChannel run.

const edhtSessions  = new Map<string, EdhtSession>()
const channels      = new Map<string, UseChannelReturn>()
const channelsPending = new Set<string>()

provide('gex:activeChannel', computed(() =>
    activeRoom.value ? channels.get(activeRoom.value.roomId) : undefined
))
const activeChannel = computed(() =>
    activeRoom.value ? channels.get(activeRoom.value.roomId) : undefined
)

// Unsub handle for the ambient message listener
let _ambientUnsub: (() => void) | null = null

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
    onRoomSelected: (room) => ensureChannel(room)
})

const {
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
    createNamedRoom
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
    onInviteMessage: (text, senderId, senderName) =>     // ← add this
    handleInviteMessage(text, senderId, senderName),
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

   const callState = useCallState({
       sdk,
       getSelfUserId: () => identity.value?.userId,

       onAccepted: async (token, withCall) => {
           // Parse and join the private room
           joinToken.value = token
           await joinRoom()

           // If it was a voice call, start the call once channel is ready
           if (withCall && activeRoom.value) {
               const startDelay = 1000
               setTimeout(async () => {
                   const channel = channels.get(activeRoom.value!.roomId)
                   if (!channel) return
                   try {
                       const stream = await getAudioStream()
                       await channel.startCall?.(stream)
                   } catch (err) {
                       console.warn('[GExchange] Auto-call on accept failed:', err)
                   }
               }, startDelay)
           }
       },

       onDeclined: (callerId) => {
           // Send decline signal back on the current room channel
           const channel = activeRoom.value
               ? channels.get(activeRoom.value.roomId)
               : null
           channel?.sendMessage(`__decline__|${callerId}`).catch(() => {})
           callState.stopRinging()
       },
   })

   const {
       incomingCall,
       outgoingCall,
       callAnswered,
       handleInviteMessage,
       startRinging,
       stopRinging,
       acceptCall,
       declineCall,
   } = callState

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

// ── Selection engine ────────────────────────────────────────────────────────
 
const selectedPeerIds = ref<Set<string>>(new Set())
let _peerEngine: SelectionEngine | null = null
 
// Initialise / re-initialise when the peer list changes identity
watch(activePeerIds, () => {
    _peerEngine?.destroy()
    _peerEngine = createSelectionEngine(
        { policy: 'windows' },
        { orderedIds: () => activePeerIds.value },
        {
            selectionChanged: (sel) => {
                selectedPeerIds.value = new Set(sel)
            },
        }
    )
}, { immediate: true })
 
// Clear selection when room changes
watch(activeRoom, () => {
    selectedPeerIds.value = new Set()
    _peerEngine?.replaceSelection([], { reason: 'room-change' })
})
 
function onPeerMouseDown(peerId: string, e: MouseEvent) {
    _peerEngine?.rowDownId(peerId, {
        shift: e.shiftKey,
        ctrl:  e.ctrlKey,
        meta:  e.metaKey,
        alt:   e.altKey,
    })
}
 
function onPeerMouseUp(peerId: string) {
    _peerEngine?.rowUpId(peerId)
}
 
function onPeerListKeydown(e: KeyboardEvent) {
    if (!_peerEngine) return
    const action = e.key === 'ArrowUp'   ? 'Up'
                 : e.key === 'ArrowDown'  ? 'Down'
                 : e.key === 'Home'       ? 'Home'
                 : e.key === 'End'        ? 'End'
                 : null
    if (!action) return
    e.preventDefault()
    _peerEngine.kbd(action, {
        shift: e.shiftKey,
        ctrl:  e.ctrlKey,
        meta:  e.metaKey,
        alt:   e.altKey,
    })
}
 
// ── Group call (current room, no new room) ──────────────────────────────────
 
async function toggleGroupCall() {
    const channel = activeChannel.value
    if (!channel) return

    if (channel.callActive?.value) {
        await channel.endCall?.()
        await audioChain.releaseStream()
    } else {
        try {
            const stream = await getAudioStream()
            await channel.startCall?.(stream)
        } catch (err) {
            console.warn('[GExchange] toggleGroupCall: mic access failed:', err)
        }
    }
}
 
// ── Private room creation ───────────────────────────────────────────────────
 
const creatingPrivateRoom = ref(false)
 
async function createPrivateRoomWith(peerIds: string[], withCall: boolean): Promise<void> {
    if (creatingPrivateRoom.value || peerIds.length === 0) return
    creatingPrivateRoom.value = true

    // ── Capture BEFORE createNamedRoom switches activeRoom ────────────
    const originChannel = activeRoom.value
        ? channels.get(activeRoom.value.roomId)
        : null

    try {
        const names    = peerIds.map(id => peerNames.value[id] ?? id.slice(0, 6)).join(', ')
        const myName   = resolvedUsername.value || identity.value?.userId?.slice(0, 6) || 'me'
        const roomName = `${myName}, ${names}`

        const room = await createNamedRoom(roomName)   // switches activeRoom internally
        await ensureChannel(room)

        // Use originChannel — the room B is currently in
        for (const peerId of peerIds) {
            try {
                const result = await sdk?.p2pCreateInvite?.(room.roomId, {
                    sessionSecret:   room.sessionSecret,
                    validityMinutes: 1440,
                })
                if (result && originChannel) {
                    await originChannel.sendMessage(
                        `__invite__|${result.token}|${roomName}|${peerId}${withCall ? '|call' : ''}`
                    )
                }
            } catch (err) {
                console.warn(`[GExchange] Failed to invite ${peerId.slice(0, 8)}…:`, err)
            }
        }

        // Switch caller to new room after invites are sent
        selectRoom(room)

        if (withCall) {
            const ringingNames = peerIds.map(id => peerNames.value[id] ?? id.slice(0, 6))
            startRinging(room.roomId, roomName, ringingNames)

            const RING_TIMEOUT_MS = 40_000

            // Watch for callee joining the private room, then start the call.
            // We capture the channel reference after ensureChannel completed above.
            const targetChannel = channels.get(room.roomId)
            if (targetChannel) {
                let started = false

                const ringTimer = setTimeout(() => {
                    if (!started) stopRinging()   // no answer — cancel
                }, RING_TIMEOUT_MS)

                const unwatch = watch(targetChannel.peers, async (peers) => {
                    if (started || peers.size === 0) return
                    started = true
                    clearTimeout(ringTimer)
                    stopRinging()
                    unwatch()

                    try {
                        const stream = await getAudioStream()
                        await targetChannel.startCall?.(stream)
                    } catch (err) {
                        console.warn('[GExchange] Auto-call on peer join failed:', err)
                    }
                }, { immediate: false })
            }
        }
    } catch (err) {
        console.warn('[GExchange] createPrivateRoomWith failed:', err)
    } finally {
        creatingPrivateRoom.value = false
        selectedPeerIds.value = new Set()
        _peerEngine?.replaceSelection([], { reason: 'action-complete' })
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MAX_PEERS = 0

function _buildEdhtPayload(): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({
        publicKey: identity.value?.publicKey ?? '',
        userId:    identity.value?.userId    ?? '',
        username:  (resolvedUsername.value   || identity.value?.userId) ?? '',
    }))
}

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

// ── Audio stream acquisition ───────────────────────────────────────────────────
//
// Single entry point for mic access. Constraints applied here so every call path
// gets echo cancellation, noise suppression, and AGC regardless of how it starts.
// VoicePanel processed stream integration hooks in here later.

async function getAudioStream(): Promise<MediaStream> {
    const raw = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl:  true,
            sampleRate:       48000,
            channelCount:     1,  
        }
    })
    return audioChain.processStream(raw)
}

// ── Mention detection ──────────────────────────────────────────────────────────
//
// Runs on every message from non-active rooms.
// Three triggers: per-room always-notify config, direct @mention, or a room
// where only one other peer is present (message is always for you).

function _shouldNotify(msg: ChatMessage, room: Room): boolean {
    if (!identity.value) return false

    // Per-room always-on config (future: room.notifyAll)
    // if (room.notifyAll) return true

    // Direct mention by resolved username or userId
    const username = resolvedUsername.value || identity.value.userId
    if (
        msg.text.toLowerCase().includes(`@${username.toLowerCase()}`) ||
        msg.text.includes(`@${identity.value.userId}`)
    ) return true

    // Only one other peer — it's a direct conversation, always notify
    const ch = channels.get(room.roomId)
    if (ch && ch.peers.value.size === 1) return true

    return false
}

// ── Phase 1 — announceRoom ─────────────────────────────────────────────────────
//
// Lightweight: EDHT session + announce only. No TCP, no mesh, no chatBind.
// Called in parallel for all owned rooms on mount so peers can find us
// immediately via EDHT even for rooms we haven't opened yet.
// Idempotent — silently skips if already announced.

async function announceRoom(room: Room): Promise<void> {
    if (edhtSessions.has(room.roomId)) return
    if (!room.sessionSecret || !createEdhtSession) return

    try {
        const secret = Uint8Array.from(atob(room.sessionSecret), c => c.charCodeAt(0))
        const edht   = await createEdhtSession({ sessionSecret: secret, scopeId: room.roomId })
        await edht.announce(_buildEdhtPayload())
        edhtSessions.set(room.roomId, edht)
        console.log(`[GExchange] Announced — room ${room.roomId.slice(0, 8)}…`)
    } catch (err) {
        console.warn(`[GExchange] Failed to announce room ${room.roomId.slice(0, 8)}…:`, err)
    }
}

// ── Phase 2 — ensureChannel ────────────────────────────────────────────────────
//
// Ambient channel setup: mesh strategy + chatBind so messages flow for all
// rooms, enabling mention detection even for rooms that aren't active.
// Reuses the EDHT session from announceRoom() if it exists — avoids
// double-creating a session or losing already-stored presence blobs.
// Does NOT load history — that's activateRoom()'s job.
// Idempotent — safe to call multiple times, channels.has() guard makes it a no-op.

async function ensureChannel(room: Room): Promise<void> {
    if (channels.has(room.roomId)) return
    if (channelsPending.has(room.roomId)) return
    if (!room.sessionSecret || !useChannel || !createEdhtSession) {
        console.warn('[GExchange] ensureChannel: missing sessionSecret, useChannel, or createEdhtSession')
        return
    }

    channelsPending.add(room.roomId)

    try {
        const channel = useChannel({
            scopeId:  room.roomId,
            identity: {
                userId:    identity.value?.userId    ?? '',
                username:  (resolvedUsername.value   || identity.value?.userId) ?? 'Unknown',
                publicKey: identity.value?.publicKey ?? '',
            },
            isHub:      room.isOwner,
            strategy:   'full',
            canConnect: buildCanConnect(room),
            secure: true,
            voice: true,
            redundancy: 0,
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

        // Register before any awaits so racing ensureChannel calls see it
        channels.set(room.roomId, channel)

        // Reuse existing EDHT session from announceRoom() if available.
        // Remove from edhtSessions since the channel now owns it — channel.dispose()
        // will call edht.dispose() internally via wireEdht.
        let edht = edhtSessions.get(room.roomId)
        if (edht) {
            edhtSessions.delete(room.roomId)
            console.log(`[GExchange] Reusing announced EDHT session — room ${room.roomId.slice(0, 8)}…`)
        } else {
            const secret = Uint8Array.from(atob(room.sessionSecret), c => c.charCodeAt(0))
            edht = await createEdhtSession({ sessionSecret: secret, scopeId: room.roomId })
            await edht.announce(_buildEdhtPayload())
        }

        channel.wireEdht(edht)

        // For owner rooms, wait for ChatBridge to register the hub session before
        // announcing. Without this, B can find A via EDHT and connect inbound
        // before the hub is ready — chat:peer:joined never fires and A's peer
        // list stays empty.
        if (room.isOwner) await channel.whenHubReady

        if (!room.isOwner && room.bootstrapPublicKey && room.bootstrapEndpoint) {
            // bootstrapEndpoint now holds the hub's userId (not an IP)
            await channel.connectToPeer(room.bootstrapEndpoint, room.bootstrapPublicKey)
        }
        
        await edht.discover().catch(err =>
            console.warn(`[GExchange] Initial discover failed — will retry via loop`, err)
        )

        channelsPending.delete(room.roomId)
        console.log(`[GExchange] Channel ready (ambient) — room ${room.roomId.slice(0, 8)}…`)
    } catch (err) {
        channels.delete(room.roomId)
        channelsPending.delete(room.roomId)
        console.warn('[GExchange] Failed to start channel:', err)
    }
}

// ── Phase 3 — activateRoom ─────────────────────────────────────────────────────
//
// Called when a room becomes active (watch on activeRoom).
// Ensures the ambient channel exists then loads history.
// ensureChannel is idempotent — safe to call if channel already exists.

async function activateRoom(room: Room): Promise<void> {
    await ensureChannel(room)
    await loadHistory(room.roomId)
}

// ── Dispose ────────────────────────────────────────────────────────────────────

async function _disposeAllChannels(): Promise<void> {
    for (const channel of channels.values())
        await channel.dispose()
    channels.clear()
    channelsPending.clear()

    // Dispose any EDHT sessions that were announced but never had a channel
    // spun up (owned rooms that were never selected). channel.dispose() handles
    // the rest via wireEdht.
    for (const edht of edhtSessions.values())
        await edht.dispose().catch(() => { /* best-effort */ })
    edhtSessions.clear()
}

// ── Picker outside-click ───────────────────────────────────────────────────────

function onDocClick(e: MouseEvent) {
    if (pickerRef.value && !pickerRef.value.contains(e.target as Node))
        closePicker()
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
    document.addEventListener('mousedown', onDocClick)
    await audioChain.load()   
    await identity$.load()
    await rooms$.load()

    // Phase 1 — announce all owned rooms immediately, in parallel.
    // No stagger: announcing is lightweight (EDHT only, no TCP).
    // This ensures B can find A via EDHT right after app start even for
    // rooms A hasn't opened yet — the 15-minute re-announce keeps it fresh.
    await Promise.all(
        rooms.value
            .filter(r => !r.isOwner && !r.isClosed)
            .map(r => announceRoom(r))
    )

    // Phase 2 — activate the first room (loads history + triggers full channel setup)
    const first = rooms.value[0]
    if (first) selectRoom(first)

    // Phase 3 — ambient channel setup for remaining rooms, staggered.
    // These won't load history but will connect so mentions are detectable.
    for (let i = 1; i < rooms.value.length; i++) {
        const room = rooms.value[i]
        setTimeout(() => ensureChannel(room), i * 200)
    }

    // Ambient message handler — mention detection for non-active rooms.
    // useChat handles the active room; this handles everything else.
    _ambientUnsub = sdk?.onChatMessage?.((msg: ChatMessage) => {
        if (msg.scopeId === activeRoom.value?.roomId) return

        // Handle call signals from any room
        if (msg.text.startsWith('__invite__|')) {
            handleInviteMessage(msg.text, msg.senderId, msg.senderName)
            return
        }
        if (msg.text.startsWith('__decline__|')) {
            stopRinging()
            return
        }

        const room = rooms.value.find(r => r.roomId === msg.scopeId)
        if (!room) return

        if (_shouldNotify(msg, room)) {
            console.log(`[GExchange] Notify: ${msg.senderName} in #${room.displayName}: ${msg.text.slice(0, 60)}`)
        }
    }) ?? null

    chat$.mount()
})

onUnmounted(async () => {
    document.removeEventListener('mousedown', onDocClick)
    _ambientUnsub?.()
    _ambientUnsub = null
    chat$.unmount()
    await audioChain.dispose()   
    await _disposeAllChannels()
    await rooms$.dispose()
    _peerEngine?.destroy()
    _peerEngine = null
})

// ── Watch active room ──────────────────────────────────────────────────────────
//
// selectRoom → onRoomSelected → ensureChannel already called.
// activateRoom calls ensureChannel (no-op if already done) then loads history.

watch(activeRoom, async (room) => {
    clearMessages()
    if (!room) return
    await activateRoom(room)
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

/* ── Participants header ─────────────────────────────────────────── */
.sidebar-participants-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
.sidebar-participants-header h4 {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: .06em;
    margin: 0;
}
.peer-count {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 9px;
    padding: 1px 5px;
    color: var(--fg-dim);
    font-weight: 400;
}
.sidebar-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}
.sidebar-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--fg-muted);
    cursor: pointer;
    transition: all .12s;
}
.sidebar-action-btn svg { width: 12px; height: 12px; }
.sidebar-action-btn:hover:not(:disabled) { color: #4caf50; border-color: #4caf50; }
.sidebar-action-btn.active { color: #e05555; border-color: #e05555; background: rgba(224,85,85,.1); }
.sidebar-action-btn:disabled { opacity: .3; cursor: not-allowed; }
.selection-hint {
    font-size: 9px;
    color: var(--accent);
    background: var(--accent-dim);
    border-radius: 4px;
    padding: 1px 5px;
}
 
/* ── Peer rows ──────────────────────────────────────────────────── */
.user-row.peer {
    cursor: pointer;
    border-radius: 4px;
    padding: 3px 4px;
    margin: 1px 0;
    user-select: none;
    transition: background .1s;
}
.user-row.peer:hover { background: var(--bg-3); }
.user-row.peer.selected {
    background: var(--accent-dim);
    border: 1px solid rgba(91,142,240,.2);
}
.user-row.peer.speaking .dot { background: #4caf50; box-shadow: 0 0 4px #4caf5088; }
.user-row.peer.speaking .user-name { color: var(--fg); }
 
/* ── Per-peer action buttons ────────────────────────────────────── */
.peer-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity .1s;
    margin-left: auto;
}
.user-row.peer:hover .peer-actions,
.user-row.peer.selected .peer-actions { opacity: 1; }
.peer-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--fg-muted);
    cursor: pointer;
    transition: all .1s;
}
.peer-action-btn svg { width: 10px; height: 10px; }
.peer-action-btn:hover { color: var(--fg); border-color: var(--border); background: var(--bg-3); }
 
/* ── Speaking dot pulse ─────────────────────────────────────────── */
.dot.speaking {
    animation: pulse-speak .8s ease-in-out infinite;
}
@keyframes pulse-speak {
    0%, 100% { box-shadow: 0 0 0 0 rgba(76,175,80,.4); }
    50%       { box-shadow: 0 0 0 4px rgba(76,175,80,0); }
}
 
/* ── Creating indicator ─────────────────────────────────────────── */
.creating-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--fg-muted);
    padding: 4px 4px;
}
.spinner-small {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin .6s linear infinite;
    flex-shrink: 0;
}
</style>