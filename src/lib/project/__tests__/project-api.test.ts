import { describe, expect, it } from "vitest";
import { describeCommandError, toCommandError } from "../project-api";
import { CommandError } from "../project-types";

describe("toCommandError", () => {
  it("keeps the kind of errors serialized by Rust", () => {
    const error = toCommandError({ kind: "unsupportedVersion", message: "newer" });
    expect(error).toBeInstanceOf(CommandError);
    expect(error.kind).toBe("unsupportedVersion");
    expect(error.message).toBe("newer");
  });

  it("falls back to 'tauri' for unknown shapes", () => {
    expect(toCommandError({ kind: "made-up", message: "x" }).kind).toBe("tauri");
    expect(toCommandError("plain string").message).toBe("plain string");
    expect(toCommandError(new Error("boom")).message).toBe("boom");
  });
});

describe("describeCommandError", () => {
  it("shows Rust input messages as-is and localizes the rest", () => {
    expect(describeCommandError(new CommandError("invalidInput", "資料夾已存在"))).toBe("資料夾已存在");
    expect(describeCommandError(new CommandError("unsupportedVersion", "v9"))).toContain("較新版本");
    expect(describeCommandError(new CommandError("io", "denied"))).toContain("denied");
    expect(describeCommandError(new Error("generic"))).toBe("generic");
  });
});
