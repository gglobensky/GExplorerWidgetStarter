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

        <!-- ── Invite panel (row 2 — collapses to zero when hidden) ───── -->
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

        <!-- ── No room state (spans body + footer rows) ────────────────── -->
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

        <!-- ── Chat body (row 3) ───────────────────────────────────────── -->
        <div v-else class="chat-body">
            <main class="chat-feed">
                <div class="message system-msg">
                    <span class="msg-text">Welcome to <strong>#{{ activeRoom.canonicalName }}</strong></span>
                </div>
                <!-- future messages here -->
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

        <!-- ── Footer (row 4) ─────────────────────────────────────────── -->
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
                <textarea
                    v-if="!showBoard"
                    class="chat-input"
                    placeholder="Type a message…"
                    :disabled="activeRoom.isClosed"
                />
                <div v-if="activeRoom.isClosed" class="closed-banner">
                    This room is archived — read only
                </div>
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface Room {
    roomId:        string
    canonicalName: string
    displayName:   string   // local override or canonicalName
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

const sdk = inject<WidgetSdk>('widgetSdk')
const {
  fsListDirSmart,
  fsMkdir,
  p2pCreateInvite,
  p2pAcceptInvite,
  p2pGetIdentity
} = sdk ?? {}


// ── State ──────────────────────────────────────────────────────────────────────

const loading       = ref(false)
const rooms         = ref<Room[]>([])
const activeRoom    = ref<Room | null>(null)
const identity      = ref<Identity | null>(null)
const showSidebar   = ref(true)
const showBoard     = ref(false)
const pickerOpen    = ref(false)
const roomFilter    = ref('')
const showJoinModal = ref(false)
const showNewRoomInput = ref(false)
const newRoomName   = ref('')
const createError   = ref('')
const loadedComponent = shallowRef<any>(null)

const inviteToken     = ref('')
const inviteExpiry    = ref(15)
const inviteCopied    = ref(false)
const inviteError     = ref('')
const showInvitePanel = ref(false)
const joinToken       = ref('')
const joinError       = ref('')
const joinLoading     = ref(false)

const pickerRef      = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const newRoomInputRef = ref<HTMLInputElement | null>(null)

// ── Local display name overrides ───────────────────────────────────────────────
// Persisted in localStorage so user renames survive reloads
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

// ── IPC helpers ────────────────────────────────────────────────────────────────

function getGexProvider() {
    const p = getProvider('gexchange')
    if (!p) throw new Error('GExchange VFS provider not registered')
    return p
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
    await Promise.all([loadIdentity(), loadRooms()])
    // Auto-select first room if available
    if (rooms.value.length > 0 && !activeRoom.value) {
        selectRoom(rooms.value[0])
    }
})

// ── Data loading ───────────────────────────────────────────────────────────────

// Identity is still direct IPC — it's not a VFS op, it's a user identity op.
// We keep this one send() call here as an exception, OR we add getIdentity
// as a VfsProvider method in future. For now use the SDK's fsWatch pattern:
// Actually — identity has no path concept so it can't be a VFS op.
// We expose it through a dedicated non-VFS IPC call via the widget SDK.
// TODO: add getIdentity to the SDK as a gexchange capability once
//       the capability system supports widget-specific extensions.
//       For now, identity is loaded via the provider's list('gexchange://')
//       response which includes the local user's identity in its meta.
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
        // fsListDirSmart routes gexchange:// to the VFS provider automatically
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

function selectRoom(room: Room) {
    activeRoom.value = room
}

async function createRoom() {
    const name = roomFilter.value.trim()
    if (!name) return
    await doCreateRoom(name)
    closePicker()
}

// Called when "New room" button is clicked with empty filter
function focusCreateField() {
    nextTick(() => {
        if (searchInputRef.value) {
            searchInputRef.value.focus()
            // Insert placeholder text pre-selected so user can type immediately
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
    await fsMkdir?.(name)  // SDK prepends the scheme — becomes gexchange://name
    await loadRooms()
    const created = rooms.value.find(r => r.canonicalName === name)
    if (created) selectRoom(created)
}


function openInItems() {
    if (!activeRoom.value) return
    // TODO: emit nav action to open gexchange://{roomId}/ in an items widget
    // For now log until the shell nav action is wired
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

// Close picker on outside click
function onDocClick(e: MouseEvent) {
    if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
        closePicker()
    }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))

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
        onCancel: () => {},
        selectAll: true,
        // Don't validate as filename — room display names have no restrictions
        validate: (v) => v.trim() ? null : 'Name cannot be empty',
    })
}
// ── Sidebar ────────────────────────────────────────────────────────────────────

function toggleSidebar() {
    showSidebar.value = !showSidebar.value
}

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
    } catch { /* fallback: token text is visible for manual copy */ }
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
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(ms))
}

// Watch newRoomInput visibility to focus
watch(showNewRoomInput, (v) => {
    if (v) nextTick(() => newRoomInputRef.value?.focus())
})
</script>

<style scoped>
/* ── Root ──────────────────────────────────────────────────────────────────── */
.gex-root {
    --bg:        #111;
    --bg-2:      #171717;
    --bg-3:      #1e1e1e;
    --border:    rgba(255,255,255,.07);
    --fg:        #e8e8e8;
    --fg-dim:    #777;
    --fg-muted:  #444;
    --accent:    #5b8ef0;
    --accent-dim: rgba(91,142,240,.15);
    --radius:    8px;
    --font:      'JetBrains Mono', 'Fira Code', monospace;

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
    grid-template-rows: 44px auto 1fr; /* header | invite panel | empty state */
}
/* ── Header ────────────────────────────────────────────────────────────────── */
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

/* ── Room picker trigger ───────────────────────────────────────────────────── */
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
.room-trigger:hover {
    background: var(--bg-3);
    border-color: var(--border);
}
.room-picker.open .room-trigger {
    background: var(--bg-3);
    border-color: var(--accent);
}
.room-hash   { color: var(--accent); font-weight: 700; flex-shrink: 0; }
.room-name   { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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

/* ── Dropdown ──────────────────────────────────────────────────────────────── */
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
    gap: 8px;
    padding: 10px 12px 6px;
}
.search-icon { width: 14px; height: 14px; color: var(--fg-dim); flex-shrink: 0; }
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
.action-btn:disabled { opacity: .35; cursor: not-allowed; }
.create-btn:not(:disabled) { color: var(--accent); }

.dropdown-sep { height: 1px; background: var(--border); margin: 0; }

.room-list-scroll {
    overflow-y: auto;
    max-height: 220px;
    padding: 4px 0;
}
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
.room-row:hover { background: var(--bg-3); }
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

/* ── Icon buttons ──────────────────────────────────────────────────────────── */
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
.icon-btn svg { width: 15px; height: 15px; }
.icon-btn:hover { color: var(--fg); background: var(--bg-3); }

/* ── Empty state ───────────────────────────────────────────────────────────── */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 24px;
    text-align: center;
}
.empty-glyph {
    font-size: 48px;
    font-weight: 900;
    color: var(--fg-muted);
    line-height: 1;
    margin-bottom: 4px;
}
.empty-title { font-size: 15px; font-weight: 600; margin: 0; color: var(--fg); }
.empty-sub   { font-size: 12px; color: var(--fg-dim); margin: 0; }
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

/* ── Pill buttons ──────────────────────────────────────────────────────────── */
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

/* ── Chat body ─────────────────────────────────────────────────────────────── */
.chat-body {
    display: flex;
    overflow: hidden;
    min-height: 0;
    height: 100%;
}
.chat-feed {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
    min-width: 0;
}
.message { margin-bottom: 8px; line-height: 1.5; }
.system-msg { color: var(--fg-dim); font-size: 12px; font-style: italic; }

/* ── Sidebar ───────────────────────────────────────────────────────────────── */
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
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot.online { background: #4caf6e; }
.you-tag {
    font-size: 10px;
    color: var(--fg-muted);
    background: var(--bg-3);
    border-radius: 3px;
    padding: 1px 4px;
    margin-left: auto;
}
.room-meta { display: flex; flex-direction: column; gap: 6px; }
.meta-row  { display: flex; flex-direction: column; gap: 1px; }
.meta-label { font-size: 10px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .06em; }
.meta-value { font-size: 12px; color: var(--fg); }
.meta-value.mono { font-family: var(--font); letter-spacing: .04em; }

/* ── Footer ────────────────────────────────────────────────────────────────── */
.chat-footer {
    max-height: 160px; 
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
.plugin-canvas {
    padding: 10px 12px;
    position: relative;
    min-height: 0;  
    flex-shrink: 0; 
}
.chat-input {
    width: 100%;
    min-height: 56px;
    background: var(--bg-3);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    font-family: var(--font);
    font-size: 13px;
    resize: vertical;
    outline: none;
    transition: border-color .15s;
    box-sizing: border-box;
}
.chat-input:focus { border-color: var(--accent); }
.chat-input:disabled { opacity: .4; cursor: not-allowed; }
.closed-banner {
    font-size: 11px;
    color: #e05555;
    text-align: center;
    padding: 4px 0 2px;
}

/* ── Loading overlay ───────────────────────────────────────────────────────── */
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

/* ── Dropdown transition ───────────────────────────────────────────────────── */
.dropdown-enter-active,
.dropdown-leave-active { transition: opacity .15s, transform .15s; }
.dropdown-enter-from,
.dropdown-leave-to  { opacity: 0; transform: translateY(-6px); }

.invite-panel {
    position: absolute;
    top: 44px;           /* sits just below the header */
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    /* existing padding/content styles unchanged */
}
/* ── Invite panel ─────────────────────────────────────────────────────────── */
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
.invite-body { display: flex; flex-direction: column; gap: 8px; }
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
.expiry-btn.active  { border-color: var(--accent); color: var(--accent); }
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
    font-family: var(--font);
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
.modal-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.modal-sub  { font-size: 12px; color: var(--fg-dim); margin: 0; }
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
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* ── Transitions ─────────────────────────────────────────────────────────── */
.slide-down-enter-active,
.slide-down-leave-active { transition: opacity .15s, transform .15s; }
.slide-down-enter-from,
.slide-down-leave-to { opacity: 0; transform: translateY(-8px); }

.fade-enter-active,
.fade-leave-active { transition: opacity .15s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>