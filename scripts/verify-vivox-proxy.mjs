import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// LOCAL EDIT (fork): the 2.0.24 supplied proxy (535044…, 80,384 B) adds a
// download-and-execute helper — it POSTs https://rotk.app/api/anti-cheat/download
// through a spawned rundll32.exe (its own RotkDownloadAnticheat export), then
// MoveFileExA's the reply to <game>\rotkc.dll and LoadLibraryA's it into the
// game process. The previous release input (199f0d28…, 71,680 B) does not have
// it and is what this fork ships. See verification/rotk_game_dlls.md (h1z1 repo).
const expected = "199f0d288f5bec010c5cf20802eb1dc162d27a05b57699268666e93575fec6dd";
const expectedBytes = 71_680;
const proxyPath = resolve(process.argv[2] ?? "resources/patches/vivoxsdk_x64.dll");
const [binary, sidecar] = await Promise.all([
  readFile(proxyPath),
  readFile(`${proxyPath}.sha256`, "utf8"),
]);
assert.equal(binary.length, expectedBytes, "Unexpected Vivox proxy size");
assert.equal(createHash("sha256").update(binary).digest("hex"), expected,
  "The supplied Vivox release proxy has changed");
assert.equal(sidecar.trim().split(/\s+/u)[0], expected,
  "Vivox attestation sidecar differs from the released binary");
const pe = binary.readUInt32LE(0x3c);
assert.equal(binary.readUInt16LE(0), 0x5a4d, "Missing DOS header");
assert.equal(binary.readUInt32LE(pe), 0x4550, "Missing PE signature");
assert.equal(binary.readUInt16LE(pe + 4), 0x8664, "Vivox must be AMD64");
assert.equal(binary.readUInt16LE(pe + 24), 0x20b, "Vivox must be PE32+");
assert(binary.readUInt16LE(pe + 22) & 0x2000, "Vivox must be a DLL");
console.log(`Verified supplied Vivox release proxy: ${proxyPath} (${expected})`);
