<h1 align="center">rotk-nulled</h1>

<p align="center">
  A private-friendly build of the ROTK Launcher for <b>H1Z1 (Return of the King)</b>.<br>
  No HWID collection. No telemetry. No forced updater. No admin prompt.
</p>

<p align="center">
  <a href="https://github.com/sinnafuls/rotk-nulled/releases/latest"><b>⬇ Download the latest installer</b></a>
</p>

---

## What this is

A fork of [`MzKaxD/rotk-launcher`](https://github.com/MzKaxD/rotk-launcher) (itself a fork of [`h1z1rotk/rotk-launcher`](https://github.com/h1z1rotk/rotk-launcher)) with a small, focused set of patches:

| Change | Where | Why |
|---|---|---|
| **No HWID collection** | `electron/services/machine-identity.ts` | `collectHwid()` returns a per-launch synthetic vector. Your real hardware IDs never leave the machine. |
| **No TPM proof** | `electron/services/tpm-identity.ts`, `tpm-anchor.ts` | Signs the ticket with an ephemeral key; `collectTpmAnchor()` returns `null`. |
| **Loopback telemetry** | `electron/services/client-config.ts`, `game-launcher.ts` | The game's `LaunchTelemetry:Url` is rewritten to `127.0.0.1:15081` and `Logging:Directory` is a random per-launch path. No launcher-side telemetry either. |
| **Inert auto-updater** | `electron/main.ts` | The updater seam returns `null`. No forced "update required before Play" gate, no version nagging. Manual updates via this repo's Releases page. |
| **Per-user install, no UAC** | `nsis.perMachine: false`, exe manifest `asInvoker`, `electron/main.ts` | Installs into `%LOCALAPPDATA%\Programs\ROTK Launcher`. Upstream 2.0.28 relaunches itself elevated (UAC) at startup; this fork removed that gate, so there is no admin prompt on install or launch. |
| **Anticheat module off by default** | `electron/services/anticheat-module.ts`, `game-launcher.ts` | Upstream ships a 15 MB `rotkc.dll` and its Vivox proxy `LoadLibraryA`s it into the game on every launch. The fork never stages it unless the **Load anticheat module** switch is on (Launcher settings → Anticheat module), and removes any copy when it is off — so by default the module never loads. The switch exists for memory analysis and testing. |
| **Foreign `dinput8.dll` moved aside** | `electron/services/gameplay-patch.ts` | Upstream refuses to launch when the client holds an unknown `dinput8.dll`. The fork renames it aside (kept on disk, never deleted) and continues in the server's mode, so another DirectInput mod cannot block Play. |
| **Upstream Vivox proxy** | `resources/patches/vivoxsdk_x64.dll` | The 2.0.24 proxy downloaded a server-chosen DLL. 2.0.28 ships the module and no longer fetches it, so the fork no longer pins the previous binary and tracks upstream's own proxy. |

The gameplay-patch DLL (`dinput8.dll`) tracks upstream 2.0.29 (`987fa565…`, the stock-controls stability update), which is genuinely useful. An unrecognized `dinput8.dll` (for example another DirectInput mod) is moved aside rather than deleted, so it never blocks Play.

Everything else — the UI, the client build validation, the launcher-key flow, the asset packs — is upstream code.

## What it does NOT change

- **Your ROTK account key** (from rotk.app) is still required to Play, and is still sent on launch. Server-side account rules are the server's.
- **Game file attestation** still runs against ROTK's manifest, so tampered game files still fail server-side.
- **The game itself** (`H1Z1.exe`) is not modified.

## Install

1. Download `ROTK-Launcher-<version>-x64.exe` from the [Releases page](https://github.com/sinnafuls/rotk-nulled/releases/latest).
2. Verify the SHA-256 against `SHA256SUMS.txt` on the same release (optional but recommended).
3. Run the installer. Per-user install to `%LOCALAPPDATA%\Programs\ROTK Launcher`, no admin prompt.
4. SmartScreen may warn on first run because the build is **unsigned**. Click "More info" → "Run anyway".

You still need a legitimate copy of the game. This repo does not distribute H1Z1 files.

## FAQ

**Is it safe?** It's a public GPL-3.0 fork; every changed file carries a `LOCAL EDIT (fork)` marker, so you can diff against upstream. That said, it is unsigned and hosted on a personal GitHub — trust it the same amount you'd trust anything else you download from a random GitHub release. Use the SHA-256 on the release page to confirm you got the file this repo built.

**Will it get me banned?** The server sees the same login flow the official launcher uses. HWID/TPM aren't currently used as ban signals by ROTK as far as I know, but I can't promise the server won't start caring. Use at your own risk.

**Does the game auto-update?** ROTK updates the game through the normal client-build flow; this fork doesn't change that. Only the *launcher* auto-updater is disabled.

**Will you support Linux/macOS?** No. ROTK only supports Windows, this fork does too.

## For maintainers

Upstream releases a new launcher version every few weeks. To roll our fork forward, see [`MAINTAINING.md`](MAINTAINING.md).

## License

GPL-3.0-or-later, inherited from upstream. Every changed file carries a `LOCAL EDIT (fork)` comment. Third-party binaries (Unity Vivox runtime, PresentMon, .NET runtimes) keep their own licenses — see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Return of the King, H1Z1 and associated marks belong to their owners. This is a community project, unaffiliated with Daybreak Game Company or the ROTK team.
