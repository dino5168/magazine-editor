import { useCallback } from "react";
import { toast } from "sonner";
import { useActivePage, useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { createImageElement, createTextFromFile } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import { findSheet } from "@/lib/editor/master-pages";
import type { PageId, Point } from "@/lib/editor/types";
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
 *   `place(item, center?, pageId?)` resolving to true when something was added. `center` is in
 *   page coordinates (default: the page center); `pageId` (default: the active page) is selected
 *   first, like the creation tools do for the facing page of a spread.
 */
export function usePlaceLibraryItem(): (item: LibraryItem, center?: Point, pageId?: PageId) => Promise<boolean> {
  const active = useActivePage();
  const { history } = useEditorState();
  const document = history.present;
  const dispatch = useEditorDispatch();

  return useCallback(
    async (item: LibraryItem, center?: Point, pageId?: PageId) => {
      if (item.kind === "audio") {
        toast.info("音訊目前不能放到頁面");
        return false;
      }
      const page = (pageId && findSheet(document, pageId)) || active;
      const at = center ?? pageCenter(page);
      // 文字要先讀檔；讀完再切頁、建立，讀取失敗時不會只切了頁
      const text = item.kind === "text" ? await readItemText(item.src) : null;
      if (item.kind === "text" && text === null) return false;
      // 已經是目前頁時 page/select 不會改變任何東西
      dispatch({ type: "page/select", id: page.id });
      const element =
        item.kind === "image" ? createImageElement(item.src, item, page, at) : createTextFromFile(normalizeText(text ?? ""), page, at);
      dispatch({ type: "element/add", element });
      return true;
    },
    [active, dispatch, document],
  );
}
