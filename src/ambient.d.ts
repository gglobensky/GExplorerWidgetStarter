// Use Vue types when importing the host's shim.
declare module '/src/runtime/vue.ts' {
  export * from 'vue'
}

// Host IPC helpers (minimal surface mirrored for types).
declare module '/src/bridge/ipc.ts' {
  export type DirEntry = { name: string; fullPath: string }

  export function fsValidate(path: string): Promise<{
    ok: boolean; exists: boolean; isDir: boolean; path: string; error?: string
  }>

  export function fsListDir(path: string): Promise<{
    ok: boolean; basePath?: string; entries: DirEntry[]; error?: string
  }>

  export function fsListDirWithAuth(widgetType: string, widgetId: string, path: string): Promise<{
    ok: boolean; basePath?: string; entries: DirEntry[]; error?: string
  }>

  export function fsDriveStats(roots: string[]): Promise<Array<{
    root: string; ready: boolean; total: number; free: number; used: number; error?: string
  }>>
  
  export function fsOpen(path: string): Promise<{ ok: boolean; error?: string }>

  export function shortcutsProbe(paths: string[]): Promise<{
    results: Array<{ path: string; IconKey: string }>
  }>
}

// Network bridge (gated by permissions)
declare module '/src/bridge/network.ts' {
  export function networkFetch(
    widgetType: string,
    widgetId: string,
    url: string,
    options?: {
      method?: string
      headers?: Record<string, string>
      body?: string
    }
  ): Promise<{
    ok: boolean
    status: number
    statusText: string
    json: () => Promise<any>
    text: () => Promise<string>
  }>
}

// Consent service
declare module '/src/consent/service' {
  export function ensureConsent(
    widgetType: string,
    widgetId: string,
    path: string,
    caps: string[],
    options?: { afterDenied?: boolean }
  ): Promise<boolean>
}

// Example host shared lib
declare module '/src/runtime/libs/dayjs.ts' {
  import dayjs from 'dayjs'
  export { dayjs }
}

// ============================================
// WIDGET DEFINITION TYPES (GLOBAL)
// ============================================

// Standard layout IDs
type GridLayoutId = 'list' | 'grid' | 'details'
type SidebarLayoutId = 'compact' | 'expanded'

// Context configurations
interface GridContext {
  size: {
    minCols: number
    minRows: number
    maxCols?: number
    maxRows?: number
    defaultCols: number
    defaultRows: number
  }
  layouts?: Array<{
    id: GridLayoutId | string
    icon?: string
    tooltip?: string
  }>
  controls?: {
    columns?: { 
      min: number
      max: number
      default: number
      appliesTo?: string[]
    }
    itemSize?: { 
      options: Array<'sm' | 'md' | 'lg'>
      default: 'sm' | 'md' | 'lg' 
    }
  }
}

interface SidebarContext {
  size: {
    minHeight: number
    maxHeight?: number
    defaultHeight: number
  }
  layouts?: Array<{
    id: SidebarLayoutId | string
    icon?: string
    tooltip?: string
  }>
}

// Widget placement info (passed to widget as prop)
interface WidgetPlacement {
  context: 'grid' | 'sidebar' | 'embedded'
  layout: string
  size: {
    width?: number
    height?: number
    cols?: number
    rows?: number
  }
}

// Widget definition
interface WidgetDefinition {
  api: '1.0'
  id: string
  version: string
  Component: any
  
  contexts: {
    grid?: GridContext
    sidebar?: SidebarContext
  }
  
  defaults: Record<string, any>
  capabilities: string[]
}

// Props that every widget receives
interface WidgetProps {
  config?: Record<string, any>
  theme?: Record<string, string>
  placement: WidgetPlacement
  runAction?: (action: HostAction) => void
  editMode?: boolean
}

// Host actions
type HostAction =
  | { type: 'nav'; to: string }
  | { type: 'open'; path: string }
  | { type: 'openUrl'; url: string; options?: { askUser?: boolean; title?: string } }
  
/* Widget base styles */
.widget-host {
  font-size: var(--font-md);
  color: var(--fg);
}

/* =====================================================================================
 * Drag & Drop utilities for widget authors (ambient type declarations only)
 * ===================================================================================== */

/**
 * Recommended import shape for widget authors (adjust to your pseudo-API path):
 *
 *   import { createDnD } from "gexplorer/widgets";
 *
 * or, if you expose it on a global:
 *
 *   const dnd = gexplorer.widgets.createDnD(...)
 */

declare module "gexplorer/widgets" {
    export type SortableId = string | number
  export type SortableOrientation = "vertical" | "horizontal"

  export interface SortableState {
    isDragging: boolean
    draggingId: SortableId | null
    hoverIdx: number | null
  }

  export interface CreateSortableOptions<T> {
    identity(item: T): SortableId
    getRef?(item: T): HTMLElement | null

    orientation?: SortableOrientation
    dragThresholdPx?: number
    rowSelector?: string
    onUpdate?: () => void

    containerClassOnDrag?: string
    scrollContainer?: HTMLElement | (() => HTMLElement | null) | null
    autoScroll?: { marginPx?: number; maxSpeedPxPerSec?: number }
  }

  export interface SortableHandle<T> {
    getOrderedList(): T[]
    getDisplayList(): T[]
    setOrderedList(items: readonly T[]): void

    registerRef(item: T, el: HTMLElement | null): void
    startDrag(displayIndex: number, startEvent?: PointerEvent | MouseEvent): void

    getState(): SortableState
    destroy(): void
  }

  export function createLinearSortable<T>(
    items: readonly T[],
    options: CreateSortableOptions<T>
  ): SortableHandle<T>
  
  /** Orientation for hit testing & pointer axis */
  export type DnDOrientation = "vertical" | "horizontal";

  /** Strategy for determining hover index from a row's rect */
  export type DnDHitTestStrategy = "bounds" | "midpoint";

  /**
   * Configuration for createDnD
   * @template T Item type in the list (must have a stable identity via `identity`)
   */
  export interface DnDConfig<T> {
    /**
     * Return a stable identity for an item (string or number).
     * Used for map lookups and reordering without mutating items.
     */
    identity(item: T): string | number;

    /**
     * Optional eager ref lookup for each item.
     * If not provided, call `registerRef(item, el)` in your template to bind lazily.
     */
    getRef?(item: T): HTMLElement | null;

    /**
     * Primary axis of movement and hit-testing.
     * - "vertical": uses clientY and element top/bottom.
     * - "horizontal": uses clientX and element left/right.
     * @default "vertical"
     */
    orientation?: DnDOrientation;

    /**
     * Minimum pointer movement (px) from pointerdown before the drag "engages".
     * Prevents accidental drags on small taps.
     * @default 6
     */
    dragThresholdPx?: number;

    /**
     * Minimum delta (px) between processed move samples before recomputing hover.
     * Acts as a simple movement gate to reduce work during scroll+drag scenarios.
     * @default 2
     */
    minMoveDeltaPx?: number;

    /**
     * How often to recompute hover while dragging.
     * - "rAF": coalesce move events to one computation per animation frame.
     * - number: ms interval (e.g., 16 for ~60Hz) if you prefer time-based throttling.
     * @default "rAF"
     */
    hoverThrottle?: "rAF" | number;

    /**
     * Controls where inside a row an item is considered "hovered".
     * - "bounds": any point inside the rect.
     * - "midpoint": only crosses when the pointer passes the rect's midpoint.
     * @default "bounds"
     */
    hitTestStrategy?: DnDHitTestStrategy;
  }

  /** Public drag state snapshot for visuals */
  export interface DnDState {
    /** True once the drag threshold is crossed and preview order is active */
    isDragging: boolean;
    /** The identity of the item being dragged (if any) */
    draggingId: string | number | null;
    /** Current hover index in the *display* order (if any) */
    hoverIdx: number | null;
  }

  /**
   * DnD instance API returned by `createDnD`.
   * Keeps a committed order and a separate preview order while dragging.
   */
  export interface DnD<T> {
    // ----- Reading lists -----

    /**
     * Committed list (source of truth). Does NOT reflect preview shuffling during a drag.
     */
    getOrderedList(): T[];

    /**
     * Display list. During a drag, shows the visual preview (dragged item inserted at hoverIdx).
     * Otherwise equals `getOrderedList()`.
     */
    getDisplayList(): T[];

    // ----- Writing lists -----

    /**
     * Replace the entire committed list.
     * Resets drag state and rebuilds internal indices.
     */
    setOrderedList(items: readonly T[]): void;

    /**
     * Append an item to the end of the committed list.
     * No dedupe is performed here (duplicates are allowed for queues).
     */
    push(item: T): void;

    /**
     * Prepend an item to the beginning of the committed list.
     * No dedupe is performed here (duplicates are allowed for queues).
     */
    unshift(item: T): void;

    /**
     * Insert an item at a specific index in the committed list.
     * @param item The item to insert.
     * @param index Target index (will be clamped to [0..length]).
     * @param shouldDedupe If true, remove any existing occurrences (by identity) before inserting.
     *                     Defaults to false so queues (e.g., music) can contain duplicates.
     */
    insertAt(item: T, index: number, shouldDedupe?: boolean): void;

    /**
     * Remove an item (by identity) from the committed list. No-op if not present.
     */
    remove(item: T): void;

    // ----- Introspection helpers -----

    /**
     * Get the committed index of an item, or null if not present.
     */
    getIdx(item: T): number | null;

    /**
     * First item in the committed list, or null.
     */
    getFirst(): T | null;

    /**
     * Last item in the committed list, or null.
     */
    getLast(): T | null;

    // ----- Wiring helpers -----

    /**
     * Bind or update a DOM ref for an item (lazy binding).
     * Call inside your templating loop, e.g.:
     *
     *   :ref="el => dnd.registerRef(item, el as HTMLElement)"
     */
    registerRef(item: T, el: HTMLElement | null): void;

    // ----- Drag lifecycle -----

    /**
     * Begin a drag from a given DISPLAY index.
     * Typically invoked from row mousedown/pointerdown.
     *
     * @param displayIndex Index in `getDisplayList()` at the start of the drag.
     * @param startEvent Optional pointer/mouse event used to capture the pointer (if supported).
     *                   Implementations should prefer Pointer Events and call setPointerCapture.
     */
    startDrag(displayIndex: number, startEvent?: PointerEvent | MouseEvent): void;

    /**
     * Update the current hover target (DISPLAY index). Safe to call frequently; throttling is applied by config.
     */
    updateHover(displayIndex: number): void;

    /**
     * Commit the preview order to the committed list (finalizes the reorder).
     */
    commitDrag(): void;

    /**
     * Cancel the drag without changing the committed list.
     */
    cancelDrag(): void;

    /**
     * Snapshot of public drag state for rendering (e.g., highlight the dragged row).
     */
    getState(): DnDState;

    /**
     * Cleanup any listeners/timers associated with this instance.
     */
    destroy(): void;
  }

  /**
   * Create a new DnD controller for a reorderable list.
   *
   * @example
   * ```ts
   * type Row = { id: string; name: string };
   * const dnd = createDnD<Row>(rows, {
   *   identity: r => r.id,
   *   orientation: "vertical",      // default
   *   dragThresholdPx: 6,           // default
   *   hoverThrottle: "rAF",         // default
   * });
   *
   * // In a template loop:
   * // :ref="el => dnd.registerRef(row, el as HTMLElement)"
   * // @pointerdown="() => dnd.startDrag(displayIndex, $event)"
   * // @pointermove="() => dnd.updateHover(displayIndex)"
   *
   * // For rendering rows:
   * const display = dnd.getDisplayList(); // includes live preview while dragging
   * const state = dnd.getState();         // e.g., add 'is-dragging' class when state.draggingId matches the row id
   * ```
   *
   * @template T Item type in the list
   * @param items Initial committed order
   * @param config Behavior & perf tuning
   * @returns DnD controller instance
   */
  export function createDnD<T>(
    items: readonly T[],
    config: DnDConfig<T>
  ): DnD<T>;

  /**
   * Overload: start with an empty list and configure behavior.
   */
  export function createDnD<T>(
    items: undefined | null,
    config: DnDConfig<T>
  ): DnD<T>;
}

/* -------------------------------------------------------------------------------------
 * (Optional) Global exposure if you also attach this to a global `gexplorer.widgets`.
 * Uncomment if that's part of your dev DX story.
 * -------------------------------------------------------------------------------------

declare global {
  namespace gexplorer {
    namespace widgets {
      export import DnDOrientation = import("gexplorer/widgets").DnDOrientation;
      export import DnDHitTestStrategy = import("gexplorer/widgets").DnDHitTestStrategy;
      export import DnDConfig = import("gexplorer/widgets").DnDConfig;
      export import DnDState = import("gexplorer/widgets").DnDState;
      export import DnD = import("gexplorer/widgets").DnD;
      export import createDnD = import("gexplorer/widgets").createDnD;
    }
  }
}

export {};
*/
