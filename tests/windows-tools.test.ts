import { describe, expect, it } from "vitest";
import { windowsSystemRoot } from "../electron/services/windows-tools";

describe("windows system root", () => {
  it("uses %SystemRoot%, then %windir%, then the default install location", () => {
    expect(windowsSystemRoot({ SystemRoot: "D:\\Win" })).toBe("D:\\Win");
    expect(windowsSystemRoot({ windir: "E:\\Windows" })).toBe("E:\\Windows");
    expect(windowsSystemRoot({ SystemRoot: "  " })).toBe("C:\\Windows");
    expect(windowsSystemRoot({})).toBe("C:\\Windows");
  });
});
