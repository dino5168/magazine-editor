import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { ColorInput } from "../color-input";

const SWATCHES = [
  "#ffffff", "#f5f5f4", "#fef3c7", "#fee2e2", "#fce7f3", "#ede9fe",
  "#dbeafe", "#e0f2fe", "#dcfce7", "#d6d3d1", "#1f2937", "#000000",
] as const;

// 深色底時勾選記號改用白色才看得見
const DARK_SWATCHES: ReadonlySet<string> = new Set(["#1f2937", "#000000"]);

/**
 * Panel for setting the active page background color.
 *
 * Returns:
 *   Swatch grid and custom color picker.
 */
export function BackgroundPanel() {
  const page = useActivePage();
  const dispatch = useEditorDispatch();
  const setColor = (color: string): void => dispatch({ type: "page/setBackground", id: page.id, color });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>頁面背景</CardTitle>
        <CardDescription>套用到目前頁面「{page.name}」。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-6 gap-2">
          {SWATCHES.map((color) => {
            const active = page.background.toLowerCase() === color;
            return (
              <button
                key={color}
                type="button"
                aria-label={`背景色 ${color}`}
                aria-pressed={active}
                onClick={() => setColor(color)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border transition-shadow hover:ring-2 hover:ring-primary/40",
                  active && "ring-2 ring-primary",
                )}
                style={{ backgroundColor: color }}
              >
                {active && <Check className={cn("size-4", DARK_SWATCHES.has(color) ? "text-white" : "text-foreground")} />}
              </button>
            );
          })}
        </div>
        <label className="flex items-center justify-between gap-2 text-sm">
          自訂顏色
          <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {page.background}
            <ColorInput value={page.background} label="自訂背景色" onCommit={setColor} />
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
