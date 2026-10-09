import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeMcpStatus } from "@/components/app/settings/mcp-dialog";
import { useMcpStatus } from "@/lib/automation/mcp-status";
import { IconButton } from "./icon-button";

// 小圓點的顏色：開啟中 / 已開啟 / 錯誤（關閉時整個按鈕不顯示）
const DOT_CLASS = {
  starting: "bg-amber-500",
  listening: "bg-emerald-500",
  error: "bg-red-500",
} as const;

/**
 * TopBar indicator shown while Claude Code may connect (偏好設定 → Claude Code 連線): a robot icon
 * with a status dot; the tooltip says what happened last. Clicking opens the settings dialog.
 *
 * Args:
 *   props.onOpenSettings: Opens the Claude Code 連線 dialog.
 *
 * Returns:
 *   The button, or nothing while MCP is off.
 */
export function McpStatusButton({ onOpenSettings }: { readonly onOpenSettings: () => void }) {
  const status = useMcpStatus();
  if (status.state === "off" || status.state === "unsupported") return null;
  return (
    <IconButton label={`Claude Code 連線：${describeMcpStatus(status)}`} className="relative" onClick={onOpenSettings}>
      <Bot />
      <span
        aria-hidden
        className={cn("absolute right-1 bottom-1 size-2 rounded-full ring-2 ring-background", DOT_CLASS[status.state])}
      />
    </IconButton>
  );
}
