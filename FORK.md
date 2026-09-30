# rotk-nulled

A patched, ready-to-install build of the ROTK Launcher for friends.

## What this fork removes / changes

Compared to upstream (`https://github.com/MzKaxD/rotk-launcher`, which in turn
pulls from `h1z1rotk/rotk-launcher`), this fork:

1. **Does not send HWID / TPM proof** on the launch ticket. `collectHwid` returns
   a per-launch synthetic vector; `collectTpmProof` signs with an ephemeral key;
   `collectTpmAnchor` returns `null`. The launcher key (your account) and file
   attestation are unchanged and still sent.
2. **Sends game telemetry to loopback**, not to the ROTK backend. The game's
   `LaunchTelemetry:Url` argv is rewritten to `http://127.0.0.1:15081/` and its
   `Logging:Directory` is a fresh anonymous path per launch (no username, no
   install id).
3. **The auto-updater is inert.** `updater: null` at the `LauncherUpdateService`
   seam; the state stays idle, so the "update required before Play" gate is
   never armed by this launcher.
4. **Per-user install, no UAC.** `nsis.perMachine: false`, exe manifest
   `asInvoker`.
5. **Ships the previous Vivox proxy (`199f0d28…`, 71,680 B)** instead of the
   upstream 2.0.24 supplied binary (`5350449196…`, 80,384 B). The upstream
   binary adds an `anti-cheat` download-and-load chain: it spawns
   `rundll32.exe "…rac*.tmp",RotkDownloadAnticheat rotk-download-v1 …`, POSTs
   to `https://rotk.app/api/anti-cheat/download`, moves the reply to
   `<game>\rotkc.dll` and `LoadLibraryA`s it into the game process on every
   launch. The previous binary keeps the crouch/voice compatibility work but
   has no downloader. The shipped gameplay-patch (`dinput8.dll`) is left at the
   new build (`2c8c7d65…`, v17) because it fixes the CZ respawn crash.

The rest of the launcher is upstream code.

## What it does NOT change

- **The launcher key** (your player key from rotk.app) is still required and is
  still sent on Play. Server-side account rules are the server's.
- **File attestation** of the game folder still runs against ROTK's manifest,
  so tampered game files still fail their attestation on the server.
- **The game itself** is not modified.

## Install

Grab the latest `.exe` from the
[Releases](https://github.com/sinnafuls/rotk-nulled/releases) page and run it.
The installer is per-user; it lands in `%LOCALAPPDATA%\Programs\ROTK Launcher`.
No admin prompt.

The release builds are **unsigned** (SmartScreen may warn on first run) unless
the maintainer configures a certificate. Downloads are pinned by SHA-256 in
`SHA256SUMS.txt` alongside each release.

## Legal notes

- This is a distribution of a **GPL-3.0** codebase; the license is preserved
  and every source file we changed carries a `LOCAL EDIT (fork)` comment.
- The repository does **not** contain any H1Z1 game file, and the release
  installer does not either. Users still need a legitimate copy of the game.
- The Vivox 5 runtime (`vivoxsdk_x64_v5.dll`, Unity-signed) and the launcher's
  Vivox proxy are third-party binaries and are pinned by SHA-256; see
  `THIRD_PARTY_NOTICES.md` and `docs/VIVOX_RELEASE_20260930.md`.

## Updating the fork (maintainer procedure)

The upstream repo publishes launcher updates every few weeks. Ours re-applies
the same four local edits on top of every release and packages a new
installer. See `MAINTAINING.md` for the exact commands.
