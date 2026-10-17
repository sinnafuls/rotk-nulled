import { describe, expect, it } from "vitest";
import { windowsSystemRoot, windowsSystemToolPath } from "../electron/services/windows-tools";

describe("windows system tool paths", () => {
  it("names the binaries under %SystemRoot%\\System32, never a bare name", () => {
    const env = { SystemRoot: "D:\\Win" };
    expect(windowsSystemToolPath("reg", env)).toBe("D:\\Win\\System32\\reg.exe");
    expect(windowsSystemToolPath("powershell", env))
      .toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  });

  it("falls back to %windir%, then to the default install location", () => {
    expect(windowsSystemRoot({ windir: "E:\\Windows" })).toBe("E:\\Windows");
    expect(windowsSystemRoot({ SystemRoot: "  " })).toBe("C:\\Windows");
    expect(windowsSystemRoot({})).toBe("C:\\Windows");
    expect(windowsSystemToolPath("reg", {})).toBe("C:\\Windows\\System32\\reg.exe");
  });

  it("never yields a relative path PATH could resolve", () => {
    for (const tool of ["reg", "powershell"] as const) {
      const resolved = windowsSystemToolPath(tool);
      expect(/^[A-Za-z]:\\/.test(resolved)).toBe(true);
      expect(resolved.endsWith(".exe")).toBe(true);
    }
  });
});
