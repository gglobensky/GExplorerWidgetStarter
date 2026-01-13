import { ref, computed, watch, type Ref, type ComputedRef } from '/runtime/vue.js'

/**
 * ============================================================================
 * useItemsSort - Client-side sorting and filtering composable
 * ============================================================================
 * 
 * ⚠️  IMPORTANT: THIS IS A TEMPORARY CLIENT-SIDE IMPLEMENTATION
 * 
 * Current State:
 * --------------
 * This composable handles ALL sorting and filtering on the frontend.
 * It receives the complete directory listing from the backend and processes
 * it in the browser.
 * 
 * Why This Needs to Change:
 * --------------------------
 * For large directories (10,000+ files), this approach has critical issues:
 * 
 * 1. **Slow Initial Load**: Transferring 10k+ file entries via IPC is slow
 *    - JSON serialization/deserialization overhead
 *    - Large payload sizes (potentially megabytes)
 * 
 * 2. **IPC Size Limits**: Stringified JSON can hit size caps during transfer
 *    - Results in truncated data or complete failures
 *    - No graceful degradation
 * 
 * 3. **Unnecessary Frontend Work**: Browser does heavy lifting
 *    - Sorting 10k items blocks the main thread
 *    - Filtering is redundant if backend can do it
 *    - Memory pressure from keeping all entries in RAM
 * 
 * 4. **No Pagination**: All-or-nothing loading
 *    - Can't progressively load results
 *    - Can't implement virtual scrolling effectively
 * 
 * Future Architecture (Post-Refactor):
 * -------------------------------------
 * This composable should become a thin wrapper that:
 * 
 * 1. **Calls Backend API** with sort/filter parameters:
 *    ```typescript
 *    await fsListDirSmart('items', sourceId, path, {
 *      sortBy: 'name',
 *      sortDir: 'asc',
 *      filters: { exts: ['mp3', 'wav'] },
 *      offset: 0,
 *      limit: 500
 *    })
 *    ```
 * 
 * 2. **Handles Pagination**:
 *    - Request chunks of 500-1000 items
 *    - Load more as user scrolls (virtual scrolling)
 *    - Keep only visible + buffer in memory
 * 
 * 3. **Streams Large Results**:
 *    - Use IPC streaming if available
 *    - Or multiple chunked requests
 *    - Render progressively as data arrives
 * 
 * 4. **Caches Backend Results**:
 *    - Backend can cache sorted results per directory
 *    - Only re-sort on directory changes or sort criteria changes
 *    - Much faster than re-sorting on every render
 * 
 * Migration Path:
 * ---------------
 * 1. Add backend sorting/filtering to fsListDirSmart in C#
 * 2. Update this composable to pass sort params to backend
 * 3. Remove client-side sort logic (keep as fallback initially)
 * 4. Add pagination support
 * 5. Implement virtual scrolling in layout components
 * 6. Remove fallback client-side logic once backend is stable
 * 
 * Benefits After Migration:
 * -------------------------
 * - 10x faster directory loads for large folders
 * - No IPC size limits (chunked transfer)
 * - Responsive UI even with 100k+ files
 * - Lower memory usage (only load what's visible)
 * - Potential for smarter caching strategies
 * 
 * NOTE: The composable extraction (this file) makes the refactor MUCH easier
 * because all sort logic is isolated here. When backend is ready, we just
 * swap out this file's internals without touching Widget.vue or layouts.
 * ============================================================================
 */

export type SortKey = 'name' | 'kind' | 'ext' | 'size' | 'modified'
export type SortDir = 'asc' | 'desc'

export interface ItemsFilter {
  exts?: string[]   // lowercased, no dots, e.g. ["mp3", "wav"]
}

export interface UseItemsSortOptions {
  entries: Ref<any[]>
  initialSortKey?: SortKey
  initialSortDir?: SortDir
  activeFilter?: ComputedRef<ItemsFilter | null>
}

export interface UseItemsSortReturn {
  sortKey: Ref<SortKey>
  sortDir: Ref<SortDir>
  sortedEntries: ComputedRef<any[]>
  onHeaderClick: (nextKey: SortKey) => void
}

export function useItemsSort(options: UseItemsSortOptions): UseItemsSortReturn {
  const { entries, initialSortKey = 'name', initialSortDir = 'asc', activeFilter } = options

  // ---- Reactive Sort State ----
  const sortKey = ref<SortKey>(initialSortKey)
  const sortDir = ref<SortDir>(initialSortDir)

  // ---- Sort Logic (TO BE REPLACED BY BACKEND CALL) ----
  const sortedEntries = computed(() => {
    // TODO: Replace this entire computed with a backend API call
    // Future: return paginatedEntries.value (from backend)
    
    const k = sortKey.value
    const dir = sortDir.value === 'asc' ? 1 : -1

    // Locale-aware string comparison (good for names)
    const cmp = (a: string, b: string) =>
      String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })

    // Start from raw directory entries
    let data = entries.value.slice()

    // ---- Apply extension filter (SHOULD BE BACKEND) ----
    // TODO: Move this to backend - send filter.exts in API request
    const f = activeFilter?.value
    if (f?.exts && f.exts.length) {
      const allowed = new Set(
        f.exts
          .map(e => (e || '').toString().toLowerCase())
          .filter(e => e && e !== '*')    // treat "*" as "no restriction"
      )

      if (allowed.size) {
        data = data.filter((e: any) => {
          const kindStr = String(e?.Kind || '').toLowerCase()
          const isDir =
            kindStr.includes('dir') ||   // "Dir", "Directory"
            kindStr === 'folder'

          // Never hide folders – matches OS dialogs
          if (isDir) return true

          const ext = String(e?.Ext || '')
            .toLowerCase()
            .replace(/^\./, '')          // ".mp3" -> "mp3"

          if (!ext) return false         // files with no ext are hidden under filtered view
          return allowed.has(ext)
        })
      }
    }

    // ---- Sort the filtered set (SHOULD BE BACKEND) ----
    // TODO: Move this to backend - C# can sort much faster
    data.sort((A, B) => {
      if (k === 'name')
        return cmp(A?.Name || '', B?.Name || '') * dir

      if (k === 'ext') {
        const c = cmp(A?.Ext || '', B?.Ext || '')
        return (c || cmp(A?.Name || '', B?.Name || '')) * dir
      }

      if (k === 'size') {
        const sa = (A?.Size ?? 0), sb = (B?.Size ?? 0)
        const c = sa === sb ? 0 : (sa < sb ? -1 : 1)
        return (c || cmp(A?.Name || '', B?.Name || '')) * dir
      }

      if (k === 'modified') {
        const ta = A?.ModifiedAt ? +new Date(A.ModifiedAt) : 0
        const tb = B?.ModifiedAt ? +new Date(B.ModifiedAt) : 0
        const c = ta === tb ? 0 : (ta < sb ? -1 : 1)
        return (c || cmp(A?.Name || '', B?.Name || '')) * dir
      }

      return 0
    })

    return data
  })

  // ---- Sort Toggle Handler ----
  // This will stay the same after backend migration - just triggers new API call
  function onHeaderClick(nextKey: SortKey) {
    if (sortKey.value === nextKey) {
      // Toggle direction
      sortDir.value = (sortDir.value === 'asc' ? 'desc' : 'asc')
    } else {
      // New sort key, default to ascending
      sortKey.value = nextKey
      sortDir.value = 'asc'
    }
    
    // TODO: After backend migration, trigger API call here:
    // await fetchSortedEntries(sortKey.value, sortDir.value, activeFilter)
  }

  return {
    sortKey,
    sortDir,
    sortedEntries,
    onHeaderClick
  }
}