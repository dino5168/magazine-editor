import { useEffect, useMemo, useState } from "react";
import {
  findFontOption,
  fontLoadRequests,
  fontOptionsFor,
  projectFontDescriptors,
  projectFontFamily,
  type FontOption,
} from "./fonts";
import type { ProjectFont } from "./types";

// 每個字型選項只載入一次；loaded 只會增加，所以復原（undo）帶回來的字型一定已經載入
const loading = new Map<string, Promise<void>>();
const loaded = new Set<string>();

/** Turns a project-relative `src` (`assets/fonts/…`) into a URL the WebView can load. */
type FontUrlResolver = (src: string) => string;
let resolveFontUrl: FontUrlResolver = (src) => src;
/** Project font faces added to `document.fonts`, by family, with the key they were made from. */
const registered = new Map<string, { readonly key: string; readonly faces: readonly FontFace[] }>();

/**
 * Sets how project font files are turned into URLs (`ProjectProvider` passes its `resolveSrc`).
 * Called when a project opens: the asset URL depends on the project folder.
 *
 * Args:
 *   resolver: Maps `FontFile.src` to a loadable URL.
 */
export function setFontUrlResolver(resolver: FontUrlResolver): void {
  resolveFontUrl = resolver;
}

/**
 * Checks that the WebView can load a project font file before it is added: Chrome's sanitizer
 * (OTS) rejects some files that Rust accepts, and the canvas would then quietly draw with the
 * fallback font. The face is loaded under a throwaway family and not added to `document.fonts`.
 *
 * Args:
 *   file: The stored file (`font_import` / `font_import_system`).
 *
 * Returns:
 *   Null when it loads, otherwise a message for the user.
 */
export async function checkFontFileLoads(file: ProjectFont["regular"]): Promise<string | null> {
  try {
    await new FontFace("magazine-font-check", `url("${resolveFontUrl(file.src)}")`).load();
    return null;
  } catch {
    return "畫面（瀏覽器引擎）無法載入這個字型檔，可能是檔案內容不符合規格";
  }
}

// 同一套字型的檔案或度量變了（例如換粗體檔）就要重新登記、重新載入
function loadKey(option: FontOption): string {
  const font = option.project;
  if (!font) return option.id;
  const file = (f: ProjectFont["regular"] | null) => (f ? `${f.src}@${f.ascent}/${f.descent}` : "-");
  return `${option.id}|${file(font.regular)}|${file(font.bold)}|${resolveFontUrl(font.regular.src)}`;
}

/**
 * Adds a project font's faces to `document.fonts`: the regular file as weight 400 and the bold
 * file (or the regular one again, so the browser never fakes bold — Typst does not either) as 700.
 * Faces made for an older version of the font are removed first.
 */
function registerProjectFont(font: ProjectFont, key: string): void {
  const family = projectFontFamily(font.id);
  const current = registered.get(family);
  if (current?.key === key) return;
  current?.faces.forEach((face) => document.fonts.delete(face));
  const face = (file: ProjectFont["regular"], weight: "400" | "700") =>
    new FontFace(family, `url("${resolveFontUrl(file.src)}")`, projectFontDescriptors(file, weight));
  const faces = [face(font.regular, "400"), face(font.bold ?? font.regular, "700")];
  faces.forEach((f) => document.fonts.add(f));
  registered.set(family, { key, faces });
}

/**
 * Loads the Regular and Bold faces of a font option (once per app session; a project font again
 * when its files change).
 *
 * `document.fonts.load` only fetches a face when asked with a character it covers, so each face is
 * requested with its sample character. A failed load still resolves: the canvas then draws with the
 * fallback font instead of never appearing.
 *
 * Args:
 *   option: The font option to load.
 *
 * Returns:
 *   A promise resolved when the faces are ready.
 */
export function loadFontOption(option: FontOption): Promise<void> {
  const key = loadKey(option);
  let promise = loading.get(key);
  if (!promise) {
    if (option.project) registerProjectFont(option.project, key);
    promise = Promise.all(fontLoadRequests(option).map(([font, text]) => document.fonts.load(font, text)))
      .catch(() => undefined)
      .then(() => {
        loaded.add(key);
      });
    loading.set(key, promise);
  }
  return promise;
}

/**
 * Loads the font of a CSS family before texts switch to it (applying a text style), so the canvas
 * never measures with a fallback font. Families outside the menu resolve at once.
 *
 * Args:
 *   family: CSS `font-family` value.
 *   fonts: The document's project fonts.
 *
 * Returns:
 *   A promise resolved when the font is ready.
 */
export function loadFontFamily(family: string, fonts: readonly ProjectFont[] = []): Promise<void> {
  const option = findFontOption(family, fonts);
  return option ? loadFontOption(option) : Promise.resolve();
}

/**
 * Whether every font the given families need is loaded (the default font is always needed).
 *
 * Konva measures text when a node's attributes change and never re-measures when a font finishes
 * loading later, so the canvas must not draw text before its font is ready: line breaks would be
 * computed with the fallback font's widths. Fonts load on demand: only those the document uses.
 *
 * Args:
 *   families: The document's font-family strings (`usedFontFamilies`).
 *   fonts: The document's project fonts.
 *
 * Returns:
 *   True when all needed fonts are loaded.
 */
export function useFontsReady(families: readonly string[], fonts: readonly ProjectFont[] = []): boolean {
  // 以內容當依賴：每次編輯都會產生新的陣列，但字型清單通常不變
  const key = JSON.stringify([families, fonts]);
  const options = useMemo(() => {
    const [parsedFamilies, parsedFonts] = JSON.parse(key) as [string[], ProjectFont[]];
    return fontOptionsFor(parsedFamilies, parsedFonts);
  }, [key]);
  const ready = options.every((option) => loaded.has(loadKey(option)));
  const [, setLoadedCount] = useState(0);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void Promise.all(options.map(loadFontOption)).then(() => {
      if (!cancelled) setLoadedCount((count) => count + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [options, ready]);

  return ready;
}
