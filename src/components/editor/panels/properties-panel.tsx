import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BringToFront, SendToBack, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage, selectSelectedElement } from "@/lib/editor/editor-reducer";
import { describeShape } from "@/lib/editor/element-factory";
import {
  clampCornerRadius,
  clampVertexCount,
  hasEditableHeight,
  innerRatioFromPercent,
  normalizeRotation,
  resizePatch,
} from "@/lib/editor/properties";
import type { CanvasElement, ElementPatch, ShapeElement, ShapeLabel, TextElement, TextStyle } from "@/lib/editor/types";
import { TEXT_VARIABLES } from "@/lib/editor/variables";
import { ColorPicker } from "../color-picker";
import { NumberField } from "../number-field";
import { Row, StrokeFields, TextStyleFields } from "../style-controls";
import { TextStyleLink } from "../text-style-link";

type TabId = "style" | "text" | "arrange";

const TAB_LABELS: { readonly [K in TabId]: string } = { style: "樣式", text: "文字", arrange: "調整" };

// 各物件有哪些分頁
function tabsOf(element: CanvasElement): readonly TabId[] {
  switch (element.type) {
    case "text":
      return ["text", "arrange"];
    case "shape":
      return ["style", "text", "arrange"];
    case "image":
      return ["arrange"];
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}

function elementName(element: CanvasElement): string {
  switch (element.type) {
    case "text":
      return "文字";
    case "shape":
      return describeShape(element);
    case "image":
      return "圖片";
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-3 last:border-b-0">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

type Update = (patch: ElementPatch) => void;

function StrokeSection({ shape, update }: { readonly shape: ShapeElement; readonly update: Update }) {
  return (
    <Section title="邊框">
      <StrokeFields id={shape.id} stroke={shape.stroke} onChange={(stroke) => update({ stroke })} switchLabel="顯示邊框" />
    </Section>
  );
}

// 圖形自己的參數；橢圓沒有可調的參數
function GeometrySection({ shape, update }: { readonly shape: ShapeElement; readonly update: Update }) {
  const { geometry } = shape;
  const key = (name: string, value: number) => `${shape.id}-${name}-${value}`;
  switch (geometry.kind) {
    case "rect":
      return (
        <Section title="形狀">
          <NumberField
            key={key("radius", geometry.cornerRadius)}
            label="圓角"
            unit="pt"
            value={geometry.cornerRadius}
            onCommit={(radius) => update({ geometry: { ...geometry, cornerRadius: clampCornerRadius(shape, radius) } })}
            className="w-1/2 pr-1.5"
          />
        </Section>
      );
    case "polygon":
      return (
        <Section title="形狀">
          <NumberField
            key={key("sides", geometry.sides)}
            label="邊數"
            unit=""
            value={geometry.sides}
            onCommit={(sides) => update({ geometry: { ...geometry, sides: clampVertexCount(sides) } })}
            className="w-1/2 pr-1.5"
          />
        </Section>
      );
    case "star":
      return (
        <Section title="形狀">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <NumberField
              key={key("points", geometry.numPoints)}
              label="角數"
              unit=""
              value={geometry.numPoints}
              onCommit={(numPoints) => update({ geometry: { ...geometry, numPoints: clampVertexCount(numPoints) } })}
            />
            <NumberField
              key={key("inner", geometry.innerRatio)}
              label="內徑"
              unit="%"
              value={geometry.innerRatio * 100}
              onCommit={(percent) => update({ geometry: { ...geometry, innerRatio: innerRatioFromPercent(percent) } })}
            />
          </div>
        </Section>
      );
    case "ellipse":
      return null;
    default: {
      const exhaustive: never = geometry;
      return exhaustive;
    }
  }
}

function StyleTab({ shape, update }: { readonly shape: ShapeElement; readonly update: Update }) {
  return (
    <>
      <GeometrySection shape={shape} update={update} />
      <Section title="填滿">
        <Row label="填色">
          <ColorPicker value={shape.fill} label="填色" onCommit={(fill) => update({ fill })} />
        </Row>
      </Section>
      <StrokeSection shape={shape} update={update} />
    </>
  );
}

/**
 * Font, font size, bold / italic / lines, alignment, color and shadow: shared by text elements and
 * the text inside shapes.
 * `verticalAlign` is only given for shape text.
 */
function TextStyleControls({
  id,
  style,
  onChange,
  verticalAlign,
}: {
  readonly id: string;
  readonly style: TextStyle;
  readonly onChange: (patch: Partial<TextStyle>) => void;
  readonly verticalAlign?: { readonly value: ShapeLabel["verticalAlign"]; readonly onChange: (value: ShapeLabel["verticalAlign"]) => void };
}) {
  return (
    <Section title="字型">
      <TextStyleFields
        id={id}
        style={style}
        onChange={onChange}
        align={{ value: style.align, onChange: (align) => onChange({ align }) }}
        verticalAlign={verticalAlign}
      />
    </Section>
  );
}

/**
 * Buttons that append a text variable (`{頁碼}` …) to the text; one click = one undo step.
 * Typing the token by hand works too.
 */
function VariablesSection({ text, onChange }: { readonly text: string; readonly onChange: (text: string) => void }) {
  return (
    <Section title="插入變數">
      <div className="flex flex-wrap gap-1">
        {TEXT_VARIABLES.map((variable) => (
          <Button
            key={variable.token}
            variant="outline"
            size="sm"
            className="h-7 px-2"
            title={variable.description}
            onClick={() => onChange(text + variable.token)}
          >
            {variable.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        加在文字最後，也可以直接輸入 <code>{"{頁碼}"}</code> 這類文字。放在主頁上時，每一頁會顯示自己的值。
      </p>
    </Section>
  );
}

function TextTab({ text, update }: { readonly text: TextElement; readonly update: Update }) {
  return (
    <>
      <Section title="文字樣式">
        <TextStyleLink elementId={text.id} text={text} />
      </Section>
      <TextStyleControls id={text.id} style={text} onChange={update} />
      <VariablesSection text={text.text} onChange={(next) => update({ text: next })} />
    </>
  );
}

function ShapeTextTab({ shape, update }: { readonly shape: ShapeElement; readonly update: Update }) {
  const { label } = shape;
  if (!label) {
    return <p className="px-3 py-3 text-sm text-muted-foreground">雙擊畫布上的圖形即可輸入文字。</p>;
  }
  const setLabel = (patch: Partial<ShapeLabel>) => update({ label: { ...label, ...patch } });
  return (
    <>
      <Section title="文字樣式">
        <TextStyleLink elementId={shape.id} text={label} />
      </Section>
      <TextStyleControls
        id={shape.id}
        style={label}
        onChange={setLabel}
        verticalAlign={{ value: label.verticalAlign, onChange: (verticalAlign) => setLabel({ verticalAlign }) }}
      />
      <VariablesSection text={label.text} onChange={(text) => setLabel({ text })} />
    </>
  );
}

function ArrangeTab({ element, update }: { readonly element: CanvasElement; readonly update: Update }) {
  const dispatch = useEditorDispatch();
  const elements = selectActivePage(useEditorState()).elements;
  const index = elements.findIndex((candidate) => candidate.id === element.id);
  const isTop = index >= elements.length - 1;
  const isBottom = index <= 0;
  // 限制寬高比是編輯時的選項，不存進文件；圖片預設開啟（拉長照片很少是刻意的）
  const [keepRatio, setKeepRatio] = useState(element.type === "image");
  const reorder = (direction: "up" | "down" | "top" | "bottom") =>
    dispatch({ type: "element/reorder", id: element.id, direction });
  const field = (name: string, value: number) => `${element.id}-${name}-${value}`;

  return (
    <>
      <Section title="圖層順序">
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" disabled={isTop} onClick={() => reorder("top")}>
            <BringToFront />
            移到最上層
          </Button>
          <Button variant="outline" size="sm" disabled={isBottom} onClick={() => reorder("bottom")}>
            <SendToBack />
            移到最下層
          </Button>
          <Button variant="outline" size="sm" disabled={isTop} onClick={() => reorder("up")}>
            <ArrowUp />
            上移一層
          </Button>
          <Button variant="outline" size="sm" disabled={isBottom} onClick={() => reorder("down")}>
            <ArrowDown />
            下移一層
          </Button>
        </div>
      </Section>
      <Section title="大小">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <NumberField
            key={field("w", element.width)}
            label={hasEditableHeight(element) ? "寬" : "行寬"}
            unit="pt"
            value={element.width}
            onCommit={(width) => update(resizePatch(element, { width }, keepRatio))}
          />
          {hasEditableHeight(element) && (
            <NumberField
              key={field("h", element.height)}
              label="高"
              unit="pt"
              value={element.height}
              onCommit={(height) => update(resizePatch(element, { height }, keepRatio))}
            />
          )}
        </div>
        {hasEditableHeight(element) ? (
          <label className="flex items-center gap-2 text-sm">
            <Switch size="sm" checked={keepRatio} onCheckedChange={setKeepRatio} />
            限制寬高比
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">文字的高度由內容決定。</p>
        )}
      </Section>
      <Section title="位置（外框左上角）">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <NumberField key={field("x", element.x)} label="X" unit="pt" value={element.x} onCommit={(x) => update({ x })} />
          <NumberField key={field("y", element.y)} label="Y" unit="pt" value={element.y} onCommit={(y) => update({ y })} />
        </div>
      </Section>
      <Section title="旋轉">
        <NumberField
          key={field("r", element.rotation)}
          label="角度"
          unit="°"
          value={element.rotation}
          onCommit={(rotation) => update({ rotation: normalizeRotation(rotation) })}
          className="w-1/2 pr-1.5"
        />
      </Section>
      <Section title="物件">
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => dispatch({ type: "element/delete", ids: [element.id] })}
        >
          <Trash />
          刪除
        </Button>
      </Section>
    </>
  );
}

function SelectedProperties({ element }: { readonly element: CanvasElement }) {
  const dispatch = useEditorDispatch();
  const update: Update = (patch) => dispatch({ type: "element/update", id: element.id, patch });
  // 切換物件時保留目前分頁；新物件沒有這個分頁時顯示它的第一個分頁
  const [tab, setTab] = useState<TabId>("style");
  const tabs = tabsOf(element);
  const active = tabs.includes(tab) ? tab : tabs[0];

  return (
    <Tabs value={active} onValueChange={(value) => setTab(value as TabId)} className="gap-0">
      {/* 名稱與分頁固定在面板頂端，內容往下捲時仍能切換分頁 */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background px-3 pt-1 pb-3">
        <span className="text-sm font-medium">{elementName(element)}</span>
        <TabsList className="w-full">
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {TAB_LABELS[id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {element.type === "shape" && (
        <TabsContent value="style">
          <StyleTab shape={element} update={update} />
        </TabsContent>
      )}
      {element.type === "shape" && (
        <TabsContent value="text">
          <ShapeTextTab shape={element} update={update} />
        </TabsContent>
      )}
      {element.type === "text" && (
        <TabsContent value="text">
          <TextTab text={element} update={update} />
        </TabsContent>
      )}
      <TabsContent value="arrange">
        {/* key：限制寬高比是每個物件各自的編輯選項，切換物件時重設 */}
        <ArrangeTab key={element.id} element={element} update={update} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Property panel (draw.io's format panel): style / text / arrange tabs for the selected element.
 *
 * Returns:
 *   Tabs for the selection, or a hint when nothing is selected.
 */
export function PropertiesPanel() {
  const state = useEditorState();
  const selected = selectSelectedElement(state);
  // 多選時只能一起移動 / 刪除 / 複製，共同屬性的編輯之後再做
  if (state.selectedIds.length > 1) {
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">
        已選取 {state.selectedIds.length} 個物件。可以一起拖曳、用方向鍵移動、刪除或複製；要編輯屬性請只選一個物件。
      </p>
    );
  }
  if (!selected) {
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">
        點選畫布上的物件即可編輯屬性；拖曳移動、拉控制點縮放旋轉，雙擊文字可修改內容。按住 Ctrl 點選或在空白處拖曳可以選取多個物件。
      </p>
    );
  }
  return <SelectedProperties element={selected} />;
}
