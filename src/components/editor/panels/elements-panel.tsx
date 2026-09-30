import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createShapeElement } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import { SHAPE_OPTIONS } from "../shape-options";

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
