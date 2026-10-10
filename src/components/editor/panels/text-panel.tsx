import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivePage, useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { TEXT_PRESETS, createStyledText, createTextElement, type TextPreset } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import type { TextStyleDef } from "@/lib/editor/types";
import { loadFontFamily } from "@/lib/editor/use-fonts-ready";

const PRESET_ORDER: readonly TextPreset[] = ["heading", "subheading", "body"];

/** Button text size (px): follows the style, within what fits a panel row. */
function buttonFontSize(style: TextStyleDef): number {
  return Math.min(24, Math.max(12, style.fontSize));
}

/**
 * Panel for adding text elements: one button per text style of the document; the new text is
 * linked to that style. A document without styles gets the three built-in presets, unlinked.
 *
 * Returns:
 *   Style buttons.
 */
export function TextPanel() {
  const page = useActivePage();
  const dispatch = useEditorDispatch();
  const { textStyles } = useEditorState().history.present;

  const add = (style: TextStyleDef): void => {
    // 先載入樣式的字型，畫布才不會用替代字型量換行
    void loadFontFamily(style.fontFamily).then(() =>
      dispatch({ type: "element/add", element: createStyledText(style, pageCenter(page)) }),
    );
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>文字樣式</CardTitle>
        <CardDescription>
          點擊加入頁面中央，新文字會連到該樣式；在畫布上雙擊文字即可編輯內容。樣式在「樣式」面板管理。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {textStyles.length > 0
          ? textStyles.map((style) => (
              <Button
                key={style.id}
                variant="outline"
                className="h-auto min-h-9 justify-start py-1.5"
                title={`新增「${style.name}」文字`}
                onClick={() => add(style)}
              >
                <span
                  className="truncate"
                  style={{
                    fontFamily: style.fontFamily,
                    fontSize: buttonFontSize(style),
                    fontWeight: style.fontStyle === "bold" ? 700 : 400,
                    fontStyle: style.italic ? "italic" : "normal",
                  }}
                >
                  {style.name}
                </span>
              </Button>
            ))
          : PRESET_ORDER.map((preset) => (
              <Button
                key={preset}
                variant="outline"
                className="justify-start"
                onClick={() => dispatch({ type: "element/add", element: createTextElement(preset, pageCenter(page)) })}
              >
                {TEXT_PRESETS[preset].label}
              </Button>
            ))}
      </CardContent>
    </Card>
  );
}
