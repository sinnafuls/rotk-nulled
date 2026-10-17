import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localizeServiceError } from "../electron/i18n.js";
import {
  assertVisualCppRuntime,
  readFileVersion,
  VISUAL_CPP_RUNTIME_DOWNLOAD_URL,
  VISUAL_CPP_RUNTIME_MINIMUM,
  type FileVersion,
} from "../electron/services/visual-cpp-runtime.js";

// VS_VERSIONINFO header, key and padding, then the start of VS_FIXEDFILEINFO.
function versionResource([major, minor, build, revision]: FileVersion): Buffer {
  const resource = Buffer.alloc(92);
  resource.writeUInt16LE(resource.length, 0);
  resource.writeUInt16LE(52, 2);
  resource.write("VS_VERSION_INFO\0", 6, "utf16le");
  resource.writeUInt32LE(0xfeef04bd, 40);
  resource.writeUInt32LE(0x00010000, 44);
  resource.writeUInt32LE(((major << 16) | minor) >>> 0, 48);
  resource.writeUInt32LE(((build << 16) | revision) >>> 0, 52);
  return resource;
}

const X64 = 0x8664;
const X86 = 0x14c;

// DOS header whose e_lfanew points to the PE signature and machine, then the resource.
function image(version: FileVersion, machine = X64): Buffer {
  const headers = Buffer.alloc(512);
  headers.write("MZ", 0, "latin1");
  headers.writeUInt32LE(0x80, 0x3c);
  headers.write("PE", 0x80, "latin1");
  headers.writeUInt16LE(machine, 0x84);
  return Buffer.concat([headers, versionResource(version), Buffer.alloc(64)]);
}

const FILES = ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"];
const MINIMUM = VISUAL_CPP_RUNTIME_MINIMUM.join(".");
const ISSUE_171: FileVersion = [14, 36, 32532, 0];
const [major, minor, build] = VISUAL_CPP_RUNTIME_MINIMUM;

function runtime(version: FileVersion): Record<string, FileVersion> {
  return Object.fromEntries(FILES.map((name) => [name, version]));
}

const machines: string[] = [];
afterEach(async () => {
  for (const machine of machines.splice(0)) {
    if (!resolve(machine).startsWith(resolve(join(tmpdir(), "rotk-vc-runtime-test-")))) throw new Error("Unsafe test cleanup");
    await rm(machine, { recursive: true, force: true });
  }
});

async function writeFiles(directory: string, files: Record<string, FileVersion | Buffer>): Promise<void> {
  for (const [name, version] of Object.entries(files)) {
    await writeFile(join(directory, name), Buffer.isBuffer(version) ? version : image(version));
  }
}

async function machine(
  system: Record<string, FileVersion | Buffer>,
  game: Record<string, FileVersion | Buffer> = {},
): Promise<{ root: string; env: NodeJS.ProcessEnv }> {
  const base = await mkdtemp(join(tmpdir(), "rotk-vc-runtime-test-"));
  machines.push(base);
  const root = join(base, "game");
  const windows = join(base, "Windows");
  await mkdir(root);
  await mkdir(join(windows, "System32"), { recursive: true });
  await writeFiles(join(windows, "System32"), system);
  await writeFiles(root, game);
  return { root, env: { SystemRoot: windows } };
}

async function refusal(root: string, env: NodeJS.ProcessEnv): Promise<string> {
  const error = await assertVisualCppRuntime(root, env).then(() => null, (failure: Error) => failure);
  if (!error) throw new Error("The runtime was accepted");
  return error.message;
}

async function systemRefusal(system: Record<string, FileVersion | Buffer>): Promise<string> {
  const { root, env } = await machine(system);
  return refusal(root, env);
}

describe("readFileVersion", () => {
  it("reads the file version from VS_FIXEDFILEINFO", () => {
    expect(readFileVersion(image(ISSUE_171))).toEqual([14, 36, 32532, 0]);
    expect(readFileVersion(image([14, 51, 36247, 65535]))).toEqual([14, 51, 36247, 65535]);
  });

  it("skips a key that no fixed file information follows", () => {
    const stray = Buffer.concat([Buffer.alloc(8), Buffer.from("VS_VERSION_INFO\0", "utf16le"), Buffer.alloc(64)]);
    expect(readFileVersion(Buffer.concat([stray, versionResource([14, 44, 35211, 0])]))).toEqual([14, 44, 35211, 0]);
  });

  it("returns null without a complete version resource", () => {
    expect(readFileVersion(Buffer.from("MZ not a versioned image"))).toBeNull();
    expect(readFileVersion(Buffer.from("VS_VERSION_INFO\0", "utf16le"))).toBeNull();
    expect(readFileVersion(versionResource(ISSUE_171).subarray(0, 50))).toBeNull();
    const unsigned = versionResource(ISSUE_171);
    unsigned.writeUInt32LE(0, 40);
    expect(readFileVersion(unsigned)).toBeNull();
  });
});

describe("assertVisualCppRuntime", () => {
  it("accepts the minimum and anything newer, comparing each part as a number", async () => {
    const accepted: FileVersion[] = [
      VISUAL_CPP_RUNTIME_MINIMUM,
      [major, minor, build, 1],
      [major, minor + 1, 0, 0],
      [14, 51, 36247, 0],
      [14, 100, 0, 0],
    ];
    for (const version of accepted) {
      const { root, env } = await machine(runtime(version));
      await expect(assertVisualCppRuntime(root, env)).resolves.toBeUndefined();
    }
  });

  it("refuses the 14.36 runtime of issue #171 and links Microsoft's download", async () => {
    expect(await systemRefusal(runtime(ISSUE_171))).toBe(
      `Le runtime Microsoft Visual C++ x64 de ce PC est trop ancien (msvcp140.dll 14.36.32532.0, minimum ${MINIMUM}) : `
      + `H1Z1 se fermerait au démarrage. Installe la dernière version depuis ${VISUAL_CPP_RUNTIME_DOWNLOAD_URL} puis réessaie.`,
    );
    expect(VISUAL_CPP_RUNTIME_DOWNLOAD_URL).toBe("https://aka.ms/vc14/vc_redist.x64.exe");
  });

  it("refuses one build below the minimum and checks every file", async () => {
    expect(await systemRefusal(runtime([major, minor, build - 1, 0])))
      .toContain(`(msvcp140.dll ${major}.${minor}.${build - 1}.0, minimum ${MINIMUM})`);
    expect(await systemRefusal(runtime([14, 40, 9999, 0]))).toContain("(msvcp140.dll 14.40.9999.0,");
    expect(await systemRefusal({ ...runtime(VISUAL_CPP_RUNTIME_MINIMUM), "vcruntime140.dll": ISSUE_171 }))
      .toContain("(vcruntime140.dll 14.36.32532.0,");
  });

  it("refuses a missing runtime file", async () => {
    expect(await systemRefusal({})).toBe(
      "Le runtime Microsoft Visual C++ x64 nécessaire à ROTK est absent de ce PC (msvcp140.dll introuvable). "
      + `Installe-le depuis ${VISUAL_CPP_RUNTIME_DOWNLOAD_URL} puis réessaie.`,
    );
    const { "vcruntime140_1.dll": _missing, ...withoutFrameHandler } = runtime(VISUAL_CPP_RUNTIME_MINIMUM);
    expect(await systemRefusal(withoutFrameHandler)).toContain("(vcruntime140_1.dll introuvable)");
  });

  it("judges a copy in the game folder instead of System32, as Windows loads it first", async () => {
    const outdatedCopy = await machine(runtime(VISUAL_CPP_RUNTIME_MINIMUM), { "msvcp140.dll": ISSUE_171 });
    expect(await refusal(outdatedCopy.root, outdatedCopy.env)).toBe(
      `Le dossier du jeu contient une ancienne copie de msvcp140.dll (14.36.32532.0, minimum ${MINIMUM}) : `
      + `H1Z1 se fermerait au démarrage. Supprime ${join(outdatedCopy.root, "msvcp140.dll")} puis réessaie.`,
    );

    const recentCopy = await machine({ ...runtime(VISUAL_CPP_RUNTIME_MINIMUM), "msvcp140.dll": ISSUE_171 },
      { "msvcp140.dll": VISUAL_CPP_RUNTIME_MINIMUM });
    await expect(assertVisualCppRuntime(recentCopy.root, recentCopy.env)).resolves.toBeUndefined();

    const { "msvcp140.dll": _system, ...systemWithoutMsvcp } = runtime(VISUAL_CPP_RUNTIME_MINIMUM);
    const onlyCopy = await machine(systemWithoutMsvcp, { "msvcp140.dll": VISUAL_CPP_RUNTIME_MINIMUM });
    await expect(assertVisualCppRuntime(onlyCopy.root, onlyCopy.env)).resolves.toBeUndefined();
  });

  it("passes over a 32-bit copy in the game folder, as Windows does for H1Z1", async () => {
    const recentX86 = await machine(runtime(ISSUE_171), { "msvcp140.dll": image([14, 51, 36247, 0], X86) });
    expect(await refusal(recentX86.root, recentX86.env))
      .toContain("Le runtime Microsoft Visual C++ x64 de ce PC est trop ancien (msvcp140.dll 14.36.32532.0,");

    const outdatedX86 = await machine(runtime(VISUAL_CPP_RUNTIME_MINIMUM), { "msvcp140.dll": image(ISSUE_171, X86) });
    await expect(assertVisualCppRuntime(outdatedX86.root, outdatedX86.env)).resolves.toBeUndefined();
  });

  it("does not judge a file whose version cannot be read", async () => {
    const { root, env } = await machine({ ...runtime(VISUAL_CPP_RUNTIME_MINIMUM), "msvcp140.dll": Buffer.from("MZ") });
    await expect(assertVisualCppRuntime(root, env)).resolves.toBeUndefined();
  });

  it("does not judge a game-folder copy it cannot read, nor fall back to System32", async () => {
    const { root, env } = await machine({ ...runtime(VISUAL_CPP_RUNTIME_MINIMUM), "msvcp140.dll": ISSUE_171 });
    // A folder under the DLL's name makes reading it fail with EISDIR.
    await mkdir(join(root, "msvcp140.dll"));
    await expect(assertVisualCppRuntime(root, env)).resolves.toBeUndefined();
  });

  it("translates each refusal", async () => {
    const tooOld = await systemRefusal(runtime(ISSUE_171));
    expect(localizeServiceError(tooOld, "en")).toBe(
      `The Microsoft Visual C++ x64 runtime on this PC is too old (msvcp140.dll 14.36.32532.0, minimum ${MINIMUM}): `
      + `H1Z1 would close as soon as it starts. Install the latest version from ${VISUAL_CPP_RUNTIME_DOWNLOAD_URL} and try again.`,
    );
    expect(localizeServiceError(tooOld, "zh")).toBe(
      `此电脑的 Microsoft Visual C++ x64 运行库版本过旧（msvcp140.dll 14.36.32532.0，最低要求 ${MINIMUM}），`
      + `H1Z1 会在启动时关闭。请从 ${VISUAL_CPP_RUNTIME_DOWNLOAD_URL} 安装最新版本后重试。`,
    );
    expect(localizeServiceError(tooOld, "fr")).toBe(tooOld);

    const missing = await systemRefusal({});
    expect(localizeServiceError(missing, "en")).toBe(
      "The Microsoft Visual C++ x64 runtime ROTK needs is missing from this PC (msvcp140.dll not found). "
      + `Install it from ${VISUAL_CPP_RUNTIME_DOWNLOAD_URL} and try again.`,
    );
    expect(localizeServiceError(missing, "zh")).toBe(
      `此电脑缺少 ROTK 所需的 Microsoft Visual C++ x64 运行库（找不到 msvcp140.dll）。请从 ${VISUAL_CPP_RUNTIME_DOWNLOAD_URL} 安装后重试。`,
    );

    const { root, env } = await machine(runtime(VISUAL_CPP_RUNTIME_MINIMUM), { "msvcp140.dll": ISSUE_171 });
    const copy = await refusal(root, env);
    const path = join(root, "msvcp140.dll");
    expect(localizeServiceError(copy, "en")).toBe(
      `The game folder contains an old copy of msvcp140.dll (14.36.32532.0, minimum ${MINIMUM}): `
      + `H1Z1 would close as soon as it starts. Delete ${path} and try again.`,
    );
    expect(localizeServiceError(copy, "zh")).toBe(
      `游戏文件夹中有旧版 msvcp140.dll（14.36.32532.0，最低要求 ${MINIMUM}），H1Z1 会在启动时关闭。请删除 ${path} 后重试。`,
    );
  });
});
