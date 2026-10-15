import { useMemo } from "react";
import { pathData } from "@/lib/editor/shape-path";
import { presetPath, resolvePresetParams, type ShapePreset } from "@/lib/editor/shape-presets";
import { cn } from "@/lib/utils";

/** Icon grid: 24 × 24, like the Lucide icons next to it; the shape fits in 20 × 20. */
const ICON_BOX = 24;
const SHAPE_MAX = 20;

/**
 * The icon of a shape-library shape, drawn from the same formula as the canvas (no separate icon
 * to maintain), at the shape's default proportions and parameters. Colours follow the Lucide icons
 * of the basic shapes (`fill-slate-400 text-slate-500` set by the caller, or `currentColor`).
 *
 * Args:
 *   props.preset: Library shape.
 *   props.className: Size and colour classes, like a Lucide icon.
 *   props.strokeWidth: Line width in the 24-unit icon grid, like a Lucide icon (default 1.5).
 *
 * Returns:
 *   Inline SVG.
 */
export function ShapePresetIcon({
  preset,
  className,
  strokeWidth = 1.5,
}: {
  readonly preset: ShapePreset;
  readonly className?: string;
  readonly strokeWidth?: number;
}) {
  const paths = useMemo(() => {
    const { width, height } = preset.size;
    const scale = SHAPE_MAX / Math.max(width, height);
    const [w, h] = [width * scale, height * scale];
    const params = Object.fromEntries(preset.params.map((param) => [param.name, param.default]));
    const path = presetPath({ kind: "preset", preset: preset.id, params: resolvePresetParams(preset, params) }, w, h);
    return {
      offset: `translate(${(ICON_BOX - w) / 2} ${(ICON_BOX - h) / 2})`,
      outline: path ? pathData(path.outline) : "",
      details: path && path.details.length > 0 ? pathData(path.details) : null,
    };
  }, [preset]);
  return (
    <svg
      viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`}
      aria-hidden
      className={cn("size-6", className)}
      // 和 Lucide 一樣預設只有線（SVG 的預設填色是黑）；元素面板以 fill-* class 填色，CSS 蓋過這個屬性
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    >
      <g transform={paths.offset}>
        <path d={paths.outline} />
        {paths.details && <path d={paths.details} fill="none" />}
      </g>
    </svg>
  );
}
