# GEM Monitor

Your computer's resources, live: the processor (each core), memory, disks, network and graphics card, the programs
that use them, and what GEM Shell itself uses. Brass valve gauges, graphs of the last two minutes.

## Places

- **Toolbar:** a small gauge and the numbers you choose. **Right-click** it to pick them (this copy only): Processor,
  Memory, Graphics card, Disks, Network, GEM Shell itself, and "The cores, one bar each" (a strip that shows at a
  glance whether the work is spread out or one core is pegged). **Click** it for the details; **📌** pins them as a
  window that stays while you work (the button then brings it back; its place and size are kept).
- **Hub grid:** tiles: gauges (CPU, memory, GPU, GEM Shell), graphs (CPU, memory, GPU, disks, network, GEM Shell's
  CPU and memory; what each one is about is written faintly along its top: the processor's name, the memory in use…),
  the cores, the busiest programs and GEM Shell's processes.
  - **Pages:** several layouts, switched with the pills in the bar on top (← → too). The usual two: *Overview* and
    *GEM Shell*. Only the page shown is read.
  - **✎** arranges: drag a tile to move it (the others make room, as in a hub), its corner to resize it (a graph can
    be as narrow as a gauge), **×** removes it. **＋** lists the tiles, **✓** those on the page (pick one to remove
    it; a fainter ✓ and the page's colour: placed on another page). The bar then names, recolours (●), removes (🗑)
    or adds (**＋ Page**) pages.
  - **☰** (top right) opens the details over them; their **▦**, in the same spot, comes back. The rows share the height, so the usual tiles fit without a
    scrollbar.
  - Each copy keeps its own pages: two monitors in one hub can show different things, and share the readings.
- **Sidebar:** the details as a panel.
- **No scrollbars:** when the details don't fit (a narrow sidebar, a small window), they go in pages: the dots at
  the bottom, ‹ ›, the mouse wheel or Page Up / Page Down turn them. Processes shows as many rows as fit, page by page.
  Every card has the same size and fits one page: when its figures (or its disks, its network adapters) don't, they
  go in parts inside the card (● ○, or a click on the figures), so the gauge and the graph keep their place.
- **Rows that stay put:** in Processes, **❄** keeps every row in its place (the figures still change; new programs
  come at the end) until you click it again; the rows also stay put while the mouse is over the list.
- **I/O, not disk:** a program's read and write figures count every read and write (files, and the pipes between
  programs: Task Manager's I/O columns). The Disks card is the disks themselves.

## The details

- **Overview:** CPU (kernel share, each core), memory (in use, available, commit, cache, pools, processes, threads,
  handles), each GPU (per engine: 3D, copy, video; its memory), disks (active %, read / write), network (in / out, link).
- **Processes:** the busiest 200 of them, sorted by any column, filtered by name: CPU, memory, disk, GPU, threads.
- **GEM Shell:** its own use, with each of its processes (its web view runs in processes of its own).
- **⏱** the refresh rate: every 0.5, 1, 2 or 5 seconds (this copy).

## For gamers and developers

- **Follow a program:** in Processes, **◎** next to its name (or right-click it). It gets its own tab: CPU (of the
  whole computer and of one core), memory, GPU, disk, with the programs it started (a game's launcher, its
  anti-cheat…). When it ends: "Follow the next one" picks the new copy of it. In a hub: the *Followed program* tiles.
- **Measure a stretch:** drag across any graph: min, average, max and 95th percentile of that stretch (a snapshot:
  the graph keeps moving). A click or × clears it.
- **Record a run:** **⏺** in the details: 5 min, 15 min, 1 h or 4 h (the most); it stops itself at the limit.
  While it records: **⚑ Mark** (a marker on the report's graphs), **■ Stop**; the toolbar button shows its clock.
  Then **💾 Report…** (one self-contained web page: the figures, a graph per resource, each core, the followed
  program, the markers; it opens offline and prints) or **CSV…** (every sample, for a spreadsheet).
  It goes on when the monitor leaves the screen (another hub tab): its card in the operations tray shows the clock
  and **⚑ Mark**; the card's Stop ends it (what was recorded is kept). Finished while you were away: the card asks
  for your attention until you save it.

## Permissions

- **Performance:** the computer's numbers. **Processes:** the programs' names and use. Asked together, the first time.
- It never sees a file, a window or a command line, and can't change or stop anything.
- **Write:** only to save a recording, in the file you pick in the save dialog.
- **No waste:** GEM Shell reads only what is on screen (the toolbar's numbers; the tiles in a hub; a tab while it's open), once for every
  monitor.

## Not yet

- Temperatures and frame rates (Windows needs administrator rights or the hardware's drivers for them).
- Linux (GEM Shell's side: `MONITOR-SHELL-ADDITIONS.md`, "Later").
