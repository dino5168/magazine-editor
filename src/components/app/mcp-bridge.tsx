import { useMcpBridge } from "@/lib/automation/use-mcp-bridge";

/**
 * Runs MCP tool calls from Claude Code. Renders nothing; kept as its own component so following
 * the editor state does not re-render the layout.
 */
export function McpBridge() {
  useMcpBridge();
  return null;
}
