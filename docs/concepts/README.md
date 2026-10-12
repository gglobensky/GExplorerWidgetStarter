# Widget concept notes

These documents describe candidate widgets and the public GEM Shell support they require. They are planning notes, not promises that internal Shell modules are available to widgets.

- [Notes board](notes-board.md)
- [App snapper](app-snapper.md)
- [File tree](file-tree.md)

The implementation boundary is deliberate: widgets use `gexplorer/widgets`, their injected SDK, and host props/events. Missing host capabilities are recorded rather than replaced with imports from Shell internals.
