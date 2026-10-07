import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, rename, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { retryFs } from "./fs-safe.js";

/**
 * LOCAL EDIT (fork): ROTK's anticheat module, off by default.
 *
 * The bundled Vivox proxy calls LoadLibraryA("rotkc.dll") from the game root at
 * DLL_PROCESS_ATTACH, so whether the module loads is decided purely by whether
 * the file is there. The fork therefore never stages it unless the player turns
 * the testing toggle on, and removes any copy when the toggle is off.
 */
export const ANTICHEAT_MODULE_FILE_NAME = "rotkc.dll";
/** Pinned upstream artifact (launcher 2.0.32); bump together with upstream. */
export const ANTICHEAT_MODULE_SHA256 =
  "f519670ae57aa7bd1a84744d01d4ad7a7ddf9cc62b9361b48de76023a9dc7111";
export const ANTICHEAT_MODULE_BYTES = 16_733_184;

const INVALID_BUNDLED_MODULE_ERROR =
  "Le module anticheat ROTK embarqué est absent ou modifié.";
const STAGE_MODULE_ERROR =
  "Le module anticheat ROTK n’a pas pu être installé dans le client.";
const REMOVE_MODULE_ERROR =
  "Le module anticheat ROTK n’a pas pu être retiré du client.";

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function isPinnedModule(filePath: string): Promise<boolean> {
  const entry = await stat(filePath).catch(() => null);
  if (!entry?.isFile() || entry.size !== ANTICHEAT_MODULE_BYTES) return false;
  return await sha256(filePath).catch(() => "") === ANTICHEAT_MODULE_SHA256;
}

async function assertBundledModule(bundledPath: string): Promise<void> {
  if (!(await isPinnedModule(bundledPath))) throw new Error(INVALID_BUNDLED_MODULE_ERROR);
}

/** Stage the pinned module into the game root, verified before and after copy. */
export async function installAnticheatModule(
  root: string,
  bundledPath: string,
): Promise<"installed" | "up-to-date"> {
  await assertBundledModule(bundledPath);
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

/**
 * Remove any rotkc.dll from the game root so the proxy cannot load it. Links
 * and directories are left untouched: only a regular file is removed.
 */
export async function removeAnticheatModule(root: string): Promise<"absent" | "removed"> {
  const destination = join(root, ANTICHEAT_MODULE_FILE_NAME);
  const entry = await lstat(destination).catch(() => null);
  if (!entry) return "absent";
  if (!entry.isFile()) throw new Error(REMOVE_MODULE_ERROR);
  try {
    await retryFs(() => unlink(destination));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw new Error(REMOVE_MODULE_ERROR, { cause: error });
  }
  return "removed";
}
