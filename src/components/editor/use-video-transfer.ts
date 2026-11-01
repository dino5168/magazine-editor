import { useEffect, useRef, type DragEvent } from "react";
import { videoFromTransfer } from "@/lib/media/media-insert";
import { isEditableTarget } from "@/lib/editor/use-editor-shortcuts";
import { useCanvasDrop } from "./canvas-drop";
import { useAddVideo } from "./use-add-video";

/** Drag types that may carry a link (a link or tab dragged from a browser, selected text). */
const LINK_TYPES = ["text/uri-list", "text/plain"];

function carriesLink(event: DragEvent): boolean {
  const { types } = event.dataTransfer;
  // 檔案（例如從檔案總管拖來的圖片）不是連結
  return !types.includes("Files") && LINK_TYPES.some((type) => types.includes(type));
}

/**
 * Shortcuts that turn a YouTube link into a video on the canvas (multimedia plan step 4):
 * - Ctrl+V with a YouTube link on the clipboard: at the pointer when it is over the canvas, else the
 *   center of the current page. Other pastes are left alone.
 * - Dropping a link (from a browser's address bar, a tab or a page) on the canvas: where it lands.
 *
 * Returns:
 *   `onDragOver` / `onDrop` for the canvas's scroll container (paste is listened to on `window`).
 */
export function useVideoTransfer(): { readonly onDragOver: (event: DragEvent) => void; readonly onDrop: (event: DragEvent) => void } {
  const { fetchAndAdd } = useAddVideo();
  const { locate } = useCanvasDrop();
  const pointer = useRef<{ readonly clientX: number; readonly clientY: number } | null>(null);
  // 事件處理器讀最新的 fetchAndAdd（目前頁面會變）
  const addRef = useRef(fetchAndAdd);
  addRef.current = fetchAndAdd;

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      pointer.current = { clientX: event.clientX, clientY: event.clientY };
    };
    const onPaste = (event: ClipboardEvent): void => {
      // 輸入框、對話框裡的貼上照常（例如在插入影片對話框貼網址）
      if (event.defaultPrevented || isEditableTarget(event.target) || !event.clipboardData) return;
      const video = videoFromTransfer((format) => event.clipboardData?.getData(format) ?? "");
      if (video === null) return;
      event.preventDefault();
      const at = pointer.current;
      void addRef.current(video, (at && locate(at.clientX, at.clientY)) ?? undefined);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("paste", onPaste);
    };
  }, [locate]);

  return {
    onDragOver: (event) => {
      if (!carriesLink(event)) return;
      // 拖曳中讀不到內容（瀏覽器保護），先接受；放下時不是 YouTube 連結就不做事
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDrop: (event) => {
      if (!carriesLink(event)) return;
      event.preventDefault();
      const video = videoFromTransfer((format) => event.dataTransfer.getData(format));
      if (video === null) return;
      void addRef.current(video, locate(event.clientX, event.clientY) ?? undefined);
    },
  };
}
