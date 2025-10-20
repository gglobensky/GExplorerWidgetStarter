// types/widgets-sdk.d.ts
declare module 'gexplorer/widgets' {
  import type { Ref, ShallowRef } from 'vue';

  /* ====================== AUDIO CORE ====================== */

  export type AudioCategory = 'music' | 'sfx' | 'voice' | 'custom';
  export type SuspendPolicy = 'continue' | 'pause' | 'duck';

  export interface SpawnOptions {
    ownerId: string;
    category?: AudioCategory;
    persistent?: boolean;
    keepOnSidebarCollapse?: boolean;
    suspendPolicy?: SuspendPolicy;
    initialProps?: Partial<{
      src: string;
      loop: boolean;
      volume: number;
      muted: boolean;
      preload: 'auto' | 'metadata' | 'none';
    }>;
  }

  export interface AudioHandle {
    id: string;
    ownerId: string;
    category: AudioCategory;

    play(): Promise<void>;
    pause(): void;
    load(): void;

    readonly paused: boolean;
    readonly readyState: number;
    readonly duration: number;

    addEventListener: HTMLMediaElement['addEventListener'];
    removeEventListener: HTMLMediaElement['removeEventListener'];

    src: string;
    currentTime: number;
    volume: number;
    muted: boolean;
    loop: boolean;
    playbackRate: number;

    connectToCategory(cat: AudioCategory): void;
    release(): void;
  }

  /* ====================== PLAYLISTS ====================== */

  export type RepeatMode = 'off' | 'one' | 'all';
  export type AutoNextMode = 'off' | 'linear';

  // Either a concrete id or a selector (id is `${ownerId}::${category}::${key}`)
  export type PlaylistSelector =
    | { ownerId: string; key: string; category?: AudioCategory }
    | string;

  export interface PlaylistItem {
    id: string;           // stable id from your library/queue
    src: string;          // playable URL (blob:, http(s):, etc.)
    name?: string;
    type?: string;
    // ...extra metadata allowed
  }

  export interface PlaylistOptions {
    autoNext?: AutoNextMode;
    repeat?: RepeatMode;
    shuffle?: boolean;
    dedupe?: boolean;
  }

  export interface PlaylistsApi {
    /** Create/replace a list; returns the resolved listId */
    register(sel: PlaylistSelector, items: PlaylistItem[], opts?: PlaylistOptions): string;

    /** Replace items (optionally keep current by id; allow dedupe override) */
    setItems(
      sel: PlaylistSelector,
      items: PlaylistItem[],
      opts?: { keepCurrent?: boolean; dedupe?: boolean }
    ): void;

    /** Update options (partial) */
    setOptions(sel: PlaylistSelector, opts: Partial<PlaylistOptions>): void;

    /** Read-only snapshot of current state (or null if not found) */
    get(sel: PlaylistSelector): {
      items: PlaylistItem[];
      currentIdx: number;      // -1 if none
      repeat: RepeatMode;
      shuffle: boolean;
      dedupe: boolean;
      autoNext: AutoNextMode;
      version: number;
    } | null;

    /** Wire an audio handle so 'ended' can auto-advance */
    bindToHandle(sel: PlaylistSelector, handle: AudioHandle): void;

    /** Remove the auto-advance binding */
    unbind(sel: PlaylistSelector): void;

    /** Start a specific index; resolves to the effective index or -1 */
    playIndex(sel: PlaylistSelector, index: number, handle: AudioHandle): Promise<number>;

    /** Advance forward/back; resolve to new index or -1 if none */
    next(sel: PlaylistSelector, handle?: AudioHandle): Promise<number>;
    prev(sel: PlaylistSelector, handle?: AudioHandle): Promise<number>;
  }

  export function useAudio(): {
    prime(): Promise<void>;
    acquireElement(opts: SpawnOptions & { key: string }): AudioHandle;
    playOneShot(
      url: string,
      opts: { ownerId: string; volume?: number; category?: AudioCategory }
    ): Promise<AudioHandle | void>;
    release(handleOrId: AudioHandle | string): void;

    setBusVolume(cat: AudioCategory | 'master', v: number): void;
    getBusVolume(cat: AudioCategory | 'master'): number;

    setDucking(opts: Partial<{ on: boolean; when: AudioCategory[]; amountDb: number; releaseMs: number }>): void;
    getDucking(): { on: boolean; when: AudioCategory[]; amountDb: number; releaseMs: number };

    muteBus(cat: 'master' | AudioCategory, on: boolean): void;
    setDebug(on: boolean): void;

    list(q?: { ownerId?: string }): Array<{ id: string; ownerId: string; category: AudioCategory; src?: string }>;

    state: {
      primed: Ref<boolean>;
      nowPlaying: ShallowRef<{ id: string; ownerId: string; src?: string } | null>;
      nowPlayingByCategory: Record<
        AudioCategory | 'custom',
        ShallowRef<{ id: string; ownerId: string; src?: string } | null>
      >;
    };

    playlists: PlaylistsApi;
  };

  /* ====================== LIFECYCLE ====================== */

  export type Visibility = 'visible' | 'collapsed';

export interface Lifecycle {
  visibility: import('vue').Ref<Visibility>;

  onSuspend(fn: () => void): () => void;
  onResume(fn: () => void): () => void;

  // live persistence
  persistRef<T>(key: string, initial: T | (() => T)): import('vue').Ref<T>;
  persistReactive<T extends object>(key: string, initial: T | (() => T)): T;

  // ✨ sugar for persistRef
  cell<T>(key: string, initial: T | (() => T)): import('vue').Ref<T>;

  // edge snapshot/hydrate
  bindRef<T>(key: string, target: import('vue').Ref<T>, opts?: { hydrate?: 'always' | 'once' | 'never' }): () => void;
  bindReactive<T extends object>(key: string, target: T, opts?: { hydrate?: 'always' | 'once' | 'never'; deep?: boolean }): () => void;
  snapshotNow(key?: string): void;
  hydrateNow(key?: string): void;

  keepInterval(fn: () => void, ms: number): () => void;
  keepTimeout(fn: () => void, ms: number): () => void;

  _hostSetVisibility(v: Visibility): void;
}

  export function createLifecycle(ownerId: string): Lifecycle;

  // Host/app-shell helpers
  export function setSidebarCollapsed(collapsed: boolean): void;
  export function hostSetOwnerCollapsed(ownerId: string, collapsed: boolean): void;
  export function hostDestroyOwner(ownerId: string): void;

  /* ====================== DnD ====================== */

  export type DnDId = string | number;

  export interface CreateDnDOptions<T> {
    identity: (item: T) => DnDId;
    getRef?: (item: T) => HTMLElement | null;
    orientation?: 'vertical' | 'horizontal';
    dragThresholdPx?: number;
    minMoveDeltaPx?: number;
    hoverThrottle?: 'rAF' | number;
    rowSelector?: string;
    onUpdate?: () => void;
    containerClassOnDrag?: string;
    scrollContainer?: HTMLElement | (() => HTMLElement | null) | null;
    autoScroll?: {
      marginPx?: number;
      maxSpeedPxPerSec?: number;
      ease?: (t: number) => number;
    };
  }

  export interface DnDHandle<T = unknown> {
    // data
    getOrderedList(): T[];
    getDisplayList(): T[];

    // wiring
    registerRef(item: T, ref: HTMLElement | null): void;
    startDrag(displayIdx: number, startEvent?: PointerEvent | MouseEvent): void;

    // mutations
    setOrderedList(items: T[]): void;
    insertAt(item: T, index: number, opts?: { shouldDedupe?: boolean }): void;
    push(item: T): void;
    unshift(item: T): void;
    remove(item: T): void;

    // utils
    getIdx(item: T): number | null;
    getFirst(): T | null;
    getLast(): T | null;
    getState(): { isDragging: boolean; draggingId: DnDId | null; hoverIdx: number | null };
    updateHover(displayIdx: number): void;
    commitDrag(): void;
    cancelDrag(): void;
    setScrollContainer(el: HTMLElement | null): void;
    destroy(): void;
  }

  export function createDnD<T>(items: T[], options: CreateDnDOptions<T>): DnDHandle<T>;
}
