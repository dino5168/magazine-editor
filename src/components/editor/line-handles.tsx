/**
 * 單選一條線時的端點把手：拖一個點改線的形狀。
 *
 * 拖曳中只在這個元件裡畫預覽（原本的線暫時隱藏），不 dispatch、整個畫布不重畫；放開時一次
 * `element/update`（一筆復原）。Shift = 這一段鎖在 45° 的倍數（優先於吸附）；開吸附時點對齊格線。
 * 點一下把手 = 選中那一點（實心），這時 Delete / Backspace 只刪那一點（至少留兩點）、Esc 取消選中。
 * 計畫：`docs/06-Plans-繪圖/03-自由繪圖-實作.md` 步驟 4。
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group } from "react-konva";
import { constrainAngle, linePagePoints, removeLinePoint, withLinePoints } from "@/lib/editor/line-geometry";
import type { ElementPatch, LineElement, LinePoint } from "@/lib/editor/types";
import { LineBody } from "./canvas-elements";

/** Lines with more points than this (pencil strokes) only get handles at their two ends. */
export const LINE_HANDLES_MAX_POINTS = 30;
const HANDLE_RADIUS_PX = 5;
const HANDLE_HIT_PX = 10;
const HANDLE_COLOR = "#6366f1";

interface LineHandlesProps {
  readonly line: LineElement;
  /** x offset of the line's page in layer coordinates (spread view). */
  readonly offsetX: number;
  readonly zoom: number;
  /** Grid spacing points snap to; null = no snapping. */
  readonly snapSpacing: number | null;
  readonly onCommit: (patch: ElementPatch) => void;
}

// 拖哪一點時，Shift 以哪一點為基準：端點看相鄰的點，中間的點看前一點
function anchorIndex(index: number): number {
  return index === 0 ? 1 : index - 1;
}

/**
 * Handles at the points of the selected line, drawn above everything on the canvas layer.
 *
 * Args:
 *   props: The line, its page offset, zoom, grid snapping and where to send the change.
 *
 * Returns:
 *   Konva group with the handles (and the line's preview while one is dragged).
 */
export function LineHandles({ line, offsetX, zoom, snapSpacing, onCommit }: LineHandlesProps) {
  const pagePoints = linePagePoints(line);
  // 拖曳中的點（頁面座標）；null = 沒在拖
  const [dragged, setDragged] = useState<LinePoint[] | null>(null);
  const shown = dragged ?? pagePoints;
  // 選中的點（點一下把手）；換線或點數改變時清掉
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [line.id, line.points.length]);

  // 選中一點時，Delete / Backspace 只刪那一點：capture + stopImmediatePropagation，編輯器不會刪掉整條線
  useEffect(() => {
    if (picked === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable], [role=dialog], [role=menu]")) return;
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        setPicked(null);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = removeLinePoint(linePagePoints(line), picked);
        if (next) onCommit(withLinePoints(line, next));
        else toast.info("線條至少要有兩個點；要刪掉整條線，先取消選中的點（Esc）再按 Delete。");
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [picked, line, onCommit]);
  const indexes =
    line.points.length > LINE_HANDLES_MAX_POINTS ? [0, line.points.length - 1] : line.points.map((_, index) => index);

  const lineNode = (event: KonvaEventObject<DragEvent>) => event.target.getStage()?.findOne(`#${line.id}`);

  const place = (index: number, event: KonvaEventObject<DragEvent>): LinePoint[] => {
    const raw = event.target.position();
    let point: LinePoint = { x: raw.x, y: raw.y };
    if (event.evt.shiftKey) point = constrainAngle(pagePoints[anchorIndex(index)], point);
    else if (snapSpacing !== null) {
      point = { x: Math.round(point.x / snapSpacing) * snapSpacing, y: Math.round(point.y / snapSpacing) * snapSpacing };
    }
    // 把手留在算好的位置（Shift / 吸附後）
    event.target.position(point);
    return pagePoints.map((current, i) => (i === index ? point : current));
  };

  // 預覽：用新的點算出位置與點（和放開後寫進文件的一樣），畫在原本那條線的位置
  const preview = dragged ? { ...line, ...withLinePoints(line, dragged) } : null;

  return (
    <Group x={offsetX}>
      {preview && (
        <Group x={preview.x} y={preview.y} rotation={preview.rotation} listening={false}>
          <LineBody line={preview} zoom={zoom} />
        </Group>
      )}
      {indexes.map((index) => (
        <Circle
          key={index}
          x={shown[index].x}
          y={shown[index].y}
          radius={HANDLE_RADIUS_PX / zoom}
          fill={picked === index ? HANDLE_COLOR : "#ffffff"}
          stroke={HANDLE_COLOR}
          strokeWidth={1.5 / zoom}
          hitStrokeWidth={HANDLE_HIT_PX / zoom}
          draggable
          // 不讓 Stage 當成按在空白處（清空選取、框選），也不讓 Layer 以為在拖物件（目前頁不裁切的狀態）
          onMouseDown={(event) => (event.cancelBubble = true)}
          onTouchStart={(event) => (event.cancelBubble = true)}
          // 沒有拖動的一下 = 選中這一點（再按一下取消）
          onClick={() => setPicked((current) => (current === index ? null : index))}
          onMouseEnter={(event) => setCursor(event, "crosshair")}
          onMouseLeave={(event) => setCursor(event, "")}
          onDragStart={(event) => {
            event.cancelBubble = true;
            lineNode(event)?.visible(false);
            setDragged(pagePoints);
          }}
          onDragMove={(event) => {
            event.cancelBubble = true;
            setDragged(place(index, event));
          }}
          onDragEnd={(event) => {
            event.cancelBubble = true;
            const next = place(index, event);
            lineNode(event)?.visible(true);
            setDragged(null);
            const moved = next.some((point, i) => point.x !== pagePoints[i].x || point.y !== pagePoints[i].y);
            if (moved) onCommit(withLinePoints(line, next));
          }}
        />
      ))}
    </Group>
  );
}

function setCursor(event: KonvaEventObject<MouseEvent>, cursor: string): void {
  const container = (event.target.getStage() as Konva.Stage | null)?.container();
  if (container) container.style.cursor = cursor;
}
