import { useMemo } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Ellipse, Group, Image as KonvaImage, Line, Rect, Text } from "react-konva";
import useImage from "use-image";
import { MIN_ELEMENT_SIZE_PT as MIN_SIZE_PT, TEXT_LINE_HEIGHT, snapPointToGrid } from "@/lib/editor/geometry";
import { shapePoints } from "@/lib/editor/shape-geometry";
import { labelAsText, labelFrame, labelTextOffset, textBlockHeight } from "@/lib/editor/shape-label";
import { konvaStroke } from "@/lib/editor/stroke";
import { konvaTextStyle } from "@/lib/editor/text-style";
import type {
  CanvasElement,
  ElementId,
  ElementPatch,
  ImageElement,
  ShapeElement,
  ShapeLabel,
  TextElement,
} from "@/lib/editor/types";
import { measureTextLayout } from "@/lib/export/text-layout";
import { useProject } from "@/lib/project/project-context";

export const ELEMENT_NODE_NAME = "element";

/** Ctrl (or Cmd) held: the click adds to / removes from the selection. */
export function isAdditive(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

export interface ElementNodeProps {
  readonly element: CanvasElement;
  /** Hides the element's text while it is edited in place (the whole text element, or a shape's label). */
  readonly textHidden: boolean;
  /** Pointer down on the element; `additive` is true with Ctrl held (add to / remove from the selection). */
  readonly onSelect: (id: ElementId, additive: boolean) => void;
  readonly onChange: (id: ElementId, patch: ElementPatch) => void;
  /** Drag ended; the canvas reads the final position (of the whole selection when several are dragged). */
  readonly onMoveEnd: (id: ElementId, node: Konva.Node) => void;
  /** Double-click: edit a text element, or the text inside a shape. */
  readonly onEditText: (id: ElementId) => void;
  /** Konva dragBoundFunc in absolute coordinates (grid snapping); null = free dragging. */
  readonly dragBound: ((id: ElementId, pos: Konva.Vector2d) => Konva.Vector2d) | null;
}

/**
 * Snaps a point given in stage (absolute) coordinates to the page grid: absolute → page pt via the
 * parent's transform, round to the grid, and back. Used by drag and Transformer anchor bounds, which
 * Konva calls with absolute positions.
 *
 * Args:
 *   parent: Node whose local coordinates are page pt (the page layer).
 *   pos: Absolute position.
 *   spacing: Grid spacing in pt.
 *
 * Returns:
 *   Snapped absolute position.
 */
export function snapAbsoluteToGrid(parent: Konva.Node, pos: Konva.Vector2d, spacing: number): Konva.Vector2d {
  const transform = parent.getAbsoluteTransform();
  return transform.point(snapPointToGrid(transform.copy().invert().point(pos), spacing));
}

interface CommonNodeProps {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly draggable: true;
  readonly dragBoundFunc: ((pos: Konva.Vector2d) => Konva.Vector2d) | undefined;
  readonly visible: boolean;
  readonly onMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  readonly onTouchStart: () => void;
  readonly onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
  readonly onTransformEnd: (event: KonvaEventObject<Event>) => void;
}

/**
 * Converts the scale produced by a Transformer into size fields and resets the node scale.
 *
 * 模型不保存 scale：縮放一律換算回 width / radius，匯出 Typst 時才能直接對應尺寸。
 *
 * Args:
 *   element: Element model before the transform.
 *   node: Konva node after the transform.
 *
 * Returns:
 *   Patch with position, rotation and baked size.
 */
export function bakeTransform(element: CanvasElement, node: Konva.Node): ElementPatch {
  const scaleX = Math.abs(node.scaleX());
  const scaleY = Math.abs(node.scaleY());
  node.scale({ x: 1, y: 1 });
  const base = { x: node.x(), y: node.y(), rotation: node.rotation() };

  switch (element.type) {
    case "text":
      // onTransform 已即時把 scaleX 換算進 width，這裡以節點目前寬度為準
      return { ...base, width: Math.max(MIN_SIZE_PT, node.width() * scaleX) };
    case "shape":
    case "image":
      return {
        ...base,
        width: Math.max(MIN_SIZE_PT, element.width * scaleX),
        height: Math.max(MIN_SIZE_PT, element.height * scaleY),
      };
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}

/** Position of a node drawn from an element that cannot be selected, dragged or edited. */
interface StaticNodeProps {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly listening: boolean;
}

function ImageNode({ element, common }: { readonly element: ImageElement; readonly common: CommonNodeProps | StaticNodeProps }) {
  // react-konva 的 Stage 會橋接 React context，Konva 子樹內可以直接讀取專案 context
  const { resolveSrc } = useProject();
  const [image, status] = useImage(resolveSrc(element.src));
  if (status !== "loaded") {
    // 載入中或失敗時以灰框佔位，物件仍可選取與移動
    return <Rect {...common} width={element.width} height={element.height} fill="#e5e5e5" dash={[6, 4]} stroke="#a3a3a3" />;
  }
  return <KonvaImage {...common} image={image} width={element.width} height={element.height} />;
}

// Transformer 以 Group 的外框決定控制框；超出圖形的文字不能算進去，否則控制框變大、拖曳換算的 scale 也會錯。
// Konva 的 Container.getClientRect 會略過寬高為 0 的子節點，所以讓文字節點回報空的外框。
function excludeFromBounds(node: Konva.Text | null): void {
  if (node) node.getClientRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
}

function ShapeLabelText({ shape, label, hidden }: { readonly shape: ShapeElement; readonly label: ShapeLabel; readonly hidden: boolean }) {
  const frame = labelFrame(shape);
  // 垂直對齊需要文字高度：用和匯出相同的離畫面 Konva.Text 量測分行
  const lineCount = useMemo(
    () => measureTextLayout(labelAsText(shape, label, { x: 0, y: 0 })).lines.length,
    // 分行只取決於文字、樣式與換行寬度；圖形的位置、旋轉改變時不必重新量測
    [label, frame.width],
  );
  const y = frame.y + labelTextOffset(frame, label.verticalAlign, textBlockHeight(lineCount, label.fontSize));
  return (
    <Text
      ref={excludeFromBounds}
      x={frame.x}
      y={y}
      width={frame.width}
      text={label.text}
      fontSize={label.fontSize}
      fontFamily={label.fontFamily}
      {...konvaTextStyle(label)}
      align={label.align}
      fill={label.fill}
      lineHeight={TEXT_LINE_HEIGHT}
      visible={!hidden}
    />
  );
}

function ShapeBody({ shape }: { readonly shape: ShapeElement }) {
  const { geometry, width, height, fill } = shape;
  const stroke = konvaStroke(shape.stroke);
  switch (geometry.kind) {
    case "rect":
      return <Rect width={width} height={height} cornerRadius={geometry.cornerRadius} fill={fill} {...stroke} />;
    case "ellipse":
      return <Ellipse x={width / 2} y={height / 2} radiusX={width / 2} radiusY={height / 2} fill={fill} {...stroke} />;
    case "polygon":
    case "star":
      return <Line points={shapePoints(geometry, width, height) ?? []} closed fill={fill} {...stroke} />;
    default: {
      const exhaustive: never = geometry;
      return exhaustive;
    }
  }
}

/**
 * Draws a shape that is not a document element (the page number): same look as a shape element,
 * but it cannot be selected, dragged or edited.
 *
 * Args:
 *   props.shape: Shape in page coordinates.
 *
 * Returns:
 *   Konva group that ignores pointer events.
 */
export function StaticShape({ shape, listening = false }: { readonly shape: ShapeElement; readonly listening?: boolean }) {
  return (
    <Group x={shape.x} y={shape.y} rotation={shape.rotation} listening={listening}>
      <ShapeBody shape={shape} />
      {shape.label && shape.label.text !== "" && <ShapeLabelText shape={shape} label={shape.label} hidden={false} />}
    </Group>
  );
}

// 文字節點的內容與樣式；可編輯的 ElementNode 與靜態的 StaticElement 共用，兩邊才不會畫得不一樣
function textAttrs(element: TextElement) {
  return {
    text: element.text,
    width: element.width,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    ...konvaTextStyle(element),
    align: element.align,
    fill: element.fill,
    lineHeight: TEXT_LINE_HEIGHT,
  };
}

/**
 * Draws an element that cannot be selected, dragged or edited: the content a page inherits from
 * its master pages, or the elements of the facing page in spread view. Looks exactly like the same
 * element drawn by `ElementNode`.
 *
 * Args:
 *   props.element: Element in page coordinates.
 *   props.listening: True to receive presses (the facing page: a press switches to that page);
 *     false (default) lets them through (master page content).
 *
 * Returns:
 *   Konva node.
 */
export function StaticElement({ element, listening = false }: { readonly element: CanvasElement; readonly listening?: boolean }) {
  const position: StaticNodeProps = { x: element.x, y: element.y, rotation: element.rotation, listening };
  switch (element.type) {
    case "text":
      return <Text {...position} {...textAttrs(element)} />;
    case "shape":
      return <StaticShape shape={element} listening={listening} />;
    case "image":
      return <ImageNode element={element} common={position} />;
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}

/**
 * Renders one canvas element as the matching Konva node.
 *
 * Args:
 *   props: Element model, visibility and interaction callbacks.
 *
 * Returns:
 *   Konva node.
 */
export function ElementNode({ element, textHidden, onSelect, onChange, onMoveEnd, onEditText, dragBound }: ElementNodeProps) {
  const common: CommonNodeProps = {
    id: element.id,
    name: ELEMENT_NODE_NAME,
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    draggable: true,
    // 吸附格線：由畫布決定位置（多選時整組依按下的物件對齊）
    dragBoundFunc: dragBound === null ? undefined : (pos) => dragBound(element.id, pos),
    // 編輯文字物件時整個節點隱藏；圖形只隱藏它的文字（ShapeLabelText）
    visible: !(textHidden && element.type === "text"),
    onMouseDown: (event) => onSelect(element.id, isAdditive(event.evt)),
    onTouchStart: () => onSelect(element.id, false),
    onDragEnd: (event) => onMoveEnd(element.id, event.target),
    onTransformEnd: (event) => onChange(element.id, bakeTransform(element, event.target)),
  };
  // Ctrl+連點兩下是在加入 / 移出選取，不是要編輯文字
  const editOnDblClick = (event: KonvaEventObject<MouseEvent>): void => {
    if (!isAdditive(event.evt)) onEditText(element.id);
  };

  switch (element.type) {
    case "text":
      return (
        <Text
          {...common}
          {...textAttrs(element)}
          onDblClick={editOnDblClick}
          onDblTap={() => onEditText(element.id)}
          onTransform={(event) => {
            // 文字只調整換行寬度，不拉伸字形
            const node = event.target;
            node.setAttrs({ width: Math.max(MIN_SIZE_PT, node.width() * node.scaleX()), scaleX: 1, scaleY: 1 });
          }}
        />
      );
    case "shape":
      // Group 的原點是外框左上角；Transformer 掛在 Group 上，之後的圖形內文字也放在這裡
      return (
        <Group {...common} onDblClick={editOnDblClick} onDblTap={() => onEditText(element.id)}>
          <ShapeBody shape={element} />
          {element.label && element.label.text !== "" && (
            <ShapeLabelText shape={element} label={element.label} hidden={textHidden} />
          )}
        </Group>
      );
    case "image":
      return <ImageNode element={element} common={common} />;
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}
