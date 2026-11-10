# GEM Clock

## 0.10.0 — Alarm sounds and quick appointment entry

- Timers and calendar reminders share a persisted Clock alarm sound. Bright chime, desk bell, digital pulse and a
  gentler rising tone are generated locally as WAV audio and continue to play through Audio Rack.
- The full timer setup page offers a compact sound selector and an immediate preview. Small timer layouts inherit the
  saved choice without sacrificing timer space.
- New appointments have an optional Quick entry surface. It understands conservative phrases such as
  `Dentist next Friday at 2pm for 45 minutes, remind me 1 hour before`, previews the interpreted date and reminder,
  and only fills the normal form after confirmation. Saving remains a separate final action.
- Natural entry supports today/tomorrow, weekdays, ISO or named dates, 12/24-hour times, noon/midnight, all-day
  events, durations and reminder offsets. Unrecognized details remain visible instead of being silently guessed.

GEM Clock is a responsive time centre. A tiny placement is a clock, a medium one adds the date, and a large one has
Clock, Calendar, Timers and Stopwatch tabs without requiring another window.

## 0.9.3 alarm-aware quitting

- A running or ringing countdown/reminder now registers a live Shell close warning. Quitting asks for confirmation
  and explains that GEM Shell cannot play the alarm while closed; paused timers remain available without nagging.
- The scheduler card exposes its state as a polite live region and escalates a ringing alarm assertively for screen
  readers, taking a small accessibility step from the roadmap.

## 0.9.2 jobs that survive a normal restart

- The Shell job API now has an explicit `restartOnLaunch` capability for recoverable jobs. Clock enables it for the
  scheduler and stopwatch, so their journal and checkpoint remain available after a normal app close, not only after
  a crash, window handover or Windows session shutdown.
- On the next launch, the Shell mounts the Clock job card invisibly long enough to reclaim that journal. The restored
  operation card therefore appears and resumes without requiring the user to open Clock's Running tab first.

## 0.9.1 startup recovery and spacious appointment editor

- The scheduler and stopwatch can be reclaimed immediately from an interrupted-run journal without waiting for a
  Clock view to mount. This restores the job card, ticking logic and Audio Rack alarm path before a recovered deadline
  arrives.
- Large calendars use their available surface for one complete appointment form. Compact week calendars retain the
  short paged editor that prevents overflow in constrained placements.

## 0.9.0 architecture, keyboard calendar and alarm snoozing

- Local and provided calendars now share one typed source adapter. Provider selection, capabilities and mutations no
  longer branch throughout the root widget, while legacy calendar panels continue to render through one surface.
- Responsive breakpoints and page availability live in a pure layout policy with boundary tests instead of being
  scattered through the view.
- Calendar days use one roving tab stop. Arrow keys move by a day or week, Page Up/Down changes the visible week or
  month, and Home returns to today.
- A ringing timer or appointment reminder can be snoozed for five minutes from the widget, its contextual menu or
  its persistent job card. Snoozed calendar reminders survive reminder synchronization and app restarts.
- Calendar occurrences and slot providers are typed end to end; production Clock code no longer relies on `any`.

## 0.8.1 visible appointments in short months

- When six complete month rows make the day cells too short for stacked content, the first appointment moves beside
  its day number. Its colour, abbreviated title and × remain visible rather than being clipped below the cell.

## 0.8.0 vintage split-flap clock

- Departure lounge is a fifth built-in skin, drawn entirely in CSS as a wood-and-metal split-flap clock. Each changed
  character performs its own short mechanical turn, including timer and stopwatch readouts, while reduced-motion
  mode keeps the cards still.
- Appointment × controls are larger and pinned inside their rows, so the six-week month grid cannot clip them away.
  The selected-date agenda control now shares the calendar header's vertical centre with Today, below the rings.

## 0.7.0 day controls and agenda

- Every visible appointment label has a compact × control. It confirms removal and treats a repeating appointment
  as one occurrence, leaving the rest of its series intact.
- The selected-date note opens a compact agenda for that day with full titles and times, edit/remove controls and a
  direct New appointment action. The week calendar keeps the smaller inline controls without covering its days.

## 0.6.1 calendar actions and calmer Matrix rain

- A calendar day's right-click menu can remove a one-off appointment, one occurrence of a repeating appointment, or
  its whole series. Destructive choices confirm their exact scope before changing either local or provided calendars.
- Matrix rain falls at half its previous speed. Its decorative characters ignore pointer input and force a normal
  cursor, so hovering them no longer suggests that a line can be moved.

## 0.6.0 contextual clock and calendar providers

- Calendar selection moved out of the calendar surface and into Clock's Control Panel settings. Automatic mode uses
  the most recently registered provider, while Clock calendar and each named provider remain explicit choices.
- A reusable `provider` settings field lets GEM Shell populate a trusted setting from an extension point instead of
  making widgets duplicate a provider picker in their own content.
- Calendar rescheduling now uses pointer capture and calendar-grid hit testing, so the shell's native drag boundary
  cannot swallow a drop after showing its preview.
- The `…` button remains the view and skin menu. Right-click is contextual: days create or edit appointments, Clock
  edits its world zones, and the timer and stopwatch pages expose their relevant commands.
- The three large-layout world clocks are editable inline from the complete IANA time-zone list and persist with the
  placement. Matrix rain now overfills the face vertically so animation never reveals an empty lower band.

## 0.5.0 recurring exceptions and paper rescheduling

- Recurring events support bounded, persisted single-occurrence exceptions. Editing one occurrence can change its
  date, time, title, duration, reminder, sound and notes without rewriting the rest of the series.
- The occurrence editor explicitly offers This occurrence and Whole series scopes. The day agenda can skip one
  occurrence or remove its entire series.
- Calendar marks can be dragged to another paper day. One-off events move normally; recurring marks create a stable
  exception while preserving their wall-clock time and reminder identity.
- Moved occurrences are found even when their original generated date is outside the visible calendar window, and
  cancelled occurrences no longer create reminder jobs.
- External providers with update capability receive the updated series and its exceptions through the existing
  versioned calendar contract; read-only providers keep drag and edit controls disabled.

## 0.4.6 compact tool pages and cleaner paper

- The selected calendar date lives at the upper-right instead of consuming a footer over the final calendar row.
- Marking a day is now a double-click gesture advertised by its hover tooltip; the overlapping Mark this date button
  is gone.
- Calendar binding rings are a skin value (`flex` or `none`), and Matrix wake omits them by default.
- Short Timers and Stopwatch views omit their redundant page headings. Timer setup and running timers are separate
  pages, and active timer rows are paged to keep the widget free of outer scrollbars.
- The short Stopwatch composition uses a smaller face, tighter spacing, and a bounded lap preview.

## 0.4.5 overlays and resumable time tools

- The `…` menu is a true overlay at every size; compact layouts no longer reserve a blank strip for it.
- Matrix rain uses eight overlaid columns behind the readout instead of being pushed into a vertical strip beside it.
- Medium timer rows can render a compact version of the selected face, including a miniature Nixie tube bank.
- Paused timers and stopwatches retain their operations-tray jobs and can be resumed directly from their cards.
- The generated alarm Blob is assigned through Audio Rack's source path so it is loaded and connected to the SFX bus.
- The skin manager obtains Clock's shared reactive skin store from its injected SDK, and lists built-in and imported
  skins without passing Vue refs through the popover boundary.

## 0.4.4 time centre

- Four trusted face renderers: Quiet system digital, Grand Central analog, Nixie laboratory and Matrix wake.
- The clock face now sizes against its own grid column, so its date, zones and complications never overlap it.
- The Skins page is replaced by a skin submenu which switches immediately, loads `.gemskin` files, or opens the full
  skin manager. The top-right `…` button opens that Clock menu.
- Views which cannot provide useful controls at the current size are disabled in that menu. Resizing an open view
  below its useful minimum returns safely to Clock.
- Medium placements give Timers a compact creation and control surface rather than a status-only summary. Calendar
  remains a date/next-appointment card and Stopwatch remains directly controllable.
- Visible stopwatch and countdown values refresh to hundredths while persistent jobs retain their efficient background
  schedule. Small analog faces use the full available widget height.
- Medium calendars become a seven-day paper view with previous/next-week navigation. Appointment editing uses short
  pages for time, recurrence, reminders and the day's agenda instead of a scrolling field stack.
- The centered skin manager has a bounded dialog surface. Imported files are copied into Clock's private persisted
  collection, and removing an imported skin deletes that copy without changing its source file.
- The generated alarm is exposed to Audio Rack as a CSP-safe local Blob rather than a blocked `data:` media URL.
- The menu button owns a reserved top-right lane instead of covering faces. Week navigation uses tall arrows over the
  end day cells, calendar headings are centred, the month/year opens a picker, and Today restores the current date.
- Active timers have confirmed removal and the stopwatch has a confirmed Reset in compact and full layouts.
- With enough room, countdowns and the stopwatch reuse the selected face renderer—including real Nixie tubes, a
  chronograph-like analog readout, and Matrix rain. Matrix columns now remain visible behind the main digits.
- Manage Skins shows built-in and imported looks together. Built-ins have an explicitly disabled removal action;
  imported and duplicated copies can be removed from Clock's private collection.
- Nixie laboratory is built from CSS glass envelopes, ghost cathodes, thin glowing numerals, pins and a base rail.
  It needs no image assets, and existing digit/glow/edge skin tokens continue to colour the whole construction.
- Timepiece skins style both the clock and its paper calendar. They use the common `.gemskin` extension and carry a
  `skin` compatibility header (`family: "timepiece"`, schema, targets `clock` and `calendar`). The common header is
  `shared/skin-file`. Game/Media Library exports now identify themselves as `family: "library-store"`; old headerless
  library skins still load. An incompatible file is named for what it is instead of being called corrupt.
- The paper calendar is part of a large widget. It has six complete weeks, month navigation and skin tokens for its
  paper, ink, rules, handwritten marks and today's pencil circle.
- Calendar marks have an agenda editor, duration, notes, IANA time zone and daily/weekly/monthly/yearly recurrence.
  Recurring wall times remain stable through daylight-saving changes and each occurrence gets its own reminder id.
- `gem.clock.calendar-provider` is a versioned data-provider slot; Clock's Control Panel setting chooses Clock
  storage, the latest installed provider, or one named provider and can merge Clock's marks into providers that advertise import support.
  The earlier `gem.clock.calendar-panel` remains as a compatible visual-panel option.
- `gem.clock.complication` (multiple) lets other widgets contribute small components. Users can show, hide and order
  up to three, with a different arrangement saved for every clock face.
- One global Clock owner prevents duplicate alarms while each placement still saves its own skin and current tab.

## Background time tools

- Stopwatch: start, pause, reset and laps. A real `stopwatch` background job keeps an operations-tray card live while
  the widget is unloaded and checkpoints its state for recovery.
- Multiple countdowns: named timers, quick presets, pause/resume/dismiss, and one `scheduler` background job. Its tray
  card shows the next countdown or the alarm that is ringing. The scheduler checkpoints absolute deadlines so an
  elapsed timer is recognized after job recovery.
- Audible alarms are optional. Starting a timer primes GEM's Audio Rack from the user's gesture and holds its local
  generated WAV handle with the scheduler job. A silent or autoplay-refused alarm still calls job attention.
- The calendar now holds real shared marks. Choose a paper day, enter a time or all-day mark, and optionally schedule
  a silent or audible reminder. Calendar reminders and countdowns use the same scheduler job and absolute deadlines.
- The skin manager duplicates built-ins, edits every timepiece and paper-calendar token with a live preview, stores
  user skins for every Clock, and imports/exports compatible `.gemskin` files.

## Calendar provider contract

A provider declares `gem.clock.calendar-provider` and static metadata in
`props.calendarContract`: `{ contract: "gem.calendar", version: 1, label, capabilities }`. Clock discovers the
provider over scoped widget messaging with `gem.calendar.v1.discover`. A mounted provider answers with
`gem.calendar.v1.snapshot`; Clock targets mutations to the answering instance on `gem.calendar.v1.command` and
refreshes after `gem.calendar.v1.changed`. The payload and command types live in `calendarProvider.ts`.

This split is deliberate: the slot makes an installed provider discoverable and supplies its label/capabilities;
the message bus keeps data and mutations under the provider widget's own identity. Unsupported contract versions
are ignored, an offline provider is shown clearly, and the local calendar is never deleted when another source is
selected.

## Next milestones

1. Alarm-volume and reduced-motion accessibility preferences.
2. Broader natural-entry phrases (recurrence and named time zones) after the conservative parser has real use.
3. Dedicated calendar-provider work remains parked until it can be treated as its own full widget project.
