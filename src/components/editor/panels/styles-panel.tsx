import { useState } from "react";
import { Copy, Pencil, Plus, Trash } from "lucide-react";
import { toast } from "sonner";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectSelectedElements } from "@/lib/editor/editor-reducer";
import { createId } from "@/lib/editor/element-factory";
import { findFontOption } from "@/lib/editor/fonts";
import {
  BUILT_IN_TEXT_STYLE_IDS,
  TEXT_STYLE_NAME_MAX_LENGTH,
  copyTextStyleName,
  defaultTextStyles,
  nextTextStyleName,
  pickTextStyle,
  styledTextOf,
  textStyleNameError,
  textStyleUsage,
} from "@/lib/editor/style-sheet";
import type { TextStyleDef } from "@/lib/editor/types";
import { loadFontFamily } from "@/lib/editor/use-fonts-ready";
import { IconButton } from "../icon-button";
import { InlineNameInput } from "../inline-name-input";
import { TextStyleDialog, type TextStyleDialogTarget } from "../text-style-dialog";

function summary(style: TextStyleDef, used: number): string {
  const font = findFontOption(style.fontFamily)?.label ?? "其他字型";
  return `${style.fontSize} pt · ${font}${style.fontStyle === "bold" ? " 粗" : ""} · ${used > 0 ? `${used} 段文字` : "未使用"}`;
}

/**
 * 「樣式」 panel: the document's text styles. Click a style to apply it to the selected texts;
 * edit (dialog), duplicate, rename (double-click) or delete it.
 *
 * Returns:
 *   Style list.
 */
export function StylesPanel() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const { textStyles } = state.history.present;
  const usage = textStyleUsage(state.history.present);
  const [dialog, setDialog] = useState<TextStyleDialogTarget | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TextStyleDef | null>(null);

  // 選取裡有文字的物件（文字、有文字的圖形）；全部連到同一個樣式時標示它
  const targets = selectSelectedElements(state).filter((element) => styledTextOf(element) !== null);
  const linked = new Set(targets.map((element) => styledTextOf(element)!.styleId));
  const current = linked.size === 1 ? [...linked][0] : null;

  const apply = (style: TextStyleDef): void => {
    if (targets.length === 0) {
      toast.info("先選取文字或有文字的圖形，再點樣式套用");
      return;
    }
    const ids = targets.map((element) => element.id);
    void loadFontFamily(style.fontFamily).then(() =>
      dispatch({ type: "element/applyTextStyle", ids, styleId: style.id }),
    );
  };

  const rename = (style: TextStyleDef, name: string): void => {
    setRenaming(null);
    const error = textStyleNameError(name, textStyles, style.id);
    if (error) toast.error(error);
    else dispatch({ type: "textStyle/rename", id: style.id, name });
  };

  const remove = (style: TextStyleDef): void => {
    if ((usage.get(style.id) ?? 0) > 0) setDeleting(style);
    else dispatch({ type: "textStyle/delete", id: style.id });
  };

  // 新樣式從選取的文字（只選一段時）或「內文」的設定開始
  const create = (): void => {
    const body = textStyles.find((style) => style.id === BUILT_IN_TEXT_STYLE_IDS.body) ?? defaultTextStyles()[2];
    const source = targets.length === 1 ? styledTextOf(targets[0])! : body;
    setDialog({ kind: "create", name: nextTextStyleName(textStyles), initial: pickTextStyle(source) });
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>文字樣式</CardTitle>
        <CardDescription>
          點樣式套用到選取的文字；改樣式時，連到它的文字都會跟著改（各自覆寫的欄位不變）。雙擊名稱可改名。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" size="sm" className="self-start" onClick={create}>
          <Plus />
          新增樣式
        </Button>
        {textStyles.length === 0 ? (
          <p className="text-sm text-muted-foreground">這份文件沒有樣式。</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {textStyles.map((style) => {
              const used = usage.get(style.id) ?? 0;
              const active = style.id === current;
              return (
                <li
                  key={style.id}
                  data-style-id={style.id}
                  className={cn("flex items-center gap-0.5 rounded-md pr-1", active ? "bg-muted" : "hover:bg-muted/60")}
                >
                  {renaming === style.id ? (
                    <div className="flex-1 px-1 py-1">
                      <InlineNameInput
                        initialValue={style.name}
                        maxLength={TEXT_STYLE_NAME_MAX_LENGTH}
                        label="樣式名稱"
                        onCommit={(name) => rename(style, name)}
                        onCancel={() => setRenaming(null)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-current={active}
                      title={targets.length > 0 ? `套用到選取的 ${targets.length} 個物件` : "選取文字後點這裡套用"}
                      onClick={() => apply(style)}
                      onDoubleClick={() => setRenaming(style.id)}
                      className="flex min-w-0 flex-1 flex-col items-start px-2 py-1.5 text-left"
                    >
                      <span
                        className="max-w-full truncate text-sm"
                        style={{
                          fontFamily: style.fontFamily,
                          fontWeight: style.fontStyle === "bold" ? 700 : 400,
                          fontStyle: style.italic ? "italic" : "normal",
                        }}
                      >
                        {style.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{summary(style, used)}</span>
                    </button>
                  )}
                  <IconButton label="編輯" size="icon-xs" onClick={() => setDialog({ kind: "edit", style })}>
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label="複製"
                    size="icon-xs"
                    onClick={() =>
                      dispatch({
                        type: "textStyle/add",
                        style: { ...style, id: createId(), name: copyTextStyleName(style.name, textStyles) },
                      })
                    }
                  >
                    <Copy />
                  </IconButton>
                  <IconButton
                    label="刪除"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove(style)}
                  >
                    <Trash />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <TextStyleDialog target={dialog} onClose={() => setDialog(null)} />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除樣式「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? usage.get(deleting.id) : 0} 段文字使用這個樣式。刪除後它們的外觀不變，只是不再連到樣式。可以復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) dispatch({ type: "textStyle/delete", id: deleting.id });
                setDeleting(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
