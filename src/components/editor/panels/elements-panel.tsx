import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrowserStorage } from "@/lib/dock/dock-storage";
import {
  accordionValue,
  layoutFromAccordion,
  loadElementsPanelLayout,
  saveElementsPanelLayout,
} from "@/lib/dock/elements-panel-layout";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createShapeElement } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import { SHAPE_OPTION_GROUPS } from "../shape-options";

/**
 * Panel for adding shapes: the basic shapes and the shape library, one accordion section per
 * category with at most one open (remembered on this computer, see `elements-panel-layout.ts`).
 *
 * Returns:
 *   The categories, the open one showing its grid of shape buttons.
 */
export function ElementsPanel() {
  const page = useActivePage();
  const dispatch = useEditorDispatch();
  // 面板每次掛載（切到這個頁籤）時讀一次；之後只寫不讀
  const [layout, setLayout] = useState(() => loadElementsPanelLayout(getBrowserStorage()));

  const changeOpen = (value: string): void => {
    const next = layoutFromAccordion(value);
    setLayout(next);
    saveElementsPanelLayout(getBrowserStorage(), next);
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>圖形</CardTitle>
        <CardDescription>點擊加入頁面中央；也可以在下方工具列選好圖形，到畫布上拖曳建立。</CardDescription>
      </CardHeader>
      <CardContent>
        {/* 單一展開；collapsible：再點一下展開中的分類 = 全部收起 */}
        <Accordion type="single" collapsible value={accordionValue(layout)} onValueChange={changeOpen}>
          {SHAPE_OPTION_GROUPS.map((group) => (
            <AccordionItem key={group.id} value={group.id}>
              <AccordionTrigger>
                <span className="flex flex-1 items-center justify-between pr-2">
                  <span>{group.label}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">{group.options.length}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
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
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
