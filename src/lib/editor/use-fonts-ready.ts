import { useEffect, useMemo, useState } from "react";
import { fontLoadRequests, fontOptionsFor, type FontOption } from "./fonts";

// 每個字型選項只載入一次；loaded 只會增加，所以復原（undo）帶回來的字型一定已經載入
const loading = new Map<string, Promise<void>>();
const loaded = new Set<string>();

/**
 * Loads the Regular and Bold faces of a font option (once per app session).
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
  let promise = loading.get(option.id);
  if (!promise) {
    promise = Promise.all(fontLoadRequests(option).map(([font, text]) => document.fonts.load(font, text)))
      .catch(() => undefined)
      .then(() => {
        loaded.add(option.id);
      });
    loading.set(option.id, promise);
  }
  return promise;
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
 *
 * Returns:
 *   True when all needed fonts are loaded.
 */
export function useFontsReady(families: readonly string[]): boolean {
  // 以內容當依賴：每次編輯都會產生新的陣列，但字型清單通常不變
  const key = JSON.stringify(families);
  const options = useMemo(() => fontOptionsFor(JSON.parse(key) as string[]), [key]);
  const ready = options.every((option) => loaded.has(option.id));
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
