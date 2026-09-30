import { Circle, Square, SquareRoundCorner, Star, Triangle, type LucideIcon } from "lucide-react";
import type { ShapeKind } from "@/lib/editor/element-factory";

export interface ShapeOption {
  readonly kind: ShapeKind;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Shapes offered by the elements panel and the bottom toolbar's shape picker, in display order. */
export const SHAPE_OPTIONS: readonly ShapeOption[] = [
  { kind: "rect", label: "矩形", icon: Square },
  { kind: "roundedRect", label: "圓角矩形", icon: SquareRoundCorner },
  { kind: "ellipse", label: "圓形", icon: Circle },
  { kind: "triangle", label: "三角形", icon: Triangle },
  { kind: "star", label: "星形", icon: Star },
];

/** Icon and label of every shape; a missing kind is a compile error. */
export const SHAPE_OPTION_BY_KIND = Object.fromEntries(SHAPE_OPTIONS.map((option) => [option.kind, option])) as Record<
  ShapeKind,
  ShapeOption
>;
