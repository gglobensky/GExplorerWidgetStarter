# Shell API follow-ups

These are observations and requests for a future GEM Shell sprint. The weather widget does not bypass them or modify the host API.

## Device location — blocks automatic setup

No device/Wi-Fi geolocation method is exposed by the inspected public WidgetSdk. Initial setup currently offers city search and a disabled automatic-location option with an explanation.

Suggested contract: a capability-gated, explicitly user-triggered location request returning latitude/longitude, accuracy and timestamp, with distinct denied/unavailable/timeout results. The host should own OS permission handling. Coordinates are sufficient for a forecast; a display label is useful but optional. The widget should not assume Wi-Fi is the actual location source.

Once supported, replace the unavailable option with the host call, ask consent only on user action, and retain city search as fallback.

## Network request options — inconsistent wrapper signatures

The SDK passes `(widgetType, url, options)` to `widgets/net/index.ts`, whose signature is `(widgetType, widgetId, url, init)`. That wrapper passes four arguments to the bridge's three-argument method. URL-only GETs still reach the correct URL, but options can be lost. Weather uses ordinary documented GETs, with no positional workaround.

## Network cancellation / timeout — lifecycle robustness

The public declaration currently exposes method/headers/body, without an abort signal or timeout contract. Weather ignores obsolete results and cleans up timers, but cannot cancel a stalled host request. A host-supported cancellation/timeout mechanism would allow explicit request cleanup and deterministic retry UX.

## Verification item, not a confirmed API gap

The widget honors browser `prefers-reduced-motion` and observes changes. Verify that the real WebView updates it when Windows animation settings change. No custom animation-settings API is needed if that propagation works.

## No API addition needed for responsive height

A widget-local ResizeObserver measures its allocated box. Taller placements show Current and Forecast together; short placements use a view switch. The observer disconnects on unmount and uses a small breakpoint dead band to prevent oscillation during resize.

## Scroll-hint typings — runtime works, public types are opaque

The public `useScrollHints` utility provides the horizontal paging behavior needed by the narrow forecast, including overflow and edge state. Its declaration currently accepts and returns `any`, however, so widget authors do not get option validation or typed refs/results. Exporting the existing `ScrollAxis`, `WheelMode`, option and return types would make the API discoverable without changing its runtime contract.

## Scroll-hint motion preference — smooth behavior is hard-coded

`useScrollHints.scrollByPage` always requests smooth scrolling and exposes no behavior option. That means its arrow animation can remain smooth when `prefers-reduced-motion` is active, even though the weather card flip correctly stops. The host composable should either honor the media preference itself or accept a `ScrollBehavior` option so every widget gets consistent Windows animation behavior.

## Toolbar sizing contract — incomplete metadata and resize support

The toolbar runtime recognizes `contexts.toolbar`, but the public `WidgetDef` declaration does not describe it. Metadata extraction also replaces widget-declared toolbar values with fixed defaults (`weight: 1`, `minWidth: 100`) rather than carrying through a preferred, minimum or maximum width.

Toolbar editing currently exposes a width handle only between two adjacent widgets. It resizes the pair with a hard-coded 100px minimum and no maximum, so a single widget or the last outside edge cannot be resized independently. A future contract should expose `minWidth`, `defaultWidth` (or preferred width) and `maxWidth`, apply those constraints to every resize edge, and persist the chosen width. `WidgetHost` should also provide the toolbar's pixel width/height in `placement.size`, as it already does for the sidebar.

## Toolbar dropdown surface — blocks the forecast flyout

Toolbar widget slots and their ancestors clip overflow. The public SDK has message boxes, snackbars, context menus and pane-chrome slots, but no lightweight anchored popover/dropdown owned by a widget. Teleporting directly to `document.body` or positioning a fixed descendant would couple the weather widget to Shell DOM behavior and cross the agreed isolation boundary.

Suggested contract: an instance-bound anchored surface opened from a user event or anchor element, with placement/fallback rules, focus management, Escape and outside-click dismissal, viewport collision handling, theme inheritance, and automatic cleanup on unmount. The content should support a widget component or host-provided target element so an interactive three/seven-day forecast can be rendered without bypassing the host.
