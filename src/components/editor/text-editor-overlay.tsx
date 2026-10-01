import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { TEXT_LINE_HEIGHT } from "@/lib/editor/geometry";
import type { Point, ShapeLabel, TextElement } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

interface TextEditorOverlayProps {
  /** Text to edit. With `frame`, `x` / `y` is the frame's top-left corner instead of the text's. */
  readonly element: TextElement;
  /**
   * Text inside a shape: the frame's height and the vertical alignment. The text is aligned inside
   * the frame while typing (and may overflow it, as on the canvas).
   */
  readonly frame?: { readonly height: number; readonly verticalAlign: ShapeLabel["verticalAlign"] };
  readonly zoom: number;
  /** Viewport pixel position of page coordinate (0, 0). */
  readonly origin: Point;
  readonly onCommit: (text: string) => void;
  readonly onCancel: () => void;
}

const JUSTIFY: { readonly [K in ShapeLabel["verticalAlign"]]: CSSProperties["justifyContent"] } = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

/**
 * In-place textarea positioned over a Konva text node for editing.
 *
 * Args:
 *   props: Element being edited, current zoom/origin and commit/cancel callbacks.
 *
 * Returns:
 *   Absolutely positioned textarea.
 */
export function TextEditorOverlay({ element, frame, zoom, origin, onCommit, onCancel }: TextEditorOverlayProps) {
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

  const placement: CSSProperties = {
    left: origin.x + element.x * zoom,
    top: origin.y + element.y * zoom,
    width: element.width * zoom,
    transform: `rotate(${element.rotation}deg)`,
    transformOrigin: "top left",
  };
  const textarea = (
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
      className={cn(
        "m-0 shrink-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-1 outline-primary outline-dashed",
        !frame && "absolute",
      )}
      style={{
        ...(frame ? { width: "100%" } : placement),
        fontSize: element.fontSize * zoom,
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: element.fontFamily,
        fontWeight: element.fontStyle === "bold" ? 700 : 400,
        textAlign: element.align,
        color: element.fill,
      }}
    />
  );
  if (!frame) return textarea;
  // 圖形內文字：外層是文字框（圖形外框內縮），用 flex 讓輸入中的文字保持垂直對齊；超出時和畫布一樣照常顯示
  return (
    <div
      className="absolute flex flex-col overflow-visible"
      style={{ ...placement, height: frame.height * zoom, justifyContent: JUSTIFY[frame.verticalAlign] }}
    >
      {textarea}
    </div>
  );
}
