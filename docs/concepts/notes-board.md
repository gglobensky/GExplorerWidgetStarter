# Notes board concept

## Product goal

The Notes Board is one widget containing a freeform desk of post-it notes. Notes can be created, edited, moved, resized, overlapped and brought forward. The board should feel direct and lightweight while retaining every note and its layout between sessions.

Grid is the primary context. A sidebar form can become a list or quick-capture view, and a toolbar form can become a single quick-capture button once the host has an anchored popover surface. Those compact forms present the same data; they do not attempt to reproduce the full board.

## Board behavior

Each note has:

- A stable identifier, title, plain-text body and color.
- Position, width, height and z-order.
- Created and modified timestamps.
- An optional locked state that prevents accidental movement and resizing.
- An optional collapsed state for temporarily reducing visual weight.

The full interaction model should support:

- Creating a note by button, keyboard shortcut or double-clicking empty board space.
- Editing without accidentally beginning a drag.
- Dragging from a dedicated grip or non-editing header region.
- Resizing from visible edges and corners with sensible minimum dimensions.
- Bringing a note forward when it is selected.
- Sending a note backward or forward explicitly from its menu.
- Snapping to an optional board grid and showing alignment guides near other notes.
- Overlap with deterministic z-order; the board must never silently move another note.
- Multi-selection, group movement and group deletion after the single-note interactions are stable.
- Duplicate, color, lock and delete commands from a host-owned context menu.
- Undo for layout changes and destructive note commands within the active session.
- Keyboard movement and resizing for the selected note.
- Touch and pen input through Pointer Events and pointer capture.

Overlapping notes are visual layers rather than a collision-resolving grid. Named stacks could be added later: dropping a note on a stack groups it, shows the count and lets the user fan or cycle the notes. Basic overlap and z-order should work before stacks are introduced.

## Persistence

The host-owned widget configuration should be the durable source of truth for each board instance. A versioned shape could begin as:

```ts
type NotesBoardDataV1 = {
  schema: 1
  notes: Array<{
    id: string
    title: string
    body: string
    color: string
    x: number
    y: number
    width: number
    height: number
    z: number
    locked?: boolean
    collapsed?: boolean
    createdAt: number
    modifiedAt: number
  }>
}
```

Text edits should emit a debounced `update:config`; blur, suspension and unmount should flush pending edits. Layout changes can commit at the end of a gesture while keeping an in-memory preview during the gesture. The board must normalize z-order periodically so repeated bring-to-front operations do not produce unbounded values.

`sdk.lifecycle().persistRef()` can preserve transient editing and selection state across suspension, but it is not the durable store for a board that must survive an application restart.

## Required public spatial-layout utility

The Shell's two-dimensional grid driver is currently internal. The public SDK exports a one-axis sortable and a stepped vertical list resizer, neither of which models a freeform overlapping board. The complete board should wait for a reusable public utility instead of importing Shell internals or creating a second incompatible drag/resize system.

The reusable surface should be an unprivileged export from `gexplorer/widgets`, conceptually similar to:

```ts
type SpatialItem = {
  id: string
  x: number
  y: number
  width: number
  height: number
  z: number
}

type SpatialLayoutOptions = {
  container: () => HTMLElement | null
  items: () => SpatialItem[]
  mode: 'freeform' | 'collision-grid'
  overlap: 'allow' | 'prevent'
  snap?: { x: number; y: number; thresholdPx?: number }
  minSize?: { width: number; height: number }
  onPreview?(items: SpatialItem[]): void
  onCommit(items: SpatialItem[], reason: 'move' | 'resize' | 'z-order'): void
}
```

The exact contract can differ, but it should own:

- Pointer capture, drag thresholds and cancellation.
- Move and edge/corner resize gestures.
- Grid snapping and optional alignment guides.
- Container bounds and minimum/maximum sizes.
- Z-order changes when overlap is allowed.
- Auto-scroll near board edges.
- Keyboard move/resize commands and accessible announcements.
- Reduced-motion behavior and a clear preview/commit lifecycle.
- Cleanup when the component unmounts or the widget suspends.

The utility should accept and return serializable geometry while leaving note content and visual design to the widget.

## Accessibility and visual behavior

- Editing a note uses a normal text control with visible focus.
- Selected notes expose move, resize and layer commands without requiring a pointer.
- Color is decorative; selection, lock and error states also use shape or icons.
- Motion follows `prefers-reduced-motion`.
- The board supports zoom or a fit-all overview only after core movement remains predictable at 100%.
- Notes retain readable contrast against every board background and Shell theme.

## Delivery sequence

1. Validate durable per-instance note configuration with a one-note widget that relies on the host grid for its own placement.
2. Add the public spatial-layout utility and verify it in a small fixture.
3. Build the board with create, edit, move, resize, overlap, z-order and persistence.
4. Add multi-selection, undo and alignment guides.
5. Consider named stacks, board zoom, import/export and compact-context views.

The one-note widget remains useful on its own and does not need to be discarded when the board arrives.
