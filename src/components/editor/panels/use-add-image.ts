import { useCallback } from "react";
import { toast } from "sonner";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createImageElement } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import { loadImageSize } from "@/lib/editor/image";
import type { Size } from "@/lib/editor/types";

/**
 * Returns a callback that adds an image to the center of the active page.
 *
 * Returns:
 *   Function accepting an image URL and optional known intrinsic size.
 */
export function useAddImage(): (src: string, knownSize?: Size) => Promise<void> {
  const page = useActivePage();
  const dispatch = useEditorDispatch();

  return useCallback(
    async (src: string, knownSize?: Size) => {
      let size = knownSize;
      if (!size) {
        const result = await loadImageSize(src);
        if (result.error) {
          toast.error(result.error.message);
          return;
        }
        size = result.data;
      }
      dispatch({ type: "element/add", element: createImageElement(src, size, page, pageCenter(page)) });
    },
    [dispatch, page],
  );
}
