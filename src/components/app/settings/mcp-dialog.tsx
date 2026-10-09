import { useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMcpStatus, type McpStatus } from "@/lib/automation/mcp-status";
import { usePreferences, useSetPreferences } from "@/lib/preferences/preferences-context";
import { SettingsDialog, SettingsDialogFooter, type SettingsDialogProps } from "./settings-dialog";
import { SwitchRow } from "./settings-fields";

/**
 * 設定 → 偏好設定 → Claude Code 連線（MCP）：允許 Claude Code 透過 MCP 讀取與編輯目前的文件。
 * 存在這台電腦（App 偏好），預設關閉；按「確定」才生效。
 */
export function McpDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-lg">
      <McpForm onDone={() => onOpenChange(false)} />
    </SettingsDialog>
  );
}

/** One line describing the connection, for the dialog and the TopBar tooltip. */
export function describeMcpStatus(status: McpStatus): string {
  switch (status.state) {
    case "unsupported":
      return "僅在桌面版可用";
    case "off":
      return "已關閉：Claude Code 連不進來";
    case "starting":
      return "開啟中…";
    case "listening": {
      const { lastCall } = status;
      if (!lastCall) return "已開啟：等待 Claude Code 呼叫";
      const time = new Date(lastCall.at).toLocaleTimeString("zh-TW", { hour12: false });
      return `已開啟：最近一次 ${lastCall.tool}（${time}${lastCall.ok ? "" : "，失敗"}）`;
    }
    case "error":
      return `無法開啟：${status.message}`;
  }
}

function McpForm({ onDone }: { readonly onDone: () => void }) {
  const preferences = usePreferences();
  const setPreferences = useSetPreferences();
  const status = useMcpStatus();
  const [enabled, setEnabled] = useState(preferences.mcpEnabled);

  const apply = () => {
    if (enabled !== preferences.mcpEnabled) setPreferences({ ...preferences, mcpEnabled: enabled });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Claude Code 連線（MCP）</DialogTitle>
        <DialogDescription>
          開啟後，同一台電腦上的 Claude Code 可以讀取與編輯目前開啟的文件、執行選單指令。每次修改都能用 Ctrl+Z 復原；存檔、匯出仍要你在 App 裡確認。只存在這台電腦。
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <SwitchRow label="允許 Claude Code 連線" checked={enabled} onChange={setEnabled} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          目前狀態：{describeMcpStatus(status)}
        </p>
        <div className="grid gap-1 rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p>Claude Code 端的設定：專案根目錄的 .mcp.json 已登記 server「magazine-editor」，第一次使用時在 Claude Code 輸入 /mcp 核准。</p>
          <p>只接受這台電腦、目前 Windows 帳號的連線。</p>
        </div>
      </div>
      <SettingsDialogFooter onApply={apply} />
    </>
  );
}
