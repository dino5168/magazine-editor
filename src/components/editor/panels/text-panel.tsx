import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { TEXT_PRESETS, createTextElement, type TextPreset } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";

const PRESET_STYLES: { readonly [K in TextPreset]: string } = {
  heading: "h-14 text-2xl font-bold",
  subheading: "h-11 text-lg",
  body: "h-9 text-sm",
};

const PRESET_ORDER: readonly TextPreset[] = ["heading", "subheading", "body"];

/**
 * Panel for adding text elements.
 *
 * Returns:
 *   Text preset buttons.
 */
export function TextPanel() {
  const page = useActivePage();
  const dispatch = useEditorDispatch();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>文字樣式</CardTitle>
        <CardDescription>點擊加入頁面中央；在畫布上雙擊文字即可編輯內容。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {PRESET_ORDER.map((preset) => (
          <Button
            key={preset}
            variant="outline"
            className={cn("justify-start", PRESET_STYLES[preset])}
            onClick={() => dispatch({ type: "element/add", element: createTextElement(preset, pageCenter(page)) })}
          >
            {TEXT_PRESETS[preset].label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
