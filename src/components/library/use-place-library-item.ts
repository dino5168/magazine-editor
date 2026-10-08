import { useCallback } from "react";
import { toast } from "sonner";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createImageElement, createTextFromFile } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import type { Point } from "@/lib/editor/types";
import { normalizeText } from "@/lib/library/library-files";
import type { LibraryItem } from "@/lib/library/types";
import { describeCommandError, isDesktop, projectApi } from "@/lib/project/project-api";

/** Full text of a text item: from Rust on the desktop (the CSP blocks fetching asset URLs), from the blob URL in the browser. */
async function readItemText(src: string): Promise<string | null> {
  if (isDesktop) {
    const read = await projectApi.readLibraryText(src);
    if (read.error) {
      toast.error(`無法讀取文字檔：${describeCommandError(read.error)}`);
      return null;
    }
    return read.data;
  }
  try {
    return await (await fetch(src)).text();
  } catch (error) {
    toast.error(`無法讀取文字檔（${error instanceof Error ? error.message : String(error)}）`);
    return null;
  }
}

/**
 * Returns a function that puts a library item on the active page: an image becomes an image
 * element, a text file a text element with its content as is (Markdown marks stay). Audio cannot
 * be placed. One `element/add` = one undo step; the new element is selected.
 *
 * Returns:
 *   `place(item, center?)` resolving to true when something was added; `center` is in page
 *   coordinates (default: the page center).
 */
export function usePlaceLibraryItem(): (item: LibraryItem, center?: Point) => Promise<boolean> {
  const page = useActivePage();
  const dispatch = useEditorDispatch();

  return useCallback(
    async (item: LibraryItem, center?: Point) => {
      const at = center ?? pageCenter(page);
      switch (item.kind) {
        case "image":
          dispatch({ type: "element/add", element: createImageElement(item.src, item, page, at) });
          return true;
        case "text": {
          const text = await readItemText(item.src);
          if (text === null) return false;
          dispatch({ type: "element/add", element: createTextFromFile(normalizeText(text), page, at) });
          return true;
        }
        case "audio":
          toast.info("音訊目前不能放到頁面");
          return false;
      }
    },
    [dispatch, page],
  );
}
