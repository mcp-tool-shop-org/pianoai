---
title: Troubleshooting
description: What to do when the platform says no — silent audio, blocked saves, missing MIDI, an unreachable Ollama, and import errors.
sidebar:
  order: 98
---

Everything here is local — no accounts, no cloud. When something doesn't work, it is almost
always the browser or the machine saying no, and the fix is one step.

## No sound

**In the cockpit:** browsers refuse to start audio until you interact with the page. Click or
press any key once and audio unlocks. If you see **"Audio is blocked by the browser — allow
sound for this site, then press Play"**, the browser has muted the site itself: allow sound in
the address-bar site settings (Safari: right-click the tab → *Allow auto-play*, or
Settings → Websites → Auto-Play), then press Play again.

**From the MCP server or CLI:** `play_song` plays through the machine's default output
device. If a headless machine or CI has no audio device you'll see ALSA/device warnings —
the tools still validate and respond; there is just nothing to hear.

## The cockpit didn't save my work

The cockpit autosaves to your browser's localStorage. If you see **"Could not save this
session — browser storage is full or blocked. Your work stays until this tab closes; use
Export JSON to keep it"**, you are in a private/incognito window or the origin's storage is
full. Your score is still live in the tab — click **Export JSON** to download it, then
import it in a normal window. Autosave resumes as soon as storage accepts writes.

## "Web MIDI is not available or was blocked"

Web MIDI needs a browser that supports it (Chrome and Edge do; Safari and Firefox may not,
or sit behind a permission prompt). Playing is not blocked — the on-screen keyboard and
QWERTY keys work regardless. To use a hardware controller, allow the MIDI permission when
the browser asks, or switch to a Chromium-based browser.

## `auto_reharmonize` / `compose_panel` say Ollama is unreachable

These two MCP tools are the only ones that talk to a network at all, and only to a **local
Ollama** (default `http://localhost:11434`). The error is structured and safe — nothing else
breaks. Fix: install Ollama (https://ollama.com), start it, and pull the generator model the
tool names (default `qwen2.5:7b`), then call the tool again. Every other tool works with no
Ollama at all.

## `import_midi` returned an error

The tool refuses, with `isError` and a reason, when:

- the path doesn't end in `.mid`/`.midi` (any case — `.MID` is fine),
- the file sits outside your user songs directory's allowed paths,
- a song with that id already exists (delete or rename first),
- the file isn't parseable MIDI.

The message names which one it was; fix that and re-import.

## My keyboard or guitar tuning reset itself

If a saved tuning file under `~/.ai-jam-sessions/voices/` is corrupt (an interrupted write,
a hand-edit), the server falls back to factory defaults and says so in the tool result:
*"Saved tuning for <id> could not be read — showing factory defaults. Re-save to repair."*
Re-running `tune_keyboard` / `tune_guitar` with your settings writes a fresh file and the
warning goes away.

## Where things live

Everything user-created is under `~/.ai-jam-sessions/` — `songs/` (imports and additions),
`voices/` (tunings), `journal/` (practice journal, one markdown file per day). Deleting a
file there resets that one thing; the 120-song library ships inside the package and is
never modified.
