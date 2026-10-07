import { memo, useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import type { CanvasElement, Sheet } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { StaticElement } from "./canvas-elements";

interface SheetThumbnailProps {
  /** Size and background. */
  readonly sheet: Sheet;
  /** Content inherited from master pages, drawn under `elements`. */
  readonly inherited: readonly CanvasElement[];
  /** The sheet's own elements as drawn (variables already replaced on pages). */
  readonly elements: readonly CanvasElement[];
  /** Thumbnail width in CSS px; the height follows the page's aspect ratio. */
  readonly width: number;
  readonly className?: string;
}

/**
 * A small picture of a page or master page, drawn with the same static nodes as the canvas.
 *
 * The Konva stage is only created once the thumbnail scrolls into view (long documents), and the
 * component is memoised: it redraws only when the sheet or the content to draw changes, which the
 * immutable document makes a reference comparison.
 *
 * Args:
 *   props: Sheet, inherited content and width.
 *
 * Returns:
 *   Thumbnail box with the page drawn inside.
 */
export const SheetThumbnail = memo(function SheetThumbnail({ sheet, inherited, elements, width, className }: SheetThumbnailProps) {
  const height = Math.round((width * sheet.height) / sheet.width);
  const scale = width / sheet.width;
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // 捲進畫面才建立 Stage；建立後就保留（捲回來不必重畫）
  useEffect(() => {
    const box = boxRef.current;
    if (!box || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={boxRef}
      className={cn("overflow-hidden bg-white", className)}
      style={{ width, height, backgroundColor: sheet.background }}
    >
      {visible && (
        // 縮圖只用來看，不攔任何事件；點擊交給外層按鈕
        <Stage width={width} height={height} listening={false}>
          <Layer scaleX={scale} scaleY={scale} listening={false}>
            <Rect width={sheet.width} height={sheet.height} fill={sheet.background} />
            {inherited.map((element) => (
              <StaticElement key={`master:${element.id}`} element={element} />
            ))}
            {elements.map((element) => (
              <StaticElement key={element.id} element={element} />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
});
