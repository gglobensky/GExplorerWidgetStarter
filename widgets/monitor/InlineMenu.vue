<!-- widgets/monitor/InlineMenu.vue -->
<!--
    A small menu GEM Monitor draws itself, inside its own box (the view's root: position: relative). Used where the
    shell's ui.menu can't be (the toolbar's detail popover: a press there counts as the widget's for a minute only)
    and where plain text isn't enough (✓ on this page, a fainter ✓ on another one, the page's colour).
    Never outside the widget's box: when it is too short, the menu goes in columns instead of scrolling.
    Keys: ↑ ↓ ← → move, Enter / Space pick, Esc closes; a press outside closes it.

    const menu = useInlineMenu()                 // in the view
    <InlineMenu :menu="menu" />                  // in its root
    const id = await menu.open(buttonEl, items, 'Refresh rate')
-->
<template>
    <div v-if="menu.state.open" ref="el" class="gm-imenu" role="menu" :aria-label="menu.state.label" tabindex="-1"
         :style="box" @keydown="keys" @pointerdown.stop>
        <div v-if="menu.state.label" class="gm-imenu-label">{{ menu.state.label }}</div>
        <div class="gm-imenu-list" :style="listStyle">
            <template v-for="(it, i) in menu.state.items" :key="it.id ?? 'sep' + i">
                <div v-if="it.separator" class="gm-imenu-sep" role="separator"></div>
                <button v-else type="button" role="menuitem" class="gm-imenu-item" :class="{ active: indexOf(it) === active }"
                        :disabled="it.disabled" :title="it.title" @click="pick(it.id!)" @pointerenter="active = indexOf(it)">
                    <span class="gm-imenu-check" :class="it.check || ''" aria-hidden="true">{{ it.check ? '✓' : '' }}</span>
                    <span v-if="it.dot" class="gm-imenu-dot" :style="{ background: it.dot }" aria-hidden="true"></span>
                    <span class="gm-imenu-text">{{ it.label }}</span>
                    <span v-if="it.hint" class="gm-imenu-hint">{{ it.hint }}</span>
                </button>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import type { InlineMenuHandle, InlineMenuItem } from './inlineMenu'

const props = defineProps<{ menu: InlineMenuHandle }>()
const menu = props.menu
const el = ref<HTMLElement | null>(null)
const active = ref(-1)
const ROW = 24

/** Where it goes, and in how many columns (the container's room: never past its edges). */
const layout = computed(() => {
    const s = menu.state
    const n = s.items.length
    const room = Math.max(ROW * 3, s.box.height - 8 - (s.label ? 22 : 0))
    const rowsNeeded = s.items.reduce((h, it) => h + (it.separator ? 7 : ROW), 0)
    const cols = Math.max(1, Math.min(4, Math.ceil(rowsNeeded / room)))
    const perCol = Math.ceil(n / cols)
    return { cols, perCol }
})
const listStyle = computed(() => layout.value.cols > 1
    ? { display: 'grid', gridAutoFlow: 'column', gridTemplateRows: `repeat(${layout.value.perCol}, auto)`, columnGap: '2px' }
    : {})
const box = ref<Record<string, string>>({})

function place() {
    const m = el.value, s = menu.state
    if (!m) return
    const W = s.box.width, H = s.box.height, a = s.anchor
    const w = Math.min(m.offsetWidth, W - 8), h = Math.min(m.offsetHeight, H - 8)
    const below = H - a.bottom - 4, above = a.top - 4
    let top = below >= h || below >= above ? a.bottom + 2 : a.top - h - 2
    top = Math.max(4, Math.min(top, H - h - 4))
    let left = a.left + a.width / 2 > W / 2 ? a.right - w : a.left
    left = Math.max(4, Math.min(left, W - w - 4))
    box.value = { top: `${top}px`, left: `${left}px`, maxWidth: `${W - 8}px` }
}

function pick(id: string) { menu.close(id) }
const indexOf = (it: InlineMenuItem) => menu.state.items.indexOf(it)
function move(d: number) {
    const its = menu.state.items
    for (let k = 1; k <= its.length; k++) {
        const i = (active.value + d * k + its.length * 4) % its.length
        if (!its[i].separator && !its[i].disabled) { active.value = i; break }
    }
    ;(el.value?.querySelectorAll('.gm-imenu-item')[menu.state.items.slice(0, active.value).filter(x => !x.separator).length] as HTMLElement | undefined)?.focus()
}
function keys(e: KeyboardEvent) {
    const per = layout.value.perCol
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menu.close(null) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'ArrowRight' && layout.value.cols > 1) { e.preventDefault(); move(per) }
    else if (e.key === 'ArrowLeft' && layout.value.cols > 1) { e.preventDefault(); move(-per) }
    else if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1) }
}

function outside(e: PointerEvent) {
    if (el.value && !el.value.contains(e.target as Node)) menu.close(null)
}
watch(() => menu.state.open, async open => {
    window.removeEventListener('pointerdown', outside, true)
    if (!open) return
    active.value = -1
    box.value = { top: '-9999px', left: '0px' }
    await nextTick()
    place()
    el.value?.focus()
    move(1)
    window.addEventListener('pointerdown', outside, true)
})
onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', outside, true)
    if (menu.state.open) menu.close(null)
})
</script>
