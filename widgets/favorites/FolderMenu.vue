<!-- widgets/favorites/FolderMenu.vue — 0.3.0: one folder level, drawn in GEM Shell's popover (useFolderPopovers.ts).
     It reads its level from ctx.openMenus; everything it does goes through ctx (the widget's own handlers). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, type PropType } from 'vue'
import type { MenuRow } from './favorites.model'
import type { FolderMenuCtx } from './useFolderPopovers'


const props = defineProps({
  level: { type: Number, required: true },
  ctx: { type: Object as PropType<FolderMenuCtx>, required: true },
  /** GEM Shell's popover gives it (closes this level and those under it). */
  close: { type: Function as PropType<() => void>, default: undefined },
})

const menu = computed(() => props.ctx.openMenus.value[props.level] ?? null)

/** A folder opens after this hover (a drag uses its own timer: useDragVisuals.ts). */
const HOVER_OPEN_MS = 150
/** A favorite hovered this long closes the level a sibling folder opened. */
const HOVER_CLOSE_MS = 250
let timer: number | null = null
function clearTimer() { if (timer !== null) { clearTimeout(timer); timer = null } }

function onRowEnter(row: MenuRow, e: PointerEvent) {
  clearTimer()
  if (props.ctx.isDragging()) return
  const el = e.currentTarget as HTMLElement
  timer = window.setTimeout(() => {
    timer = null
    if (row.type === 'folder') props.ctx.onFolderHover(row, el, props.level)
    else props.ctx.onItemHover(props.level)
  }, row.type === 'folder' ? HOVER_OPEN_MS : HOVER_CLOSE_MS)
}

onBeforeUnmount(clearTimer)
</script>

<template>
  <div
    v-if="menu"
    class="fav-menu"
    @click.stop
    @contextmenu.prevent.stop="ctx.onDropdownMenu(menu.folderId, $event)"
    :ref="el => ctx.setMenuContainerRef(menu!, el as HTMLElement | null)"
  >
    <div class="fav-menu-title">
      {{ menu.label || 'Folder' }}
    </div>

    <div
      v-if="!menu.rows.length"
      class="fav-menu-empty"
      :class="{ 'is-drop-target': ctx.dropTargetFolderId.value === ('folder:' + (menu.folderId ?? '')) }"
    >
      No entries
    </div>

    <ul v-else class="fav-menu-list">
      <li
        v-for="row in menu.rows"
        :key="row.id"
        class="fav-menu-row"
        :class="{ 'is-folder': row.type === 'folder', 'is-open': row.type === 'folder' && ctx.openMenus.value[level + 1]?.folderId === row.id }"
        :ref="el => ctx.setMenuRowRef(row, el as HTMLElement | null)"
        @pointerenter="onRowEnter(row, $event)"
        @pointerleave="clearTimer"
      >
        <button
          type="button"
          class="fav-menu-btn"
          :data-fav-folder="row.type === 'folder' ? row.id : undefined"
          :data-fav-item="row.type === 'item' ? row.id : undefined"
          data-rename-row
          @pointerdown.stop="ctx.startMenuRowDrag(row, menu.folderId ?? '', $event as PointerEvent)"
          @click="ctx.onRowClick(row, $event, level)"
          @contextmenu.prevent.stop="row.type === 'item' ? ctx.onFavoriteMenu(row.id, $event) : ctx.onFolderNodeMenu(row.id, $event)"
          :title="row.type === 'item' ? ctx.favTip(row.label, row.locations) : row.label"
        >
          <span class="fav-menu-label">
            <span class="fav-menu-indent" :style="{ width: row.depth * 12 + 'px' }" />
            <span class="fav-menu-icon">
              <span v-if="row.type === 'folder'">📁</span>
              <span v-else :class="{ 'fav-icon--multi': ctx.paneCount(row.locations) > 1 }">★<span v-if="ctx.paneCount(row.locations) > 1" class="fav-pane-count">{{ ctx.paneCount(row.locations) }}</span></span>
            </span>
            <span class="fav-menu-text">{{ row.label }}</span>
          </span>
          <span v-if="row.type === 'folder'" class="fav-menu-more" aria-hidden="true">›</span>
        </button>

        <div class="fav-menu-row-actions">
          <button
            v-if="row.type === 'folder'"
            type="button"
            class="icon-btn danger fav-menu-delete-btn"
            @pointerdown.stop
            @click.stop="ctx.removeFolder(row.id)"
            title="Delete folder and nested favorites"
          >✕</button>
          <button
            v-else
            type="button"
            class="icon-btn danger fav-menu-delete-btn"
            @pointerdown.stop
            @click.stop="ctx.removeFavorite(row.id)"
            title="Remove favorite"
          >✕</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 0.3.0: moved from Widget.css; the frame (background, border, shadow, position) is GEM Shell's popover. */
.fav-menu {
  min-width: 220px;
  max-width: 320px;
  padding: 6px 0;
  color: var(--fav-fg, var(--fg, #eee));
  font-size: 12px;
}
.fav-menu-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.8;
  padding: 0 10px 4px;
}
.fav-menu-empty {
  font-size: 12px;
  opacity: 0.8;
  padding: 4px 10px 8px;
  font-style: italic;
}
.fav-menu-empty.is-drop-target {
  background: rgba(255, 255, 255, 0.06);
  border-top: 1px dashed rgba(255, 255, 255, 0.4);
  border-bottom: 1px dashed rgba(255, 255, 255, 0.4);
}
.fav-menu-list { list-style: none; margin: 0; padding: 0; }
.fav-menu-row { margin: 0; padding: 0; display: flex; align-items: center; }
.fav-menu-row.is-open { background: rgba(255, 255, 255, 0.06); }
.fav-menu-btn {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  min-width: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
  box-sizing: border-box;
}
.fav-menu-btn:hover { background: rgba(255, 255, 255, 0.08); }
.fav-menu-label { display: inline-flex; align-items: center; min-width: 0; flex: 1 1 auto; }
.fav-menu-indent { display: inline-block; flex: 0 0 auto; }
.fav-menu-icon { display: inline-block; width: 18px; text-align: center; margin-right: 4px; flex: 0 0 auto; }
.fav-menu-text { white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.fav-menu-more { flex: 0 0 auto; margin-left: 8px; opacity: 0.6; }
.fav-icon--multi { position: relative; margin-right: 4px; }
.fav-pane-count {
  position: absolute;
  right: -5px;
  bottom: -4px;
  min-width: 11px;
  height: 11px;
  padding: 0 2px;
  box-sizing: border-box;
  border-radius: 6px;
  background: var(--accent, #4ea1ff);
  color: #081018;
  font: 700 8px/11px system-ui, sans-serif;
  text-align: center;
  pointer-events: none;
}
.fav-menu-row-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  padding-right: 6px;
}
.fav-menu-row:hover .fav-menu-row-actions { opacity: 1; }
.icon-btn {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0.7;
}
.icon-btn.danger:hover { color: #ff6b6b; opacity: 1; background: rgba(255, 107, 107, 0.12); }
.fav-menu-delete-btn { font-size: 10px; padding: 1px 3px; }
@media (prefers-reduced-motion: reduce) {
  .fav-menu-row-actions { transition: none; }
}
</style>
