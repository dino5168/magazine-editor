import { useCallback } from "react";
import { toast } from "sonner";
import { createId } from "@/lib/editor/element-factory";
import { loadImageSize, svgIntrinsicSize } from "@/lib/editor/image";
import type { Size } from "@/lib/editor/types";
import { validateImageFile, type Result } from "@/lib/editor/validation";
import { describeCommandError, isDesktop, projectApi } from "@/lib/project/project-api";
import { useLibraryControl, useLibraryDispatch } from "./library-context";
import { fileExtension, kindOfFile, libraryItemName, textExcerpt } from "./library-files";
import { importOutcome, type ImportOutcome } from "./library-selectors";
import { itemNameError } from "./library-validation";
import {
  AUDIO_ASSET_MAX_BYTES,
  TEXT_ASSET_MAX_BYTES,
  type ImageItem,
  type LibraryItem,
  type LibraryItemKind,
} from "./types";

/** An image ready to be placed on a page: `src` for `ImageElement.src` plus its intrinsic size. */
export type ImportedImage = Size & { readonly src: string };

/** One imported file: its library item and whether it was added, already there or restored from the trash. */
export interface ImportedItem {
  readonly item: LibraryItem;
  readonly outcome: ImportOutcome;
}

/** Options for `importFile`. */
export interface ImportFileOptions {
  /** Folder to import into; `null` = 未分類. */
  readonly folderId: string | null;
  /** Kinds accepted (default: all). */
  readonly accept?: readonly LibraryItemKind[];
  /** Item name instead of the one from the file name (an item already in the library keeps its name). */
  readonly name?: string;
}

/** A checked file, before it becomes a library item (`id`, folder and time are added later). */
type Prepared =
  | { readonly kind: "image"; readonly name: string; readonly bytes: number; readonly src: string; readonly size: Size }
  | { readonly kind: "text"; readonly name: string; readonly bytes: number; readonly src: string; readonly excerpt: string }
  | { readonly kind: "audio"; readonly name: string; readonly bytes: number; readonly src: string };

const KIND_LABELS: { readonly [K in LibraryItemKind]: string } = { image: "圖片", text: "文字檔", audio: "音訊" };
const BOM_BYTES = 3;

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = (message: string): Result<never> => ({ data: null, error: new Error(message) });

// 瀏覽器模式沒有專案資料夾：素材只存在記憶體，src 用 blob URL（不 revoke，undo 可能讓物件回來）
async function store(bytes: ArrayBuffer, kind: LibraryItemKind, extension: string, blobUrl: string): Promise<Result<string>> {
  if (!isDesktop) return ok(blobUrl);
  const stored = await projectApi.importLibraryAsset(new Uint8Array(bytes), kind, extension);
  return stored.error ? fail(`無法把檔案存入專案：${describeCommandError(stored.error)}`) : ok(stored.data);
}

/** Checks a file and stores it in the project; the error message is user-facing (toast or MCP). */
async function prepare(file: File, accept: readonly LibraryItemKind[]): Promise<Result<Prepared>> {
  const kind = kindOfFile(file.name);
  if (kind === null || !accept.includes(kind)) {
    const allowed = accept.map((k) => KIND_LABELS[k]).join("、");
    return fail(`「${file.name}」不是支援的檔案（可以匯入：${allowed}）`);
  }
  const name = libraryItemName(file.name);
  const extension = fileExtension(file.name);
  switch (kind) {
    case "image": {
      const checked = validateImageFile(file);
      if (checked.error) return fail(checked.error.message);
      const blobUrl = URL.createObjectURL(file);
      // MIME 由副檔名推斷，實際解碼成功才接受；讀取位元組和解碼互不相依，同時進行
      const [size, bytes] = await Promise.all([loadImageSize(blobUrl), file.arrayBuffer()]);
      if (size.error) {
        URL.revokeObjectURL(blobUrl);
        return fail(`「${file.name}」${size.error.message}`);
      }
      // 只有 viewBox 的 SVG：瀏覽器給的高度固定是 150，改用 viewBox 的大小
      const svgSize = extension === "svg" ? svgIntrinsicSize(await file.text()) : null;
      const src = await store(bytes, kind, extension, blobUrl);
      if (isDesktop) URL.revokeObjectURL(blobUrl);
      return src.error ? src : ok({ kind, name, bytes: file.size, src: src.data, size: svgSize ?? size.data });
    }
    case "text": {
      // 精確的檢查（UTF-8、BOM、NUL）在 Rust；這裡先擋掉明顯太大的檔案，免得整份讀進來
      if (file.size > TEXT_ASSET_MAX_BYTES + BOM_BYTES) return fail(`「${file.name}」超過 200 KB 上限`);
      const [text, bytes] = await Promise.all([file.text(), file.arrayBuffer()]);
      const blobUrl = URL.createObjectURL(file);
      const src = await store(bytes, kind, extension, blobUrl);
      if (isDesktop) URL.revokeObjectURL(blobUrl);
      return src.error ? src : ok({ kind, name, bytes: file.size, src: src.data, excerpt: textExcerpt(text) });
    }
    case "audio": {
      if (file.size > AUDIO_ASSET_MAX_BYTES) return fail(`「${file.name}」超過 50 MB 上限`);
      const blobUrl = URL.createObjectURL(file);
      const src = await store(await file.arrayBuffer(), kind, extension, blobUrl);
      if (isDesktop) URL.revokeObjectURL(blobUrl);
      return src.error ? src : ok({ kind, name, bytes: file.size, src: src.data });
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
 *   `importFiles` for user files (problems shown as toasts), `importFile` for one file with the
 *   problem returned instead (MCP), and `importBundled` for images shipped with the app (they go to
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
  /**
   * Imports one file like `importFiles`, but shows no toast: the problem (unsupported file, too
   * large, cannot be stored, unknown folder, invalid name) comes back as the error.
   */
  readonly importFile: (file: File, options: ImportFileOptions) => Promise<Result<ImportedItem>>;
  readonly importBundled: (url: string, name: string) => Promise<ImportedImage | null>;
} {
  const dispatch = useLibraryDispatch();
  const { getLibrary } = useLibraryControl();

  // 把檢查好的檔案加進素材庫（同檔不重複、在垃圾桶就還原），回傳素材庫裡的那一筆
  const add = useCallback(
    (prepared: Prepared, folderId: string | null, importedAt: string): ImportedItem | null => {
      const outcome = importOutcome(getLibrary(), prepared.src);
      dispatch({ type: "item/add", item: toItem(prepared, folderId, importedAt) });
      const item = getLibrary().items.find((candidate) => candidate.src === prepared.src);
      return item ? { item, outcome } : null;
    },
    [dispatch, getLibrary],
  );

  const importFiles = useCallback(
    async (files: readonly File[], folderId: string | null, accept: readonly LibraryItemKind[] = ALL_KINDS) => {
      // 各檔案互不相依，並行處理；結果依原本的檔案順序加入
      const results = await Promise.all(files.map((file) => prepare(file, accept)));
      const importedAt = new Date().toISOString();
      let duplicates = 0;
      let restored = 0;
      const items: LibraryItem[] = [];
      for (const result of results) {
        if (result.error) {
          toast.error(result.error.message);
          continue;
        }
        const added = add(result.data, folderId, importedAt);
        if (added?.outcome === "duplicate") duplicates += 1;
        if (added?.outcome === "restore") restored += 1;
        if (added && !items.includes(added.item)) items.push(added.item);
      }
      if (duplicates > 0) toast.info(`${duplicates} 個檔案已經在素材庫，沒有重複加入`);
      if (restored > 0) toast.info(`${restored} 個素材已從垃圾桶還原`);
      return items;
    },
    [add],
  );

  const importFile = useCallback(
    async (file: File, { folderId, accept = ALL_KINDS, name }: ImportFileOptions): Promise<Result<ImportedItem>> => {
      // 先檢查資料夾與名稱：檔案存進專案之後才不合格，素材庫只會默默不加
      if (folderId !== null && !getLibrary().folders.some((folder) => folder.id === folderId)) {
        return fail(`找不到資料夾「${folderId}」`);
      }
      const itemName = name === undefined ? undefined : name.trim();
      const nameProblem = itemName === undefined ? null : itemNameError(itemName);
      if (nameProblem) return fail(nameProblem);
      const prepared = await prepare(file, accept);
      if (prepared.error) return prepared;
      const entry = itemName === undefined ? prepared.data : { ...prepared.data, name: itemName };
      const added = add(entry, folderId, new Date().toISOString());
      // 檢查之後、寫入之前使用者刪掉了資料夾之類的情況
      return added ? ok(added) : fail(`「${file.name}」無法加入素材庫`);
    },
    [add, getLibrary],
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
      const stored = await store(bytes, "image", "", url);
      if (stored.error) {
        toast.error(stored.error.message);
        return null;
      }
      const src = stored.data;
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

  return { importFiles, importFile, importBundled };
}
