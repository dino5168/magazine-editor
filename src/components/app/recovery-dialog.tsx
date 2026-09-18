import { type ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { RecoveryChoice } from "@/lib/project/project-context";
import type { RecoveryEntry } from "@/lib/project/project-types";
import { usePendingChoice } from "./use-pending-choice";

/**
 * Formats a backup timestamp in local time.
 *
 * Args:
 *   savedAt: RFC 3339 timestamp.
 *
 * Returns:
 *   Localized date and time, or the raw value when it cannot be parsed.
 */
function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? savedAt : date.toLocaleString("zh-TW", { hour12: false });
}

/**
 * Startup prompt offering to restore content backed up before the app last closed abnormally.
 *
 * Returns:
 *   The dialog element to render and `confirm`, resolving with the user's choice. The dialog can
 *   only be closed by choosing, so a backup is never dropped by accident.
 */
export function useRecoveryDialog(): {
  readonly dialog: ReactElement;
  readonly confirm: (entry: RecoveryEntry) => Promise<RecoveryChoice>;
} {
  const { pending, ask, choose } = usePendingChoice<RecoveryEntry, RecoveryChoice>();
  const entry = pending?.payload;

  const dialog = (
    <AlertDialog open={entry !== undefined}>
      <AlertDialogContent size="sm" onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>要復原上次未儲存的內容嗎？</AlertDialogTitle>
          <AlertDialogDescription>
            軟體上次沒有正常關閉。「{entry?.documentName}」
            {entry?.untitled ? "（尚未存檔的新專案）" : ""}有 {entry ? formatSavedAt(entry.savedAt) : ""}{" "}
            自動備份的內容還沒有存檔。選擇「捨棄」會永久刪除這份備份。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => choose("discard")}>
            捨棄
          </Button>
          <AlertDialogAction onClick={() => choose("restore")}>復原</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog, confirm: ask };
}
