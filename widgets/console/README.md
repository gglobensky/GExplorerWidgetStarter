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
- **Copy:** select, then Ctrl+C (Ctrl+C without a selection goes to the program), Ctrl+Shift+C, or a right-click.
  **Paste:** Ctrl+V / Ctrl+Shift+V.
- **Links** in the output (and a program's own links) open on **Ctrl+click**, http and https only: GEM Shell asks
  before opening one. A plain click selects, as in Windows Terminal.
- **Esc** is the console's (vim, a prompt's own). F6 / Shift+F6 still move the focus out; GEM Shell says so once, and
  Keyboard shortcuts says it beside "Leave the focused pane".
- **"Open console here"** on any folder menu (GEM Console ▸): the console you placed goes there. With none open, the
  next one you start begins there. It never opens a new widget.
- Closing a tab running a command asks first. A console that ended can be restarted (⋯).

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
