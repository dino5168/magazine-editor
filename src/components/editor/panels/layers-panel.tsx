import { ArrowDown, ArrowUp, Circle, Image, Square, Star, Trash, Triangle, Type, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage } from "@/lib/editor/editor-reducer";
import { describeElement } from "@/lib/editor/element-factory";
import type { CanvasElement, GeometryKind } from "@/lib/editor/types";
import { IconButton } from "../icon-button";

const GEOMETRY_ICONS: { readonly [K in GeometryKind]: LucideIcon } = {
  rect: Square,
  ellipse: Circle,
  polygon: Triangle,
  star: Star,
};

function elementIcon(element: CanvasElement): LucideIcon {
  switch (element.type) {
    case "text":
      return Type;
    case "shape":
      return GEOMETRY_ICONS[element.geometry.kind];
    case "image":
      return Image;
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}

/**
 * Panel listing elements of the active page from top to bottom.
 *
 * Returns:
 *   Layer list with select, reorder and delete actions.
 */
export function LayersPanel() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const page = selectActivePage(state);
  const count = page.elements.length;
  // 模型 index 0 在最底層；清單以最上層排最前
  const rows = page.elements.map((element, index) => ({ element, index })).reverse();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>圖層</CardTitle>
        <CardDescription>{count === 0 ? "目前頁面沒有物件。" : `「${page.name}」共 ${count} 個物件，最上層排在最前。`}</CardDescription>
      </CardHeader>
      {count > 0 && (
        <CardContent>
          <ul className="flex flex-col gap-0.5">
            {rows.map(({ element, index }) => {
              const Icon = elementIcon(element);
              const selected = element.id === state.selectedId;
              return (
                <li
                  key={element.id}
                  className={cn("flex items-center gap-0.5 rounded-md pr-1", selected ? "bg-muted" : "hover:bg-muted/60")}
                >
                  <button
                    type="button"
                    aria-current={selected}
                    onClick={() => dispatch({ type: "selection/set", id: element.id })}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className={cn("truncate", selected && "font-medium")}>{describeElement(element)}</span>
                  </button>
                  <IconButton
                    label="上移一層"
                    size="icon-xs"
                    disabled={index >= count - 1}
                    onClick={() => dispatch({ type: "element/reorder", id: element.id, direction: "up" })}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    label="下移一層"
                    size="icon-xs"
                    disabled={index <= 0}
                    onClick={() => dispatch({ type: "element/reorder", id: element.id, direction: "down" })}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    label="刪除"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => dispatch({ type: "element/delete", id: element.id })}
                  >
                    <Trash />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
