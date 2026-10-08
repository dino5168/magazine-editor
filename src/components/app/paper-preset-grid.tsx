import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { orientationOf, presetIdOf, presetIdsInGroup, presetSize, type PageSizePresetId } from "@/lib/editor/page-setup";
import { formatNumber } from "@/lib/editor/properties";
import type { Size } from "@/lib/editor/types";
import { PAGE_SIZE_GROUPS, PAGE_SIZE_PRESETS, ptToMm } from "@/lib/editor/units";

/** Longest side of the paper outline drawn on a card, in px. */
const PREVIEW_MAX_PX = 52;

const ALL_IDS = PAGE_SIZE_GROUPS.flatMap((group) => presetIdsInGroup(group.id));

const NEXT_KEYS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

interface PaperPresetGridProps {
  /** Current page size; the matching card is selected and every card follows its orientation. */
  readonly size: Size;
  /** Called with the clicked preset. */
  readonly onSelect: (id: PageSizePresetId) => void;
}

/**
 * Paper presets as cards grouped like the page setup menu (ISO A, JIS B, …), each with a scaled
 * outline of the paper and its size. One radio group: arrow keys move the selection.
 *
 * Args:
 *   props: Current size and selection callback.
 *
 * Returns:
 *   Grouped card grid.
 */
export function PaperPresetGrid({ size, onSelect }: PaperPresetGridProps) {
  const selected = presetIdOf(size);
  const orientation = orientationOf(size);
  const buttons = useRef(new Map<PageSizePresetId, HTMLButtonElement>());
  // 只有一張卡片可以用 Tab 進入（radio group 的慣例）；自訂尺寸時是第一張
  const tabStop = selected ?? ALL_IDS[0];

  const handleKeyDown = (event: KeyboardEvent, id: PageSizePresetId): void => {
    const step = NEXT_KEYS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = ALL_IDS[(ALL_IDS.indexOf(id) + step + ALL_IDS.length) % ALL_IDS.length];
    onSelect(next);
    buttons.current.get(next)?.focus();
  };

  return (
    <div role="radiogroup" aria-label="紙張" className="flex flex-col gap-4">
      {PAGE_SIZE_GROUPS.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">{group.label}</h3>
          <div className="grid grid-cols-3 gap-2">
            {presetIdsInGroup(group.id).map((id) => {
              const paper = presetSize(id, orientation);
              const scale = PREVIEW_MAX_PX / Math.max(paper.width, paper.height);
              const checked = id === selected;
              return (
                <button
                  key={id}
                  ref={(node) => {
                    if (node) buttons.current.set(id, node);
                    else buttons.current.delete(id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={id === tabStop ? 0 : -1}
                  onClick={() => onSelect(id)}
                  onKeyDown={(event) => handleKeyDown(event, id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border bg-background px-2 pt-3 pb-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    checked && "border-primary bg-muted ring-1 ring-primary",
                  )}
                >
                  <span className="flex size-14 items-center justify-center">
                    <span
                      className={cn("border bg-background", checked ? "border-primary" : "border-foreground/40")}
                      style={{ width: paper.width * scale, height: paper.height * scale }}
                    />
                  </span>
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-sm">{PAGE_SIZE_PRESETS[id].label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(ptToMm(paper.width))} × {formatNumber(ptToMm(paper.height))} mm
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
