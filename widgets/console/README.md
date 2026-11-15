# GEM Console

Consoles in tabs, like Visual Studio's terminal: Command Prompt, Windows PowerShell, PowerShell 7, Git Bash and each
WSL distro GEM Shell finds. Built on xterm.js (MIT, bundled into `index.js`; its notice is on GEM Shell's About page).

## Places

- **A hub's grid: a pane** (`role: 'navigable'`). Click it to focus it.
  - GEM Shell's path bar, Back / Forward / Up, Favorites and Quick Links move the active console.
  - A `cd` you type moves the path bar (the console's genuine OSC 9;9).
  - Switching tabs shows that console's folder.
- **The sidebar:** a path field and ★ (your favorite folders) above the consoles.
- **The toolbar:** a `>_` button. A click grows it into the consoles with a path field; ⌃, Esc outside it or a click
  elsewhere folds it. They keep running folded, and the button shows a dot while one runs a command.

## Working in it

- **＋** a console in your usual shell (the last one you picked), where the active one is. **▾** another shell.
- **Moving while a program runs:** the console waits for its prompt, says so ("Moves to … when the command ends"), and
  you can cancel. GEM Shell types the `cd`, quoted for that shell; the widget never types a path.
  **0.1.11:** something typed at the prompt also makes it wait; erase it (Backspace) and the move goes at once. After
  a key GEM Shell can't follow on the line (arrows, Tab, Esc, a paste), it still waits for Enter or the next prompt.
- **Copy:** select, then Ctrl+C (Ctrl+C without a selection goes to the program), Ctrl+Shift+C, or a right-click.
  **Paste:** Ctrl+V / Ctrl+Shift+V.
- **Links** in the output (and a program's own links) open on **Ctrl+click**, http and https only: GEM Shell asks
  before opening one. A plain click selects, as in Windows Terminal.
- **Esc** is the console's (vim, a prompt's own). F6 / Shift+F6 still move the focus out; GEM Shell says so once, and
  Keyboard shortcuts says it beside "Leave the focused pane".
- **"Open console here"** on any folder menu (GEM Console ▸): the console you placed goes there. With none open, the
  next one you start begins there. It never opens a new widget.
- Closing a tab running a command asks first. A console that ended can be restarted (⋯).

## The terminal part (0.2.0)

GEM Console provides GEM Shell's `shell.terminal` point (`TerminalPart.vue`): another widget, such as GEM Forge, shows
GEM Console's terminal in its own box (`sdk.parts().mount`). There it is **that widget's** terminal:

- It runs as that widget, with its Terminal permission: the first console asks for it in that widget's name, the
  tray card names it, and its consoles end with it. GEM Console's own consoles are separate.
- It runs from its own copy of GEM Console's code, with only the calls GEM Shell gives a terminal part (consoles, the
  menus and questions, copying, links). No path field or ★: the widget showing it says where.
- Its tabs are consoles, plus a **Tool output** tab for what that widget prints (npm, ESLint): output only, never
  typed into a shell. It shows a dot when something was printed while another tab was shown.
- When that widget runs a command, GEM Shell types it at the prompt of the console in use (the active one, else the
  last one still running), never over what you typed and never while a command runs. With no console open, your usual
  shell starts where that widget last moved it, and the command runs at its first prompt. It needs your click in
  that widget.
- That widget shows one terminal part: showing it in a second place moves the same consoles there.

## Permissions

- **Terminal:** run consoles. GEM Shell asks the first time you start one, and asks again before Allow.
- **Favorites:** the ★ list.
- **Clipboard:** copying.

There's no Read: GEM Shell checks a folder exists before a console goes there, and the path field's suggestions are
GEM Shell's own. Terminal is the only standing permission, so there is nothing to ask together with it.

## Needs

GEM Shell 2026-11-06 or later: `CONSOLE-SHELL-ADDITIONS.md` parts A to C and E (sessions, the SDK and raw keys, the
navigable role, console popovers). Windows 10 1809 or later.

**Linux:** GEM Shell's Linux backend is a stub for now, so the console says "Consoles aren't available on this system
yet." The widget itself is ready for it: the shells are GEM Shell's list, folders are compared the POSIX way (with
their case), and xterm.js's ConPTY mode is for Windows sessions only. What the port needs is GEM Shell's side:
`forkpty` sessions, the shell list (bash, zsh, fish…), and the prompt hook (OSC 133 / the folder mark) for each.
