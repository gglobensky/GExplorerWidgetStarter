# Media Library host integration gaps

This file records only generic GEM Shell contracts still needed by the Media Library. The widget must not patch Shell components to obtain them.

## Platform parity

The new image service is implemented on Windows. Linux currently reports image creation as unsupported, so local covers, thumbnails, and captured-frame assets need a Linux image backend before the widget has feature parity there.

## Implemented with the current Shell

- `pickFolder()` can select the folder currently shown and retains its dynamic **Select this folder** / **Select “name”** action for acceptance testing. `openFiles()` exercises `acceptLabel` through the cover picker's **Use as cover** action.
- `sdk.ui().quietMode()` dismisses and suppresses host hover tooltips while the Media Library player is open; closing the player releases it, with host cleanup as a fallback when the widget leaves the screen.
- `mediaImageCreate({ type: 'file' })` imports sidecar and user-selected cover files as same-origin assets.
- `mediaImageCreate({ type: 'thumbnail' })` supplies cached artwork for a local video without a sidecar.
- `mediaImageCreate({ type: 'url' })` imports TMDB posters and episode stills through the Network capability, public-address checks, bounded downloads, validation, re-encoding, and content-addressed cache storage.
- TMDB artwork respects custom-cover and local-sidecar priority; episode stills provide the preview fallback image.
- `networkFetch()` and URL images share the backend's public-internet-only HTTP path, including redirect/DNS checks and query-free security logging.
- The media loopback stream sends CORS headers. With `crossorigin="anonymous"` set before `src`, the widget captures the current playback frame, converts it to a blob, and passes the bytes to `mediaImageCreate`.
- Persistent storage keeps user-selected and captured covers; cache storage holds reproducible sidecar and thumbnail artwork.
- `mediaImageDelete()` removes a replaced persistent cover when no other media entry references it.
- `mediaVideoFramesCreate()` prepares all four exact preview stills in one cached host request and creates persistent covers from the current playback time. Frame decoding no longer runs in the widget's WebView.
- `networkFetch()` now forwards request options correctly, so TMDB JSON matching does not need a host fix.
- `sdk.secrets()` prompts for the TMDB token in a cross-origin Shell field, stores it OS-protected, exposes only status and a masked hint, and substitutes it into requests only for `api.themoviedb.org`. The widget never receives or persists the plaintext token.
- The existing `openUrl` host action can send users to TMDB account or approval pages with the Shell-owned confirmation flow.

The widget starter declaration now includes the media image and secret-handle contracts used by the implementation.
