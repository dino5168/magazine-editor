import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { contentArea } from "@/lib/editor/content-align";
import { useActivePage, useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { pageCenter } from "@/lib/editor/geometry";
import { linePointBounds } from "@/lib/editor/line-geometry";
import { linePaths, lineStrokeWidth } from "@/lib/editor/line-path";
import { createPresetLine, LINE_PRESETS, type LinePreset } from "@/lib/editor/line-presets";
import { pathBounds, pathData } from "@/lib/editor/shape-path";
import { dashPattern } from "@/lib/editor/stroke";

const ICON_SIZE = 40;

// 預覽：同一份 linePaths（和畫布、匯出一樣）縮進 40 px 的方格。線寬照縮放比例放大（1 pt 的線在圖示裡約 1 px），
// 箭頭跟著線寬變大才看得到（160 pt 的線直接縮小，箭頭只剩 1–2 px）
function PresetIcon({ preset }: { readonly preset: LinePreset }) {
  const base = createPresetLine(preset, { x: 0, y: 0 }, [], null);
  const extent = (() => {
    const b = linePointBounds(base.points);
    return Math.max(b.maxX - b.minX, b.maxY - b.minY);
  })();
  const size = extent * 1.25;
  const line = { ...base, stroke: { ...base.stroke, width: (size / ICON_SIZE) * preset.width } };
  const paths = linePaths(line);
  // 雙線的兩條細線各 1/3 線寬（同畫布）
  const width = lineStrokeWidth(line);
  const headWidth = line.stroke.width;
  const bounds = pathBounds([...paths.stroke, ...paths.fills, ...paths.outlines]) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const [cx, cy] = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
  const pattern = dashPattern(preset.dash, width);
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`${cx - size / 2} ${cy - size / 2} ${size} ${size}`} aria-hidden className="text-slate-600">
      <path
        d={pathData(paths.stroke)}
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeDasharray={pattern ? pattern.segments.join(" ") : undefined}
        strokeLinecap={pattern?.roundCap ? "round" : "butt"}
      />
      {paths.fills.length > 0 && <path d={pathData(paths.fills)} fill="currentColor" />}
      {paths.outlines.length > 0 && <path d={pathData(paths.outlines)} fill="none" stroke="currentColor" strokeWidth={headWidth} />}
    </svg>
  );
}

/**
 * 「繪圖」panel: common lines and arrows (click = add at the page centre; rules span the content
 * area), plus where the line and pencil tools are.
 *
 * Returns:
 *   The preset grid.
 */
export function DrawPanel() {
  const page = useActivePage();
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const document = state.history.present;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>線條與箭頭</CardTitle>
        <CardDescription>點擊加入頁面中央（分隔線橫跨內容區）。也可以用下方工具列的線條（L）與鉛筆（P）直接在畫布上畫。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-1.5">
          {LINE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              onClick={() =>
                dispatch({
                  type: "element/add",
                  element: createPresetLine(preset, pageCenter(page), document.swatches, contentArea(page, document.margins)),
                })
              }
              className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-lg border bg-background px-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PresetIcon preset={preset} />
              <span className="w-full truncate text-center">{preset.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
