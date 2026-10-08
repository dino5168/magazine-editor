import { ITEM_NAME_MAX_CHARS, TEXT_EXCERPT_MAX_CHARS, type LibraryItemKind } from "./types";

const KIND_OF_EXTENSION: Readonly<Record<string, LibraryItemKind>> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  txt: "text",
  md: "text",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
};

/** File types the import dialog offers (`accept` attribute). */
export const LIBRARY_ACCEPT = Object.keys(KIND_OF_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(",");

/**
 * Lower-case extension of a file name.
 *
 * Args:
 *   name: File name.
 *
 * Returns:
 *   Extension without the dot; empty when there is none.
 */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Which kind of library item a file becomes, by its extension. This only routes the file:
 * Rust checks the content (magic bytes for images and audio, UTF-8 for text).
 *
 * Args:
 *   name: File name.
 *
 * Returns:
 *   The kind, or null for an unsupported file.
 */
export function kindOfFile(name: string): LibraryItemKind | null {
  return KIND_OF_EXTENSION[fileExtension(name)] ?? null;
}

/**
 * A valid item name from a file name: one line, trimmed, at most `ITEM_NAME_MAX_CHARS` characters.
 *
 * Args:
 *   fileName: Original file name (or a label).
 *
 * Returns:
 *   Name to store; 「未命名」 when nothing is left.
 */
export function libraryItemName(fileName: string): string {
  const name = [...fileName.replace(/[\r\n]+/g, " ").trim()].slice(0, ITEM_NAME_MAX_CHARS).join("").trim();
  return name === "" ? "未命名" : name;
}

/**
 * Text as stored and placed on pages: no BOM, `\n` line breaks.
 *
 * Args:
 *   text: Text read from a file.
 *
 * Returns:
 *   Normalized text.
 */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/**
 * The card preview kept in `library.json`: the first `TEXT_EXCERPT_MAX_CHARS` characters.
 *
 * Args:
 *   text: Full text of the file.
 *
 * Returns:
 *   Excerpt (code points, like Rust's `chars()`).
 */
export function textExcerpt(text: string): string {
  return [...normalizeText(text)].slice(0, TEXT_EXCERPT_MAX_CHARS).join("");
}
