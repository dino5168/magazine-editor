/**
 * 屬性面板的線條控制項：「線條」分頁（顏色 / 粗細 / 線型、兩端箭頭）與「調整」分頁的長度 / 角度。
 * 每次修改 = 一個 `element/update`（一筆復原）。計畫：`docs/06-Plans-繪圖/03-自由繪圖-實作.md` 步驟 6。
 */
import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lineAngle, lineLength, withLengthAngle } from "@/lib/editor/line-geometry";
import { ARROWHEAD_LABELS, ARROWHEAD_SCALES } from "@/lib/editor/line-kinds";
import { linePaths } from "@/lib/editor/line-path";
import { pathData } from "@/lib/editor/shape-path";
import type { ElementPatch, LineArrowhead, LineElement, LineEnd } from "@/lib/editor/types";
import { LINE_ARROWHEADS } from "@/lib/editor/validation";
import { NumberField } from "./number-field";
import { LineStyleFields, STROKE_WIDTH_FIELD } from "./style-controls";

type Update = (patch: ElementPatch) => void;

const ICON_WIDTH = 36;
const ICON_HEIGHT = 12;

/**
 * Small picture of an arrowhead (same paths as the canvas), at the left for the start end and at
 * the right for the end.
 *
 * Args:
 *   props.arrowhead: Arrowhead to draw.
 *   props.atStart: True for the start end.
 *
 * Returns:
 *   Inline SVG.
 */
export function ArrowheadIcon({ arrowhead, atStart }: { readonly arrowhead: LineArrowhead; readonly atStart: boolean }) {
  const end: LineEnd = { arrowhead, scale: 1 };
  const plain: LineEnd = { arrowhead: "none", scale: 1 };
  const paths = linePaths({
    points: [
      { x: 3, y: ICON_HEIGHT / 2 },
      { x: ICON_WIDTH - 3, y: ICON_HEIGHT / 2 },
    ],
    stroke: { color: "currentColor", swatchId: null, width: 1, dash: "solid" },
    start: atStart ? end : plain,
    end: atStart ? plain : end,
  });
  return (
    // size-auto：選單項目預設把沒有 size- class 的 svg 壓成 16 px（右端的箭頭會被裁掉）
    <svg width={ICON_WIDTH} height={ICON_HEIGHT} aria-hidden className="size-auto shrink-0 text-foreground">
      <path d={pathData(paths.stroke)} fill="none" stroke="currentColor" strokeWidth={1} />
      {paths.fills.length > 0 && <path d={pathData(paths.fills)} fill="currentColor" />}
      {paths.outlines.length > 0 && <path d={pathData(paths.outlines)} fill="none" stroke="currentColor" strokeWidth={1} />}
    </svg>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-3 last:border-b-0">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

// 不在小 / 中 / 大裡的大小（MCP 給的）：選單多一個「自訂」顯示它
const CUSTOM = "custom";

function EndFields({ label, end, atStart, onChange }: { readonly label: string; readonly end: LineEnd; readonly atStart: boolean; readonly onChange: (end: LineEnd) => void }) {
  const preset = ARROWHEAD_SCALES.find((size) => size.scale === end.scale);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-8 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Select value={end.arrowhead} onValueChange={(arrowhead) => onChange({ ...end, arrowhead: arrowhead as LineArrowhead })}>
        <SelectTrigger size="sm" className="h-7 flex-1" aria-label={`${label}箭頭`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LINE_ARROWHEADS.map((arrowhead) => (
            <SelectItem key={arrowhead} value={arrowhead}>
              <ArrowheadIcon arrowhead={arrowhead} atStart={atStart} />
              {ARROWHEAD_LABELS[arrowhead]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={preset ? String(preset.scale) : CUSTOM}
        disabled={end.arrowhead === "none"}
        onValueChange={(value) => value !== CUSTOM && onChange({ ...end, scale: Number(value) })}
      >
        <SelectTrigger size="sm" className="h-7 w-16" aria-label={`${label}箭頭大小`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ARROWHEAD_SCALES.map((size) => (
            <SelectItem key={size.scale} value={String(size.scale)}>
              {size.label}
            </SelectItem>
          ))}
          {!preset && <SelectItem value={CUSTOM}>自訂 ×{end.scale}</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * 「線條」tab: the line's color (may follow a swatch), width and dash, and the arrowheads at both ends.
 *
 * Args:
 *   props.line: Selected line.
 *   props.update: Sends one `element/update`.
 *
 * Returns:
 *   The tab's sections.
 */
export function LineTab({ line, update }: { readonly line: LineElement; readonly update: Update }) {
  return (
    <>
      <Section title="線條">
        <LineStyleFields id={line.id} value={line.stroke} onChange={(stroke) => update({ stroke })} colorLabel="線條顏色" width={STROKE_WIDTH_FIELD} />
      </Section>
      <Section title="箭頭">
        <EndFields label="起點" end={line.start} atStart onChange={(start) => update({ start })} />
        <EndFields label="終點" end={line.end} atStart={false} onChange={(end) => update({ end })} />
      </Section>
    </>
  );
}

// 長度 / 角度只顯示到小數兩位；−0 顯示成 0
const round = (value: number) => Math.round(value * 100) / 100 + 0;

/**
 * 「長度與角度」 of a straight two-point line (「調整」 tab): the first point stays where it is.
 * Lines with more points have no single length / angle and do not get it.
 *
 * Args:
 *   props.line: Selected two-point line.
 *   props.update: Sends one `element/update`.
 *
 * Returns:
 *   The section.
 */
export function LineGeometrySection({ line, update }: { readonly line: LineElement; readonly update: Update }) {
  const length = round(lineLength(line.points));
  const angle = round(lineAngle(line));
  return (
    <Section title="長度與角度（起點不動）">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <NumberField
          key={`${line.id}-length-${length}`}
          label="長度"
          unit="pt"
          value={length}
          // 長度 0 會讓角度消失，至少 1 pt
          onCommit={(value) => update(withLengthAngle(line, { length: Math.max(1, value) }))}
        />
        <NumberField key={`${line.id}-angle-${angle}`} label="角度" unit="°" value={angle} onCommit={(value) => update(withLengthAngle(line, { angle: value }))} />
      </div>
      <p className="text-xs text-muted-foreground">角度：0° 向右、順時針為正（和旋轉相同）。</p>
    </Section>
  );
}
