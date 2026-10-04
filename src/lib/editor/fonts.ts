import type { EditorDocument } from "./types";

/** One `@font-face` family of a font option, with a character it covers (used to trigger loading). */
export interface FontFace {
  /** CSS family name, same as `@font-face` in `src/index.css` and `BUNDLED_FONTS` in Rust. */
  readonly family: string;
  readonly sample: string;
}

export interface FontOption {
  readonly id: string;
  /** Name shown in the font menu. */
  readonly label: string;
  /** CSS font-family stack stored in the document's `fontFamily`. */
  readonly family: string;
  /** Families to load before the canvas measures text in this font (Regular and Bold of each). */
  readonly faces: readonly FontFace[];
}

/**
 * The fonts the user can pick: the single source for the font menu and font loading.
 *
 * Every family here must be bundled in `fonts/` and registered in `src/index.css` and the Rust
 * `BUNDLED_FONTS` (see `fonts/README.md`), so the canvas, PDF and EPUB use the same files.
 * The first option is the default for new text.
 */
export const FONT_OPTIONS = [
  {
    id: "sans",
    label: "黑體",
    family: '"Geist", "Noto Sans TC", sans-serif',
    faces: [
      { family: "Geist", sample: "A" },
      // 一份中文雜誌的換行幾乎都由中文字型決定，所以中文字型也要等
      { family: "Noto Sans TC", sample: "中" },
    ],
  },
  // 以下三套只用中文字型（內含西文字形），不另外搭配西文字型
  {
    id: "serif",
    label: "明體",
    family: '"Noto Serif TC", serif',
    faces: [{ family: "Noto Serif TC", sample: "中" }],
  },
  {
    // 霞鶩文楷沒有 Bold，粗體用 Medium（見 fonts/README.md）
    id: "kai",
    label: "楷體",
    family: '"LXGW WenKai TC", serif',
    faces: [{ family: "LXGW WenKai TC", sample: "中" }],
  },
  {
    id: "rounded",
    label: "圓體",
    family: '"GenSenRounded2 TW", sans-serif',
    faces: [{ family: "GenSenRounded2 TW", sample: "中" }],
  },
] as const satisfies readonly FontOption[];

export const DEFAULT_FONT_OPTION: FontOption = FONT_OPTIONS[0];

// font-family 字串比對時忽略引號、空白與大小寫（CSS 的字族名稱不分大小寫）
function normalizeFamily(family: string): string {
  return family
    .split(",")
    .map((name) => name.trim().replace(/^["']|["']$/g, "").trim().toLowerCase())
    .join(",");
}

/**
 * Finds the font option whose stack matches a document's `fontFamily`.
 *
 * Args:
 *   family: CSS font-family string from the document.
 *
 * Returns:
 *   The matching option, or undefined for families not in the menu (older projects, hand-edited files).
 */
export function findFontOption(family: string): FontOption | undefined {
  const normalized = normalizeFamily(family);
  return FONT_OPTIONS.find((option) => normalizeFamily(option.family) === normalized);
}

/**
 * Lists every distinct `fontFamily` used by text, shape text and page numbers in the document (all pages).
 *
 * Args:
 *   document: The editor document.
 *
 * Returns:
 *   Distinct font-family strings, sorted (stable for use as an effect dependency).
 */
export function usedFontFamilies(document: EditorDocument): string[] {
  const families = new Set<string>();
  for (const page of document.pages) {
    for (const element of page.elements) {
      if (element.type === "text") families.add(element.fontFamily);
      else if (element.type === "shape" && element.label) families.add(element.label.fontFamily);
    }
  }
  // 頁碼不是物件，但同樣畫在畫布上、也會匯出
  for (const rule of document.pageNumberRules) families.add(rule.style.fontFamily);
  return [...families].sort();
}

/**
 * Font options needed to draw the given families: the default option plus every matching option.
 *
 * Args:
 *   families: font-family strings (see `usedFontFamilies`).
 *
 * Returns:
 *   Distinct options, default first.
 */
export function fontOptionsFor(families: readonly string[]): FontOption[] {
  const options: FontOption[] = [DEFAULT_FONT_OPTION];
  for (const family of families) {
    const option = findFontOption(family);
    if (option && !options.includes(option)) options.push(option);
  }
  return options;
}

/**
 * `document.fonts.load` arguments for one option: Regular and Bold of each face.
 *
 * Args:
 *   option: The font option.
 *
 * Returns:
 *   `[font, sample]` pairs.
 */
export function fontLoadRequests(option: FontOption): [font: string, text: string][] {
  return option.faces.flatMap(({ family, sample }): [string, string][] => [
    [`16px "${family}"`, sample],
    [`bold 16px "${family}"`, sample],
  ]);
}
