import { useCallback } from "react";
import { toast } from "sonner";
import { useEditorDispatch } from "@/lib/editor/editor-context";
import { loadImageSize } from "@/lib/editor/image";
import type { AssetInfo, Size } from "@/lib/editor/types";
import { validateImageFile } from "@/lib/editor/validation";
import { describeCommandError, isDesktop, projectApi } from "./project-api";

/** An image ready to be placed on a page: `src` for `ImageElement.src` plus its intrinsic size. */
export type ImportedImage = Size & { readonly src: string };

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

async function importFile(file: File): Promise<AssetInfo | null> {
  const checked = validateImageFile(file);
  if (checked.error) {
    toast.error(checked.error.message);
    return null;
  }
  const blobUrl = URL.createObjectURL(checked.data);
  // MIME 由副檔名推斷，實際解碼成功才接受，避免改副檔名的非圖片檔；讀取位元組和解碼互不相依，同時進行
  const [size, bytes] = await Promise.all([loadImageSize(blobUrl), file.arrayBuffer()]);
  if (size.error) {
    URL.revokeObjectURL(blobUrl);
    toast.error(`「${file.name}」${size.error.message}`);
    return null;
  }
  const src = await storeBytes(bytes, blobUrl);
  // 桌面版改用專案內的檔案；瀏覽器模式的 blob URL 不 revoke（undo 可能讓圖片物件回來）
  if (isDesktop) URL.revokeObjectURL(blobUrl);
  return src === null ? null : { src, name: file.name, ...size.data };
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
      // 各檔案互不相依，並行處理；結果依原本的檔案順序加入
      const results = await Promise.all(files.map(importFile));
      const imported = results.filter((asset): asset is AssetInfo => asset !== null);
      for (const asset of imported) dispatch({ type: "asset/add", asset });
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
    return src === null ? null : { src, ...size.data };
  }, []);

  return { importFiles, importBundled };
}
