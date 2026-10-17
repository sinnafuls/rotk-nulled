/**
 * The Windows system directory, resolved from the environment rather than
 * assumed, so system files (for example the Visual C++ runtime) are read from
 * the actual installation.
 */

/** %SystemRoot%, falling back to %windir% and then the default install location. */
export function windowsSystemRoot(env: NodeJS.ProcessEnv = process.env): string {
  const root = env["SystemRoot"]?.trim() || env["windir"]?.trim();
  return root ? root : "C:\\Windows";
}
