import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ANTICHEAT_MODULE_BYTES,
  ANTICHEAT_MODULE_FILE_NAME,
  ANTICHEAT_MODULE_SHA256,
  installAnticheatModule,
  removeAnticheatModule,
} from "../electron/services/anticheat-module.js";

const workspaces: string[] = [];
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const bundledModule = join(repositoryRoot, "resources", "patches", ANTICHEAT_MODULE_FILE_NAME);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "rotk-anticheat-module-"));
  workspaces.push(directory);
  const root = join(directory, "game");
  await mkdir(root);
  return { root, destination: join(root, ANTICHEAT_MODULE_FILE_NAME) };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("anticheat module staging", () => {
  it("copies the pinned module into the game and is idempotent", async () => {
    const { root, destination } = await fixture();

    await expect(installAnticheatModule(root, bundledModule)).resolves.toBe("installed");
    const installed = await readFile(destination);
    expect(installed.length).toBe(ANTICHEAT_MODULE_BYTES);
    expect(installed.subarray(0, 2).toString("ascii")).toBe("MZ");
    await expect(installAnticheatModule(root, bundledModule)).resolves.toBe("up-to-date");
  });

  it("refuses a bundled module that does not match the pin", async () => {
    const { root, destination } = await fixture();
    const tampered = join(root, "tampered.dll");
    await writeFile(tampered, "not the pinned module");

    await expect(installAnticheatModule(root, tampered)).rejects.toThrow(/anticheat/i);
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes a staged module and reports absence idempotently", async () => {
    const { root, destination } = await fixture();
    await installAnticheatModule(root, bundledModule);

    await expect(removeAnticheatModule(root)).resolves.toBe("removed");
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(removeAnticheatModule(root)).resolves.toBe("absent");
  });

  it("leaves a directory named rotkc.dll untouched", async () => {
    const { root, destination } = await fixture();
    await mkdir(destination);

    await expect(removeAnticheatModule(root)).rejects.toThrow(/anticheat/i);
    await expect(stat(destination).then((entry) => entry.isDirectory())).resolves.toBe(true);
  });
});
