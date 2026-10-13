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
- Sidecar artwork discovery for a matching image or `poster`, `cover`, or `folder` file. Displaying local images awaits the Shell support described below.
- Series detection for `S01E02`, `1x02`, and `Season 01/Episode 02` layouts, with series shelves as well as genre shelves.
- Embedded local playback through the Shell's byte-range media stream, with an external-player fallback for unsupported codecs.
- DVD-case selection with a full detail stage.
- A case front/back turn with synopsis and metadata.
- Four scene cues loaded as paused video frames one at a time, then played in place on hover. This keeps large episodes responsive while showing real frames before interaction; sample media uses artwork motion.
- Scene previews return to their initial cue frame when the pointer or keyboard focus leaves them.
- Optional, manually triggered TMDB matching for movie and episode titles, synopsis, release dates, genres, runtime, rating, and poster/still references. The API Read Access Token is held in memory only and is never written to widget config.
- Neutral grey cases for scanned media without real artwork; the illustrated atlas is reserved for the fictional preview collection.
- Responsive narrow presentation and reduced-motion support.
- One shared implementation under `shared/library-ui`, imported and bundled at build time.

Sample scene cues use artwork-driven motion because the fictional collection has no backing video. Real local movies seek and play inside the cue on hover.

## TMDB metadata beta

Add real media folders, open the library menu, enter a TMDB API Read Access Token, and choose **Match with TMDB**. Matching is opt-in and makes no requests while the widget is merely scanning or browsing. Movie filenames are searched as movies; detected series are searched as TV shows and then matched to their season and episode records.

This product uses the TMDB API but is not endorsed or certified by TMDB. Distribution also requires TMDB's approved logo in an About or Credits area and a license appropriate for the project. The text notice is present in the widget; the approved logo asset should be added after TMDB approves the intended use.

## Shell API gap: local images and frame capture

`mintStreamHttp` is usable by `<video>`, but its cross-origin URL is excluded by the widget `img-src` policy and taints a canvas. The widget therefore cannot display a chosen local image or export a video frame with `canvas.toDataURL()`. Custom covers and sidecar artwork should remain disabled until the Shell provides either a widget-safe thumbnail/data URL API, or an image stream with matching CSP and CORS support. A thumbnail API is preferable because it also avoids decoding full-resolution video in the frontend.

TMDB poster and still paths are retained with matched metadata, but remote image URLs are blocked by the same widget `img-src` policy. They are ready to render once the Shell exposes a permitted image proxy or expands image access for an approved host.

The scanner reads up to 3,000 relevant entries per folder, 400 folders and 1,500 videos per refresh. It skips hidden items and folder links, closes every listing after use, and reports truncation or inaccessible folders in the library menu.
