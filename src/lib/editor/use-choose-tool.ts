import { useCallback } from "react";
import { useActivePage, useEditorDispatch, useEditorState } from "./editor-context";
import { createShapeElement, createTextElement, type ShapeKind } from "./element-factory";
import { pageCenter } from "./geometry";
import type { ToolId } from "./tools";

/**
 * Returns the handler shared by the bottom toolbar buttons and the tool shortcuts.
 *
 * 步驟 2（docs/imp-tldraw-bar.md）：畫布還不會在點擊位置建立物件，所以文字 / 圖形工具沿用面板的做法，
 * 直接把物件加到頁面中央，再回到選取工具。步驟 4 改成選工具後到畫布上點擊或拖曳建立。
 *
 * Returns:
 *   `(tool, shape?) => void`.
 */
export function useChooseTool(): (tool: ToolId, shape?: ShapeKind) => void {
  const dispatch = useEditorDispatch();
  const page = useActivePage();
  const { shapeKind } = useEditorState();

  return useCallback(
    (tool: ToolId, shape?: ShapeKind) => {
      dispatch({ type: "tool/set", tool, shape });
      if (tool === "text") {
        dispatch({ type: "element/add", element: createTextElement("subheading", pageCenter(page)) });
      } else if (tool === "shape") {
        // 沒指定圖形時（按工具列上的圖形按鈕）用最近用過的圖形
        dispatch({ type: "element/add", element: createShapeElement(shape ?? shapeKind, pageCenter(page)) });
      } else {
        return;
      }
      dispatch({ type: "tool/set", tool: "select" });
    },
    [dispatch, page, shapeKind],
  );
}
