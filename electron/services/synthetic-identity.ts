/**
 * LOCAL EDIT: a synthetic machine identity.
 *
 * The server sees raw lowercase strings (machine-identity.ts, the slots the
 * signed challenge names — from 2.0.14 that is a random draw from a pool of
 * 21, different every launch, so a fork answering five constants is caught by
 * the sixth question) and a P-256 public key + signature (tpm-identity.ts,
 * signing the binding message that ties the challengeId to that same vector).
 * Both are replaced with values that have the exact shape of real ones - the
 * formats below were taken from this machine's real values - but are generated
 * here and stored in the launcher's user-data directory, never in the game
 * tree (which is attested).
 *
 * The whole vector answers: every slot SLOT_READERS in machine-identity.ts
 * knows, in the format its PowerShell reader produces (post-cleanComponent,
 * i.e. lowercase). A challenge that names a slot gets an answer.
 *
 * Rotated on every launch by default: every Play is a new machine and a new
 * key, and nothing from a previous launch survives to be correlated. Set
 * `"rotateEveryLaunch": false` in machine.v1.json to keep one identity.
 *
 * Ported 2026-09-27 from the v2.0.17 app.asar patch
 * (h1z1/verification/rotk_launcher_v2017.patch) to the launcher's TypeScript
 * source, unchanged in behaviour.
 */
import { app } from "electron";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomInt,
  randomUUID,
  sign,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILE = "machine.v1.json";
const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
const HEX = "0123456789abcdef";

interface SyntheticIdentity {
  version: number;
  createdAt: string;
  rotateEveryLaunch: boolean;
  hwid: Record<string, string>;
  tpmKeyPem: string;
}

let cached: SyntheticIdentity | null = null;

function filePath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, FILE);
}

function pick(alphabet: string, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

/** A random, meaningless directory name: what the game's log paths show instead of a user and an install id. */
export function syntheticLogsRoot(): string {
  const drive = process.env.SystemDrive || "C:";
  return join(drive + "\\", "ProgramData", "Temp", pick(ALNUM, 12));
}

/** A plausible past date as yyyy-mm-dd (BIOS release / OS install slots). */
function pastDate(fromYear: number, toYear: number): string {
  const year = randomInt(fromYear, toYear + 1);
  const month = randomInt(1, 13);
  const day = randomInt(1, 29);
  const mm = month < 10 ? `0${month}` : String(month);
  const dd = day < 10 ? `0${day}` : String(day);
  return `${year}-${mm}-${dd}`;
}

/**
 * The full vector, in the formats real Windows machines produce, all lowercase
 * (cleanComponent lowercases everything, so the raw values a real machine sends
 * are lowercase too). Coherent as a build: an AMD or an Intel machine, each
 * with a board, RAM and GPUs that machine could plausibly have.
 */
function generateVector(): Record<string, string> {
  const amd = randomInt(2) === 0;
  // Two boards/CPUs/disks/GPUs each: enough variety that two identities
  // rarely share a value, few enough to stay believable as a real machine.
  const boards = amd
    ? ["rog strix b650e-f gaming wifi", "msi mag b650 tomahawk wifi"]
    : ["msi mag b660m mortar wifi", "asus tuf gaming b660m-plus wifi"];
  const cpus = amd
    ? ["amd ryzen 7 7800x3d 8-core processor", "amd ryzen 9 5900x 12-core processor"]
    : ["intel(r) core(tm) i7-12700k cpu @ 3.60ghz", "intel(r) core(tm) i5-13400f cpu @ 2.50ghz"];
  const disks = amd
    ? ["samsung ssd 990 pro 1tb", "wd black sn850x 2tb"]
    : ["crucial ct1000p5ssd8", "samsung ssd 980 pro 1tb"];
  const gpuChoices = [
    { name: "nvidia geforce rtx 3080", pnp: "pci\\ven_10de&dev_2206&subsys_" },
    { name: "nvidia geforce rtx 4090", pnp: "pci\\ven_10de&dev_2684&subsys_" },
    { name: "amd radeon rx 7900 xtx", pnp: "pci\\ven_1002&dev_744c&subsys_" },
    { name: "amd radeon rx 6800 xt", pnp: "pci\\ven_1002&dev_73a5&subsys_" },
  ];
  const gpu = gpuChoices[randomInt(gpuChoices.length)];
  // volume_serial: exactly 8 hex digits, never 00000000.
  let volume = randomBytes(4).toString("hex");
  while (volume === "00000000") volume = randomBytes(4).toString("hex");
  const cpuId = (amd ? "178bfbff" : "bfebfbff") + pick(HEX, 8);
  // One or two physical NICs, one or two monitors, one or two RAM sticks.
  const macs = Array.from({ length: randomInt(1, 3) }, () => `${pick(HEX, 2)}:${pick(HEX, 2)}:${pick(HEX, 2)}:${pick(HEX, 2)}:${pick(HEX, 2)}:${pick(HEX, 2)}`)
    .sort();
  const monitors = Array.from({ length: randomInt(1, 3) }, () => pick(ALNUM, randomInt(5, 9)))
    .sort();
  const ram = Array.from({ length: randomInt(1, 3) }, () => pick(HEX, 8))
    .sort();
  return {
    machine_guid: randomUUID(),
    smbios_uuid: randomUUID(),
    baseboard_serial: String(randomInt(2, 10)) + pick("0123456789", 14),
    baseboard_product: boards[randomInt(boards.length)],
    disk_serial: "s" + pick(ALNUM, 14),
    disk_model: disks[randomInt(disks.length)],
    disk_firmware: pick(ALNUM, 8),
    volume_serial: volume,
    bios_serial: pick(HEX, 8),
    bios_version: ["2803", "f2", "1.24", "p4.20"][randomInt(4)],
    bios_release_date: pastDate(2022, 2025),
    cpu_name: cpus[randomInt(cpus.length)],
    cpu_processor_id: cpuId,
    ram_module_serials: ram.join(","),
    gpu_pnp_device_id: gpu.pnp + pick(HEX, 8),
    gpu_name: gpu.name,
    mac_addresses: macs.join(","),
    monitor_edid_serials: monitors.join(","),
    os_install_date: pastDate(2020, 2025),
    enclosure_serial: pick(ALNUM, randomInt(8, 11)),
    system_sku: pick(ALNUM, 6),
  };
}

function generateKey(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

function fresh(rotate: boolean): SyntheticIdentity {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    rotateEveryLaunch: rotate,
    hwid: generateVector(),
    tpmKeyPem: generateKey(),
  };
}

/** The identity for this launch: loaded once, created or rotated as configured. */
export function identity(): SyntheticIdentity {
  if (cached) return cached;
  const path = filePath();
  let current: SyntheticIdentity | null = null;
  if (existsSync(path)) {
    try {
      current = JSON.parse(readFileSync(path, "utf8")) as SyntheticIdentity;
    } catch {
      current = null;
    }
  }
  const rotate = current?.rotateEveryLaunch !== false;
  if (!current || rotate || !current.hwid || !current.tpmKeyPem) {
    current = fresh(rotate);
    writeFileSync(path, JSON.stringify(current, null, 2), { mode: 0o600 });
  }
  cached = current;
  return cached;
}

/**
 * Drop this process's identity so the next read makes a new one. Called once
 * at the start of every launch: one Play click, one machine. With
 * `rotateEveryLaunch: false` the persisted identity is simply re-read.
 */
export function rotateIdentity(): void {
  cached = null;
}

/**
 * The HWID vector in machine-identity's own shape, for the slots the challenge
 * asked about: the requested known slots (deduplicated, request order),
 * exactly like selectHwidSlots + the readers would answer. A slot name this
 * identity does not know is simply not answered - the server counts it as
 * unanswered, same as a stock launcher missing a WMI class. No array means
 * the core five, matching collectHwid's default.
 */
export function syntheticHwid(requested?: readonly string[]): Record<string, string> {
  const vector = identity().hwid;
  let slots = requested;
  if (!Array.isArray(slots) || slots.length === 0) {
    slots = ["machine_guid", "smbios_uuid", "baseboard_serial", "disk_serial", "volume_serial"];
  }
  const out: Record<string, string> = {};
  for (const slot of slots) {
    if (Object.prototype.hasOwnProperty.call(vector, slot) && !Object.prototype.hasOwnProperty.call(out, slot)) {
      out[slot] = vector[slot];
    }
  }
  return out;
}

/**
 * A "TPM" proof over `message` (from 2.0.12 the binding message, which ties
 * the challengeId to the HWID vector this same identity answered): the
 * persisted software P-256 key, the public half as a BCRYPT_ECCKEY_BLOB
 * (ECS1, cbKey 32, X||Y - 72 bytes, what the platform provider exports) and
 * an IEEE P1363 r||s signature over SHA-256 of the message bytes -
 * indistinguishable on the wire from the TPM-backed one.
 */
export function syntheticTpmProof(message: string): { publicKey: string; signature: string; algo: "ecdsa-p256-sha256" } {
  const privateKey = createPrivateKey(identity().tpmKeyPem);
  const spki = createPublicKey(identity().tpmKeyPem).export({ format: "der", type: "spki" });
  const raw = spki.subarray(spki.length - 65); // 0x04 || X(32) || Y(32)
  const cbKey = Buffer.alloc(4);
  cbKey.writeUInt32LE(32);
  const blob = Buffer.concat([Buffer.from("ECS1", "ascii"), cbKey, raw.subarray(1)]);
  const signature = sign("sha256", Buffer.from(message, "utf8"), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return {
    publicKey: blob.toString("base64"),
    signature: signature.toString("base64"),
    algo: "ecdsa-p256-sha256",
  };
}
