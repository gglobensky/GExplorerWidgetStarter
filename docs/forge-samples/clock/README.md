# Clock (a GEM Forge sample)

The clock built to demo GEM Forge in its prototype (2026-11-06, artifact "GEM Forge Prototype"; design:
`claude/plan-2026-11-06-code-playground.md` in the project). It shows more as it grows: the time, then the date, then
world clocks. Kept as GEM Forge's first sample project, and as an example of a widget that reads its own box
(`placement.size.width` / `height`) to fit a toolbar popover, a crowded sidebar or a large hub tile.

- `entry.ts`: the manifest (id `my-clock`: user widgets get their own names, see the design).
- `Widget.vue`: the clock; `zones.ts`: the cities and the time format.
- No capabilities: it reads nothing but the time.

Not built (outside `widgets/`). To try it as a widget now: copy the folder to `widgets/clock/`, set the id to `clock`,
`npm run build -- clock`.
