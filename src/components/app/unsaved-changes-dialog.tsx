import { useCallback, useState, type ReactElement } from "react";
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
import { Button } from "@/components/ui/button";
import type { ConfirmUnsaved, UnsavedChoice } from "@/lib/project/use-project-commands";

type Resolver = (choice: UnsavedChoice) => void;

/**
 * Promise-based "save changes?" prompt.
 *
 * Returns:
 *   The dialog element to render and a `confirm` function that opens it and resolves with the
 *   user's choice (closing the dialog counts as cancel).
 */
export function useUnsavedChangesDialog(): { readonly dialog: ReactElement; readonly confirm: ConfirmUnsaved } {
  const [resolver, setResolver] = useState<Resolver | null>(null);

  const confirm = useCallback<ConfirmUnsaved>(
    // setState 收到函式時會當成 updater 執行，所以要再包一層
    () => new Promise<UnsavedChoice>((resolve) => setResolver(() => resolve)),
    [],
  );

  const choose = (choice: UnsavedChoice): void => {
    resolver?.(choice);
    setResolver(null);
  };

  const dialog = (
    <AlertDialog open={resolver !== null} onOpenChange={(open) => !open && choose("cancel")}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>要儲存目前的變更嗎？</AlertDialogTitle>
          <AlertDialogDescription>如果不儲存，這次修改的內容會遺失。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <Button variant="outline" onClick={() => choose("discard")}>
            不儲存
          </Button>
          <AlertDialogAction onClick={() => choose("save")}>儲存</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog, confirm };
}
