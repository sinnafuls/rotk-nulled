import { join } from "node:path";
import { app } from "electron";

export const APP_NAME = "ROTK Launcher";

// LOCAL EDIT (fork): the version REPORTED to ROTK's servers. The attestation
// and launch-ticket routes refuse any launcher version they have not shipped
// ("This launcher version is too old to verify the game files"), and a fork
// release number past upstream's is exactly that. package.json keeps the fork's
// own number for releases; every server-facing request sends this one. Bump it
// to the upstream launcher version each fork sync (the "Fork: sync to launcher
// X" commits), never to the fork's.
export const REPORTED_LAUNCHER_VERSION = "2.0.36";
export const WEBSITE_ORIGIN = "https://rotk.app";
export const WEBSITE_UPDATES_PATH = "/updates";
export const FORBIDDEN_INSTALL_SEGMENTS = new Set([
  "steam",
  "steamlibrary",
  "steamapps",
  "common",
]);

export const CRITICAL_CLIENT_FILES = [
  "H1Z1.exe",
  "ClientConfig.ini",
  "steam_api64.dll",
] as const;

export const ROTK_INSTALL_DIRECTORY_NAME = "ROTK";
export const RECOMMENDED_INSTALL_PARENT_NAME = "Games";
export const INSTALL_MARKER_NAME = ".rotk-installation.json";

export function resolveBundledDiagnosticsPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "diagnostics", "ROTK.Diagnostics.exe")
    : join(app.getAppPath(), "resources", "diagnostics", "ROTK.Diagnostics.exe");
}

export function resolveBundledShimPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "patches", "steam_api64.dll")
    : join(app.getAppPath(), "resources", "patches", "steam_api64.dll");
}

export function resolveBundledVivoxProxyPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "patches", "vivoxsdk_x64.dll")
    : join(app.getAppPath(), "resources", "patches", "vivoxsdk_x64.dll");
}

export function resolveBundledVivoxRuntimePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "patches", "vivoxsdk_x64_v5.dll")
    : join(app.getAppPath(), "resources", "patches", "vivoxsdk_x64_v5.dll");
}

export function resolveBundledGameplayPatchPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "patches", "dinput8.dll")
    : join(app.getAppPath(), "resources", "patches", "dinput8.dll");
}

// LOCAL EDIT (fork): bundled so the "load anticheat module" testing toggle can
// stage it on demand. It is never copied or loaded unless the player turns the
// toggle on (see services/anticheat-module.ts).
export function resolveBundledAnticheatModulePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "patches", "rotkc.dll")
    : join(app.getAppPath(), "resources", "patches", "rotkc.dll");
}
