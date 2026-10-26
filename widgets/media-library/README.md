# GEM Video Club · Media Library milestone

GEM Video Club establishes the shared GEM Library UI and video-store shelf experience without requiring Shell changes. With no source folder selected it shows an empty shelf of DVD cases, the middle one asking for a media folder. Once folders are selected, it scans real local video files through the public widget SDK.

## What's new in 0.6.0 (2026-10-25)

- **Playback through GEM Shell's video rack** (`sdk.video()`, new in the shell the same day): the movie plays in a `<video>` the shell owns, shown in the player with `<gex-video-surface>`. With *Keep playing when hidden* on, the background job holds it: leaving the screen, the shell parks the very same element and it plays on (sound only: the shell stops decoding its picture while parked, when the WebView allows it); back on screen, the same element is shown again. No muted twin, no hand-over, no drift, and one decoder instead of two. The tray card controls the parked video. With the setting off, the shell releases the video with the widget and the player reopens paused where it was. `useParkedPlayback.ts`; on shells without `sdk.video()`, the 0.5.0 muted twin (`useBackgroundPlayback.ts`) still does the job.
- **Checks a video before playing it** (`sdk.mediaProbe`, GEM Shell phase 2): when GEM Shell says the picture or the sound can't be decoded on this computer (10-bit HEVC without a hardware decoder for it, a format that crashed GEM Shell here before, AC-3 / DTS sound, an AVI...), a box says why and offers the default video player (the default button) or *Play here anyway* (not asked again for that file this session). Without `mediaProbe` (older shells) it just plays.
- **Converted playback** (GEM Shell phases 3-4): when the shell can convert the file while it plays (`probe.conversion`: an AVI or TS repackaged, AC-3 / DTS sound converted to AAC, a picture this computer can't decode re-encoded to H.264 by ffmpeg), the box is skipped. The player sets its stream URL as usual, and the shell's video plays it converted; the shell shows its own notice. The player and the background playback compare URLs through `element.src` (it keeps answering the URL set, whatever plays underneath).

## What's new in 0.5.0 (2026-10-25)

- **One look setting:** *Video Club* (showroom aisle and the movie-store case) or *Classic* (shelves and a details page). Older placements are mapped over: Shelves + Classic details become Classic, anything else becomes Video Club. The showroom now opens with featured racks: Continue watching, New arrivals and Collections.
- **Watch progress** (`watch-progress` document, by media path): Resume and Start over, a watched mark on cases, Continue watching for real libraries (the next episode after a finished one), and *Up next* with a 10 s countdown at the end of an episode.
- **Sorting** (top bar): Title (ignoring "The / A / An"), Release date, Recently added, Sequels together.
- **Collections:** matching a movie also reads its TMDB collection and runtime (one more request per matched movie). A Collections shelf shows each set of two or more local movies in release order. TMDB has no in-universe chronology. *Refresh matches* fills in collections for movies matched before 0.5.0.
- **Extras:** videos in an extras folder (`Extras`, `Featurettes`, `Behind The Scenes`, `Deleted Scenes`, `Interviews`, `Trailers`, ...), videos named `<movie>-trailer`, `- featurette` ..., and unrecognized videos shorter than 60 minutes beside a TMDB-identified movie go under that movie. A second full-length movie stays a movie. Without TMDB, a folder's only video not named as an extra owns its extras folder. TMDB misses are remembered, so a rescan does not query them again or lose their grouping.
- **Scan again** also matches the new titles with TMDB when it is connected.
- **Right-click menus** on cases (Play, Play from the start, Open the case, watched / unwatched, Show media file, Change artwork, Match with TMDB) and on the library (Scan again, Refresh TMDB matches, Add media folder). **Keyboard commands:** Ctrl+F find, Ctrl+Enter play, F turn the case over, W watched, F5 scan again.
- **Extras beside the case** (Video Club): under the rating, each extra has its name above (the file name without the movie's title and year at its start or end; `-trailer`-style suffixes become words), then a chip whose face is a frame of the video (decoded by GEM Shell, a fifth of the way in). Square while there is room, then name and chip shrink to fit the column. Two see-through buttons cover the chip: play (top three quarters) and Find in GExplorer (bottom quarter). Picture-in-picture is turned off in the player and the previews: the `<video>` goes away with the widget on a tab switch, and the shell has no way back to a tab from it yet.
- **Default app** next to Play opens the file in the system's default player. GEM Shell's own *Open with* (the ranked app list) isn't available to widgets yet: an SDK item for the shell.
- **Playback survives leaving the screen, without a seam:** while a movie plays, a GEM Shell audio element (it outlives the widget) plays the same stream muted, following the video (play, pause, seeks, speed; drift corrected by nudging its speed). Leaving the screen (another tab, the sidebar folded) just unmutes it, and the operations tray shows its card (play/pause, −10 s / +30 s, Stop). Back on screen, the video starts muted where the sound is, catches up, and takes the sound back. *Keep playing when hidden* (on by default) turns this off: then the player reopens paused where it was. Sound the WebView can't decode (AC3 / DTS) can't play in either place.
- **No more illustrated sample collection:** a new library shows an empty shelf of DVD cases with *Add a media folder* on the middle one. The bundle no longer carries the two poster atlases (about 900 KB). `fixtures.ts` and `assets/poster-atlas-*.jpg` are no longer used and can be deleted.
- **Back is an arrow everywhere** (top bar, a title's details, the player).
- **Steadier on modest hardware:** one scene-preview decoder at a time, released explicitly; a preview that is not playing within 6 s stops for that title; no blur effects inside the 3D case; the player's Back works while playback is still being prepared (abandoned after 15 s).
- Code: `Widget.vue` keeps navigation, the opened title and the player. The library's work lives in composables over one shared context (`context.ts`): `useLibraryScan`, `useCovers`, `useMetadataEdits`, `useTmdbMatching`, `usePreviewMedia`, `useWatchProgress`, plus `PlayerOverlay.vue` and `SettingsMenu.vue`. Custom covers are no longer copied into the placement's settings (the `custom-covers` document holds them).

## Run

From the starter folder:

```powershell
npm run typecheck -- media-library
npm run test -- media-library
npm run build -- media-library
npm run preview -- media-library
```

`build` writes `dist/runtime-widgets/media-library/index.js` and installs it in GEM Shell's `UserInterface/public/runtime-widgets/media-library/` (where GEM Shell is: the starter's README). Build GEM Shell in Release, start it, then add **GEM Video Club** from the grid or sidebar widget picker. `--no-install` builds without installing.

`preview` starts the isolated preview: open the address it prints (`/widgets/media-library/preview/`). Without the Shell's listing API it shows the empty shelf (the starting point of a new library). Use the width control to exercise the grid and narrow/sidebar presentations.

## Included interaction

- Horizontally scrolling, dimensional video-store shelves with diagonal ends that offset the front edge from the backing, section headings above, two-line media titles attached visually to larger cases, and cases resting on the front shelf edge, plus Continue watching and New arrivals. For local libraries, New arrivals contains only paths discovered since the previous successful scan.
- Shelf and Showroom presentations, selected from the library menu and persisted through the widget lifecycle along with the focused-title presentation.
- Showroom is a laterally scrolling aisle of equal-height genre racks that fill the available stage. Its counts include every episode; each series gets one ordered preview row with the remaining episodes implied. The public `useScrollHints` helper supplies wheel translation, overflow state, and clickable page arrows. Selecting a genre zooms into its department, where a fixed number of cases wrap onto additional rows instead of scrolling laterally; separate Back and Showroom controls preserve one-step and direct navigation.
- Classic and Movie Store focused-title views, with Movie Store used by default. Movie Store enlarges the case, moves playback and file-location controls beside it, gives the back a title-specific cinematic layout, and animates a disc emerging before playback.
- Title, year and genre search.
- Genre quick navigation and an A–Z jump control on every shelf.
- The library header remains pinned above the scrolling shelves, keeping search, genre navigation, and the library menu available.
- Multiple persisted source folders, bounded recursive scanning, filename cleanup, local media metadata and folder-based genre inference.
- **Show media file** navigation from a local title's detail view opens its containing folder through the public host action API without naming or depending on a particular destination widget.
- Movie names are stripped of common release, resolution, codec, audio, and year tags before matching; distinct local-title fallbacks are searched only after the first TMDB query does not match.
- TMDB is queried by cleaned title without a year filter; the parsed release year validates and ranks the returned candidates instead of hiding exact-title results.
- Movie and TV genre catalogs are requested only when needed; if that auxiliary request fails, stable built-in TMDB genre IDs still allow the selected title's synopsis and genres to be applied.
- Artwork-triggered TMDB queries log the GET query parameters (`body` is null) and complete response body without logging the protected token.
- Description and genre pen controls save local overrides by media path; provider metadata remains cached separately underneath those edits.
- Changing an episode's genres asks whether the edit applies only to that episode or every local episode of the same detected series.
- The completed library shelf is retained through the public lifecycle API, so remounting the same widget with unchanged source selections does not recursively scan the folders again. Source changes and **Scan again** always perform a fresh scan.
- Source selection can add the folder currently shown in the picker; its accept action identifies the current or highlighted folder.
- Sidecar artwork discovery for a matching image or `poster`, `cover`, or `folder` file, imported as safe same-origin image assets.
- Cached OS video thumbnails when no sidecar cover exists.
- Series detection for `S01E02`, `1x02`, `Season 01/Episode 02`, `Season 01/02 - Title`, and named files inside season folders, with numeric season-then-episode ordering even when only an `SxxExx` display title is available. Genre shelves collapse episodes into one series card that navigates back to that series shelf. Series shelves in both Shelves and Showroom views offer an All seasons/individual season filter using the scanned metadata with filename and folder fallbacks.
- Embedded local playback through the Shell's byte-range media stream, with an external-player fallback for unsupported codecs.
- Player overlays hold the Shell's tooltip quiet mode until playback closes; native fullscreen is also covered by the host.
- DVD-case selection with a full detail stage.
- A case front/back turn with synopsis and metadata. Back-cover scene placement is deterministically derived from the media identity, so its analog collage stays the same for that title without another metadata store.
- Four scene cues are extracted at their exact timestamps by the Shell's bounded ffmpeg service and cached as ordinary image assets. Hover or keyboard focus plays an eight-second loop through one short-lived video decoder; its progress bar follows playback, and leaving restores the extracted still. The same playback behavior is available on the scattered Movie Store back-cover frames. Sample media uses artwork motion.
- A pencil beside the enlarged case opens artwork choices: use/query TMDB, choose an image file, or open playback to capture an exact movie frame. Captured frames open a focal-point editor so the user chooses the portion kept visible on portrait cases.
- Optional, manually triggered TMDB matching for movie and episode titles, synopsis, release dates, genres, runtime, rating, cached poster artwork, movie backdrops, and episode stills. Matched metadata is persisted by local media path and restored on later scans; cached artwork is rehydrated without repeating the metadata search. GEM Shell stores the API Read Access Token as an OS-protected secret and the widget refers to it only by name.
- Titles without artwork look like empty DVD cases (the outline of the missing insert, the disc hub, "No cover").
- Responsive narrow presentation and reduced-motion support.
- One shared implementation under `shared/library-ui`, imported and bundled at build time.

Real local movies seek and play inside the cue on hover.

## TMDB metadata beta

Add real media folders, open the library menu, choose **Connect TMDB**, enter an API Read Access Token in GEM Shell's protected dialog, and choose **Match with TMDB**. Matching is opt-in and makes no requests while the widget is merely scanning or browsing. Movie filenames are searched as movies; detected series are searched as TV shows and then matched to their season and episode records.

This product uses the TMDB API but is not endorsed or certified by TMDB. TMDB requires one of its approved logos and this notice in an About or Credits area: both are in the widget's `credits` (`entry.ts`, logo `assets/tmdb-logo.png`, converted from TMDB's SVG), shown on GEM Shell's About page (Widgets tab). The widget uses each user's own TMDB API Read Access Token until GEM Shell's official widget repo can hand widgets their own secrets.

## Shell integration status

The widget uses `mediaImageCreate` / `mediaImageDelete` for local sidecars, cached OS video thumbnails, validated TMDB URL images, and persistent custom covers. It uses `mediaVideoFramesCreate` for cached scene cues and for a persistent cover made from the current playback time, keeping frame decoding out of WebView2.

The current and resolved host requirements are tracked in [`API-GAPS.md`](./API-GAPS.md).

The scanner reads up to 3,000 relevant entries per folder, 400 folders and 1,500 videos per refresh. It skips hidden items and folder links, closes every listing after use, and reports truncation or inaccessible folders in the library menu.
