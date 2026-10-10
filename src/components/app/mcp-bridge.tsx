import { useMemo } from "react";
import { useMcpBridge } from "@/lib/automation/use-mcp-bridge";
import { useLibraryControl } from "@/lib/library/library-context";
import type { CommandHandlers, CommandId } from "@/lib/menu/commands";
import { usePreferences } from "@/lib/preferences/preferences-context";

interface McpBridgeProps {
  /** Same handlers as the menu bar, so `run_command` behaves like clicking the menu. */
  readonly handlers: CommandHandlers;
  readonly isChecked: (id: CommandId) => boolean;
}

/**
 * Runs MCP tool calls from Claude Code while the user allows it (偏好設定 → Claude Code 連線).
 * Renders nothing; kept as its own component so following the editor state does not re-render the
 * layout.
 */
export function McpBridge({ handlers, isChecked }: McpBridgeProps) {
  const { mcpEnabled } = usePreferences();
  const { getLibrary } = useLibraryControl();
  useMcpBridge(
    useMemo(() => ({ handlers, isChecked }), [handlers, isChecked]),
    mcpEnabled,
    getLibrary,
  );
  return null;
}
