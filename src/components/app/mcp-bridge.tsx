import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { ImportFileFn } from "@/lib/automation/run-tool";
import { useMcpBridge } from "@/lib/automation/use-mcp-bridge";
import { useLibraryControl } from "@/lib/library/library-context";
import { useLibraryImport } from "@/lib/library/use-library-import";
import type { CommandDisabledReason } from "@/lib/menu/command-availability";
import type { CommandHandlers, CommandId } from "@/lib/menu/commands";
import { usePreferences } from "@/lib/preferences/preferences-context";

interface McpBridgeProps {
  /** Same handlers as the menu bar, so `run_command` behaves like clicking the menu. */
  readonly handlers: CommandHandlers;
  readonly isChecked: (id: CommandId) => boolean;
  readonly disabledReason: CommandDisabledReason;
}

/**
 * Runs MCP tool calls from Claude Code while the user allows it (偏好設定 → Claude Code 連線).
 * Renders nothing; kept as its own component so following the editor state does not re-render the
 * layout.
 */
export function McpBridge({ handlers, isChecked, disabledReason }: McpBridgeProps) {
  const { mcpEnabled } = usePreferences();
  const { getLibrary } = useLibraryControl();
  const { importFile } = useLibraryImport();
  // 素材庫多了東西要讓人知道（不另外確認：Claude Code 呼叫工具前已經問過使用者）
  const importForMcp = useCallback<ImportFileFn>(
    async (file, options) => {
      const result = await importFile(file, options);
      if (result.data) {
        const { item, outcome } = result.data;
        const note = outcome === "duplicate" ? "（已經在素材庫，沒有重複加入）" : outcome === "restore" ? "（從垃圾桶還原）" : "";
        toast.info(`Claude Code 匯入了素材「${item.name}」${note}`);
      }
      return result;
    },
    [importFile],
  );
  useMcpBridge(
    useMemo(() => ({ handlers, isChecked, disabledReason }), [handlers, isChecked, disabledReason]),
    mcpEnabled,
    getLibrary,
    importForMcp,
  );
  return null;
}
