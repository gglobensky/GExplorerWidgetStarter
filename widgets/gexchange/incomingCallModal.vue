<template>
    <!-- ── Incoming call modal ───────────────────────────────────────── -->
    <Transition name="call-slide">
        <div v-if="incomingCall" class="call-modal incoming">
            <div class="call-avatar">
                <div class="call-avatar-ring" :class="{ pulse: true }"/>
                <div class="call-avatar-inner">
                    {{ callerInitial }}
                </div>
            </div>

            <div class="call-info">
                <div class="call-label">Incoming {{ incomingCall.withCall ? 'call' : 'room invite' }}</div>
                <div class="call-name">{{ incomingCall.callerName }}</div>
                <div class="call-room">{{ incomingCall.roomName }}</div>
            </div>

            <div class="call-actions">
                <button
                    class="call-btn decline"
                    @click="declineCall"
                    v-gex-tooltip="'Decline'"
                >
                    <svg viewBox="0 0 16 16" fill="none">
                        <path d="M3 3c0 0 1-1 2 0l2 2c1 1 0 2 0 2s-1 1 0 2l2 2c1 1 2 0 2 0s1-1 2 0l1 1c1 1 0 3-1 3C5 16 0 11 0 4 0 3 2 2 3 3z"
                            stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                        <path d="M10 2l4 4M14 2l-4 4"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
                <button
                    class="call-btn accept"
                    @click="acceptCall"
                    v-gex-tooltip="incomingCall.withCall ? 'Answer' : 'Join room'"
                >
                    <svg viewBox="0 0 16 16" fill="none">
                        <path d="M3 3c0 0 1-1 2 0l2 2c1 1 0 2 0 2s-1 1 0 2l2 2c1 1 2 0 2 0s1-1 2 0l1 1c1 1 0 3-1 3C5 16 0 11 0 4 0 3 2 2 3 3z"
                            stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        </div>
    </Transition>

    <!-- ── Outgoing call / ringing modal ─────────────────────────────── -->
    <Transition name="call-slide">
        <div v-if="outgoingCall && !callAnswered" class="call-modal outgoing">
            <div class="call-avatar">
                <div class="call-avatar-ring spin"/>
                <div class="call-avatar-inner multi" v-if="outgoingCall.peerNames.length > 1">
                    {{ outgoingCall.peerNames.length }}
                </div>
                <div class="call-avatar-inner" v-else>
                    {{ outgoingCall.peerNames[0]?.[0]?.toUpperCase() ?? '?' }}
                </div>
            </div>

            <div class="call-info">
                <div class="call-label">Calling…</div>
                <div class="call-name">
                    {{ outgoingCall.peerNames.join(', ') }}
                </div>
                <div class="call-room">{{ outgoingCall.roomName }}</div>
            </div>

            <div class="call-actions">
                <button
                    class="call-btn decline"
                    @click="$emit('cancel')"
                    v-gex-tooltip="'Cancel call'"
                >
                    <svg viewBox="0 0 16 16" fill="none">
                        <path d="M3 3c0 0 1-1 2 0l2 2c1 1 0 2 0 2s-1 1 0 2l2 2c1 1 2 0 2 0s1-1 2 0l1 1c1 1 0 3-1 3C5 16 0 11 0 4 0 3 2 2 3 3z"
                            stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                        <path d="M10 2l4 4M14 2l-4 4"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IncomingCall, OutgoingCall } from './useCallState'

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{
    incomingCall:  IncomingCall | null
    outgoingCall:  OutgoingCall | null
    callAnswered:  boolean
}>()

// ── Emits ─────────────────────────────────────────────────────────────────────

const emit = defineEmits<{
    accept:  []
    decline: []
    cancel:  []
}>()

// ── Helpers ───────────────────────────────────────────────────────────────────

const callerInitial = computed(() =>
    props.incomingCall?.callerName?.[0]?.toUpperCase() ?? '?'
)

function acceptCall()  { emit('accept') }
function declineCall() { emit('decline') }
</script>

<style scoped>
/* ── Call modal ─────────────────────────────────────────────────────── */
.call-modal {
    position: absolute;
    bottom: 56px;   /* sits above the footer tab bar */
    left: 50%;
    transform: translateX(-50%);
    z-index: 400;
    background: var(--bg-2, #171717);
    border: 1px solid var(--border, rgba(255,255,255,.07));
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 240px;
    max-width: 320px;
}

.call-modal.incoming { border-color: rgba(76,175,80,.3); }
.call-modal.outgoing { border-color: rgba(91,142,240,.2); }

/* ── Avatar ──────────────────────────────────────────────────────── */
.call-avatar {
    position: relative;
    flex-shrink: 0;
    width: 40px;
    height: 40px;
}

.call-avatar-inner {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-3, #1e1e1e);
    border: 1px solid var(--border, rgba(255,255,255,.07));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
    color: var(--fg, #e8e8e8);
    position: relative;
    z-index: 1;
}

.call-avatar-inner.multi {
    font-size: 13px;
    color: var(--accent, #5b8ef0);
}

.call-avatar-ring {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid #4caf50;
    opacity: 0;
}

.call-avatar-ring.pulse {
    animation: ring-pulse 1.2s ease-out infinite;
}

.call-avatar-ring.spin {
    border-color: transparent;
    border-top-color: var(--accent, #5b8ef0);
    opacity: 1;
    animation: ring-spin .9s linear infinite;
}

@keyframes ring-pulse {
    0%   { inset: -4px; opacity: .8; }
    100% { inset: -12px; opacity: 0; }
}

@keyframes ring-spin {
    to { transform: rotate(360deg); }
}

/* ── Call info ───────────────────────────────────────────────────── */
.call-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.call-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--fg-muted, #444);
}

.call-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--fg, #e8e8e8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.call-room {
    font-size: 10px;
    color: var(--fg-dim, #777);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ── Action buttons ──────────────────────────────────────────────── */
.call-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}

.call-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: filter .12s, transform .1s;
}

.call-btn svg { width: 14px; height: 14px; }

.call-btn:active { transform: scale(.93); }

.call-btn.accept {
    background: #4caf50;
    color: #fff;
}

.call-btn.accept:hover { filter: brightness(1.15); }

.call-btn.decline {
    background: #e05555;
    color: #fff;
}

.call-btn.decline:hover { filter: brightness(1.15); }

/* ── Transition ──────────────────────────────────────────────────── */
.call-slide-enter-active,
.call-slide-leave-active { transition: opacity .2s, transform .2s; }
.call-slide-enter-from,
.call-slide-leave-to     { opacity: 0; transform: translateX(-50%) translateY(12px); }
</style>