// src/widgets/gexchange/useIdentity.ts
//
// Manages local peer identity and display name for GExchange.
//
// RESPONSIBILITIES:
//   - Load identity from backend (p2pGetIdentity)
//   - First-run name prompt when isNameSet is false
//   - Inline name editor (sidebar)
//   - Disambiguator — detects name collisions with peers and offers
//     suffix/prefix options to differentiate
//
// OUTPUT:
//   identity         — reactive, reflects the latest resolved state
//   resolvedUsername — computed: baseName + disambiguator (if any)
//   onNameChanged    — call this when the name changes to trigger reannounce
//                      (ChatRoom.vue wires this to reannounceAll so useIdentity
//                       stays decoupled from the mesh layer)
//
// DISAMBIG SEEDING:
//   Preview values and initial selections are derived deterministically from
//   userId via FNV-1a. This ensures two users with colliding names see
//   different suggested suffixes/prefixes from the moment the prompt opens,
//   with no coordination required. "Try another" remains random — that is its
//   entire purpose.

import { ref, computed, nextTick, type Ref } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Identity {
    userId:    string
    username:  string
    publicKey: string
}

type DisambigMode = 'suffix-number' | 'suffix-word' | 'prefix-word'

interface DisambigState {
    mode:  DisambigMode
    value: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DISAMBIG_WORDS = [
    'swift','calm','bold','keen','bright','azure','crisp','dusk',
    'east','fern','gale','haze','iris','jade','kite','lark',
    'mesa','nova','opal','pine','quill','rust','sage','teal',
    'umber','vale','wren','xen','yew','zeal',
]

// ── Seeded integer ────────────────────────────────────────────────────────────
//
// FNV-1a over (userId + '\0' + salt). Different salts per mode ensure that
// suffix-word and prefix-word never resolve to the same word even when the
// userId is the same. Returns a value in [0, max).

function _seededInt(seed: string, salt: string, max: number): number {
    let h = 0x811c9dc5
    const s = seed + '\0' + salt
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = (Math.imul(h, 0x01000193)) >>> 0
    }
    return h % max
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseIdentityOptions {
    sdk: WidgetSdk
    /**
     * Called after any successful name change (prompt, editor, or disambig).
     * ChatRoom.vue wires this to reannounceAll() so peers see the update
     * without waiting for the TTL to expire.
     */
    onNameChanged?: () => Promise<void>
    /** Ref to the name prompt input for auto-focus on first run. */
    namePromptInputRef?: Ref<HTMLInputElement | null>
    /** Ref to the name editor input for auto-focus on open. */
    nameEditorInputRef?: Ref<HTMLInputElement | null>
}

// ── Return type ───────────────────────────────────────────────────────────────

export interface UseIdentityReturn {
    // ── Core identity ──────────────────────────────────────────────────────
    identity:         Ref<Identity | null>
    resolvedUsername: ReturnType<typeof computed<string>>

    // ── First-run name prompt ──────────────────────────────────────────────
    showNamePrompt:   Ref<boolean>
    namePromptValue:  Ref<string>
    namePromptError:  Ref<string>
    commitNamePrompt: () => Promise<void>
    dismissNamePrompt: () => void

    // ── Inline name editor (sidebar) ───────────────────────────────────────
    showNameEditor:    Ref<boolean>
    nameEditorValue:   Ref<string>
    nameEditorSaving:  Ref<boolean>
    nameEditorError:   Ref<string>
    openNameEditor:    () => void
    commitNameEdit:    () => Promise<void>

    // ── Disambiguator ──────────────────────────────────────────────────────
    showDisambigPrompt: Ref<boolean>
    disambigChoice:     Ref<DisambigMode | null>
    disambigOptions:    { id: DisambigMode; label: string }[]
    previewDisambig:    (mode: DisambigMode) => string
    selectDisambigOption: (mode: DisambigMode) => void
    regenerateDisambig: () => void
    commitDisambig:     () => Promise<void>

    // ── Init ───────────────────────────────────────────────────────────────
    /** Call once from onMounted. */
    load: () => Promise<void>
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useIdentity(options: UseIdentityOptions): UseIdentityReturn {
    const { sdk, onNameChanged, namePromptInputRef, nameEditorInputRef } = options
    const { p2pGetIdentity, p2pSetUsername } = sdk

    // ── Core state ────────────────────────────────────────────────────────

    const identity       = ref<Identity | null>(null)
    const baseName       = ref('')
    const disambigState  = ref<DisambigState | null>(null)

    const resolvedUsername = computed(() => {
        if (!baseName.value) return identity.value?.userId ?? ''
        const d = disambigState.value
        if (!d) return baseName.value
        if (d.mode === 'prefix-word') return `${d.value}${baseName.value}`
        return `${baseName.value}${d.value}`
    })

    function _syncIdentityUsername() {
        if (!identity.value) return
        identity.value = {
            ...identity.value,
            username: resolvedUsername.value || identity.value.userId,
        }
    }

    // ── Name prompt ───────────────────────────────────────────────────────

    const showNamePrompt  = ref(false)
    const namePromptValue = ref('')
    const namePromptError = ref('')

    async function commitNamePrompt() {
        const name = namePromptValue.value.trim()
        if (!name) return
        namePromptError.value = ''

        if (!p2pSetUsername) {
            baseName.value = name
            _syncIdentityUsername()
            showNamePrompt.value  = false
            namePromptValue.value = ''
            await onNameChanged?.()
            return
        }

        try {
            await p2pSetUsername(name)
            baseName.value = name
            _syncIdentityUsername()
            showNamePrompt.value  = false
            namePromptValue.value = ''
            await onNameChanged?.()
        } catch (err: any) {
            namePromptError.value = err?.message ?? 'Failed to save name'
        }
    }

    function dismissNamePrompt() {
        showNamePrompt.value  = false
        namePromptValue.value = ''
    }

    // ── Name editor ───────────────────────────────────────────────────────

    const showNameEditor    = ref(false)
    const nameEditorValue   = ref('')
    const nameEditorSaving  = ref(false)
    const nameEditorError   = ref('')

    function openNameEditor() {
        nameEditorValue.value = baseName.value
        showNameEditor.value  = true
        nextTick(() => nameEditorInputRef?.value?.focus())
    }

    async function commitNameEdit() {
        const name = nameEditorValue.value.trim()
        if (!name || nameEditorSaving.value) return
        nameEditorError.value  = ''
        nameEditorSaving.value = true
        try {
            if (p2pSetUsername) await p2pSetUsername(name)
            baseName.value      = name
            disambigState.value = null   // clear disambig — re-fires on next collision
            _syncIdentityUsername()
            showNameEditor.value = false
            await onNameChanged?.()
        } catch (err: any) {
            nameEditorError.value = err?.message ?? 'Failed to save name'
        } finally {
            nameEditorSaving.value = false
        }
    }

    // ── Disambiguator ─────────────────────────────────────────────────────
    //
    // _seededDefaults holds one deterministic suggestion per mode, derived
    // from userId. Built once in load(). These are the values shown in
    // preview before any explicit selection, and the initial generated value
    // when a mode is selected for the first time. "Try another" overwrites
    // with a fresh Math.random() value — seeding does not constrain it.

    const showDisambigPrompt = ref(false)
    const disambigChoice     = ref<DisambigMode | null>(null)
    const disambigGenerated  = ref('')

    // userId → { mode → formatted suffix/prefix string }
    const _seededDefaults = new Map<DisambigMode, string>()

    function _buildSeededDefaults(userId: string): void {
        const number     = 100 + _seededInt(userId, 'n',  900)
        const suffixWord = DISAMBIG_WORDS[_seededInt(userId, 'sw', DISAMBIG_WORDS.length)]
        const prefixWord = DISAMBIG_WORDS[_seededInt(userId, 'pw', DISAMBIG_WORDS.length)]
        _seededDefaults.set('suffix-number', `#${number}`)
        _seededDefaults.set('suffix-word',   `-${suffixWord}`)
        _seededDefaults.set('prefix-word',   `${prefixWord}-`)
    }

    const disambigOptions: { id: DisambigMode; label: string }[] = [
        { id: 'suffix-number', label: 'Add a number (#42)' },
        { id: 'suffix-word',   label: 'Add a word after (-swift)' },
        { id: 'prefix-word',   label: 'Add a word before (bold-)' },
    ]

    function _generateDisambigValue(mode: DisambigMode): string {
        if (mode === 'suffix-number') return `#${Math.floor(Math.random() * 900) + 100}`
        const word = DISAMBIG_WORDS[Math.floor(Math.random() * DISAMBIG_WORDS.length)]
        if (mode === 'suffix-word') return `-${word}`
        return `${word}-`
    }

    function previewDisambig(mode: DisambigMode): string {
        const base = baseName.value || identity.value?.userId?.slice(0, 8) || 'you'

        if (disambigChoice.value === mode) {
            const v = disambigGenerated.value
            if (mode === 'prefix-word') return `${v.replace(/-$/, '')}-${base}`
            return `${base}${v}`
        }

        // Show the seeded default for unselected modes so each user sees a
        // unique suggestion list. Falls back to the hardcoded placeholder only
        // if identity hasn't loaded yet.
        const def = _seededDefaults.get(mode)
        if (def !== undefined) {
            if (mode === 'prefix-word') return `${def.replace(/-$/, '')}-${base}`
            return `${base}${def}`
        }

        if (mode === 'suffix-number') return `${base}#42`
        if (mode === 'suffix-word')   return `${base}-swift`
        return `bold-${base}`
    }

    function selectDisambigOption(mode: DisambigMode) {
        disambigChoice.value    = mode
        // Initialize with the seeded default so the first selection already
        // shows a value unique to this user. The user can hit "Try another"
        // to get a fresh random value if they want something different.
        disambigGenerated.value = _seededDefaults.get(mode) ?? _generateDisambigValue(mode)
    }

    function regenerateDisambig() {
        if (!disambigChoice.value) return
        // Intentionally random — this is the "give me something different" action.
        disambigGenerated.value = _generateDisambigValue(disambigChoice.value)
    }

    async function commitDisambig() {
        if (!disambigChoice.value) return
        disambigState.value = {
            mode:  disambigChoice.value,
            value: disambigGenerated.value,
        }
        _syncIdentityUsername()
        showDisambigPrompt.value = false
        disambigChoice.value     = null
        await onNameChanged?.()
    }

    // ── Load ──────────────────────────────────────────────────────────────

    async function load() {
        if (!p2pGetIdentity) return
        try {
            const result   = await p2pGetIdentity()
            baseName.value = result.displayName ?? ''
            identity.value = {
                userId:    result.userId,
                username:  resolvedUsername.value || result.userId,
                publicKey: result.publicKey,
            }
            // Build seeded defaults now that we have a stable userId.
            // Must happen before the disambig prompt could ever be shown.
            _buildSeededDefaults(result.userId)

            if (!result.isNameSet) {
                showNamePrompt.value  = true
                namePromptValue.value = ''
                nextTick(() => namePromptInputRef?.value?.focus())
            }
        } catch (err) {
            console.warn('[GExchange] Failed to load identity:', err)
        }
    }

    return {
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

        load,
    }
}