import { useCallback } from "react";
import { toast } from "sonner";
import { createId } from "@/lib/editor/element-factory";
import { loadImageSize } from "@/lib/editor/image";
import type { Size } from "@/lib/editor/types";
import { validateImageFile } from "@/lib/editor/validation";
import { describeCommandError, isDesktop, projectApi } from "@/lib/project/project-api";
import { useLibraryControl, useLibraryDispatch } from "./library-context";
import { fileExtension, kindOfFile, libraryItemName, textExcerpt } from "./library-files";
import { importOutcome } from "./library-selectors";
import {
  AUDIO_ASSET_MAX_BYTES,
  TEXT_ASSET_MAX_BYTES,
  type ImageItem,
  type LibraryItem,
  type LibraryItemKind,
} from "./types";

/** An image ready to be placed on a page: `src` for `ImageElement.src` plus its intrinsic size. */
export type ImportedImage = Size & { readonly src: string };

/** A checked file, before it becomes a library item (`id`, folder and time are added later). */
type Prepared =
  | { readonly kind: "image"; readonly name: string; readonly bytes: number; readonly src: string; readonly size: Size }
  | { readonly kind: "text"; readonly name: string; readonly bytes: number; readonly src: string; readonly excerpt: string }
  | { readonly kind: "audio"; readonly name: string; readonly bytes: number; readonly src: string };

const KIND_LABELS: { readonly [K in LibraryItemKind]: string } = { image: "圖片", text: "文字檔", audio: "音訊" };
const BOM_BYTES = 3;

// 瀏覽器模式沒有專案資料夾：素材只存在記憶體，src 用 blob URL（不 revoke，undo 可能讓物件回來）
async function store(bytes: ArrayBuffer, kind: LibraryItemKind, extension: string, blobUrl: string): Promise<string | null> {
  if (!isDesktop) return blobUrl;
  const stored = await projectApi.importLibraryAsset(new Uint8Array(bytes), kind, extension);
  if (stored.error) {
    toast.error(`無法把檔案存入專案：${describeCommandError(stored.error)}`);
    return null;
  }
  return stored.data;
}

async function prepare(file: File, accept: readonly LibraryItemKind[]): Promise<Prepared | null> {
  const kind = kindOfFile(file.name);
  if (kind === null || !accept.includes(kind)) {
    const allowed = accept.map((k) => KIND_LABELS[k]).join("、");
    toast.error(`「${file.name}」不是支援的檔案（可以匯入：${allowed}）`);
    return null;
  }
  const name = libraryItemName(file.name);
  const extension = fileExtension(file.name);
  switch (kind) {
    case "image": {
      const checked = validateImageFile(file);
      if (checked.error) {
        toast.error(checked.error.message);
        return null;
      }
      const blobUrl = URL.createObjectURL(file);
      // MIME 由副檔名推斷，實際解碼成功才接受；讀取位元組和解碼互不相依，同時進行
      const [size, bytes] = await Promise.all([loadImageSize(blobUrl), file.arrayBuffer()]);
      if (size.error) {
        URL.revokeObjectURL(blobUrl);
        toast.error(`「${file.name}」${size.error.message}`);
        return null;
      }
      const src = await store(bytes, kind, extension, blobUrl);
      if (isDesktop) URL.revokeObjectURL(blobUrl);
      return src === null ? null : { kind, name, bytes: file.size, src, size: size.data };
    }
    case "text": {
      // 精確的檢查（UTF-8、BOM、NUL）在 Rust；這裡先擋掉明顯太大的檔案，免得整份讀進來
      if (file.size > TEXT_ASSET_MAX_BYTES + BOM_BYTES) {
        toast.error(`「${file.name}」超過 200 KB 上限`);
        return null;
      }
      const [text, bytes] = await Promise.all([file.text(), file.arrayBuffer()]);
      const blobUrl = URL.createObjectURL(file);
      const src = await store(bytes, kind, extension, blobUrl);
      if (isDesktop) URL.revokeObjectURL(blobUrl);
      return src === null ? null : { kind, name, bytes: file.size, src, excerpt: textExcerpt(text) };
    }
    case "audio": {
      if (file.size > AUDIO_ASSET_MAX_BYTES) {
        toast.error(`「${file.name}」超過 50 MB 上限`);
        return null;
      }
      const blobUrl = URL.createObjectURL(file);
      const src = await store(await file.arrayBuffer(), kind, extension, blobUrl);
      if (isDesktop) URL.revokeObjectURL(blobUrl);
      return src === null ? null : { kind, name, bytes: file.size, src };
    }
  }
}

function toItem(prepared: Prepared, folderId: string | null, importedAt: string): LibraryItem {
  const base = { id: createId(), name: prepared.name, src: prepared.src, bytes: prepared.bytes, folderId, importedAt, trashed: null };
  switch (prepared.kind) {
    case "image":
      return { ...base, kind: "image", width: prepared.size.width, height: prepared.size.height };
    case "text":
      return { ...base, kind: "text", excerpt: prepared.excerpt };
    case "audio":
      return { ...base, kind: "audio" };
  }
}

const ALL_KINDS: readonly LibraryItemKind[] = ["image", "text", "audio"];

/**
 * Returns functions that copy files into the project and add them to the asset library.
 *
 * Returns:
 *   `importFiles` for user files and `importBundled` for images shipped with the app (they go to
 *   未分類 too).
 */
export function useLibraryImport(): {
  /**
   * Imports files into a folder (`null` = 未分類). A file whose content is already in the library
   * is not added again (one restored from the trash moves into the folder).
   *
   * Resolves to the library items for the accepted files, in file order.
   */
  readonly importFiles: (
    files: readonly File[],
    folderId: string | null,
    accept?: readonly LibraryItemKind[],
  ) => Promise<LibraryItem[]>;
  readonly importBundled: (url: string, name: string) => Promise<ImportedImage | null>;
} {
  const dispatch = useLibraryDispatch();
  const { getLibrary } = useLibraryControl();

  const importFiles = useCallback(
    async (files: readonly File[], folderId: string | null, accept: readonly LibraryItemKind[] = ALL_KINDS) => {
      // 各檔案互不相依，並行處理；結果依原本的檔案順序加入
      const prepared = (await Promise.all(files.map((file) => prepare(file, accept)))).filter(
        (entry): entry is Prepared => entry !== null,
      );
      const importedAt = new Date().toISOString();
      let duplicates = 0;
      let restored = 0;
      const items: LibraryItem[] = [];
      for (const entry of prepared) {
        const outcome = importOutcome(getLibrary(), entry.src);
        if (outcome === "duplicate") duplicates += 1;
        if (outcome === "restore") restored += 1;
        dispatch({ type: "item/add", item: toItem(entry, folderId, importedAt) });
        const item = getLibrary().items.find((candidate) => candidate.src === entry.src);
        if (item && !items.includes(item)) items.push(item);
      }
      if (duplicates > 0) toast.info(`${duplicates} 個檔案已經在素材庫，沒有重複加入`);
      if (restored > 0) toast.info(`${restored} 個素材已從垃圾桶還原`);
      return items;
    },
    [dispatch, getLibrary],
  );

  const importBundled = useCallback(
    async (url: string, name: string) => {
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
      const src = await store(bytes, "image", "", url);
      if (src === null) return null;
      // 內建相片放到頁面時也加入素材庫的未分類（已經在素材庫就不動）
      const item: ImageItem = {
        id: createId(),
        kind: "image",
        name: libraryItemName(name),
        src,
        bytes: bytes.byteLength,
        folderId: null,
        importedAt: new Date().toISOString(),
        trashed: null,
        ...size.data,
      };
      if (importOutcome(getLibrary(), src) === "new") dispatch({ type: "item/add", item });
      return { src, ...size.data };
    },
    [dispatch, getLibrary],
  );

  return { importFiles, importBundled };
}
