// src/widgets/gexchange/useChat.ts
//
// Manages the chat message list for GExchange.
//
// RESPONSIBILITIES:
//   - Subscribe to incoming messages (onChatMessage push)
//   - Subscribe to history-ready events (onChatHistoryReady)
//   - Load history on room switch
//   - Send messages via the active channel (never touches chatSessionId)
//   - Optimistic message insertion and correction
//   - Message display helpers (shouldShowSender, shouldShowDateSep, formatTime/Date)
//
// THE CHANNEL CONTRACT:
//   useChat never calls chatSend directly. It gets the active channel via a
//   getter: () => ChannelSession | undefined. This keeps useChat completely
//   decoupled from the room and mesh layers.

import { ref, nextTick, type Ref } from 'vue'
import type { WidgetSdk, ChatMessage } from 'gexplorer/widgets'
import type { ChannelSession } from 'gexplorer/widgets'

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseChatOptions {
    sdk:        WidgetSdk
    /**
     * Returns the currently active channel session, or undefined if no room
     * is selected / channel not yet connected.
     * useChat calls channel.sendMessage() — never touches the session ID.
     */
    getChannel: () => ChannelSession | undefined
    /** Active room's scopeId — used to filter incoming push messages. */
    getScopeId: () => string | undefined
    /** Reactive ref to the identity userId — used for mine/theirs styling. */
    getSenderId: () => string | undefined
    /** Reactive display name for outgoing optimistic messages. */
    getSenderName: () => string
    /** Ref to the chat feed element for scroll-to-bottom. */
    feedRef:    Ref<HTMLElement | null>
    /** Ref to the message input for post-send re-focus. */
    inputRef:   Ref<HTMLTextAreaElement | null>
}

// ── Return type ───────────────────────────────────────────────────────────────

export interface UseChatReturn {
    // ── State ──────────────────────────────────────────────────────────────
    messages:    Ref<ChatMessage[]>
    draftText:   Ref<string>
    sending:     Ref<boolean>
    chatLoading: Ref<boolean>
    shiftToSend: Ref<boolean>

    // ── Actions ────────────────────────────────────────────────────────────
    sendMessage:  () => Promise<void>
    loadHistory:  (scopeId: string) => Promise<void>
    clearMessages: () => void

    // ── Input handlers ─────────────────────────────────────────────────────
    onInputKeydown:   (e: KeyboardEvent) => void
    autoResizeInput:  () => void

    // ── Display helpers ────────────────────────────────────────────────────
    shouldShowSender:  (msg: ChatMessage, list: ChatMessage[]) => boolean
    shouldShowDateSep: (msg: ChatMessage, list: ChatMessage[]) => boolean
    formatTime:        (ms: number) => string
    formatDate:        (ms: number) => string

    // ── Lifecycle ───────────────────────────────────────────────────────────
    /** Call from onMounted — subscribes to push events. Returns unsub fns. */
    mount:   () => void
    /** Call from onUnmounted — unsubscribes. */
    unmount: () => void
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useChat(options: UseChatOptions): UseChatReturn {
    const {
        sdk,
        getChannel,
        getScopeId,
        getSenderId,
        getSenderName,
        feedRef,
        inputRef,
    } = options

    const { chatGetHistory, onChatMessage, onChatHistoryReady } = sdk

    // ── State ─────────────────────────────────────────────────────────────

    const messages    = ref<ChatMessage[]>([])
    const draftText   = ref('')
    const sending     = ref(false)
    const chatLoading = ref(false)
    const shiftToSend = ref(true)

    // ── Unsub handles ─────────────────────────────────────────────────────

    let _unsubMessage: (() => void) | null = null
    let _unsubHistory: (() => void) | null = null

    // ── Internal helpers ──────────────────────────────────────────────────

    function _appendMessage(msg: ChatMessage) {
        if (messages.value.some(m => m.id === msg.id)) return
        messages.value.push(msg)
        nextTick(() => _scrollToBottom())
    }

    function _scrollToBottom() {
        if (feedRef.value) feedRef.value.scrollTop = feedRef.value.scrollHeight
    }

    function _resetInputHeight() {
        if (inputRef.value) inputRef.value.style.height = 'auto'
    }

    // ── Actions ───────────────────────────────────────────────────────────

    async function loadHistory(scopeId: string) {
        if (!chatGetHistory) return
        chatLoading.value = true
        try {
            const msgs     = await chatGetHistory(scopeId, 100)
            messages.value = msgs.map(m => ({ ...m, roomId: m.scopeId }))
            await nextTick()
            _scrollToBottom()
        } catch (err) {
            console.warn('[GExchange] Failed to load history:', err)
        } finally {
            chatLoading.value = false
        }
    }

    function clearMessages() {
        messages.value = []
    }

    async function sendMessage() {
        const text = draftText.value.trim()
        if (!text || sending.value) return

        const channel = getChannel()
        if (!channel) {
            console.warn('[GExchange] No channel — message will be queued on connect')
            // Channel will queue and drain automatically via useChannel
            // Only bail if we have no channel instance at all
            return
        }

        sending.value = true
        const optimisticId = `opt_${Date.now()}`

        const optimistic: ChatMessage = {
            id:         optimisticId,
            scopeId:    getScopeId() ?? '',
            senderId:   getSenderId() ?? '',
            senderName: getSenderName(),
            text,
            type:       'text',
            sentAt:     Date.now(),
        }

        _appendMessage(optimistic)
        draftText.value = ''
        _resetInputHeight()

        try {
            const result = await channel.sendMessage(text)
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

    // ── Input handlers ────────────────────────────────────────────────────

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

    // ── Display helpers ───────────────────────────────────────────────────

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

    // ── Lifecycle ─────────────────────────────────────────────────────────

    function mount() {
        _unsubMessage = onChatMessage?.((msg) => {
            if (msg.scopeId === getScopeId())
                _appendMessage({ ...msg, roomId: msg.scopeId } as ChatMessage)
        }) ?? null

        _unsubHistory = onChatHistoryReady?.((scopeId) => {
            if (scopeId === getScopeId())
                loadHistory(scopeId)
        }) ?? null
    }

    function unmount() {
        _unsubMessage?.()
        _unsubHistory?.()
        _unsubMessage = null
        _unsubHistory = null
    }

    return {
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

        mount,
        unmount,
    }
}