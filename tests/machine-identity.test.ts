import { describe, expect, it, vi } from "vitest";
import {
  HWID_CORE_SLOTS,
  HWID_KNOWN_SLOTS,
  buildHwidScript,
  cleanComponent,
  collectHwid,
  parseHwidOutput,
  selectHwidSlots,
} from "../electron/services/machine-identity";

describe("machine identity parsing", () => {
  it("drops placeholder and empty values", () => {
    expect(cleanComponent("  Real-Serial-123 ")).toBe("real-serial-123");
    expect(cleanComponent("")).toBeUndefined();
    expect(cleanComponent("To be filled by O.E.M.")).toBeUndefined();
    expect(cleanComponent("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")).toBeUndefined();
    expect(cleanComponent("System Serial Number")).toBeUndefined();
    expect(cleanComponent(null)).toBeUndefined();
  });

  it("reads the script's JSON, one cleaned value per requested slot", () => {
    const stdout = "﻿{\"machine_guid\":\"3F2504E0-4F89-41D3-9A0C-0305E82C3301\",\"disk_serial\":\" S4EW NX0N \",\"bios_serial\":\"To be filled by O.E.M.\",\"gpu_name\":42,\"volume_serial\":\"1A2B3C4D\"}\r\n";
    expect(parseHwidOutput(stdout, ["machine_guid", "disk_serial", "bios_serial", "gpu_name", "volume_serial", "cpu_name"]))
      .toEqual({
        machine_guid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        disk_serial: "s4ew nx0n",
        volume_serial: "1a2b3c4d",
      });
    expect(parseHwidOutput("not json", ["machine_guid"])).toEqual({});
    expect(parseHwidOutput("[1,2]", ["machine_guid"])).toEqual({});
    expect(parseHwidOutput("", ["machine_guid"])).toEqual({});
  });
});

describe("slot selection and script", () => {
  it("knows the core five and the pool the server draws from", () => {
    for (const slot of HWID_CORE_SLOTS) expect(HWID_KNOWN_SLOTS).toContain(slot);
    for (const slot of ["bios_serial", "mac_addresses", "monitor_edid_serials", "cpu_processor_id", "os_install_date"]) {
      expect(HWID_KNOWN_SLOTS).toContain(slot);
    }
  });

  it("reads only the requested slots it knows, once each, in request order", () => {
    expect(selectHwidSlots(["gpu_name", "machine_guid", "gpu_name", "tpm_manufacturer_id", "not a slot; rm -rf"]))
      .toEqual(["gpu_name", "machine_guid"]);
    expect(selectHwidSlots([])).toEqual([]);
  });

  it("builds one script with one guarded reader per slot and nothing from the request text", () => {
    const script = buildHwidScript(["machine_guid", "cpu_name"]);
    expect(script.startsWith("$ErrorActionPreference = 'Stop'\n$r = @{}\n")).toBe(true);
    expect(script.endsWith("$r | ConvertTo-Json -Compress")).toBe(true);
    expect(script).toContain("$r['machine_guid'] = $v");
    expect(script).toContain("Win32_Processor");
    expect(script).not.toContain("Win32_BIOS");
    expect((script.match(/^try \{/gm) ?? []).length).toBe(2);
  });
});

// LOCAL EDIT (synthetic identity): collectHwid answers from the synthetic
// identity (synthetic-identity.ts) instead of running a PowerShell script, so
// these tests pin the new contract: every requested KNOWN slot is answered
// (values generated, shapes asserted), unknown slots are dropped, nothing is
// ever shelled out to, and collection never throws. The parsing/selection
// tests above keep covering the stock helpers the module still carries.
// vi.mock factories are hoisted above every static import, so the node
// builtins the temp dir needs can only be pulled in dynamically here.
 vi.mock("electron", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "rotk-synth-mi-"));
  return { app: { getPath: () => dir } };
});

describe("collectHwid", () => {
  it("answers exactly the requested known slots and never runs a script", async () => {
    if (process.platform !== "win32") return; // gated on win32; collector is a no-op elsewhere
    let ran = false;
    const vector = await collectHwid(["machine_guid", "bios_serial", "unknown_slot"], {
      run: async () => { ran = true; return "{}"; },
    });
    expect(ran).toBe(false); // the shell never runs: no powershell.exe / reg.exe child
    expect(Object.keys(vector).sort()).toEqual(["bios_serial", "machine_guid"]);
    expect(vector.machine_guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(vector.bios_serial).toMatch(/^[0-9a-f]{8}$/);
  });

  it("defaults to the core five", async () => {
    if (process.platform !== "win32") return;
    const vector = await collectHwid(undefined, { run: async () => { throw new Error("must not run"); } });
    expect(Object.keys(vector).sort()).toEqual([...HWID_CORE_SLOTS].sort());
  });

  it("answers nothing when no requested slot is known, and never throws", async () => {
    if (process.platform !== "win32") return;
    expect(await collectHwid(["nope"], { run: async () => { throw new Error("must not run"); } })).toEqual({});
    // A slot the vector does not know is simply not answered - same as a stock
    // launcher missing a WMI class - and that is not an error.
    expect(await collectHwid(["machine_guid"])).toEqual({ machine_guid: expect.any(String) });
  });

  it("returns an empty vector off Windows", async () => {
    if (process.platform === "win32") return;
    expect(await collectHwid(["machine_guid"], { run: async () => "{}" })).toEqual({});
  });
});
