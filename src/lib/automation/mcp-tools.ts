/**
 * 把 `TOOL_DEFINITIONS` 轉成 MCP `tools/list` 的格式。
 *
 * 結果存成 `src-tauri/mcp-tools.json`，由橋接程式 `magazine-mcp.exe` 內嵌（App 沒開時 Claude Code
 * 仍看得到工具）。檔案由 `__tests__/mcp-tools.test.ts` 產生與比對，不要手改。
 */
import { z } from "zod";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "./tool-definitions";

/** One entry of MCP `tools/list` (the fields this app uses). */
export interface McpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: { readonly readOnlyHint: boolean };
}

/**
 * Builds the MCP tool list.
 *
 * Returns:
 *   Tools in definition order, with JSON Schemas generated from the zod schemas (without `$schema`).
 */
export function mcpTools(): McpTool[] {
  return TOOL_NAMES.map((name) => {
    const { title, description, input, readOnly } = TOOL_DEFINITIONS[name];
    const { $schema: _dialect, ...inputSchema } = z.toJSONSchema(input, { io: "input" }) as Record<string, unknown>;
    return { name, title, description, inputSchema, annotations: { readOnlyHint: readOnly } };
  });
}

/**
 * The text of `src-tauri/mcp-tools.json`.
 *
 * Returns:
 *   Pretty-printed JSON with a trailing newline (the repo stores LF).
 */
export function mcpToolsJson(): string {
  return `${JSON.stringify(mcpTools(), null, 2)}\n`;
}
