# App snapper concept

## Product goal

The App Snapper presents an existing native application window in a widget slot. The native application follows the GEM Shell window, placement and visibility: moving or resizing the Shell updates the slot, minimizing the Shell hides or minimizes the attached application, and changing tabs or collapsing the containing area removes it from view.

The widget supplies discovery, attachment status and user controls. GEM Shell owns all native window observation and positioning.

## Why this requires a host capability

The current widget SDK can open executable entries through the `Exec` capability, but it cannot enumerate native windows, identify a process window, observe native window events, position it, clip it, change ownership, or synchronize focus and visibility. A browser widget also cannot reliably convert its DOM rectangle into native screen coordinates across WebView offsets, zoom, monitor DPI and Shell chrome.

The feature therefore needs a native Shell service plus an instance-bound public SDK. The widget must not receive raw HWND values or import backend/window internals.

## Proposed capability boundary

A new capability such as `ExternalWindows` should have a clear reason in the widget manifest and host-owned user consent. The host should provide a window picker so the widget never performs unrestricted process/window enumeration.

A conceptual API could look like:

```ts
type ExternalWindowDescriptor = {
  appName: string
  title: string
  icon?: string
  processName?: string
}

type ExternalWindowSession = {
  readonly state: Ref<'attaching' | 'attached' | 'hidden' | 'lost' | 'closed' | 'blocked'>
  readonly window: Ref<ExternalWindowDescriptor | null>
  detach(options?: { restoreWindow?: boolean }): Promise<void>
  requestFocus(): Promise<void>
  retry(): Promise<void>
  onEvent(handler: (event: ExternalWindowEvent) => void): () => void
}

type ExternalWindowApi = {
  pickAndAttach(options: {
    anchor: HTMLElement
    preferredAppPath?: string
    visibility: 'follow-widget'
  }): Promise<ExternalWindowSession | null>
}
```

The concrete implementation may use a native child window, a managed companion window, or another platform mechanism. That choice should remain invisible to the widget.

## Host responsibilities

### Discovery and authorization

- Present a host-owned picker containing attachable top-level windows.
- Exclude GEM Shell, transient system windows and windows the current process cannot safely manage.
- Explain elevation or integrity-level incompatibilities.
- Remember an application identity only when the user asks; do not treat a process ID or native handle as durable identity.

### Bounds and visibility

- Translate the widget anchor rectangle to native screen coordinates.
- Observe Shell movement, resize, monitor changes, WebView zoom and DPI changes.
- Follow grid/sidebar/toolbar resizing and tab, Hub, sidebar and collapse visibility.
- Hide or minimize the attached window with GEM Shell and restore it to the correct state.
- Clip the application to the widget slot where the platform supports it.
- Reconcile bounds after missed events without continuous high-frequency polling.

Native event hooks should drive updates. Polling is acceptable as a low-frequency health check or short fallback during an active move/resize gesture, not as the primary lifecycle mechanism.

### Focus, z-order and input

- Keep the attached application above the Shell content it occupies without floating above unrelated applications.
- Transfer focus predictably between the widget controls and native application.
- Preserve keyboard accelerators, IME, mouse capture, drag/drop and accessibility behavior.
- Handle menus, dialogs, tool windows and additional top-level windows opened by the application.

### Lifecycle and recovery

- Detect close, crash, restart, handle recreation, application relaunch and process elevation changes.
- Restore the application's original parent, style, bounds, visibility and taskbar behavior on detach when possible.
- Release the attachment when the widget is removed or GEM Shell exits.
- Define whether closing the widget detaches or also closes the application; default to detach.
- Surface `lost` and `blocked` states to the widget with actionable reasons.

## Widget experience

- Empty state: “Attach an app” and a concise description.
- Attached header: application icon/title, focus button, detach button and connection state.
- Lost state: retry, choose another window or detach.
- Edit mode: Shell layout handles remain usable without sending unintended input to the native application.
- Configuration: preferred application, automatic reacquisition policy, toolbar visibility and detach behavior.

The first version should attach an already running window selected by the user. Launching executables, matching windows automatically and managing multiple windows can follow after attachment is reliable.

## Cases the host design must test

- Per-monitor DPI and moving GEM Shell between monitors.
- Maximized, minimized, borderless, modal and always-on-top applications.
- Elevated applications and applications running under another user/session.
- Applications that recreate their top-level window during startup or navigation.
- Multiple windows with identical titles.
- Native menus, dialogs and popups extending outside the slot.
- Shell tab switches, sidebar collapse, Hub switches, suspension and shutdown.
- Application crash and restart.
- Alt-Tab/taskbar behavior and keyboard focus restoration.
- Windows animation settings and reduced-motion behavior in the widget controls.
- Non-Windows hosts, which should report the capability as unavailable rather than expose a dead control.

## Delivery sequence

1. Build a native feasibility fixture outside the widget API and compare child-window and managed-overlay approaches.
2. Define the capability, picker, opaque session and cleanup contract.
3. Implement one selected, already-running window on Windows.
4. Verify positioning, focus, DPI, minimization, tab visibility and detach restoration.
5. Expose the stable instance-bound API and build the widget UI.
6. Add optional launch/reacquisition and platform-specific implementations later.
