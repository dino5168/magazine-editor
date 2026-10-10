import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage } from "@/lib/editor/editor-reducer";
import { createId } from "@/lib/editor/element-factory";
import {
  TEXT_STYLE_KEY_LABELS,
  TEXT_STYLE_NAME_MAX_LENGTH,
  nextTextStyleName,
  pickTextStyle,
  styleOverrides,
} from "@/lib/editor/style-sheet";
import type { ElementId, StyledText } from "@/lib/editor/types";
import { loadFontFamily } from "@/lib/editor/use-fonts-ready";
import { InlineNameInput } from "./inline-name-input";

/** Select value for 「不使用樣式」: Radix Select items cannot use "", and style ids are UUIDs or `text-style-*`. */
const NO_STYLE = "__none__";

interface TextStyleLinkProps {
  /** Element whose text it is: a text element, or the shape holding the label. */
  readonly elementId: ElementId;
  readonly text: StyledText;
}

/**
 * 「文字樣式」 section of the property panel: which style the text follows, which fields override
 * it, and the actions clear overrides / update the style from this text / make a new style.
 *
 * Args:
 *   props: The element and its styled text.
 *
 * Returns:
 *   The controls, without a surrounding section.
 */
export function TextStyleLink({ elementId, text }: TextStyleLinkProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const { textStyles } = state.history.present;
  const pageId = selectActivePage(state).id;
  const [naming, setNaming] = useState(false);
  const style = textStyles.find((candidate) => candidate.id === text.styleId) ?? null;
  const overrides = style ? styleOverrides(text, style) : [];

  const apply = (styleId: string | null): void => {
    const target = textStyles.find((candidate) => candidate.id === styleId);
    void (target ? loadFontFamily(target.fontFamily) : Promise.resolve()).then(() =>
      dispatch({ type: "element/applyTextStyle", ids: [elementId], styleId }),
    );
  };

  const create = (name: string): void => {
    setNaming(false);
    if (textStyles.some((candidate) => candidate.name === name)) {
      toast.error(`已經有名為「${name}」的樣式`);
      return;
    }
    const created = { ...pickTextStyle(text), id: createId(), name };
    dispatch({ type: "textStyle/add", style: created, link: { pageId, ids: [elementId] } });
    toast.success(`已建立樣式「${name}」`);
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-xs text-muted-foreground">樣式</span>
        <Select value={text.styleId ?? NO_STYLE} onValueChange={(value) => apply(value === NO_STYLE ? null : value)}>
          <SelectTrigger size="sm" className="h-7 flex-1" aria-label="文字樣式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_STYLE}>不使用樣式</SelectItem>
            {textStyles.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
                {candidate.id === text.styleId && overrides.length > 0 ? " ＋" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {style && overrides.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            和樣式不同（覆寫）：{overrides.map((key) => TEXT_STYLE_KEY_LABELS[key]).join("、")}
          </p>
          <div className="flex flex-wrap gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => apply(style.id)}>
              清除覆寫
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              title={`把「${style.name}」改成這段文字的設定，連到它的文字都會跟著改`}
              onClick={() => dispatch({ type: "textStyle/update", id: style.id, style: pickTextStyle(text) })}
            >
              以目前設定更新樣式
            </Button>
          </div>
        </>
      )}
      {naming ? (
        <InlineNameInput
          initialValue={nextTextStyleName(textStyles)}
          maxLength={TEXT_STYLE_NAME_MAX_LENGTH}
          label="新樣式名稱"
          onCommit={create}
          onCancel={() => setNaming(false)}
        />
      ) : (
        <Button variant="outline" size="sm" className="h-7 self-start px-2" onClick={() => setNaming(true)}>
          以目前設定建立新樣式
        </Button>
      )}
    </>
  );
}
