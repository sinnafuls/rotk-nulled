# Maintaining the fork

## Once, when first cloning

```
git clone https://github.com/sinnafuls/rotk-nulled.git rotk-launcher
cd rotk-launcher
git remote add upstream https://github.com/MzKaxD/rotk-launcher.git
git fetch upstream --tags
```

You'll also need:
- Node 22 (`nvm-windows` or from nodejs.org)
- Zig 0.15.2 in `PATH` (portable at `D:\Tools\zig-0.15.2` is fine)
- .NET 10 SDK for the deathcomm helper

## After upstream publishes a new launcher version

```
cd rotk-launcher

# 1. Pull upstream, merge (or rebase — see below).
git fetch upstream --tags
git merge upstream/main            # or: git rebase upstream/main

# 2. Resolve conflicts. The load-bearing files are marked with
#    `// LOCAL EDIT (fork)` comments — every hit MUST survive:
git grep -n "LOCAL EDIT (fork)"
#      electron/services/machine-identity.ts    (collectHwid -> syntheticHwid)
#      electron/services/tpm-identity.ts        (collectTpmProof -> synthetic)
#      electron/services/tpm-anchor.ts          (collectTpmAnchor -> null)
#      electron/services/client-config.ts       (LaunchTelemetry loopback)
#      electron/services/game-launcher.ts       (argv loopback, anon logs, removeForeignRotkc)
#      electron/services/gameplay-patch.ts      (quarantine an unknown dinput8.dll)
#      electron/services/game-launcher.ts       (argv loopback, anon logs, anticheat toggle)
#      electron/services/gameplay-patch.ts      (quarantine an unknown dinput8.dll)
#      electron/services/anticheat-module.ts    (rotkc pin + stage/remove; off by default)
#      electron/main.ts                         (rotateIdentity, updater: null, no elevation gate)
#      .github/workflows/release.yml            (fork hash pins)
#      package.json                             ("publish" -> sinnafuls)
#
#    If upstream re-adds `resources/patches/rotkc.dll` (its anticheat module) or
#    a Vivox proxy that loads it:
#      - Keep the fork's rule: never ship, copy, or load `rotkc.dll`. Delete the
#        bundled binary and re-remove the launch wiring (`git log -S rotkc`).
#      - `game-launcher.ts` (`removeForeignRotkc`) deletes any copy from the
#        client; `shared/attestation.ts` no longer exempts it.
#      - Keep upstream's own `resources/patches/vivoxsdk_x64.dll` — the fork
#        pins no proxy of its own; verify it with `scripts/verify-vivox-proxy.mjs`.
#
#      - The fork bundles it only for the "load anticheat module" testing
#        toggle (services/anticheat-module.ts). Never edit or delete the
#        bundled binary in a fork commit: `resources/patches/*.dll` are upstream
#        release inputs, so every sync would conflict. A new upstream rotkc.dll
#        only needs ANTICHEAT_MODULE_SHA256 / ANTICHEAT_MODULE_BYTES bumped to
#        match (the binary itself arrives with the rebase).
#      - Keep upstream's own `resources/patches/vivoxsdk_x64.dll` — the fork
#        pins no proxy of its own; verify it with `scripts/verify-vivox-proxy.mjs`.
#
#    Never commit `.nyx/` (local agent workspace: uploads, scratch); it is
#    gitignored, and re-adding it makes the next rebase abort on untracked files.
#
#    If upstream adds any NEW resources/patches/* DLL, analyze it BEFORE bumping
#    the version.
#
#    If upstream re-adds the administrator-startup gate (a new
#    electron/services/startup-elevation.ts + `startWithRequiredElevation` in
#    main.ts), remove it again: initialize() directly in app.whenReady(), keep
#    `requestedExecutionLevel: asInvoker` and `nsis.perMachine: false`. The
#    fork never requests UAC.

# 3. Verify the tree.
PATH="D:/Tools/zig-0.15.2;$PATH" \
ZIG_LOCAL_CACHE_DIR="$TEMP/zig-local-cache" \
  npm run prepare:native
node scripts/verify-vivox-proxy.mjs
node scripts/verify-gameplay-patch.mjs

# 4. Build + full test suite + package.
PATH="D:/Tools/zig-0.15.2;$PATH" \
ZIG_LOCAL_CACHE_DIR="$TEMP/zig-local-cache" \
  npm run build
npx electron-builder --win nsis \
  --config.forceCodeSigning=false \
  --config.win.signExecutable=false \
  --publish never

# `release/ROTK-Launcher-<version>-x64.exe` now exists.

# 5. Sanity-check what the packaged installer will actually deploy:
sha256sum release/win-unpacked/resources/patches/dinput8.dll \
          release/win-unpacked/resources/patches/vivoxsdk_x64.dll
#   expected: 987fa565…  dinput8.dll
#             d7466229…  vivoxsdk_x64.dll
#   and confirm no rotkc.dll is packaged:
ls release/win-unpacked/resources/patches/
```

## Cutting a release

`package.json.version` is the fork's own release number; tag with
`v<version>` (the release workflow requires the tag to match it). The version
sent to ROTK's servers is separate: `REPORTED_LAUNCHER_VERSION` in
`electron/constants.ts`, which must be a version upstream has actually shipped
or the attestation and ticket routes refuse the launch ("This launcher version
is too old to verify the game files"). Set it to the upstream version on every
sync; a fork release past upstream keeps reporting upstream's number.

```
git commit -am "Fork: sync to launcher <version>"
git tag v<version>
git push origin main --tags
```

The workflow at `.github/workflows/release.yml` runs on the tag:
- rebuilds natives (Zig 0.15.2), deathcomm (.NET 10), diagnostics helper,
- validates the pinned DLL hashes (fork values, not upstream),
- packages an NSIS installer,
- generates `SHA256SUMS.txt` and `latest.yml`,
- creates a **draft** GitHub release with everything attached.

Open <https://github.com/sinnafuls/rotk-nulled/releases>, review the draft,
publish it.

## Emergency rollback

If a release is bad, the previous installer is still on the previous release.
Users who already installed the bad one can reinstall the old `.exe`; NSIS
per-user replaces cleanly.

If you need to revert the fork itself:
```
git reset --hard <previous good SHA>
git push --force-with-lease origin main
```

## What NEVER goes in the repo

- `release/` (built by CI; already `.gitignore`d)
- `%APPDATA%\ROTK Launcher\player-keys.v2.json` (your account key)
- `%APPDATA%\ROTK Launcher\machine.v1.json` (per-launch synthetic identity)
- Any H1Z1 game file
