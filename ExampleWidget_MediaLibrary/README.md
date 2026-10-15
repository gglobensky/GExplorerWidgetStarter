# Media Library · Video Store milestone

The Media Library establishes the shared GEM Library UI and video-store shelf experience without requiring Shell changes. With no source folder selected it uses fictional sample movies and generated artwork. Once folders are selected, it scans real local video files through the public widget SDK.

## Run

```powershell
pnpm typecheck:media-library
pnpm test:media-library
pnpm build:media-library
pnpm copy:media-library:release
pnpm preview:media-library
```

The copy step targets `C:\Repos\GEM Shell\Gexplorer\GExplorer\bin\Release\net8.0\win-x64\wwwroot\runtime-widgets\media-library\index.js` in the standard sibling-repository layout. It verifies the Shell executable and runtime directory, backs up a different existing Media Library bundle, copies the production bundle, and verifies its SHA-256. For another Release location, run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/copy-media-library-release.ps1 -ReleaseRoot <path>`.

Restart that Release's `GExplorer.exe`, then add **Media Library** from the grid or sidebar widget picker. A later Shell rebuild can regenerate `wwwroot`; rerun the copy command afterward.

For the isolated sample-data preview, run `pnpm preview:media-library`, then open `/ExampleWidget_MediaLibrary/preview/` at the Vite address. Use the width control to exercise the grid and narrow/sidebar presentations.

## Included interaction

- Horizontally scrolling genre shelves plus Continue watching and New arrivals.
- Shelf and angled case-rack presentations, selected from the library menu.
- Title, year and genre search.
- Genre quick navigation and an A–Z jump control on every shelf.
- Multiple persisted source folders, bounded recursive scanning, filename cleanup, local media metadata and folder-based genre inference.
- Source selection can add the folder currently shown in the picker; its accept action identifies the current or highlighted folder.
- Sidecar artwork discovery for a matching image or `poster`, `cover`, or `folder` file, imported as safe same-origin image assets.
- Cached OS video thumbnails when no sidecar cover exists.
- Series detection for `S01E02`, `1x02`, and `Season 01/Episode 02` layouts, with series shelves as well as genre shelves.
- Embedded local playback through the Shell's byte-range media stream, with an external-player fallback for unsupported codecs.
- Player overlays hold the Shell's tooltip quiet mode until playback closes; native fullscreen is also covered by the host.
- DVD-case selection with a full detail stage.
- A case front/back turn with synopsis and metadata.
- Four scene cues are extracted at their exact timestamps by the Shell's bounded ffmpeg service and cached as ordinary image assets. Hover or keyboard focus plays an eight-second loop through one short-lived video decoder; its progress bar follows playback, and leaving restores the extracted still. Sample media uses artwork motion.
- Persistent custom covers chosen from an image file or captured from the exact frame shown in the player. Captured frames open a focal-point editor so the user chooses the portion kept visible on portrait cases.
- Optional, manually triggered TMDB matching for movie and episode titles, synopsis, release dates, genres, runtime, rating, cached poster artwork, movie backdrops, and episode stills. Matched metadata is persisted by local media path and restored on later scans; cached artwork is rehydrated without repeating the metadata search. GEM Shell stores the API Read Access Token as an OS-protected secret and the widget refers to it only by name.
- Neutral grey cases for scanned media without real artwork; the illustrated atlas is reserved for the fictional preview collection.
- Responsive narrow presentation and reduced-motion support.
- One shared implementation under `shared/library-ui`, imported and bundled at build time.

Sample scene cues use artwork-driven motion because the fictional collection has no backing video. Real local movies seek and play inside the cue on hover.

## TMDB metadata beta

Add real media folders, open the library menu, choose **Connect TMDB**, enter an API Read Access Token in GEM Shell's protected dialog, and choose **Match with TMDB**. Matching is opt-in and makes no requests while the widget is merely scanning or browsing. Movie filenames are searched as movies; detected series are searched as TV shows and then matched to their season and episode records.

This product uses the TMDB API but is not endorsed or certified by TMDB. Distribution also requires TMDB's approved logo in an About or Credits area and a license appropriate for the project. The text notice is present in the widget; the approved logo asset should be added after TMDB approves the intended use.

## Shell integration status

The widget uses `mediaImageCreate` / `mediaImageDelete` for local sidecars, cached OS video thumbnails, validated TMDB URL images, and persistent custom covers. It uses `mediaVideoFramesCreate` for cached scene cues and for a persistent cover made from the current playback time, keeping frame decoding out of WebView2.

The current and resolved host requirements are tracked in [`API-GAPS.md`](./API-GAPS.md).

The scanner reads up to 3,000 relevant entries per folder, 400 folders and 1,500 videos per refresh. It skips hidden items and folder links, closes every listing after use, and reports truncation or inaccessible folders in the library menu.
