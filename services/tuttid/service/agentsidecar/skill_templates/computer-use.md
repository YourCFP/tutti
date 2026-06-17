---
name: computer-use
description: Use to operate the macOS desktop — take screenshots, click, type, press keys, scroll — through the Tutti CLI.
---

# Computer Use

Use this skill whenever the task needs macOS desktop automation: capturing a
screenshot, clicking a UI element, typing text, pressing keyboard shortcuts, or
scrolling.

Drive the desktop **only** through the `tutti computer` CLI. The Tutti daemon
owns the cua-driver session for you. Do **not** shell out to AppleScript,
`osascript`, `xdotool`, or any direct accessibility API call — those are not the
managed desktop session and will be blocked or denied.

## Commands

- `tutti computer screenshot` — capture the screen and return the PNG file path.
- `tutti computer click --x <n> --y <n>` — left-click at screen coordinates.
- `tutti computer double-click --x <n> --y <n>` — double-click at coordinates.
- `tutti computer right-click --x <n> --y <n>` — right-click at coordinates.
- `tutti computer type --text <text>` — type a string of characters.
- `tutti computer press-key --key <key>` — press a key or shortcut (e.g. `cmd+c`, `return`, `escape`).
- `tutti computer scroll --x <n> --y <n> --direction <up|down|left|right> --amount <n>` — scroll at coordinates.
- `tutti computer move-cursor --x <n> --y <n>` — move the cursor without clicking.

## Workflow

1. `tutti computer screenshot` to see the current screen state.
2. Identify the target element's coordinates from the screenshot.
3. Act with `click`, `type`, `press-key`, etc., using those coordinates.
4. Re-`screenshot` after actions that change the screen — coordinates may shift.

## Notes

- The computer session is shared per workspace and reused across commands.
- All automation is background (no focus stealing); the foreground app is not
  disturbed.
- If a command reports that cua-driver is not installed or permissions are
  missing (Screen Recording, Accessibility), report that to the user rather
  than falling back to AppleScript or shell automation.
- Coordinates are in logical screen points (not raw pixels). Use the screenshot
  to determine correct coordinates.
