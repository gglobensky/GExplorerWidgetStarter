<script setup lang="ts">
import { ref, computed } from '/runtime/vue.js'

type LinkItem = {
  id: string
  name: string
  target: string
  type: 'web' | 'local'
}

type HostAction = 
  | { type: 'nav'; to: string } 
  | { type: 'openUrl'; url: string; options?: { askUser?: boolean; title?: string } }

const props = defineProps<{
  config?: { 
    links?: LinkItem[]
    showSeparator?: boolean
    groupByType?: boolean
  }
  placement?: {
    context: 'grid' | 'sidebar' | 'embedded'
    layout: string  // 'compact', 'expanded', etc.
    size: any
  }
  runAction?: (a: HostAction) => void
}>()

const links = ref<LinkItem[]>(props.config?.links || [])

function normalizeLink(link: any): LinkItem {
  return {
    id: link.id || `link-${Date.now()}`,
    name: link.name || link.target,
    target: link.target,
    type: link.type || detectLinkType(link.target)
  }
}

function detectLinkType(target: string): 'web' | 'local' {
  if (/^https?:\/\//i.test(target)) return 'web'
  return 'local'
}

const organizedLinks = computed(() => {
  const normalized = links.value.map(normalizeLink)
  
  if (!props.config?.groupByType) return normalized
  
  const web = normalized.filter(l => l.type === 'web')
  const local = normalized.filter(l => l.type === 'local')
  
  return [...web, ...local]
})

const showSeparator = computed(() => {
  if (!props.config?.showSeparator || !props.config?.groupByType) return false
  
  const web = organizedLinks.value.filter(l => l.type === 'web')
  const local = organizedLinks.value.filter(l => l.type === 'local')
  
  return web.length > 0 && local.length > 0
})

// NEW: Check current layout
const isCompact = computed(() => props.placement?.layout === 'compact')
const isExpanded = computed(() => props.placement?.layout === 'expanded')

function getIcon(link: LinkItem): string {
  return link.type === 'web' ? '🌐' : '📁'
}

function getPreview(link: LinkItem): string {
  if (link.type === 'web') {
    return link.target
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/$/, '')
      .substring(0, 30)
  } else {
    const parts = link.target.split(/[/\\]/)
    if (parts.length > 3) {
      return `${parts[0]}\\...\\${parts[parts.length - 1]}`
    }
    return link.target
  }
}

function handleClick(link: LinkItem) {
  if (!props.runAction) return
  
  if (link.type === 'web') {
    props.runAction({ 
      type: 'openUrl', 
      url: link.target,
      options: {
        askUser: true,
        title: link.name
      }
    })
  } else {
    props.runAction({ type: 'nav', to: link.target })
  }
}
</script>

<template>
  <div class="links-widget" :class="{ compact: isCompact, expanded: isExpanded }">
    <div class="links-list">
      <div
        v-for="link in organizedLinks"
        :key="link.id"
        class="link-item"
        :class="{ 
          web: link.type === 'web',
          local: link.type === 'local'
        }"
        @click="handleClick(link)"
      >
        <div class="link-icon">{{ getIcon(link) }}</div>
        <div class="link-content">
          <div class="link-name">{{ link.name }}</div>
          <div v-if="isExpanded" class="link-preview">{{ getPreview(link) }}</div>
        </div>
      </div>
      
      <div v-if="showSeparator" class="separator" />
    </div>
    
    <div v-if="organizedLinks.length === 0" class="empty">
      No links yet
    </div>
  </div>
</template>

<style scoped>
.links-widget {
  padding: 8px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.links-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
  border-left: 3px solid transparent;
  box-sizing: border-box;
}

.link-item:hover {
  background: var(--surface-3, #2a2a2a);
}

.link-item:active {
  transform: translateY(1px);
}

.link-item.web {
  border-left-color: #4ea1ff;
}

.link-item.local {
  border-left-color: #f59e0b;
}

.link-icon {
  font-size: 20px;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.link-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.link-name {
  font-weight: 500;
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-preview {
  font-size: 0.75em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.separator {
  height: 1px;
  background: var(--border, #555);
  margin: 4px 0;
}

.empty {
  padding: 16px;
  text-align: center;
  opacity: 0.5;
  font-size: 0.9em;
}

/* Compact variant (smaller padding) */
.links-widget.compact .link-item {
  padding: 6px 8px;
}

.links-widget.compact .link-icon {
  font-size: 16px;
  width: 20px;
  height: 20px;
}

.links-widget.compact .link-name {
  font-size: 0.85em;
}

/* Expanded variant (more spacing, shows preview) */
.links-widget.expanded .link-item {
  padding: 10px 12px;
}
</style>