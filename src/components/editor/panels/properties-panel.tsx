import { useMemo, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Scan,
  SendToBack,
  StretchHorizontal,
  StretchVertical,
  Trash,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORNER_NAMES, clampCornerRadii, cornerRadii, isUniformCornerRadius, withCornerRadius, type CornerIndex } from "@/lib/editor/corner-radius";
import { cn } from "@/lib/utils";
import { alignContentPatch, contentArea, fillContentDisabledReason, fillContentPatch, type ContentEdge, type FillAxis } from "@/lib/editor/content-align";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage, selectSelectedElement } from "@/lib/editor/editor-reducer";
import { describeShape } from "@/lib/editor/element-factory";
import {
  clampVertexCount,
  hasEditableHeight,
  innerRatioFromPercent,
  normalizeRotation,
  resizePatch,
} from "@/lib/editor/properties";
import type { CanvasElement, CornerRadius, ElementPatch, ShapeElement, ShapeLabel, TextElement, TextStyle } from "@/lib/editor/types";
import { textBlockHeight } from "@/lib/editor/shape-label";
import { resolveElementVariables, TEXT_VARIABLES, variableValues } from "@/lib/editor/variables";
import { measureTextLayout } from "@/lib/export/text-layout";
import { ColorPicker } from "../color-picker";
import { IconButton } from "../icon-button";
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

// 2 × 2 欄位的順序 = 角在畫面上的位置：左上、右上 / 左下、右下（CornerRadii 的順序是左上、右上、右下、左下）
const CORNER_GRID: readonly CornerIndex[] = [0, 1, 3, 2];

/**
 * Corner radius of a rectangle: one field (all four corners) with a toggle that expands it into
 * four fields laid out where the corners are. Differing corners open expanded; collapsed, the
 * field shows 「混合」 and a typed value sets all four.
 */
function CornerRadiusFields({ shape, radius, update }: { readonly shape: ShapeElement; readonly radius: CornerRadius; readonly update: Update }) {
  const uniform = isUniformCornerRadius(radius);
  const [expanded, setExpanded] = useState(!uniform);
  const radii = cornerRadii(radius);
  const setRadius = (cornerRadius: CornerRadius) => update({ geometry: { kind: "rect", cornerRadius } });
  return (
    <>
      <div className="flex items-center gap-1.5">
        {expanded ? (
          <span className="flex-1 text-xs text-muted-foreground">圓角（四個角分別設定）</span>
        ) : (
          <NumberField
            key={radii.join(",")}
            label="圓角"
            unit="pt"
            value={radii[0]}
            mixed={!uniform}
            onCommit={(value) => setRadius(clampCornerRadii(shape, value))}
            className="flex-1"
          />
        )}
        <IconButton
          label={expanded ? "四個角一起設定" : "分別設定四個角"}
          aria-pressed={expanded}
          className={cn(expanded && "bg-muted")}
          onClick={() => setExpanded(!expanded)}
        >
          <Scan />
        </IconButton>
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {CORNER_GRID.map((corner) => (
            <NumberField
              key={`${corner}-${radii[corner]}`}
              label={CORNER_NAMES[corner]}
              unit="pt"
              value={radii[corner]}
              onCommit={(value) => setRadius(withCornerRadius(shape, radius, corner, value))}
            />
          ))}
        </div>
      )}
    </>
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
          {/* key：「分別設定」是每個矩形各自的編輯狀態，切換物件時重新判斷 */}
          <CornerRadiusFields key={shape.id} shape={shape} radius={geometry.cornerRadius} update={update} />
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
        spacing={{ value: style, onChange }}
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

const ALIGN_EDGES: readonly { readonly edge: ContentEdge; readonly label: string; readonly icon: LucideIcon }[] = [
  { edge: "left", label: "靠左對齊內容區", icon: AlignStartVertical },
  { edge: "centerX", label: "水平置中於內容區", icon: AlignCenterVertical },
  { edge: "right", label: "靠右對齊內容區", icon: AlignEndVertical },
  { edge: "top", label: "靠上對齊內容區", icon: AlignStartHorizontal },
  { edge: "centerY", label: "垂直置中於內容區", icon: AlignCenterHorizontal },
  { edge: "bottom", label: "靠下對齊內容區", icon: AlignEndHorizontal },
];

/**
 * 「對齊內容區」: fill the content area's width / height, or move to its edges / centre lines.
 * One click = one `element/update` (one undo step); nothing is stored in the document.
 */
function ContentAlignSection({ element, keepRatio, update }: { readonly element: CanvasElement; readonly keepRatio: boolean; readonly update: Update }) {
  const state = useEditorState();
  const sheet = selectActivePage(state);
  const document = state.history.present;
  const area = contentArea(sheet, document.margins);
  const variables = useMemo(() => variableValues(document, sheet.id), [document, sheet.id]);
  // 文字的高度用和畫布相同的 Konva 量測（畫布顯示的是換過變數的文字）；estimateTextHeight 只是粗估
  const height = useMemo(() => {
    if (element.type !== "text") return element.height;
    const shown = variables ? (resolveElementVariables(element, variables) as TextElement) : element;
    return textBlockHeight(measureTextLayout(shown).lines.length, element.fontSize, element.lineHeight);
  }, [element, variables]);
  const apply = (patch: ElementPatch | null) => {
    if (patch) update(patch);
  };
  const axes: readonly FillAxis[] = element.type === "text" ? ["width"] : ["width", "height"];
  const reasons = axes.map((axis) => fillContentDisabledReason(element, area, axis)).filter((reason) => reason !== null);

  return (
    <Section title="對齊內容區">
      <div className="grid grid-cols-2 gap-1.5">
        {axes.map((axis) => (
          <Button
            key={axis}
            variant="outline"
            size="sm"
            disabled={fillContentDisabledReason(element, area, axis) !== null}
            onClick={() => apply(fillContentPatch(element, area, axis, keepRatio))}
          >
            {axis === "width" ? <StretchHorizontal /> : <StretchVertical />}
            {axis === "width" ? "填滿寬度" : "填滿高度"}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-0.5">
        {ALIGN_EDGES.map(({ edge, label, icon: Icon }) => (
          <IconButton key={edge} label={label} onClick={() => apply(alignContentPatch(element, area, edge, height))}>
            <Icon />
          </IconButton>
        ))}
      </div>
      {element.rotation !== 0 && <p className="text-xs text-muted-foreground">填滿時會把旋轉歸零；對齊照旋轉後的外框。</p>}
      {[...new Set(reasons)].map((reason) => (
        <p key={reason} className="text-xs text-muted-foreground">
          無法填滿：{reason}。
        </p>
      ))}
    </Section>
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
      <ContentAlignSection element={element} keepRatio={keepRatio} update={update} />
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
