/**
 * 色票對話框的草稿（純邏輯）：新增、改名、改色、排序、刪除都先改草稿，「確定」時一次交給
 * `swatch/applyEdits`。刪除時可以把用到它的地方換成另一個色票；換過去的色票之後也被刪除時，
 * 換到它的那些地方跟著改到它的替代（不會指向已刪除的色票）。
 */
import { nextSwatchName, swatchNameError, type SwatchDeletion } from "./swatches";
import type { EditorDocument, Swatch } from "./types";

export interface SwatchDraft {
  /** The list being edited, in display order (names as typed, possibly invalid). */
  readonly swatches: readonly Swatch[];
  /** Swatches of the document removed in the dialog (new ones removed again are simply dropped). */
  readonly deletions: readonly SwatchDeletion[];
}

/**
 * Starts a draft from the document's swatches.
 *
 * Args:
 *   document: Document.
 *
 * Returns:
 *   Draft with nothing changed yet.
 */
export function startSwatchDraft(document: EditorDocument): SwatchDraft {
  return { swatches: document.swatches, deletions: [] };
}

/**
 * Adds a swatch at the end with the next free name.
 *
 * Args:
 *   draft: Draft.
 *   id: New id (from the caller, so this stays pure).
 *   color: Its color (`#rrggbb`).
 *
 * Returns:
 *   The new draft.
 */
export function addDraftSwatch(draft: SwatchDraft, id: string, color: string): SwatchDraft {
  return { ...draft, swatches: [...draft.swatches, { id, name: nextSwatchName(draft.swatches), color }] };
}

/**
 * Changes the name (as typed) and / or color of one swatch in the draft.
 *
 * Args:
 *   draft: Draft.
 *   id: Swatch.
 *   change: New name and / or color.
 *
 * Returns:
 *   The new draft.
 */
export function editDraftSwatch(draft: SwatchDraft, id: string, change: Partial<Pick<Swatch, "name" | "color">>): SwatchDraft {
  return { ...draft, swatches: draft.swatches.map((swatch) => (swatch.id === id ? { ...swatch, ...change } : swatch)) };
}

/**
 * Moves a swatch to another position.
 *
 * Args:
 *   draft: Draft.
 *   from: Current index.
 *   to: Index after the move.
 *
 * Returns:
 *   The new draft (the same one when the position does not change or is out of range).
 */
export function moveDraftSwatch(draft: SwatchDraft, from: number, to: number): SwatchDraft {
  const count = draft.swatches.length;
  if (from === to || from < 0 || from >= count || to < 0 || to >= count) return draft;
  const swatches = [...draft.swatches];
  const [moved] = swatches.splice(from, 1);
  swatches.splice(to, 0, moved);
  return { ...draft, swatches };
}

/**
 * Removes a swatch from the draft. Its uses (and the uses already moved to it) go to `replaceWith`,
 * or keep their color and are unlinked when it is null.
 *
 * Args:
 *   draft: Draft.
 *   id: Swatch to remove.
 *   replaceWith: Another swatch of the draft, or null.
 *   documentIds: Ids of the document's swatches (only those need a deletion entry).
 *
 * Returns:
 *   The new draft (the same one when the swatch or the replacement is not in the draft).
 */
export function removeDraftSwatch(
  draft: SwatchDraft,
  id: string,
  replaceWith: string | null,
  documentIds: ReadonlySet<string>,
): SwatchDraft {
  const inDraft = (candidate: string) => draft.swatches.some((swatch) => swatch.id === candidate);
  if (!inDraft(id) || replaceWith === id || (replaceWith !== null && !inDraft(replaceWith))) return draft;
  const deletions = draft.deletions.map((deletion) => (deletion.replaceWith === id ? { ...deletion, replaceWith } : deletion));
  return {
    swatches: draft.swatches.filter((swatch) => swatch.id !== id),
    deletions: documentIds.has(id) ? [...deletions, { id, replaceWith }] : deletions,
  };
}

/**
 * How many color fields will link to each swatch of the draft after「確定」: its own uses plus the
 * uses of deleted swatches moved to it.
 *
 * Args:
 *   draft: Draft.
 *   usage: Uses per swatch in the document (`swatchUsage`).
 *
 * Returns:
 *   Count per swatch id of the draft (0 included).
 */
export function draftUsage(draft: SwatchDraft, usage: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  const counts = new Map(draft.swatches.map((swatch) => [swatch.id, usage.get(swatch.id) ?? 0]));
  for (const deletion of draft.deletions) {
    if (deletion.replaceWith !== null) {
      counts.set(deletion.replaceWith, (counts.get(deletion.replaceWith) ?? 0) + (usage.get(deletion.id) ?? 0));
    }
  }
  return counts;
}

/**
 * Name problems of the draft, for the messages next to the fields and the disabled「確定」.
 *
 * Args:
 *   draft: Draft.
 *
 * Returns:
 *   Message per swatch id that has one.
 */
export function draftNameErrors(draft: SwatchDraft): ReadonlyMap<string, string> {
  // 比對用去掉頭尾空白後的名稱（「確定」時存的就是它）
  const trimmed = draft.swatches.map((swatch) => ({ ...swatch, name: swatch.name.trim() }));
  const errors = new Map<string, string>();
  for (const swatch of draft.swatches) {
    const error = swatchNameError(swatch.name, trimmed, swatch.id);
    if (error) errors.set(swatch.id, error);
  }
  return errors;
}

/**
 * What「確定」sends (`swatch/applyEdits`): trimmed names, the deletions.
 *
 * Args:
 *   draft: Draft without name errors.
 *
 * Returns:
 *   Swatches and deletions.
 */
export function finishSwatchDraft(draft: SwatchDraft): SwatchDraft {
  return { swatches: draft.swatches.map((swatch) => ({ ...swatch, name: swatch.name.trim() })), deletions: draft.deletions };
}
