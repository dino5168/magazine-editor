import { describe, expect, it } from "vitest";
import { mcpTools, mcpToolsJson } from "../mcp-tools";

describe("mcp-tools.json", () => {
  it("matches the tool definitions", async () => {
    // 橋接程式 magazine-mcp.exe 內嵌這份檔案。改了工具定義後更新：npx vitest run mcp-tools -u
    await expect(mcpToolsJson()).toMatchFileSnapshot("../../../../src-tauri/mcp-tools.json");
  });

  it("describes every tool with an object schema", () => {
    for (const tool of mcpTools()) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.inputSchema).not.toHaveProperty("$schema");
    }
  });
});
