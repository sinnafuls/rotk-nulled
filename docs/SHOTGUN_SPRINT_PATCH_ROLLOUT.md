# Shotgun sprint client patch — launcher 2.0.14

## What ships

Launcher 2.0.14 adds one attested artifact and one opt-in marker:

| File | SHA-256 | Size |
| --- | --- | --- |
| `dinput8.dll` | `36fba2037b0c9b1829e7c7e8bbedbcf5a962f495de4e8c63880b785745dcac3a` | 25 088 |
| `rotk-shotgun-sprint.ini` (marker, not attested) | content pinned by the service | 323 |

The DLL is a DirectInput8 proxy (the same hardened shape as the 1.4.7 stable
proxy) that applies **two guarded one-byte opcode edits** inside the final v26
client's `CanSprint` predicate:

| Address | Stock | Patched | Effect |
| --- | --- | --- | --- |
| `H1Z1.exe+0x1046F98` | `0x8F` (JG) | `0x82` (JB, never taken after TEST) | ignores the positive post-shot action timer |
| `H1Z1.exe+0x1046FE5` | `0x74` (JE) | `0xEB` (JMP) | ignores the independent pending "enter fire state" block |

The second byte is what the 1.4.7 patch was missing: the 2026-09-12 live test
confirmed the first byte in memory while the shotgun still slowed, and the
offline oracle reproduces that failure. The v3 proof
(`shotgun-sprint-v3-proof.json`) runs the real predicate with synthetic actor
and event objects: stock blocks the timer and the pending shot, one byte only
unblocks the timer, both bytes unblock both while ADS, melee, knocked-down,
charging, shield and `CanMove` gates still refuse.

There is no trampoline, executable allocation, input polling, resume hook or
player-state write. The proxy only starts after the real `DirectInput8Create`
call, waits five seconds, requires 20 consecutive stable reads of both stock
signatures, verifies the exact H1Z1 build, and rolls back an incomplete byte
write. The marker next to `H1Z1.exe` is the explicit opt-in; when it
disappears the proxy restores both stock bytes within two seconds.

## Server-directed modes

The patch is never a silent launcher preference. The signed attestation
challenge (launcher 2.0.14+, `clientPatchMode`) tells the launcher exactly what
the server wants for this launch:

| Mode | Launcher action before attestation | Expected attestation root |
| --- | --- | --- |
| `patched` | install/repair `dinput8.dll`, write the marker | `launcherPatchedExpectedRoots[2.0.14]` |
| `clean` | delete the marker, then `dinput8.dll` | `launcherExpectedRoots[2.0.14]` |

A server that predates the field sends no mode; 2.0.14 then keeps the client
clean, which is what those policies expect. A `patched` mode is only ever
issued for a build the policy explicitly mapped, so older launchers keep their
historic clean root and their historic five-field challenge signature.

The launcher records the last decision in
`%APPDATA%\ROTK Launcher\gameplay-patch-state.v1.json`. When attestation is
unavailable or unconfigured, that cached mode (default `patched` on a fresh
machine) is reapplied instead of guessing; a mismatch between the recorded
mode and the files on disk blocks the launch with a repairable error.

## Player-state migration matrix

Every start reconciles the installation against the pinned hashes:

| Starting state | Result |
| --- | --- |
| clean client, no `dinput8.dll` | installs `dinput8.dll` + marker (`patched`) |
| launcher 1.4.3 retired DLL (`307603aa…`, 24 064 bytes) | replaced |
| launcher 1.4.5/1.4.7 stable DLL (`0d560316…`, 21 504 bytes) | replaced |
| current 2.0.14 DLL, marker missing | marker repaired |
| current 2.0.14 DLL + marker | idempotent |
| unknown `dinput8.dll` file | moved aside as `*.unknown-<id>.original` (kept, never deleted), then the mode's patch is applied |
| `dinput8.dll` link / directory | refused, never followed, overwritten or deleted |
| clean mode with any known DLL | marker removed first, then DLL |
| marker unwritable | deployment fails closed and removes the DLL it just staged |

The marker is removed before the DLL so even a locked proxy (a game started
outside the launcher) reverts to stock bytes on its next start. Deleting both
files is the complete rollback: `H1Z1.exe` is never modified on disk by this
patch, so no game-file rollback, Steam verification or reinstall is ever
required.

## Rollout order

1. **Server first.** Apply
   `infra/vps/postgresql/migrations/0084_launcher_2_0_14_client_patch_policy.sql`.
   It copies the newest policy, maps `2.0.14` clean + patched roots, adds
   `dinput8.dll` to `overridePaths`, and sets `clientPatchMode = "patched"`.
   The migration refuses to guess if the live policy no longer maps `2.0.13`
   to the clean root the candidate was computed against.
2. Verify the newest row:
   `SELECT policy_version, enforcement, document->>'clientPatchMode' FROM app.attestation_policies ORDER BY policy_version DESC LIMIT 1;`
3. **Admit the build.** In Launcher Logs → Launcher Version Policy, enable
   `2.0.14` with a reason. Admission is deliberately a separate action; the
   version becomes selectable once the policy names its roots.
4. Publish launcher 2.0.14 and let players update.
5. Watch `app.attestation_events` for accepted 2.0.14 reports carrying both
   roots, then move the policy from `observe` to `enforce` if the rollout was
   published in observe mode.
6. In-game validation gate: Combat Training, Riot Shotgun hipfire with Shift
   held, crouch on/off, ADS, reload, weapon swap, repeated respawns, and a
   long session. The shotgun-only server weapon profile
   (`H1Z1_SHOTGUN_HIPFIRE_SPRINT=1`, validated on 2026-09-16) is still a
   separate candidate on the server's `test/client-patch-lab-20260912` branch
   and is not part of this release. If it is enabled later it becomes an
   independent, shotgun-scoped fallback: a client depatch would then leave
   that scoped fix in place instead of returning to the stock slowdown.

## Emergency depatch

Level 1 — immediate, server-side (no launcher release needed):

```bash
psql "$ROTK_WEB_DATABASE_URL" -f rotk-web/scripts/emergency-depatch-client-patch.sql
```

This publishes a new immutable policy with `clientPatchMode = "clean"`. Every
2.0.14 launcher removes the marker and the DLL before its next launch and
attests the clean root; a player who has not restarted keeps the patch until
the next start. Older launchers are unaffected because their clean roots do not
change.

Level 2 — local, no server (support instruction):

1. Close H1Z1 if the player can, then tell them to delete
   `rotk-shotgun-sprint.ini` next to `H1Z1.exe`. A running game reverts to
   stock bytes within two seconds; the launcher will remove the inert DLL on
   its next start once the policy says `clean`.
2. If no game is running, deleting `dinput8.dll` as well restores the exact
   2.0.13 tree.

Never ask a player to delete an unknown `dinput8.dll`: the launcher moves the
file aside (keeping it) and then applies the server's mode. Links and
directories are still left untouched, by design.

Level 3 — launcher-side repair: keep the launcher installed. It re-applies the
server mode on every launch and rewrites the AppData state, so a player who
cannot follow instructions converges as soon as the policy is flipped.

## Attestation roots

Computed on 2026-09-18 against the live assets 1.13.5 feed + payloads and the
base manifest root `ecbe6647b60cfbc2832afbad8bc0e8905ea88bdcde3755c1bc2259590b8ef686`,
independently with the launcher's `shared/attestation.ts` implementation and
with `rotk-web/scripts/publish-attestation-policy.mjs` (both agreed):

| Tree | Files | Root |
| --- | --- | --- |
| clean (no `dinput8.dll`) | 537 | `77c99cb7192324ace991aeb7c07edd3333425df528f989ef74d52293d19582d5` |
| patched | 538 | `437f97e9f0f38d5a880920a50e0baade48c83a8e450981efd2f7d43bf3e91f4d` |

If the live pack moves before the migration is applied, the migration leaves a
NOTICE and the operator republishes the 2.0.14 roots with the private publisher
using the four overrides
`steam_api64.dll`, `vivoxsdk_x64.dll`, `vivoxsdk_x64_v5.dll`, `dinput8.dll`.

## Known limits

* The two bytes are not weapon-specific: they remove both sprint blocks for
  every weapon that has them. The validated, shotgun-only variant is the
  server weapon profile above; until it is enabled in production a client
  depatch returns the shotgun to the stock slowdown, which is the expected
  behaviour of an emergency rollback.
* An in-session player cannot be switched by a remote command; the depatch
  applies to the next launch, or immediately in-process when the marker is
  deleted locally (two-second watchdog).
* Frame-time/stutter measurements and long-session respawn stability remain
  separate qualification gates from the functional sprint result.
