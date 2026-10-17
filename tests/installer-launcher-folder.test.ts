import { mkdir, mkdtemp, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRITICAL_CLIENT_FILES, INSTALL_MARKER_NAME } from "../electron/constants.js";
import {
  adoptExistingClient,
  installClient,
  lostWithLauncherFolder,
} from "../electron/services/installer.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function launcherFixture(): Promise<{ root: string; launcher: string; launcherFolder: string }> {
  const root = await mkdtemp(join(tmpdir(), "vitest-installer-"));
  temporaryRoots.push(root);
  const launcher = join(root, "ROTK Launcher");
  await mkdir(launcher);
  return { root, launcher, launcherFolder: await realpath(launcher) };
}

async function createClient(client: string): Promise<void> {
  await mkdir(client, { recursive: true });
  for (const fileName of CRITICAL_CLIENT_FILES) await writeFile(join(client, fileName), "");
}

const bundled = {
  shimPath: "unused-steam_api64.dll",
  vivoxProxyPath: "unused-vivoxsdk_x64.dll",
  vivoxRuntimePath: "unused-vivox-runtime.dll",
  launcherVersion: "0.0.0-test",
};

describe("game copy inside the launcher folder", () => {
  it("refuses to copy the game into the launcher folder before creating anything", async () => {
    const { root, launcher, launcherFolder } = await launcherFixture();
    const source = join(root, "source");
    await createClient(source);
    const destination = join(launcher, "ROTK");
    const onProgress = vi.fn();

    await expect(installClient({
      ...bundled,
      sourceRoot: source,
      destinationRoot: destination,
      launcherFolder,
      signal: new AbortController().signal,
      onProgress,
    })).rejects.toMatchObject({ name: "PathPolicyError" });
    expect(onProgress).not.toHaveBeenCalled();
    expect(await stat(destination).catch(() => null)).toBeNull();
  });

  it("refuses to adopt a client kept in the launcher folder without touching it", async () => {
    const { launcher, launcherFolder } = await launcherFixture();
    const client = join(launcher, "H1Z1");
    await createClient(client);
    const onProgress = vi.fn();

    await expect(adoptExistingClient({
      ...bundled,
      root: client,
      launcherFolder,
      onProgress,
    })).rejects.toMatchObject({ name: "PathPolicyError" });
    expect(onProgress).not.toHaveBeenCalled();
    expect((await readdir(client)).sort()).toEqual([...CRITICAL_CLIENT_FILES].sort());
  });

  it("explains a game lost with the launcher folder only when it was inside", async () => {
    const { root, launcher, launcherFolder } = await launcherFixture();
    const kept = join(launcher, "ROTK-kept");
    await createClient(kept);
    await writeFile(join(kept, INSTALL_MARKER_NAME), JSON.stringify({
      schemaVersion: 1,
      installId: "install-id",
      clientBuildId: "client-build",
      sourceRoot: join(root, "source"),
      installedAt: "2026-10-01T00:00:00.000Z",
      launcherVersion: "0.0.0-test",
      patchVersion: "patch",
      criticalHashes: {},
    }));

    // The launcher uninstaller removed the whole folder, game included.
    expect(await lostWithLauncherFolder(join(launcher, "ROTK"), launcherFolder)).toBe(true);
    expect(await lostWithLauncherFolder(kept, launcherFolder)).toBe(false);
    expect(await lostWithLauncherFolder(join(root, "Games", "ROTK"), launcherFolder)).toBe(false);
    expect(await lostWithLauncherFolder(join(launcher, "ROTK"), null)).toBe(false);
  });
  it("recognizes missing games through a physical launcher-folder alias", async () => {
    const { root, launcher, launcherFolder } = await launcherFixture();
    const alias = join(root, "launcher-alias");
    await symlink(launcher, alias, process.platform === "win32" ? "junction" : "dir");
    expect(await lostWithLauncherFolder(join(alias, "missing-game"), launcherFolder)).toBe(true);
  });

});
