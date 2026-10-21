import { useCallback, type ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConfirmFontLicense } from "@/lib/project/use-project-commands";
import { usePendingChoice } from "./use-pending-choice";

/**
 * Promise-based reminder before a flip book export: the folder carries whole font files, so fonts
 * that are not open-licence (system fonts, the user's own files) may not be allowed on a website.
 * It does not block the export.
 *
 * Returns:
 *   The dialog element to render and a `confirm` function that opens it with the font names and
 *   resolves true to export anyway (closing the dialog counts as cancel).
 */
export function useFontLicenseDialog(): { readonly dialog: ReactElement; readonly confirm: ConfirmFontLicense } {
  const { pending, ask, choose } = usePendingChoice<readonly string[], boolean>();
  const confirm = useCallback<ConfirmFontLicense>((fontNames) => ask(fontNames), [ask]);
  const names = pending?.payload.map((name) => `「${name}」`).join("、") ?? "";

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && choose(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>請確認字型授權</AlertDialogTitle>
          <AlertDialogDescription>
            翻頁電子書會把{names}的字型檔整個放進資料夾；放到網站上，任何人都能下載這些檔案。系統字型（例如微軟正黑體）與自行匯入的字型，授權多半不允許這樣散布，放上網站前請確認。從「下載免費字型」加入的開放授權字型沒有這個問題。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => choose(true)}>繼續匯出</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog, confirm };
}
