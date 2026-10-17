# Maintaining the privacy fork

## Supported contract

Send the synthetic machine identity with every launch: the server refuses tickets that carry no HWID serials, so the fork fabricates them (synthetic-identity.ts — a plausible vector plus a software P-256 key shaped like a TPM proof, rotated per Play click by default, `rotateEveryLaunch: false` in `machine.v1.json` for one stable machine). The real hardware is never read. Preserve real account authentication, server-directed integrity policy, and server admission refusals. Always stage the current upstream real anticheat; do not restore the historical anticheat-disable switch.

The anticheat can collect information independently. Do not describe this build as preventing all hardware collection or networking.

## Updating upstream

1. Fetch upstream and record its exact commit and package version. Inspect the complete upstream change, including native binaries and their authoritative hashes/sidecars.
2. Merge without discarding conflict sides wholesale. Trace each changed contract through producers, IPC, renderer consumers, and tests. Renderer and Electron use separate TypeScript configurations.
3. Keep the identity fabrication explicit: the real hardware is never read, but every HWID slot the challenge names is answered from the synthetic identity, and the TPM proof signs the binding message with the synthetic key. Do not let a merge reintroduce real hardware readers or drop the ticket's `hwid` field — the server rejects serial-less tickets.
4. Keep upstream's current `rotkc.dll` and normal staging/loading path. Verify provenance against upstream, not merely against whatever happens to be on disk. An old binary passing an old local pin is not an update.
5. Retain per-user packaging and the fork's release destination. An unsigned release must explicitly pass boolean signing configuration and must be labeled unsigned. Do not reference signing/reuse step outputs unless those steps exist.
6. Update the privacy description, dependencies, and all affected contract tests. Never waive artifact integrity checks merely to make CI green.

## Verification before release

Use the locked dependency installation and the same toolchain as CI: Node 22, Zig 0.15.2, and .NET 10. Check `package.json` scripts and the current workflow for the authoritative commands.

Run both TypeScript configurations through `npm run typecheck`, the full existing test suite, native artifact verification/build steps, renderer and Electron builds, and the actual Electron Builder NSIS packaging command. Do not treat test compilation or a renderer build as installer verification.

Exercise the identity boundary: the ticket request carries the synthetic vector for the slots the challenge named; the TPM proof is present and bound to the same vector; `rotateIdentity()` yields a different machine while `rotateEveryLaunch: false` reuses one; no real hardware reader runs (no powershell/reg children); a server refusal remains a refusal. Exercise normal real-anticheat staging and verify the packaged binary against the upstream source artifact. Smoke the packaged launcher without launching the game or transmitting user credentials unless separately authorized.

Inspect packaging output and checksums. Record any unexercised in-game or server-acceptance behavior accurately.

## Release sequencing

The package version tracks upstream; do not invent a newer version to evade server admission rules. Build the intended merged commit, never an imported upstream tag by accident.

For a fork-only release, use a new `v<upstream-version>-fork.N` tag (positive integer `N`) without changing the package version reported to the server. Never replace assets of an already published release.

Run CI and a manual verification build on the exact candidate commit before publishing or moving a public release tag. Verify that the artifact source SHA is the intended commit, the installer exists, and its checksum matches the published manifest. Only then publish the verified installer. A failed workflow does not constitute a release.

Do not force-push main or reset unrelated work to recover from a failed build. Preserve user changes. Repair the candidate and rerun only when the changed condition makes the retry informative.

## Private and generated files

Do not version game installations, user account keys, local identities, logs, captured traffic, build caches, or generated `release/` output. GitHub Actions publishes verified release artifacts separately from source.
