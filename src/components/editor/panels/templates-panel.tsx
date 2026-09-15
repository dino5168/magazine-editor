import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useActivePage } from "@/lib/editor/editor-context";
import { PAGE_SIZE_PRESETS, findPageSizePreset, mmToPt, type PageSizePreset } from "@/lib/editor/units";

interface TemplateItem {
  readonly id: string;
  readonly name: string;
  readonly size: PageSizePreset;
  /** Tailwind gradient classes for the placeholder thumbnail. */
  readonly thumbnail: string;
}

// 佔位範本：資料結構待 Typst 模板格式確定後再設計
const TEMPLATES: readonly TemplateItem[] = [
  { id: "cover-bold", name: "雜誌封面・粗體標題", size: PAGE_SIZE_PRESETS.a4, thumbnail: "from-rose-400 to-orange-300" },
  { id: "cover-photo", name: "雜誌封面・滿版照片", size: PAGE_SIZE_PRESETS.a4, thumbnail: "from-sky-500 to-indigo-500" },
  { id: "toc", name: "目錄頁", size: PAGE_SIZE_PRESETS.a4, thumbnail: "from-slate-200 to-slate-400" },
  { id: "article-2col", name: "內文・雙欄", size: PAGE_SIZE_PRESETS.a4, thumbnail: "from-emerald-300 to-teal-500" },
  { id: "interview", name: "人物專訪", size: PAGE_SIZE_PRESETS.b5, thumbnail: "from-amber-200 to-yellow-400" },
  { id: "photo-essay", name: "攝影專題", size: PAGE_SIZE_PRESETS.b5, thumbnail: "from-fuchsia-400 to-purple-500" },
  { id: "ad-full", name: "全版廣告", size: PAGE_SIZE_PRESETS.letter, thumbnail: "from-lime-300 to-green-500" },
  { id: "back-cover", name: "封底", size: PAGE_SIZE_PRESETS.a4, thumbnail: "from-zinc-600 to-zinc-900" },
];

/**
 * Placeholder template gallery with search and same-size filter.
 *
 * Returns:
 *   Search box, size switch and template cards.
 */
export function TemplatesPanel() {
  const page = useActivePage();
  const [query, setQuery] = useState("");
  const [sameSizeOnly, setSameSizeOnly] = useState(false);
  const pagePreset = findPageSizePreset(page);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return TEMPLATES.filter((template) => {
      if (keyword && !template.name.toLowerCase().includes(keyword)) return false;
      if (!sameSizeOnly) return true;
      return (
        Math.abs(mmToPt(template.size.widthMm) - page.width) < 1 &&
        Math.abs(mmToPt(template.size.heightMm) - page.height) < 1
      );
    });
  }, [query, sameSizeOnly, page.width, page.height]);

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋範本..."
          aria-label="搜尋範本"
          className="h-9 pl-8"
        />
      </div>
      <label className="flex items-center justify-between gap-2 text-sm">
        只顯示相同尺寸範本{pagePreset ? `（${pagePreset.label}）` : ""}
        <Switch checked={sameSizeOnly} onCheckedChange={setSameSizeOnly} />
      </label>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">找不到符合的範本</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visible.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => toast.info("範本套用將於後續版本提供")}
              className="rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Card size="sm" className="gap-0 py-0 transition-shadow hover:ring-2 hover:ring-primary/40">
                <div
                  className={cn("flex flex-col justify-end gap-1 bg-linear-to-br p-2", template.thumbnail)}
                  style={{ aspectRatio: `${template.size.widthMm} / ${template.size.heightMm}` }}
                >
                  <div className="h-2 w-3/4 rounded-sm bg-white/80" />
                  <div className="h-1.5 w-1/2 rounded-sm bg-white/60" />
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium">{template.name}</p>
                  <p className="text-[10px] text-muted-foreground">{template.size.label}</p>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
