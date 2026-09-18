import { useCallback } from "react";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createImageElement } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import type { Size } from "@/lib/editor/types";

/**
 * Returns a callback that adds an image to the center of the active page.
 *
 * Returns:
 *   Function accepting the model `src` (project-relative path in the desktop app) and the image's
 *   intrinsic size. The size must be known up front because `src` itself may not be loadable URL.
 */
export function useAddImage(): (src: string, size: Size) => void {
  const page = useActivePage();
  const dispatch = useEditorDispatch();

  return useCallback(
    (src: string, size: Size) => {
      dispatch({ type: "element/add", element: createImageElement(src, size, page, pageCenter(page)) });
    },
    [dispatch, page],
  );
}
