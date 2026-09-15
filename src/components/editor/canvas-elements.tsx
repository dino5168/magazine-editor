import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Ellipse, Image as KonvaImage, Rect, RegularPolygon, Star, Text } from "react-konva";
import useImage from "use-image";
import { TEXT_LINE_HEIGHT } from "@/lib/editor/geometry";
import type { CanvasElement, ElementId, ElementPatch, ImageElement } from "@/lib/editor/types";

/** Smallest width/height (pt) an element can be resized to. */
const MIN_SIZE_PT = 4;

export const ELEMENT_NODE_NAME = "element";

export interface ElementNodeProps {
  readonly element: CanvasElement;
  readonly hidden: boolean;
  readonly onSelect: (id: ElementId) => void;
  readonly onChange: (id: ElementId, patch: ElementPatch) => void;
  readonly onEditText: (id: ElementId) => void;
}

interface CommonNodeProps {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly draggable: true;
  readonly visible: boolean;
  readonly onMouseDown: () => void;
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
    case "rect":
    case "image":
      return {
        ...base,
        width: Math.max(MIN_SIZE_PT, element.width * scaleX),
        height: Math.max(MIN_SIZE_PT, element.height * scaleY),
      };
    case "ellipse":
      return {
        ...base,
        radiusX: Math.max(MIN_SIZE_PT / 2, element.radiusX * scaleX),
        radiusY: Math.max(MIN_SIZE_PT / 2, element.radiusY * scaleY),
      };
    case "polygon":
      return { ...base, radius: Math.max(MIN_SIZE_PT / 2, element.radius * scaleX) };
    case "star":
      return {
        ...base,
        innerRadius: Math.max(MIN_SIZE_PT / 4, element.innerRadius * scaleX),
        outerRadius: Math.max(MIN_SIZE_PT / 2, element.outerRadius * scaleX),
      };
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}

function ImageNode({ element, common }: { readonly element: ImageElement; readonly common: CommonNodeProps }) {
  const [image, status] = useImage(element.src);
  if (status !== "loaded") {
    // 載入中或失敗時以灰框佔位，物件仍可選取與移動
    return <Rect {...common} width={element.width} height={element.height} fill="#e5e5e5" dash={[6, 4]} stroke="#a3a3a3" />;
  }
  return <KonvaImage {...common} image={image} width={element.width} height={element.height} />;
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
export function ElementNode({ element, hidden, onSelect, onChange, onEditText }: ElementNodeProps) {
  const common: CommonNodeProps = {
    id: element.id,
    name: ELEMENT_NODE_NAME,
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    draggable: true,
    visible: !hidden,
    onMouseDown: () => onSelect(element.id),
    onTouchStart: () => onSelect(element.id),
    onDragEnd: (event) => onChange(element.id, { x: event.target.x(), y: event.target.y() }),
    onTransformEnd: (event) => onChange(element.id, bakeTransform(element, event.target)),
  };

  switch (element.type) {
    case "text":
      return (
        <Text
          {...common}
          text={element.text}
          width={element.width}
          fontSize={element.fontSize}
          fontFamily={element.fontFamily}
          fontStyle={element.fontStyle}
          align={element.align}
          fill={element.fill}
          lineHeight={TEXT_LINE_HEIGHT}
          onDblClick={() => onEditText(element.id)}
          onDblTap={() => onEditText(element.id)}
          onTransform={(event) => {
            // 文字只調整換行寬度，不拉伸字形
            const node = event.target;
            node.setAttrs({ width: Math.max(MIN_SIZE_PT, node.width() * node.scaleX()), scaleX: 1, scaleY: 1 });
          }}
        />
      );
    case "rect":
      return (
        <Rect
          {...common}
          width={element.width}
          height={element.height}
          cornerRadius={element.cornerRadius}
          fill={element.fill}
        />
      );
    case "ellipse":
      return <Ellipse {...common} radiusX={element.radiusX} radiusY={element.radiusY} fill={element.fill} />;
    case "polygon":
      return <RegularPolygon {...common} sides={element.sides} radius={element.radius} fill={element.fill} />;
    case "star":
      return (
        <Star
          {...common}
          numPoints={element.numPoints}
          innerRadius={element.innerRadius}
          outerRadius={element.outerRadius}
          fill={element.fill}
        />
      );
    case "image":
      return <ImageNode element={element} common={common} />;
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}
