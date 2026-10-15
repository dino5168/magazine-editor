import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createShapeElement } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import { SHAPE_OPTION_GROUPS } from "../shape-options";

/**
 * Panel for adding shapes: the basic shapes and the shape library, grouped by category.
 *
 * Returns:
 *   One grid of shape buttons per group.
 */
export function ElementsPanel() {
  const page = useActivePage();
  const dispatch = useEditorDispatch();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>圖形</CardTitle>
        <CardDescription>點擊加入頁面中央；也可以在下方工具列選好圖形，到畫布上拖曳建立。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {SHAPE_OPTION_GROUPS.map((group) => (
          <section key={group.id} aria-label={group.label} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {group.options.map(({ kind, label, icon: Icon }) => (
                <button
                  key={kind}
                  type="button"
                  title={label}
                  onClick={() => dispatch({ type: "element/add", element: createShapeElement(kind, pageCenter(page)) })}
                  className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-lg border bg-background px-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon className="size-7 fill-slate-400 text-slate-500" strokeWidth={1} />
                  <span className="w-full truncate text-center">{label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
