import { useCallback } from "react";
import { toast } from "sonner";
import { useEditorDispatch } from "@/lib/editor/editor-context";
import { loadImageSize } from "@/lib/editor/image";
import type { AssetInfo, Size } from "@/lib/editor/types";
import { validateImageFile } from "@/lib/editor/validation";
import { describeCommandError, isDesktop, projectApi } from "./project-api";

/** An image ready to be placed on a page. */
export interface ImportedImage {
  /** Value for `ImageElement.src`. */
  readonly src: string;
  readonly size: Size;
}

async function storeBytes(bytes: ArrayBuffer, fallbackUrl: string): Promise<string | null> {
  // 瀏覽器模式沒有專案資料夾，直接使用 blob / 打包的網址（只存在記憶體）
  if (!isDesktop) return fallbackUrl;
  const stored = await projectApi.importAsset(new Uint8Array(bytes));
  if (stored.error) {
    toast.error(`無法把圖片存入專案：${describeCommandError(stored.error)}`);
    return null;
  }
  return stored.data;
}

/**
 * Returns functions that copy images into the project's `assets/images/`.
 *
 * Returns:
 *   `importFiles` for user files (also listed in the upload panel) and `importBundled` for images
 *   shipped with the app.
 */
export function useImageImport(): {
  readonly importFiles: (files: readonly File[]) => Promise<AssetInfo[]>;
  readonly importBundled: (url: string) => Promise<ImportedImage | null>;
} {
  const dispatch = useEditorDispatch();

  const importFiles = useCallback(
    async (files: readonly File[]) => {
      const imported: AssetInfo[] = [];
      for (const file of files) {
        const checked = validateImageFile(file);
        if (checked.error) {
          toast.error(checked.error.message);
          continue;
        }
        const blobUrl = URL.createObjectURL(checked.data);
        // MIME 由副檔名推斷，實際解碼成功才接受，避免改副檔名的非圖片檔
        const size = await loadImageSize(blobUrl);
        if (size.error) {
          URL.revokeObjectURL(blobUrl);
          toast.error(`「${file.name}」${size.error.message}`);
          continue;
        }
        const src = await storeBytes(await file.arrayBuffer(), blobUrl);
        // 桌面版改用專案內的檔案；瀏覽器模式的 blob URL 不 revoke（undo 可能讓圖片物件回來）
        if (isDesktop) URL.revokeObjectURL(blobUrl);
        if (src === null) continue;
        const asset: AssetInfo = { src, name: file.name, ...size.data };
        dispatch({ type: "asset/add", asset });
        imported.push(asset);
      }
      return imported;
    },
    [dispatch],
  );

  const importBundled = useCallback(async (url: string) => {
    const size = await loadImageSize(url);
    if (size.error) {
      toast.error(size.error.message);
      return null;
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await (await fetch(url)).arrayBuffer();
    } catch (error) {
      toast.error(`無法讀取內建圖片（${error instanceof Error ? error.message : String(error)}）`);
      return null;
    }
    const src = await storeBytes(bytes, url);
    return src === null ? null : { src, size: size.data };
  }, []);

  return { importFiles, importBundled };
}
