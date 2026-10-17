import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { retryFs } from "./fs-safe.js";

/**
 * ROTK's anticheat module, staged before every launch.
 *
 * The bundled Vivox proxy calls LoadLibraryA("rotkc.dll") from the game root at
 * DLL_PROCESS_ATTACH. The launcher ships upstream's module unchanged and copies
 * it into the game root before each spawn, verified against the pin below
 * before and after the copy.
 */
export const ANTICHEAT_MODULE_FILE_NAME = "rotkc.dll";
/**
 * Upstream rotk-launcher v2.0.41 (f68b517) resources/patches/rotkc.dll, git
 * blob e5d1b22e65770cb34ee84cb1de3877add892ef05; matches upstream's
 * docs/RELEASE_2_0_40.md. Bump only against the upstream artifact.
 */
export const ANTICHEAT_MODULE_SHA256 =
  "4765861dc893a103f531874e18970ea5b99755d0e5eafa60f710aaba0067a6ed";
export const ANTICHEAT_MODULE_BYTES = 21_757_440;

const INVALID_BUNDLED_MODULE_ERROR =
  "Le module anticheat ROTK embarqué est absent ou modifié. Ton antivirus l’a peut-être mis en quarantaine : restaure-le depuis Sécurité Windows ou réinstalle le launcher.";
const STAGE_MODULE_ERROR =
  "Le module anticheat ROTK n’a pas pu être installé dans le client. Ferme H1Z1 puis réessaie.";

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/** A regular file (never a link or directory) with the pinned size and hash. */
async function isPinnedModule(filePath: string): Promise<boolean> {
  const entry = await lstat(filePath).catch(() => null);
  if (!entry?.isFile() || entry.size !== ANTICHEAT_MODULE_BYTES) return false;
  return await sha256(filePath).catch(() => "") === ANTICHEAT_MODULE_SHA256;
}

/** Stage the pinned module into the game root, verified before and after copy. */
export async function installAnticheatModule(
  root: string,
  bundledPath: string,
): Promise<"installed" | "up-to-date"> {
  if (!(await isPinnedModule(bundledPath))) throw new Error(INVALID_BUNDLED_MODULE_ERROR);
  const destination = join(root, ANTICHEAT_MODULE_FILE_NAME);
  if (await isPinnedModule(destination)) return "up-to-date";

  const temporary = `${destination}.rotk-${randomUUID()}.tmp`;
  try {
    await retryFs(() => copyFile(bundledPath, temporary));
    if (!(await isPinnedModule(temporary))) throw new Error(STAGE_MODULE_ERROR);
    await retryFs(() => rename(temporary, destination));
  } catch (error) {
    if (error instanceof Error && error.message === STAGE_MODULE_ERROR) throw error;
    throw new Error(STAGE_MODULE_ERROR, { cause: error });
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return "installed";
}
