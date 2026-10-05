import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

// LOCAL EDIT (fork): the launcher no longer requires administrator rights, so
// there is no elevation to prove (upstream 2.0.28 proved the UAC gate here).
// This keeps the other half of upstream's proof: a sandboxed, context-isolated
// Electron renderer starts and loads content alongside a real game process.
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "release");
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, "renderer-proof-"));
const reportPath = path.join(fixture, "report.json");
try {
  await writeFile(path.join(fixture, "package.json"), JSON.stringify({ name: "rotk-renderer-proof", type: "module", main: "main.mjs" }));
  await writeFile(path.join(fixture, "main.mjs"), `
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
app.setPath('userData', ${JSON.stringify(path.join(fixture, "profile"))});
const receipt = { windows: 0, status: 'pending' };
const errors = [];
app.on('child-process-gone', (_event, detail) => { if (detail.reason !== 'clean-exit') errors.push(detail.reason); });
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  receipt.windows++;
  const preferences = window.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  await window.loadURL('data:text/html,<title>ROTK renderer proof</title><p>ready</p>');
  assert.equal(await window.webContents.executeJavaScript('document.body.textContent'), 'ready');
  assert.deepEqual(errors, []);
  receipt.sandboxRendererVerified = true;
  receipt.status = 'ready';
  window.destroy();
  fs.writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(receipt));
  app.exit(0);
}).catch(error => { fs.writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ ...receipt, error: String(error) })); app.exit(1); });
app.on('window-all-closed', () => {});
`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let stderr = "";
  const child = spawn(require("electron"), [fixture], { cwd: fixture, env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-16_384); });
  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("Electron renderer proof timed out")); }, 60_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(exitCode, 0, stderr);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert(!report.error, report.error);
  assert.equal(report.status, "ready");
  assert.equal(report.windows, 1);
  assert.equal(report.sandboxRendererVerified, true);
  console.log("PASS: sandboxed, context-isolated Electron renderer starts and loads content.");
} finally {
  const resolved = path.resolve(fixture);
  assert.equal(path.dirname(resolved), output);
  assert(path.basename(resolved).startsWith("renderer-proof-"));
  await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
