import { createElement, type ComponentType } from "react";
import { Circle, Square, SquareRoundCorner, Star, Triangle } from "lucide-react";
import { presetChoice, SHAPE_KIND_LABELS, type ShapeChoice } from "@/lib/editor/element-factory";
import { SHAPE_CATEGORIES, SHAPE_LIBRARY, type ShapeCategoryId, type ShapePreset } from "@/lib/editor/shape-presets";
import { ShapePresetIcon } from "./shape-preset-icon";

/** An icon drawn like a Lucide icon (size / colour by class; Lucide icons also take `strokeWidth`). */
export type ShapeIcon = ComponentType<{ readonly className?: string; readonly strokeWidth?: number }>;

export interface ShapeOption {
  readonly kind: ShapeChoice;
  readonly label: string;
  readonly icon: ShapeIcon;
}

/** The five basic shapes, in display order (first in the panel's 基本 group and the toolbar menu). */
export const SHAPE_OPTIONS: readonly ShapeOption[] = [
  { kind: "rect", label: SHAPE_KIND_LABELS.rect, icon: Square },
  { kind: "roundedRect", label: SHAPE_KIND_LABELS.roundedRect, icon: SquareRoundCorner },
  { kind: "ellipse", label: SHAPE_KIND_LABELS.ellipse, icon: Circle },
  { kind: "triangle", label: SHAPE_KIND_LABELS.triangle, icon: Triangle },
  { kind: "star", label: SHAPE_KIND_LABELS.star, icon: Star },
];

// 圖形庫圖形的 icon 元件：以路徑畫的 SVG（每個圖形一個元件，參考穩定）
function presetOption(preset: ShapePreset): ShapeOption {
  const icon: ShapeIcon = ({ className, strokeWidth }) => createElement(ShapePresetIcon, { preset, className, strokeWidth });
  return { kind: presetChoice(preset.id), label: preset.label, icon };
}

export interface ShapeOptionGroup {
  readonly id: ShapeCategoryId;
  readonly label: string;
  readonly options: readonly ShapeOption[];
}

/**
 * Every shape the user can pick, grouped like the shape library: the basic shapes lead the 基本
 * group, followed by the library's shapes of each category.
 */
export const SHAPE_OPTION_GROUPS: readonly ShapeOptionGroup[] = SHAPE_CATEGORIES.map(({ id, label }) => ({
  id,
  label,
  options: [
    ...(id === "basic" ? SHAPE_OPTIONS : []),
    ...SHAPE_LIBRARY.filter((preset) => preset.category === id).map(presetOption),
  ],
})).filter((group) => group.options.length > 0);

const BY_KIND = new Map(SHAPE_OPTION_GROUPS.flatMap((group) => group.options).map((option) => [option.kind, option]));

/**
 * The option of a shape choice (the toolbar shows the last shape used).
 *
 * Args:
 *   kind: Shape choice.
 *
 * Returns:
 *   Its option; the rectangle for a choice this version does not know.
 */
export function shapeOption(kind: ShapeChoice): ShapeOption {
  return BY_KIND.get(kind) ?? SHAPE_OPTIONS[0];
}
