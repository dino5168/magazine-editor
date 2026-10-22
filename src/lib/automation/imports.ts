/**
 * MCP 的匯入工具：把 Rust 讀好的本機檔案（`ToolContext.attachedFile`）交給素材庫的匯入流程
 * （`useLibraryImport().importFile`），和使用者在 App 裡匯入相同。
 *
 * 路徑只在 Rust 檢查與讀取（`src-tauri/src/mcp/attachment.rs`）；這裡只拿得到這次呼叫的檔案。
 * 素材庫立即寫入、不在編輯器的復原歷史裡，所以不送 reducer action，也不能放進 batch。
 */
import type { Result } from "@/lib/editor/validation";
import type { ImportOutcome } from "@/lib/library/library-selectors";
import type { Library } from "@/lib/library/types";
import { itemSummary, unknownFolderError, type LibraryItemSummary } from "./queries";
import type { ToolContext } from "./run-tool";
import type { ToolArgs } from "./tool-definitions";

/** What `import_library_item` reports: the item, and whether it was added, already there or restored. */
export type ImportStatus = "new" | "duplicate" | "restored";

const STATUS_OF: { readonly [K in ImportOutcome]: ImportStatus } = { new: "new", duplicate: "duplicate", restore: "restored" };

/**
 * Imports the call's image into the asset library (tool `import_library_item`).
 *
 * Args:
 *   library: The asset library before the import (for the folder check and the folder path).
 *   context: `attachedFile` (the file Rust read) and `importFile` (the library importer).
 *   args: Target folder and item name (the path itself was handled by Rust).
 *
 * Returns:
 *   The library item (`itemId` plus the `list_library_items` fields) and `status`, or the reason
 *   the file was not imported.
 */
export async function importLibraryItem(
  library: Library,
  { attachedFile, importFile }: Pick<ToolContext, "attachedFile" | "importFile">,
  { folderId, name }: ToolArgs<"import_library_item">,
): Promise<Result<LibraryItemSummary & { itemId: string; status: ImportStatus }>> {
  if (!importFile) return { data: null, error: new Error("這個 App 視窗不能匯入素材") };
  if (!attachedFile) return { data: null, error: new Error("App 沒有收到檔案：path 要是這台電腦上圖片檔的絕對路徑") };
  if (folderId !== undefined && !library.folders.some((folder) => folder.id === folderId)) {
    return { data: null, error: unknownFolderError(folderId) };
  }
  const file = await attachedFile();
  if (file.error) return file;
  const imported = await importFile(file.data, { folderId: folderId ?? null, accept: ["image"], name });
  if (imported.error) return imported;
  const { item, outcome } = imported.data;
  return { data: { itemId: item.id, ...itemSummary(library, item), status: STATUS_OF[outcome] }, error: null };
}
