import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { catalogCategories, catalogDownloadBytes, formatMegabytes, type CatalogFont } from "@/lib/editor/font-catalog";
import { checkFontFileLoads } from "@/lib/editor/use-fonts-ready";
import { describeCommandError, projectApi } from "@/lib/project/project-api";
import { FONT_CATALOG_PROGRESS_EVENT, type FontCatalogProgress, type ImportedFonts } from "@/lib/project/project-types";
import { cn } from "@/lib/utils";
import { SettingsDialog, SettingsDialogFooter } from "./settings-dialog";

interface FontCatalogPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Catalog fonts already in the font list (shown as added, cannot be added again). */
  readonly inUse: ReadonlySet<string>;
  /** Called with the stored files once they are in the project. */
  readonly onAdd: (fonts: ImportedFonts, font: CatalogFont) => void;
}

/**
 * 「下載免費字型」: the built-in list of open-licence Chinese fonts. Adding one downloads it (Rust,
 * pinned URLs, SHA-256 checked) unless it is already in the local cache, and stores it in the project.
 *
 * Args:
 *   props: Open state, close callback, fonts already added and what to do with the added files.
 *
 * Returns:
 *   Dialog element.
 */
export function FontCatalogPicker({ open, onOpenChange, inUse, onAdd }: FontCatalogPickerProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-2xl">
      <PickerBody
        inUse={inUse}
        onAdd={(fonts, font) => {
          onAdd(fonts, font);
          onOpenChange(false);
        }}
      />
    </SettingsDialog>
  );
}

function PickerBody({ inUse, onAdd }: { readonly inUse: ReadonlySet<string>; readonly onAdd: (fonts: ImportedFonts, font: CatalogFont) => void }) {
  const categories = useMemo(() => catalogCategories(), []);
  const [cached, setCached] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ readonly received: number; readonly total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const downloading = useRef(false);

  useEffect(() => {
    void projectApi.cachedCatalogFonts().then((result) => {
      if (result.data) setCached(new Set(result.data));
    });
    // 對話框關掉（取消、Esc、✕）時，下載中的也一起取消
    return () => {
      if (downloading.current) void projectApi.cancelCatalogDownload();
    };
  }, []);

  const selected = categories.flatMap((group) => group.fonts).find((font) => font.id === selectedId) ?? null;

  const add = async (font: CatalogFont): Promise<void> => {
    setError(null);
    setProgress({ received: 0, total: catalogDownloadBytes(font, cached.has(font.id)) });
    downloading.current = true;
    const unlisten = await listen<FontCatalogProgress>(FONT_CATALOG_PROGRESS_EVENT, ({ payload }) => {
      if (payload.id === font.id) setProgress({ received: payload.received, total: payload.total });
    });
    try {
      const result = await projectApi.downloadCatalogFont(font.id);
      if (result.error) {
        setError(describeCommandError(result.error));
        return;
      }
      if (result.data === null) return; // 取消
      for (const file of [result.data.regular, result.data.bold]) {
        const problem = file ? await checkFontFileLoads(file) : null;
        if (problem) {
          setError(problem);
          return;
        }
      }
      onAdd(result.data, font);
    } finally {
      downloading.current = false;
      unlisten();
      setProgress(null);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>下載免費字型</DialogTitle>
        <DialogDescription>
          精選的開放授權（SIL OFL）中文字型，可以自由嵌入與散布。下載後會存在這台電腦，其他專案再用不必重新下載；字型檔也會複製進專案資料夾。
        </DialogDescription>
      </DialogHeader>

      <ul className="flex h-80 flex-col overflow-y-auto rounded-md border p-1" role="listbox" aria-label="免費字型">
        {categories.map(({ category, fonts }) => (
          <li key={category} role="presentation">
            <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{category}</p>
            <ul role="presentation">
              {fonts.map((font) => {
                const added = inUse.has(font.id);
                return (
                  <li
                    key={font.id}
                    role="option"
                    aria-selected={font.id === selectedId}
                    aria-disabled={added}
                    className={cn(
                      "flex cursor-default items-center gap-3 rounded-sm px-2 py-1.5 text-sm",
                      font.id === selectedId ? "bg-muted" : !added && "hover:bg-muted/60",
                      added && "opacity-50",
                    )}
                    onClick={() => {
                      if (added || progress) return;
                      setSelectedId(font.id);
                      setError(null);
                    }}
                    onDoubleClick={() => {
                      if (!added && !progress) void add(font);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {font.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">{font.version}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{font.bold ? "一般 + 粗體" : "只有一般"}</span>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {added ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="size-3" />
                          已加入
                        </span>
                      ) : cached.has(font.id) ? (
                        "已下載"
                      ) : (
                        formatMegabytes(catalogDownloadBytes(font, false))
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="flex items-center gap-3 rounded-md border p-3 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">
            {selected.name}・{selected.license}・版本 {selected.version}
            {!cached.has(selected.id) && `・下載 ${formatMegabytes(catalogDownloadBytes(selected, false))}`}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void openUrl(selected.homepage)}>
            <ExternalLink />
            官方網站
          </Button>
        </div>
      )}

      {progress ? (
        <DialogFooter>
          <div className="mr-auto flex min-w-0 flex-1 items-center gap-3 self-center">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.received}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress.total ? (progress.received / progress.total) * 100 : 100}%` }} />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {progress.total && progress.received < progress.total
                ? `${formatMegabytes(progress.received)} / ${formatMegabytes(progress.total)}`
                : "檢查並加入中…"}
            </span>
          </div>
          <Button variant="outline" onClick={() => void projectApi.cancelCatalogDownload()}>
            取消下載
          </Button>
        </DialogFooter>
      ) : (
        <SettingsDialogFooter
          onApply={() => selected && void add(selected)}
          applyLabel={selected && !cached.has(selected.id) ? "下載並加入" : "加入"}
          applyDisabled={!selected}
          note={error && <span className="text-destructive">{error}</span>}
        />
      )}
    </>
  );
}
