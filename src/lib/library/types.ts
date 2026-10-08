/**
 * The project's asset library (`library.json`). Mirrors `src-tauri/src/project/library.rs`, which is
 * the authoritative definition; both sides are tested against `tests/fixtures/sample-library.json`.
 */

/** Longest folder chain, counting the top folder; same as `LIBRARY_DEPTH_MAX` in Rust. */
export const LIBRARY_DEPTH_MAX = 8;
export const FOLDER_NAME_MAX_CHARS = 100;
export const ITEM_NAME_MAX_CHARS = 255;
/** Characters of a text asset kept in `library.json` for the card preview. */
export const TEXT_EXCERPT_MAX_CHARS = 200;
/** Largest `.txt` / `.md` file (bytes, BOM excluded); same as Rust `assets::TEXT_ASSET_MAX_BYTES`. */
export const TEXT_ASSET_MAX_BYTES = 200 * 1024;
/** Largest audio file (bytes); same as Rust `assets::AUDIO_ASSET_MAX_BYTES`. */
export const AUDIO_ASSET_MAX_BYTES = 50 * 1024 * 1024;

export interface Library {
  readonly libraryVersion: 1;
  /** Array order is the order among siblings. */
  readonly folders: readonly LibraryFolder[];
  readonly items: readonly LibraryItem[];
}

export interface LibraryFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

/** Where a trashed item came from; the folder may no longer exist. */
export interface Trashed {
  /** RFC 3339. */
  readonly at: string;
  readonly fromFolderId: string | null;
  /** Folder path shown in the trash, e.g. `封面 / 人物`. */
  readonly fromName: string | null;
}

interface LibraryItemBase {
  readonly id: string;
  /** Display name (the original file name, renamable). */
  readonly name: string;
  /** Project-relative path: `assets/images/`, `assets/texts/` or `assets/audio/` by kind. */
  readonly src: string;
  /** File size in bytes. */
  readonly bytes: number;
  /** `null` = 未分類. Always `null` while the item is in the trash. */
  readonly folderId: string | null;
  /** RFC 3339. */
  readonly importedAt: string;
  readonly trashed: Trashed | null;
}

export interface ImageItem extends LibraryItemBase {
  readonly kind: "image";
  /** Intrinsic size in pixels. */
  readonly width: number;
  readonly height: number;
}

export interface TextItem extends LibraryItemBase {
  readonly kind: "text";
  /** The first `TEXT_EXCERPT_MAX_CHARS` characters, for the card preview. */
  readonly excerpt: string;
}

/** Audio can be imported and sorted, but not placed on pages. */
export interface AudioItem extends LibraryItemBase {
  readonly kind: "audio";
}

export type LibraryItem = ImageItem | TextItem | AudioItem;

export type LibraryItemKind = LibraryItem["kind"];

/** A project without any library entries yet. */
export const EMPTY_LIBRARY: Library = { libraryVersion: 1, folders: [], items: [] };
