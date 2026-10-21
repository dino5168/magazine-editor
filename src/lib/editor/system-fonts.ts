/**
 * 「從系統字型加入」清單的純邏輯：把系統字型（`system_fonts_list`）依家族分組、自動配對一般與粗體、搜尋。
 *
 * 計畫：`docs/05-Plans-字型/02-字型管理問題-實作.md`。
 */
import type { SystemFont } from "@/lib/project/project-types";

/** Weight the regular file should be closest to. */
const REGULAR_WEIGHT = 400;
/** Weight the bold file should be closest to; faces lighter than `BOLD_MIN_WEIGHT` are not bold. */
const BOLD_WEIGHT = 700;
const BOLD_MIN_WEIGHT = 600;

/** One family of the list: its faces and the regular / bold pair picked for it. */
export interface SystemFontFamily {
  /** Grouping key (the CSS family, lower case). */
  readonly key: string;
  /** Display name (Traditional Chinese first). */
  readonly family: string;
  /** What CSS `font-family` uses to draw the preview. */
  readonly cssFamily: string;
  readonly hasChinese: boolean;
  /** Installed by this user (any face). */
  readonly user: boolean;
  /** Every face, lightest first. */
  readonly faces: readonly SystemFont[];
  /** Picked regular file, or null when no face can be used. */
  readonly regular: SystemFont | null;
  /** Picked bold file (weight ≥ 600), or null. */
  readonly bold: SystemFont | null;
  /** Why the family cannot be added (no usable face), or null. */
  readonly problem: string | null;
}

/** Faces that can be a project font's regular or bold file. */
function usable(face: SystemFont): boolean {
  return face.problem === null && !face.italic;
}

/** The face closest to `weight`; ties go to the lighter face, then to `preferred` among equal weights. */
function closest<T extends { readonly weight: number }>(faces: readonly T[], weight: number, preferred: (a: T, b: T) => boolean): T | null {
  let best: T | null = null;
  for (const face of faces) {
    if (best === null) {
      best = face;
      continue;
    }
    const distance = Math.abs(face.weight - weight) - Math.abs(best.weight - weight);
    if (distance < 0 || (distance === 0 && (face.weight < best.weight || (face.weight === best.weight && preferred(face, best))))) {
      best = face;
    }
  }
  return best;
}

/**
 * Picks a regular and a bold face by weight (system fonts and imported files share the rule).
 *
 * Args:
 *   faces: Candidate faces of one family (already without unusable / italic ones).
 *   preferred: Among faces of equal weight, whether `a` beats `b`; defaults to keeping the first.
 *
 * Returns:
 *   Regular = closest to 400; bold = another face of weight ≥ 600, heavier than the regular,
 *   closest to 700, or null.
 */
export function pairByWeight<T extends { readonly weight: number }>(
  faces: readonly T[],
  preferred: (a: T, b: T) => boolean = () => false,
): { readonly regular: T | null; readonly bold: T | null } {
  const regular = closest(faces, REGULAR_WEIGHT, preferred);
  const bold = closest(
    faces.filter((face) => face !== regular && face.weight >= BOLD_MIN_WEIGHT && face.weight > (regular?.weight ?? 0)),
    BOLD_WEIGHT,
    preferred,
  );
  return { regular, bold };
}

/**
 * Picks the regular and bold files of one family.
 *
 * Args:
 *   faces: The family's faces.
 *
 * Returns:
 *   `pairByWeight` over the usable upright faces; equal weights prefer the user's own copy.
 */
export function pairFaces(faces: readonly SystemFont[]): { readonly regular: SystemFont | null; readonly bold: SystemFont | null } {
  return pairByWeight(faces.filter(usable), (a, b) => a.source === "user" && b.source !== "user");
}

const collator = new Intl.Collator("zh-Hant");

/**
 * Groups the system fonts into families.
 *
 * Args:
 *   fonts: `system_fonts_list` result.
 *
 * Returns:
 *   Families sorted by display name (zh-Hant order: Chinese names before Latin ones), each with
 *   its regular / bold pair.
 */
export function groupSystemFonts(fonts: readonly SystemFont[]): SystemFontFamily[] {
  const groups = new Map<string, SystemFont[]>();
  for (const font of fonts) {
    const key = (font.cssFamily || font.family).toLowerCase();
    const group = groups.get(key);
    if (group) group.push(font);
    else groups.set(key, [font]);
  }
  return [...groups.entries()]
    .map(([key, faces]) => {
      const sorted = [...faces].sort((a, b) => a.weight - b.weight || Number(a.italic) - Number(b.italic));
      const { regular, bold } = pairFaces(sorted);
      const first = regular ?? sorted[0];
      return {
        key,
        family: first.family,
        cssFamily: first.cssFamily || first.family,
        hasChinese: sorted.some((face) => face.hasChinese),
        user: sorted.some((face) => face.source === "user"),
        faces: sorted,
        regular,
        bold,
        problem: regular ? null : (sorted.find((face) => face.problem !== null)?.problem ?? "沒有可以用的一般（非斜體）字型"),
      };
    })
    .sort((a, b) => collator.compare(a.family, b.family));
}

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/**
 * Filters families by a search text and the 「只看中文字型」 switch.
 *
 * Args:
 *   families: Grouped families.
 *   query: What the user typed (any of the family names; spaces and case do not matter).
 *   chineseOnly: Keep only families with Chinese characters.
 *
 * Returns:
 *   The matching families, in the same order.
 */
export function filterSystemFontFamilies(families: readonly SystemFontFamily[], query: string, chineseOnly: boolean): SystemFontFamily[] {
  const needle = normalize(query);
  return families.filter((family) => {
    if (chineseOnly && !family.hasChinese) return false;
    if (needle === "") return true;
    const names = [family.family, family.cssFamily, ...family.faces.flatMap((face) => face.aliases)];
    return names.some((name) => normalize(name).includes(needle));
  });
}
