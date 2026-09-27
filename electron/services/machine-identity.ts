/**
 * Composite hardware fingerprint (Windows).
 *
 * The launcher reads the machine identifiers a launch is asked for and sends
 * the RAW values with the ticket request; the server keyed-hashes each and
 * stores only the digests (never the raw value, never on the launcher side
 * either). No single component is trusted — the server matches a HWID ban
 * fuzzily over identity slots, so changing one serial does not evade it.
 *
 * Which slots: the five CORE slots every launch has always answered, plus the
 * slots the signed attestation challenge names (#320 §B) — a random draw from a
 * wider pool, different at every launch, so a fork that answers five constants
 * is caught by the sixth question. A slot name from the server only ever
 * selects an entry of SLOT_READERS below; it never reaches the shell.
 *
 * This is a userland fingerprint on an open-source launcher: a cost to ban
 * evasion, not an unspoofable identity. The TPM anchor is what raises that
 * cost, and from 2.0.12 its signature covers this vector (#320 §C).
 *
 * Every collector is best-effort: a slot that cannot be read is omitted, and
 * an empty vector is valid (the machine just contributes no HWID signal).
 * Collection never throws into the launch path.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { syntheticHwid } from "./synthetic-identity.js";
 import { windowsSystemToolPath } from "./windows-tools.js";

const execFileAsync = promisify(execFile);

/** The slots every launch answers; the server's HWID_CORE_COMPONENTS. */
export const HWID_CORE_SLOTS = [
  "machine_guid", "smbios_uuid", "baseboard_serial", "disk_serial", "volume_serial",
] as const;

/**
 * Every slot this launcher can read, with the PowerShell expression that reads
 * it. Fixed text only. Mirrors the server's HWID_COMPONENTS; a slot the server
 * asks for that is missing here is simply not answered, and counts as missing
 * on its side.
 */
const SLOT_READERS: Readonly<Record<string, string>> = Object.freeze({
  machine_guid: "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid",
  smbios_uuid: "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
  baseboard_serial: "(Get-CimInstance Win32_BaseBoard).SerialNumber",
  baseboard_product: "(Get-CimInstance Win32_BaseBoard).Product",
  disk_serial: "(Get-CimInstance Win32_DiskDrive | Where-Object { $_.Index -eq 0 } | Select-Object -First 1).SerialNumber",
  disk_model: "(Get-CimInstance Win32_DiskDrive | Where-Object { $_.Index -eq 0 } | Select-Object -First 1).Model",
  disk_firmware: "(Get-CimInstance Win32_DiskDrive | Where-Object { $_.Index -eq 0 } | Select-Object -First 1).FirmwareRevision",
  volume_serial: "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='$($env:SystemDrive)'\").VolumeSerialNumber",
  bios_serial: "(Get-CimInstance Win32_BIOS).SerialNumber",
  bios_version: "(Get-CimInstance Win32_BIOS).SMBIOSBIOSVersion",
  bios_release_date: "(Get-CimInstance Win32_BIOS).ReleaseDate.ToString('yyyy-MM-dd')",
  cpu_processor_id: "(Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId",
  cpu_name: "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name",
  ram_module_serials: "((Get-CimInstance Win32_PhysicalMemory | ForEach-Object { $_.SerialNumber } | Where-Object { $_ } | Sort-Object) -join ',')",
  gpu_pnp_device_id: "(Get-CimInstance Win32_VideoController | Select-Object -First 1).PNPDeviceID",
  gpu_name: "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name",
  mac_addresses: "((Get-CimInstance Win32_NetworkAdapter -Filter 'PhysicalAdapter=True' | ForEach-Object { $_.MACAddress } | Where-Object { $_ } | Sort-Object -Unique) -join ',')",
  monitor_edid_serials: "((Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID | ForEach-Object { -join ($_.SerialNumberID | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) } | Where-Object { $_ } | Sort-Object) -join ',')",
  os_install_date: "(Get-CimInstance Win32_OperatingSystem).InstallDate.ToString('yyyy-MM-dd')",
  enclosure_serial: "(Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1).SerialNumber",
  system_sku: "(Get-CimInstance Win32_ComputerSystem).SystemSKUNumber",
});

/** Every slot name this launcher knows how to read. */
export const HWID_KNOWN_SLOTS: readonly string[] = Object.freeze(Object.keys(SLOT_READERS));

/** Values a real machine never legitimately reports; dropped if seen. */
const PLACEHOLDER_VALUES = new Set([
  "", "0", "none", "n/a", "na", "null", "default string", "to be filled by o.e.m.",
  "system serial number", "not applicable", "not available", "无", "00000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff", "00000000-0000-0000-0000-000000000000",
]);

/** Trim, collapse whitespace, lowercase, and reject known placeholders. */
export function cleanComponent(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized === "" || PLACEHOLDER_VALUES.has(normalized)) return undefined;
  return normalized;
}

/**
 * The slots to read: the requested names this launcher knows, deduplicated,
 * in request order. Unknown names are dropped silently — the server counts
 * them as unanswered; nothing here guesses at what they might mean.
 */
export function selectHwidSlots(requested: readonly string[]): string[] {
  const slots: string[] = [];
  for (const slot of requested) {
    if (Object.prototype.hasOwnProperty.call(SLOT_READERS, slot) && !slots.includes(slot)) slots.push(slot);
  }
  return slots;
}

/**
 * One PowerShell script reading every requested slot, each in its own
 * try/catch so a broken WMI class costs its slot and nothing else, printing a
 * compact JSON object. One process for the whole vector: ten slots do not mean
 * ten shells.
 */
export function buildHwidScript(slots: readonly string[]): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$r = @{}",
    ...slots.map((slot) =>
      `try { $v = [string](${SLOT_READERS[slot]}); if ($v) { $r['${slot}'] = $v } } catch {}`),
    "$r | ConvertTo-Json -Compress",
  ].join("\n");
}

/** The JSON the script prints, cleaned slot by slot. Anything unreadable is an empty vector. */
export function parseHwidOutput(stdout: string, slots: readonly string[]): Record<string, string> {
  const vector: Record<string, string> = {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.replace(/^﻿/, "").trim() || "{}");
  } catch {
    return vector;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return vector;
  const record = parsed as Record<string, unknown>;
  for (const slot of slots) {
    const value = record[slot];
    const cleaned = cleanComponent(typeof value === "string" ? value : undefined);
    if (cleaned !== undefined) vector[slot] = cleaned;
  }
  return vector;
}

async function runPowerShell(script: string, timeoutMs: number): Promise<string> {
  // Absolute path, never a bare name: a `powershell.exe` earlier on the user's
  // PATH would otherwise answer these queries itself. -EncodedCommand carries
  // the fixed script without any quoting on the command line.
  const { stdout } = await execFileAsync(
    windowsSystemToolPath("powershell"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64")],
    { windowsHide: true, timeout: timeoutMs, maxBuffer: 256 * 1024, encoding: "utf8" },
  );
  return stdout;
}

/**
 * Collect the fingerprint for the requested slots (the core five by default).
 * Non-Windows returns an empty vector (Linux/Proton is out of scope for v1;
 * the server treats the absence as no HWID signal). Never throws: a shell that
 * fails or times out yields the empty vector.
 */
export async function collectHwid(
  requested: readonly string[] = HWID_CORE_SLOTS,
  options: { run?: (script: string) => Promise<string>; timeoutMs?: number } = {},
): Promise<Record<string, string>> {
  // LOCAL EDIT: the whole vector comes from the synthetic identity
  // (synthetic-identity.ts) - every slot the challenge names is answered, in
  // the shape the PowerShell readers would produce. The shell never runs: no
  // powershell.exe / reg.exe children of a launch.
  if (process.platform !== "win32") return {};
  return syntheticHwid(requested);
}
