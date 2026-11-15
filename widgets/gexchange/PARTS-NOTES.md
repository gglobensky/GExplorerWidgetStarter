# GExchange and GEM Shell's parts (notes, 2026-11-15)

GExchange is paused (`widgets.skip.json`). These notes are for when it comes back.

## What changed in GEM Shell

`useSlotProviders` and `useSlotState` are gone (GEM Shell 2026-11-15, roadmap group 3 F6a). They drew a provider's
component inside the consumer's own tree, from the provider's shared module, with the consumer's whole SDK. Parts now
go through `sdk.parts()`: `list(point)` gives the providers of a point in your `consumes` with their static `props`;
`mount(el, point, provider)` has GEM Shell draw the provider's part over your element, from the provider's own copy
of its code, never in your tree. A widget's own point (`gexchange.board`) will run as its provider; GEM Shell doesn't
mount those yet (`E_LATER`).

## What breaks here

- `ChatRoom.vue` imports `useSlotProviders` from `gexplorer/widgets` (`boardProviders`, the board tabs at about line
  497, the watch on it): it no longer exists, so the build fails.
- `entry.ts` `provides` / `consumes` `gexchange.board` stay valid declarations (`component` is kept, `props` must be
  plain JSON).

## Porting

1. GExchange's own board (`VoicePanel.vue`) is GExchange's code: import it directly in `ChatRoom.vue` and drop the
   self-provision from `entry.ts`. That is the whole of what the point does today.
2. Boards from other widgets: list them with `sdk.parts().list('gexchange.board')` (their label and props), and show
   one with `mount(el, 'gexchange.board', type)` in a box of the chat room once GEM Shell mounts widget points. They
   then run as their own widget, so anything they need from the room goes through messages, not shared state
   (`useSlotState` is gone).
