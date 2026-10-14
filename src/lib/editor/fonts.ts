import type { EditorDocument, FontFile, ProjectFont } from "./types";

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
  /** Set for a project font: its faces must be registered (`FontFace` API) before they load. */
  readonly project?: ProjectFont;
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

/** Built-in Chinese font drawn for characters a project font lacks, by its generic family. */
const PROJECT_FONT_FALLBACK = {
  "sans-serif": "Noto Sans TC",
  serif: "Noto Serif TC",
} as const satisfies Record<ProjectFont["generic"], string>;

/**
 * The CSS / Typst family of a project font; same as Rust `project_font_family`.
 *
 * Args:
 *   id: `ProjectFont.id`.
 *
 * Returns:
 *   `project-font-<id>`.
 */
export function projectFontFamily(id: string): string {
  return `project-font-${id}`;
}

/**
 * The font menu option of a project font: the font, then the built-in Chinese font of the same kind
 * (most imported fonts are Latin-only), then the generic family.
 *
 * Args:
 *   font: The project font.
 *
 * Returns:
 *   An option whose `family` is what texts using the font store.
 */
export function projectFontOption(font: ProjectFont): FontOption {
  const family = projectFontFamily(font.id);
  const fallback = PROJECT_FONT_FALLBACK[font.generic];
  return {
    id: `project:${font.id}`,
    label: font.name,
    family: `"${family}", "${fallback}", ${font.generic}`,
    // 沒有 unicode-range 的 FontFace 用任何字都會載入，樣本字只是讓 load() 有字可問
    faces: [
      { family, sample: "A" },
      { family: fallback, sample: "中" },
    ],
    project: font,
  };
}

// font-family 的第一個名稱（去引號、小寫）
function firstFamily(family: string): string {
  return normalizeFamily(family).split(",")[0];
}

/**
 * Whether a CSS `fontFamily` uses a project font: its first family is `project-font-<id>`
 * (case-insensitive; the fallback after it does not matter).
 *
 * Args:
 *   family: CSS font-family string from the document.
 *   id: `ProjectFont.id`.
 *
 * Returns:
 *   True when the text draws with that project font.
 */
export function usesProjectFont(family: string, id: string): boolean {
  return firstFamily(family) === projectFontFamily(id).toLowerCase();
}

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
 * A project font matches on its first family only (`project-font-<id>`), so changing its generic
 * family later does not orphan the texts that already use it.
 *
 * Args:
 *   family: CSS font-family string from the document.
 *   fonts: The document's project fonts.
 *
 * Returns:
 *   The matching option, or undefined for families not in the menu (older projects, hand-edited
 *   files, a deleted project font).
 */
export function findFontOption(family: string, fonts: readonly ProjectFont[] = []): FontOption | undefined {
  const normalized = normalizeFamily(family);
  const builtIn = FONT_OPTIONS.find((option) => normalizeFamily(option.family) === normalized);
  if (builtIn) return builtIn;
  const font = fonts.find((candidate) => usesProjectFont(family, candidate.id));
  return font ? projectFontOption(font) : undefined;
}

/**
 * Lists every distinct `fontFamily` used by text, shape text and page numbers in the document (all
 * pages and master pages).
 *
 * Args:
 *   document: The editor document.
 *
 * Returns:
 *   Distinct font-family strings, sorted (stable for use as an effect dependency).
 */
export function usedFontFamilies(document: EditorDocument): string[] {
  const families = new Set<string>();
  for (const sheet of [...document.pages, ...document.masters]) {
    for (const element of sheet.elements) {
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
 *   fonts: The document's project fonts.
 *
 * Returns:
 *   Distinct options (by id), default first.
 */
export function fontOptionsFor(families: readonly string[], fonts: readonly ProjectFont[] = []): FontOption[] {
  const options: FontOption[] = [DEFAULT_FONT_OPTION];
  for (const family of families) {
    const option = findFontOption(family, fonts);
    if (option && !options.some((existing) => existing.id === option.id)) options.push(option);
  }
  return options;
}

/**
 * `FontFace` descriptors of one project font file: the weight it stands for, and the metrics the
 * canvas uses written as overrides, so every engine that supports them (Chromium, Firefox) puts the
 * baseline where the canvas does (plan step 1).
 *
 * Args:
 *   file: The font file.
 *   weight: `"400"` for the regular face, `"700"` for the face drawn as bold.
 *
 * Returns:
 *   Descriptors for `new FontFace(family, source, descriptors)`.
 */
export function projectFontDescriptors(file: FontFile, weight: "400" | "700"): FontFaceDescriptors {
  const percent = (em: number) => `${Math.round(em * 1_000_000) / 10_000}%`;
  return { weight, ascentOverride: percent(file.ascent), descentOverride: percent(file.descent), lineGapOverride: "0%" };
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
