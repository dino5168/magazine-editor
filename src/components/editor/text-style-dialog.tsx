import { useId, useState, type CSSProperties } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsDialog, SettingsDialogFooter } from "@/components/app/settings/settings-dialog";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { createId } from "@/lib/editor/element-factory";
import { textStyleNameError, textStyleUsage } from "@/lib/editor/style-sheet";
import { textDecorationLine } from "@/lib/editor/text-style";
import type { TextStyle, TextStyleDef } from "@/lib/editor/types";
import { TextStyleFields } from "./style-controls";

/** What the dialog edits: an existing style, or a new one starting from these values. */
export type TextStyleDialogTarget =
  | { readonly kind: "edit"; readonly style: TextStyleDef }
  | { readonly kind: "create"; readonly name: string; readonly initial: TextStyle };

interface TextStyleDialogProps {
  /** null = closed. */
  readonly target: TextStyleDialogTarget | null;
  readonly onClose: () => void;
}

/** Largest font size the preview draws at (px), so a 200 pt heading still fits the dialog. */
const PREVIEW_MAX_PX = 40;

function previewStyle(style: TextStyle): CSSProperties {
  const { shadow } = style;
  return {
    fontFamily: style.fontFamily,
    fontSize: Math.min(style.fontSize, PREVIEW_MAX_PX),
    fontWeight: style.fontStyle === "bold" ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textDecorationLine: textDecorationLine(style) || "none",
    // 預覽只有一行，行距看不出來；字距照字級比例
    letterSpacing: `${style.letterSpacing / 1000}em`,
    color: style.fill,
    textShadow: shadow ? `${shadow.offsetX}px ${shadow.offsetY}px 0 ${shadow.color}` : "none",
    textAlign: style.align,
  };
}

/**
 * Edit or create a text style. Drafts live in the form; 「確定」 writes once (one undo step):
 * `textStyle/update` with the new name, or `textStyle/add`.
 *
 * Args:
 *   props: The style to edit or the values of a new one; null keeps the dialog closed.
 *
 * Returns:
 *   Dialog element.
 */
export function TextStyleDialog({ target, onClose }: TextStyleDialogProps) {
  return (
    <SettingsDialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && <TextStyleForm target={target} onDone={onClose} />}
    </SettingsDialog>
  );
}

function TextStyleForm({ target, onDone }: { readonly target: TextStyleDialogTarget; readonly onDone: () => void }) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const document = state.history.present;
  const editing = target.kind === "edit" ? target.style : null;
  const [name, setName] = useState(target.kind === "edit" ? target.style.name : target.name);
  const [draft, setDraft] = useState<TextStyle>(target.kind === "edit" ? target.style : target.initial);
  const nameId = useId();
  const error = textStyleNameError(name, document.textStyles, editing?.id ?? null);
  const used = editing ? (textStyleUsage(document).get(editing.id) ?? 0) : 0;

  const apply = (): void => {
    if (error) return;
    if (editing) dispatch({ type: "textStyle/update", id: editing.id, style: draft, name });
    else dispatch({ type: "textStyle/add", style: { ...draft, id: createId(), name: name.trim() } });
    onDone();
  };

  const change = (patch: Partial<TextStyle>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "編輯文字樣式" : "新增文字樣式"}</DialogTitle>
        <DialogDescription>
          {editing
            ? used > 0
              ? `${used} 段文字使用這個樣式，按「確定」後會跟著改（各自覆寫的欄位不變）。`
              : "目前沒有文字使用這個樣式。"
            : "新增後可在屬性面板讓文字套用它，或點樣式面板的樣式套用到選取的文字。"}
        </DialogDescription>
      </DialogHeader>
      {/* 表單只包名稱：字型欄位的 −／＋ 是沒有 type 的 <button>，放在表單裡時 Enter 會「按下」它而不是送出 */}
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <Label htmlFor={nameId}>名稱</Label>
        <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} className="h-8" />
        {/* Enter 送出表單 */}
        <button type="submit" hidden />
      </form>
      <div className="flex flex-col gap-2">
        <TextStyleFields
          id={editing?.id ?? "new-style"}
          style={draft}
          onChange={change}
          align={{ value: draft.align, onChange: (align) => change({ align }) }}
          spacing={{ value: draft, onChange: change }}
        />
      </div>
      <div className="truncate rounded-md border bg-white px-3 py-2" style={previewStyle(draft)} aria-label="預覽">
        範例文字 Aa 123
      </div>
      <SettingsDialogFooter onApply={apply} applyDisabled={error !== null} note={error} />
    </>
  );
}
