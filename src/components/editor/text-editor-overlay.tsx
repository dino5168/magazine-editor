import { useLayoutEffect, useRef, useState } from "react";
import { TEXT_LINE_HEIGHT } from "@/lib/editor/geometry";
import type { Point, TextElement } from "@/lib/editor/types";

interface TextEditorOverlayProps {
  readonly element: TextElement;
  readonly zoom: number;
  /** Viewport pixel position of page coordinate (0, 0). */
  readonly origin: Point;
  readonly onCommit: (text: string) => void;
  readonly onCancel: () => void;
}

/**
 * In-place textarea positioned over a Konva text node for editing.
 *
 * Args:
 *   props: Element being edited, current zoom/origin and commit/cancel callbacks.
 *
 * Returns:
 *   Absolutely positioned textarea.
 */
export function TextEditorOverlay({ element, zoom, origin, onCommit, onCancel }: TextEditorOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const finishedRef = useRef(false);
  const [value, setValue] = useState(element.text);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, zoom]);

  // Esc 取消後 blur 仍會觸發，用 flag 確保只結束一次
  const finish = (commit: boolean): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <textarea
      ref={ref}
      value={value}
      // textarea 預設 rows=2，自動高度（scrollHeight）不會小於兩行；單行文字的編輯框會多出一行
      rows={1}
      spellCheck={false}
      aria-label="編輯文字"
      onChange={(event) => setValue(event.target.value)}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
      }}
      onKeyDown={(event) => {
        // 注音/倉頡選字期間的 Enter、Esc 屬於輸入法，不可結束編輯
        if (composingRef.current || event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          finish(true);
        }
      }}
      onBlur={() => finish(true)}
      className="absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-1 outline-primary outline-dashed"
      style={{
        left: origin.x + element.x * zoom,
        top: origin.y + element.y * zoom,
        width: element.width * zoom,
        fontSize: element.fontSize * zoom,
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: element.fontFamily,
        fontWeight: element.fontStyle === "bold" ? 700 : 400,
        textAlign: element.align,
        color: element.fill,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "top left",
      }}
    />
  );
}
