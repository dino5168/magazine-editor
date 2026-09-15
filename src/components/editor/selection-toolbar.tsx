import { useState } from "react";
import { ArrowDown, ArrowUp, Bold, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage, selectSelectedElement } from "@/lib/editor/editor-reducer";
import type { CanvasElement, ElementPatch, ElementType, TextElement } from "@/lib/editor/types";
import { FONT_SIZE_MAX, FONT_SIZE_MIN, clampFontSize } from "@/lib/editor/validation";
import { ColorInput } from "./color-input";
import { IconButton } from "./icon-button";

const TYPE_LABELS: { readonly [K in ElementType]: string } = {
  text: "文字",
  rect: "矩形",
  ellipse: "圓形",
  polygon: "三角形",
  star: "星形",
  image: "圖片",
};

const ALIGN_OPTIONS: readonly { readonly value: TextElement["align"]; readonly label: string; readonly icon: LucideIcon }[] = [
  { value: "left", label: "靠左對齊", icon: TextAlignStart },
  { value: "center", label: "置中對齊", icon: TextAlignCenter },
  { value: "right", label: "靠右對齊", icon: TextAlignEnd },
];

function FontSizeInput({ value, onCommit }: { readonly value: number; readonly onCommit: (size: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  const commit = (): void => {
    const next = clampFontSize(Number(draft));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      字級
      <Input
        type="number"
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="h-7 w-16 text-sm"
      />
      pt
    </label>
  );
}

function TextControls({ element, onChange }: { readonly element: TextElement; readonly onChange: (patch: ElementPatch) => void }) {
  return (
    <>
      {/* key 讓 undo 或切換物件後輸入框同步為最新字級 */}
      <FontSizeInput key={`${element.id}-${element.fontSize}`} value={element.fontSize} onCommit={(fontSize) => onChange({ fontSize })} />
      <ColorInput value={element.fill} label="文字顏色" onCommit={(fill) => onChange({ fill })} />
      <IconButton
        label="粗體"
        aria-pressed={element.fontStyle === "bold"}
        className={cn(element.fontStyle === "bold" && "bg-muted")}
        onClick={() => onChange({ fontStyle: element.fontStyle === "bold" ? "normal" : "bold" })}
      >
        <Bold />
      </IconButton>
      {ALIGN_OPTIONS.map(({ value, label, icon: Icon }) => (
        <IconButton
          key={value}
          label={label}
          aria-pressed={element.align === value}
          className={cn(element.align === value && "bg-muted")}
          onClick={() => onChange({ align: value })}
        >
          <Icon />
        </IconButton>
      ))}
    </>
  );
}

function SelectedControls({ element, index, count }: { readonly element: CanvasElement; readonly index: number; readonly count: number }) {
  const dispatch = useEditorDispatch();
  const update = (patch: ElementPatch): void => dispatch({ type: "element/update", id: element.id, patch });

  return (
    <>
      <span className="mr-1 text-xs font-medium text-muted-foreground">{TYPE_LABELS[element.type]}</span>
      <Separator orientation="vertical" className="mx-1 h-5" />
      {element.type === "text" && <TextControls element={element} onChange={update} />}
      {element.type !== "text" && element.type !== "image" && (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          填色
          <ColorInput value={element.fill} label="填色" onCommit={(fill) => update({ fill })} />
        </label>
      )}
      <div className="ml-auto flex items-center gap-1">
        <IconButton
          label="上移一層"
          disabled={index >= count - 1}
          onClick={() => dispatch({ type: "element/reorder", id: element.id, direction: "up" })}
        >
          <ArrowUp />
        </IconButton>
        <IconButton
          label="下移一層"
          disabled={index <= 0}
          onClick={() => dispatch({ type: "element/reorder", id: element.id, direction: "down" })}
        >
          <ArrowDown />
        </IconButton>
        <IconButton
          label="刪除 (Delete)"
          className="text-destructive hover:text-destructive"
          onClick={() => dispatch({ type: "element/delete", id: element.id })}
        >
          <Trash />
        </IconButton>
      </div>
    </>
  );
}

/**
 * Contextual property bar for the selected element.
 *
 * Returns:
 *   Fixed-height toolbar; shows a hint when nothing is selected.
 */
export function SelectionToolbar() {
  const state = useEditorState();
  const selected = selectSelectedElement(state);
  const elements = selectActivePage(state).elements;

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b bg-background px-3">
      {selected ? (
        <SelectedControls
          element={selected}
          index={elements.findIndex((element) => element.id === selected.id)}
          count={elements.length}
        />
      ) : (
        <span className="text-xs text-muted-foreground">
          點選畫布上的物件即可編輯屬性；拖曳移動、拉控制點縮放旋轉，雙擊文字可修改內容
        </span>
      )}
    </div>
  );
}
