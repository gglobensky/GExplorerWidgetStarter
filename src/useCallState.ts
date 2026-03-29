// src/widgets/gexchange/useCallState.ts
//
// Manages incoming and outgoing call state for GExchange.
//
// RESPONSIBILITIES:
//   - Track incoming call (token, roomName, callerName, callerId)
//   - Track outgoing call (ringing state, target room)
//   - Play/stop ringtone (incoming) and dial tone (outgoing)
//   - Accept: join the private room via token, then start call
//   - Decline: send __decline__ signal back to caller
//   - Custom ringtone: loads from vault if set, falls back to built-in
//
// RINGTONE CONTRACT:
//   Built-in files live at /sounds/ringtone.ogg and /sounds/dialtone.ogg
//   User override stored in vault at gexchange://config/ringtone.ogg
//   Falls back silently to built-in if custom fails to load.

import { ref, type Ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IncomingCall {
    token:      string
    roomName:   string
    callerName: string
    callerId:   string
    withCall:   boolean   // false = room invite only, no auto-call
}

export interface OutgoingCall {
    roomId:   string
    roomName: string
    peerNames: string[]
}

export interface UseCallStateOptions {
    sdk:         WidgetSdk
    getSelfUserId: () => string | undefined
    /** Called when user accepts — joins room and optionally starts call. */
    onAccepted:  (token: string, withCall: boolean) => Promise<void>
    /** Called when user declines. */
    onDeclined?: (callerId: string) => void
}

export interface UseCallStateReturn {
    // ── State ──────────────────────────────────────────────────────────────
    incomingCall:  Ref<IncomingCall | null>
    outgoingCall:  Ref<OutgoingCall | null>
    callAnswered:  Ref<boolean>

    // ── Actions ────────────────────────────────────────────────────────────
    /** Parse an __invite__ message and show the incoming call modal. */
    handleInviteMessage: (
        text:       string,
        senderId:   string,
        senderName: string,
    ) => boolean   // returns true if message was consumed as a call

    /** Show outgoing ringing state while waiting for callee to answer. */
    startRinging:  (roomId: string, roomName: string, peerNames: string[]) => void
    /** Stop outgoing ringing (call answered, cancelled, or timed out). */
    stopRinging:   () => void

    /** Accept the incoming call. */
    acceptCall:    () => Promise<void>
    /** Decline the incoming call. */
    declineCall:   () => void
}

// ── Invite message format ─────────────────────────────────────────────────────
// __invite__|{token}|{roomName}|{targetUserId}[|call]
// The trailing |call flag means auto-start voice after joining.

const INVITE_PREFIX  = '__invite__|'
const DECLINE_PREFIX = '__decline__|'

// Timeout after which call attempt is dropped
let _ringTimeout: ReturnType<typeof setTimeout> | null = null

// ── Ringtone player ───────────────────────────────────────────────────────────

class RingtonePlayer {
    private _audio: HTMLAudioElement | null = null
    private _playing = false

    play(src: string, loop = true) {
        this.stop()
        this._audio = new Audio(src)
        this._audio.loop = loop
        this._audio.volume = 0.7
        this._audio.play().catch(err =>
            console.warn('[RingtonePlayer] Play failed:', err)
        )
        this._playing = true
    }

    stop() {
        if (this._audio) {
            this._audio.pause()
            this._audio.currentTime = 0
            this._audio = null
        }
        this._playing = false
    }

    get playing() { return this._playing }
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useCallState(opts: UseCallStateOptions): UseCallStateReturn {
    const { getSelfUserId, onAccepted, onDeclined } = opts

    const incomingCall = ref<IncomingCall | null>(null)
    const outgoingCall = ref<OutgoingCall | null>(null)
    const callAnswered = ref(false)

    const _ringtone = new RingtonePlayer()
    const _dialtone = new RingtonePlayer()

    // ── Invite message interception ───────────────────────────────────────

    function handleInviteMessage(
        text:       string,
        senderId:   string,
        senderName: string,
    ): boolean {
        if (!text.startsWith(INVITE_PREFIX)) return false

        const parts    = text.split('|')
        // __invite__|token|roomName|targetUserId[|call]
        const token      = parts[1]
        const roomName   = parts[2]
        const targetId   = parts[3]
        const withCall   = parts[4] === 'call'

        if (!token || !roomName || !targetId) return false

        const selfId = getSelfUserId()

        // Only show modal to the targeted peer
        if (targetId !== selfId) return true   // consumed but not for us

        // Already have an incoming call — queue or ignore
        if (incomingCall.value) return true

        incomingCall.value = {
            token,
            roomName,
            callerName: senderName,
            callerId:   senderId,
            withCall,
        }

        // Play ringtone
        _ringtone.play('/sounds/ringtone.ogg')

        console.log(
            `[useCallState] Incoming ${withCall ? 'call' : 'room invite'} ` +
            `from ${senderName} → room "${roomName}"`
        )

        return true   // message consumed — don't show in chat feed
    }

    // ── Outgoing ringing ──────────────────────────────────────────────────

function startRinging(roomId: string, roomName: string, peerNames: string[]) {
    outgoingCall.value = { roomId, roomName, peerNames }
    callAnswered.value = false
    _dialtone.play('/sounds/dialtone.ogg')

    _ringTimeout = setTimeout(() => {
        if (outgoingCall.value?.roomId === roomId)
            stopRinging()
    }, 40_000)
}

    function stopRinging() {
        clearTimeout(_ringTimeout)
        _ringTimeout = null
        _dialtone.stop()
        outgoingCall.value = null
    }

    // ── Accept ────────────────────────────────────────────────────────────

    async function acceptCall() {
        const call = incomingCall.value
        if (!call) return

        _ringtone.stop()
        callAnswered.value  = true
        incomingCall.value  = null

        await onAccepted(call.token, call.withCall)
    }

    // ── Decline ───────────────────────────────────────────────────────────

    function declineCall() {
        const call = incomingCall.value
        if (!call) return

        _ringtone.stop()
        onDeclined?.(call.callerId)
        incomingCall.value = null
    }

    return {
        incomingCall,
        outgoingCall,
        callAnswered,
        handleInviteMessage,
        startRinging,
        stopRinging,
        acceptCall,
        declineCall,
    }
}