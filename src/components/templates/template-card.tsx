import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { TriangleAlert } from "lucide-react";
import { AssetSrcProvider } from "@/components/editor/asset-src";
import { SheetThumbnail } from "@/components/editor/sheet-thumbnail";
import { inheritedElements } from "@/lib/editor/master-pages";
import { ptToMm } from "@/lib/editor/units";
import { resolveAssetUrl } from "@/lib/project/asset-url";
import { templatePreviewSheet, templateSummary, type TemplateSummary } from "@/lib/templates/template-content";
import type { TemplateEntry, TemplateProblem } from "@/lib/templates/types";
import { cn } from "@/lib/utils";

export const PROBLEM_LABELS: { readonly [K in TemplateProblem]: string } = {
  unsupportedVersion: "需要新版 App",
  damaged: "無法讀取",
};

/** Name shown for a template whose `template.json` cannot be read. */
export function templateName(entry: TemplateEntry): string {
  return entry.meta?.name ?? "（無法讀取的範本）";
}

/** `A4 直式` / `210 × 297 mm 橫式`. */
export function paperLabel(summary: TemplateSummary): string {
  const orientation = summary.width > summary.height ? "橫式" : "直式";
  if (summary.paper) return `${summary.paper.label} ${orientation}`;
  return `${Math.round(ptToMm(summary.width))} × ${Math.round(ptToMm(summary.height))} mm ${orientation}`;
}

/**
 * A template's first master page (or first page), with its images loaded from the template's
 * folder. Project fonts of the template are not registered, so text in them uses the fallback
 * font (known limitation; enough to recognize a template).
 *
 * Args:
 *   props.entry: A usable template.
 *   props.width: Thumbnail width in CSS px.
 *
 * Returns:
 *   Thumbnail, or a placeholder for templates that cannot be used.
 */
export function TemplateThumbnail({ entry, width, className }: { readonly entry: TemplateEntry; readonly width: number; readonly className?: string }) {
  const { root, document } = entry;
  const resolve = useMemo(() => (src: string) => resolveAssetUrl(src, root, convertFileSrc), [root]);
  const sheet = document ? templatePreviewSheet(document) : null;
  const inherited = useMemo(() => (document && sheet ? inheritedElements(document.masters, sheet) : []), [document, sheet]);
  if (!document || !sheet) {
    return (
      <div className={cn("flex aspect-[3/4] items-center justify-center bg-muted text-muted-foreground", className)} style={{ width }}>
        <TriangleAlert className="size-6 opacity-60" />
      </div>
    );
  }
  return (
    <AssetSrcProvider value={resolve}>
      <SheetThumbnail sheet={sheet} inherited={inherited} elements={sheet.elements} width={width} className={className} />
    </AssetSrcProvider>
  );
}

interface TemplateCardProps {
  readonly entry: TemplateEntry;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** Double click (e.g. 用這個範本新增專案); optional. */
  readonly onOpen?: () => void;
}

/**
 * A template in the grid: thumbnail, name and paper / master pages; problems shown instead.
 *
 * Args:
 *   props: Template, selection state and callbacks.
 *
 * Returns:
 *   Card button.
 */
export function TemplateCard({ entry, selected, onSelect, onOpen }: TemplateCardProps) {
  const summary = entry.document ? templateSummary(entry.document) : null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        "flex w-full flex-col items-center gap-1.5 rounded-lg border p-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-primary bg-muted ring-1 ring-primary",
        entry.problem && "opacity-70",
      )}
    >
      <div className="flex h-36 w-full items-center justify-center">
        <TemplateThumbnail entry={entry} width={100} className="max-h-36 rounded-sm shadow-sm ring-1 ring-border" />
      </div>
      <span className="w-full truncate text-sm font-medium">{templateName(entry)}</span>
      <span className="w-full truncate text-xs text-muted-foreground">
        {summary ? `${paperLabel(summary)}・主頁 ${summary.masterCount}` : PROBLEM_LABELS[entry.problem ?? "damaged"]}
      </span>
    </button>
  );
}
