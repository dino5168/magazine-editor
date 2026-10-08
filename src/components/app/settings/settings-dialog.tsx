import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Props every settings dialog takes (the registry in `index.ts` checks this). */
export interface SettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface SettingsDialogFrameProps extends SettingsDialogProps {
  /** Extra classes for the dialog box, e.g. a wider max width. */
  readonly className?: string;
  /**
   * Keeps the canvas visible while the dialog is open (live preview): no dimming or blur, and the
   * box sits at the right edge instead of the middle of the window.
   */
  readonly seeThrough?: boolean;
  /** The form; it renders its own header and a `SettingsDialogFooter`. */
  readonly children: ReactNode;
}

/**
 * Frame shared by the settings dialogs (設定 → 文件 / 偏好設定). Radix unmounts the content when the
 * dialog closes, so the form's drafts start again from the current values every time it opens.
 *
 * Args:
 *   props: Open state, close callback, optional box classes, see-through mode and the form.
 *
 * Returns:
 *   Dialog element.
 */
export function SettingsDialog({ open, onOpenChange, className, seeThrough = false, children }: SettingsDialogFrameProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // 遮罩的樣式在 index.css（[data-see-through]）；位置用 ! 蓋過 DialogContent 置中的 left / translate
        data-see-through={seeThrough ? "" : undefined}
        className={cn("sm:max-w-md", seeThrough && "right-4 left-auto! translate-x-0! shadow-xl", className)}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

interface SettingsDialogFooterProps {
  /** Writes the drafts and closes the dialog. */
  readonly onApply: () => void;
  readonly applyDisabled?: boolean;
  /** Text of the apply button; defaults to「確定」. */
  readonly applyLabel?: string;
  /** Short hint shown on the left (e.g. why「確定」is disabled). */
  readonly note?: ReactNode;
  /** Extra controls on the left, e.g. buttons that reset the form. */
  readonly start?: ReactNode;
}

/**
 * 「取消」/「確定」row: cancel (and Esc) discards the drafts, nothing is written before「確定」.
 *
 * Args:
 *   props: Apply callback, whether it is disabled, optional button text, an optional note and
 *     optional controls on the left.
 *
 * Returns:
 *   Dialog footer.
 */
export function SettingsDialogFooter({
  onApply,
  applyDisabled = false,
  applyLabel = "確定",
  note,
  start,
}: SettingsDialogFooterProps) {
  return (
    <DialogFooter>
      {start && <div className="mr-auto flex flex-wrap items-center gap-2">{start}</div>}
      {note && <p className="mr-auto self-center text-xs text-muted-foreground">{note}</p>}
      <DialogClose asChild>
        <Button variant="outline">取消</Button>
      </DialogClose>
      <Button onClick={onApply} disabled={applyDisabled}>
        {applyLabel}
      </Button>
    </DialogFooter>
  );
}
