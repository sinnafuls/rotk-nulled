/**
 * Absolute paths of the Windows tools the launcher shells out to.
 *
 * `execFile("powershell", …)` resolves the binary through PATH, and PATH is
 * writable by the user: a `powershell.exe` or `reg.exe` dropped in a directory
 * listed before System32 would answer every machine-identity query with
 * whatever it likes, without touching the launcher at all. Naming the binary
 * under %SystemRoot% closes that door — the system directory is not
 * user-writable — and costs nothing on a healthy machine.
 *
 * Windows paths are built with the win32 flavour explicitly so the result is
 * the same string whichever platform runs the tests.
 */

import { win32 } from "node:path";

export type WindowsSystemTool = "reg" | "powershell";

/** The absolute path of a system tool, never a bare name PATH gets to resolve. */
export function windowsSystemToolPath(
  tool: WindowsSystemTool,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const system32 = win32.join(windowsSystemRoot(env), "System32");
  switch (tool) {
    case "reg":
      return win32.join(system32, "reg.exe");
    case "powershell":
      return win32.join(system32, "WindowsPowerShell", "v1.0", "powershell.exe");
  }
}

/** %SystemRoot%, falling back to %windir% and then the default install location. */
export function windowsSystemRoot(env: NodeJS.ProcessEnv = process.env): string {
  const root = env["SystemRoot"]?.trim() || env["windir"]?.trim();
  return root ? root : "C:\\Windows";
}
