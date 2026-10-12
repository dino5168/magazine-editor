import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { ColorPalette } from "../color-picker";
import { DocumentSwatchesProvider } from "../document-swatches";

/**
 * Panel for setting the active page background color.
 *
 * Returns:
 *   Tailwind palette without opacity (a page is paper).
 */
export function BackgroundPanel() {
  const page = useActivePage();
  const dispatch = useEditorDispatch();
  const setColor = (color: string, swatchId: string | null): void =>
    dispatch({ type: "page/setBackground", id: page.id, color, swatchId });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>頁面背景</CardTitle>
        <CardDescription>套用到目前頁面「{page.name}」。</CardDescription>
      </CardHeader>
      <CardContent>
        {/* key：切換頁面時重新 mount，色系跳到新頁面背景所在的位置 */}
        <DocumentSwatchesProvider>
          <ColorPalette
            key={page.id}
            value={page.background}
            swatchId={page.backgroundSwatchId}
            label="背景色"
            onCommit={setColor}
            allowAlpha={false}
          />
        </DocumentSwatchesProvider>
      </CardContent>
    </Card>
  );
}
