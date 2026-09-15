import { Circle, Square, SquareRoundCorner, Star, Triangle, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createShapeElement, type ShapeKind } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";

const SHAPE_OPTIONS: readonly { readonly kind: ShapeKind; readonly label: string; readonly icon: LucideIcon }[] = [
  { kind: "rect", label: "矩形", icon: Square },
  { kind: "roundedRect", label: "圓角矩形", icon: SquareRoundCorner },
  { kind: "ellipse", label: "圓形", icon: Circle },
  { kind: "triangle", label: "三角形", icon: Triangle },
  { kind: "star", label: "星形", icon: Star },
];

/**
 * Panel for adding basic shapes.
 *
 * Returns:
 *   Grid of shape buttons.
 */
export function ElementsPanel() {
  const page = useActivePage();
  const dispatch = useEditorDispatch();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>圖形</CardTitle>
        <CardDescription>點擊加入頁面中央，可在上方工具列修改填色。</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-2">
        {SHAPE_OPTIONS.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => dispatch({ type: "element/add", element: createShapeElement(kind, pageCenter(page)) })}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border bg-background text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon className="size-9 fill-slate-400 text-slate-500" strokeWidth={1} />
            {label}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
