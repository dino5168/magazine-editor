import { colorAlpha, withAlpha } from "./palette";
import { fitPaths, PathBuilder, svgPathCommands, type PathCommand } from "./shape-path";
import type { ShapeGeometry, Size, Stroke } from "./types";

// 圖形庫：每個圖形是「外框大小 + 參數 → 路徑」的公式，只寫在這裡（Rust 只畫編輯器算好的路徑）。
// 計畫與決定：docs/06-Plans-繪圖/01-繪圖-實作.md。外觀參考 draw.io「一般」分類，定義是自己寫的。

/** A shape-library parameter. */
export interface ShapePresetParam {
  /** Stored in the file (`ShapeGeometry.params`); never rename after release. */
  readonly name: string;
  /** Shown in the properties panel. */
  readonly label: string;
  /**
   * `ratio`: a fraction of a side, shown as % (the shape says which side), so it stretches with the
   * box; `pt`: a fixed length that does not stretch (clamped to what the box can hold).
   */
  readonly kind: "ratio" | "pt";
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

export type ShapeCategoryId = "basic" | "flow" | "arrows" | "callouts";

/** Panel groups, in display order. */
export const SHAPE_CATEGORIES: readonly { readonly id: ShapeCategoryId; readonly label: string }[] = [
  { id: "basic", label: "基本" },
  { id: "flow", label: "方塊與流程" },
  { id: "arrows", label: "箭頭" },
  { id: "callouts", label: "標註與旗幟" },
];

/**
 * What a shape draws, in pt relative to its box: `outline` is filled and stroked (closed
 * subpaths); `details` are drawn on top, stroked only (open or closed, never filled).
 */
export interface ShapePath {
  readonly outline: readonly PathCommand[];
  readonly details: readonly PathCommand[];
}

/** Parameter values after defaults and clamping, by name. */
export type ResolvedParams = Readonly<Record<string, number>>;

export interface ShapePreset {
  /** Stored in the file (`ShapeGeometry.preset`); never rename after release. */
  readonly id: string;
  readonly label: string;
  readonly category: ShapeCategoryId;
  /** Size of a shape created by a click (or from the elements panel). */
  readonly size: Size;
  readonly params: readonly ShapePresetParam[];
  /** The paths for a box; computed in pt so stretching never thickens the border. */
  readonly path: (box: Size, params: ResolvedParams) => ShapePath;
}

const NO_DETAILS: readonly PathCommand[] = [];

type Point = readonly [number, number];

// 一個封閉的多邊形子路徑
function polygon(points: readonly Point[]): PathCommand[] {
  const builder = new PathBuilder().moveTo(...points[0]);
  for (const point of points.slice(1)) builder.lineTo(...point);
  return builder.close().build();
}

// 只描邊的線段（每段一個子路徑，不封閉）
function lines(segments: readonly (readonly Point[])[]): PathCommand[] {
  return segments.flatMap((points) => {
    const builder = new PathBuilder().moveTo(...points[0]);
    for (const point of points.slice(1)) builder.lineTo(...point);
    return builder.build();
  });
}

function outlineOnly(outline: readonly PathCommand[]): ShapePath {
  return { outline, details: NO_DETAILS };
}

// 波浪：從 (x0, y) 到 (x1, y) 的半個波，往 bulge 方向凸出 depth（對稱的三次曲線最遠到控制點距離的 3/4，
// 所以控制點放在 4/3 · depth；控制點的 x 在兩端往內 1/4，前後兩段在接點的切線連成一直線）
function halfWave(builder: PathBuilder, x0: number, x1: number, y: number, depth: number): PathBuilder {
  const c = (4 / 3) * depth;
  const k = (x1 - x0) / 4;
  return builder.cubicTo(x0 + k, y + c, x1 - k, y + c, x1, y);
}

// 雲：以弧線寫的 SVG 路徑（座標任意），交給 svgpath 換成三次曲線，再拉伸到碰到外框四邊
const CLOUD_COMMANDS = svgPathCommands(
  "M25 60 A15 15 0 0 1 22 31 A20 20 0 0 1 52 18 A18 18 0 0 1 82 26 A17 17 0 0 1 88 58 A14 14 0 0 1 70 72 A18 18 0 0 1 40 74 A14 14 0 0 1 25 60 Z",
);
// 心形：同上（左右對稱，下尖）
const HEART_COMMANDS = svgPathCommands("M50 28 C50 8 22 -2 9 14 C-4 30 12 60 50 96 C88 60 104 30 91 14 C78 -2 50 8 50 28 Z");

// 對話框的尾巴：在本體下緣 [left, right] 之間開口，尖端在 (left, h)（漫畫式的斜尾巴）
interface Tail {
  readonly left: number;
  readonly right: number;
  readonly bodyHeight: number;
}

function calloutTail(
  { width: w, height: h }: Size,
  { position, base, length }: ResolvedParams,
  corner: number,
): Tail {
  const bodyHeight = h - Math.min(length, h / 2);
  const baseWidth = Math.min(base * w, Math.max(0, w - 2 * corner));
  const left = Math.min(Math.max(position * w - baseWidth / 2, corner), w - corner - baseWidth);
  return { left, right: left + baseWidth, bodyHeight };
}

const CALLOUT_PARAMS: readonly ShapePresetParam[] = [
  { name: "position", label: "尾巴位置", kind: "ratio", min: 0, max: 1, step: 0.01, default: 0.3 },
  { name: "base", label: "尾巴寬度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.15 },
  { name: "length", label: "尾巴長度", kind: "pt", min: 0, max: 1000, step: 1, default: 20 },
];

/** Every shape of the library, in panel order within each category. */
export const SHAPE_LIBRARY: readonly ShapePreset[] = [
  // ── 基本 ──
  {
    id: "rhombus",
    label: "菱形",
    category: "basic",
    size: { width: 120, height: 100 },
    params: [],
    path: ({ width: w, height: h }) => outlineOnly(polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])),
  },
  {
    id: "parallelogram",
    label: "平行四邊形",
    category: "basic",
    size: { width: 160, height: 100 },
    params: [{ name: "size", label: "斜邊寬度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.2 }],
    path: ({ width: w, height: h }, { size }) => outlineOnly(polygon([[size * w, 0], [w, 0], [w - size * w, h], [0, h]])),
  },
  {
    id: "trapezoid",
    label: "梯形",
    category: "basic",
    size: { width: 160, height: 100 },
    params: [{ name: "size", label: "斜邊寬度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.2 }],
    path: ({ width: w, height: h }, { size }) => outlineOnly(polygon([[size * w, 0], [w - size * w, 0], [w, h], [0, h]])),
  },
  {
    id: "hexagon",
    label: "六角形",
    category: "basic",
    size: { width: 140, height: 100 },
    params: [{ name: "size", label: "斜邊寬度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.25 }],
    path: ({ width: w, height: h }, { size }) => {
      const s = size * w;
      return outlineOnly(polygon([[s, 0], [w - s, 0], [w, h / 2], [w - s, h], [s, h], [0, h / 2]]));
    },
  },
  {
    id: "octagon",
    label: "八角形",
    category: "basic",
    size: { width: 120, height: 120 },
    // 切角 = 短邊的比例
    params: [{ name: "size", label: "切角大小", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.29 }],
    path: ({ width: w, height: h }, { size }) => {
      const c = size * Math.min(w, h);
      return outlineOnly(polygon([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]));
    },
  },
  {
    id: "cross",
    label: "十字",
    category: "basic",
    size: { width: 120, height: 120 },
    // 直臂寬 = 寬的比例、橫臂高 = 高的比例
    params: [{ name: "size", label: "粗細", kind: "ratio", min: 0.05, max: 1, step: 0.01, default: 0.33 }],
    path: ({ width: w, height: h }, { size }) => {
      const [a, b] = [((1 - size) * w) / 2, ((1 - size) * h) / 2];
      return outlineOnly(
        polygon([
          [a, 0], [w - a, 0], [w - a, b], [w, b], [w, h - b], [w - a, h - b],
          [w - a, h], [a, h], [a, h - b], [0, h - b], [0, b], [a, b],
        ]),
      );
    },
  },
  {
    id: "heart",
    label: "心形",
    category: "basic",
    size: { width: 120, height: 110 },
    params: [],
    path: ({ width, height }) => outlineOnly(fitPaths([HEART_COMMANDS], width, height)[0]),
  },
  {
    id: "cloud",
    label: "雲",
    category: "basic",
    size: { width: 160, height: 100 },
    params: [],
    path: ({ width, height }) => outlineOnly(fitPaths([CLOUD_COMMANDS], width, height)[0]),
  },

  // ── 方塊與流程 ──
  {
    id: "process",
    label: "程序",
    category: "flow",
    size: { width: 160, height: 100 },
    params: [{ name: "size", label: "線的位置", kind: "ratio", min: 0, max: 0.25, step: 0.01, default: 0.1 }],
    path: ({ width: w, height: h }, { size }) => {
      const s = size * w;
      return {
        outline: polygon([[0, 0], [w, 0], [w, h], [0, h]]),
        details: lines([[[s, 0], [s, h]], [[w - s, 0], [w - s, h]]]),
      };
    },
  },
  {
    id: "document",
    label: "文件",
    category: "flow",
    size: { width: 140, height: 110 },
    // 波浪高 = 高的比例；右半往上凸、左半往下凸到下緣
    params: [{ name: "size", label: "波浪高度", kind: "ratio", min: 0, max: 0.25, step: 0.01, default: 0.1 }],
    path: ({ width: w, height: h }, { size }) => {
      const d = size * h;
      const builder = new PathBuilder().moveTo(0, 0).lineTo(w, 0).lineTo(w, h - d);
      halfWave(builder, w, w / 2, h - d, -d);
      halfWave(builder, w / 2, 0, h - d, d);
      return outlineOnly(builder.close().build());
    },
  },
  {
    id: "card",
    label: "卡片",
    category: "flow",
    size: { width: 140, height: 100 },
    params: [{ name: "size", label: "缺角", kind: "pt", min: 0, max: 1000, step: 1, default: 20 }],
    path: ({ width: w, height: h }, { size }) => {
      const c = Math.min(size, Math.min(w, h) / 2);
      return outlineOnly(polygon([[c, 0], [w, 0], [w, h], [0, h], [0, c]]));
    },
  },
  {
    id: "note",
    label: "便條紙",
    category: "flow",
    size: { width: 120, height: 140 },
    params: [{ name: "size", label: "折角", kind: "pt", min: 0, max: 1000, step: 1, default: 20 }],
    path: ({ width: w, height: h }, { size }) => {
      const f = Math.min(size, Math.min(w, h) / 2);
      return {
        outline: polygon([[0, 0], [w - f, 0], [w, f], [w, h], [0, h]]),
        details: lines([[[w - f, 0], [w - f, f], [w, f]]]),
      };
    },
  },
  {
    id: "cylinder",
    label: "圓柱",
    category: "flow",
    size: { width: 100, height: 120 },
    params: [{ name: "size", label: "頂部高度", kind: "pt", min: 0, max: 1000, step: 1, default: 15 }],
    path: ({ width: w, height: h }, { size }) => {
      // 頂部橢圓高 size（最多半個圖形高）；外框 = 上半橢圓 → 右邊 → 下半橢圓 → 左邊
      const ry = Math.min(size, h / 2) / 2;
      const rx = w / 2;
      const outline = new PathBuilder()
        .moveTo(0, ry)
        .arc(rx, ry, rx, ry, 180, 360)
        .lineTo(w, h - ry)
        .arc(rx, h - ry, rx, ry, 0, 180)
        .close()
        .build();
      // 頂部橢圓的前緣（下半弧），只描邊
      const details = new PathBuilder().moveTo(0, ry).arc(rx, ry, rx, ry, 180, 0).build();
      return { outline, details };
    },
  },
  {
    id: "cube",
    label: "立方體",
    category: "flow",
    size: { width: 120, height: 120 },
    params: [{ name: "size", label: "深度", kind: "pt", min: 0, max: 1000, step: 1, default: 20 }],
    path: ({ width: w, height: h }, { size }) => {
      // 正面在左下，上面與右面往右上斜
      const d = Math.min(size, Math.min(w, h) / 2);
      return {
        outline: polygon([[d, 0], [w, 0], [w, h - d], [w - d, h], [0, h], [0, d]]),
        details: lines([[[0, d], [w - d, d], [w - d, h]], [[w - d, d], [w, 0]]]),
      };
    },
  },
  {
    id: "internalStorage",
    label: "內部儲存",
    category: "flow",
    size: { width: 120, height: 100 },
    params: [{ name: "size", label: "線的位置", kind: "pt", min: 0, max: 1000, step: 1, default: 15 }],
    path: ({ width: w, height: h }, { size }) => {
      const s = Math.min(size, Math.min(w, h) / 2);
      return {
        outline: polygon([[0, 0], [w, 0], [w, h], [0, h]]),
        details: lines([[[s, 0], [s, h]], [[0, s], [w, s]]]),
      };
    },
  },
  {
    id: "tape",
    label: "波浪帶",
    category: "flow",
    size: { width: 160, height: 100 },
    // 上下兩條平行的波浪：左半往上、右半往下
    params: [{ name: "size", label: "波浪高度", kind: "ratio", min: 0, max: 0.2, step: 0.01, default: 0.1 }],
    path: ({ width: w, height: h }, { size }) => {
      const d = size * h;
      const builder = new PathBuilder().moveTo(0, d);
      halfWave(builder, 0, w / 2, d, -d);
      halfWave(builder, w / 2, w, d, d);
      builder.lineTo(w, h - d);
      halfWave(builder, w, w / 2, h - d, d);
      halfWave(builder, w / 2, 0, h - d, -d);
      return outlineOnly(builder.close().build());
    },
  },
  {
    id: "delay",
    label: "延遲",
    category: "flow",
    size: { width: 140, height: 100 },
    params: [],
    path: ({ width: w, height: h }) => {
      // D 形：左半是矩形，右半是半個橢圓
      const outline = new PathBuilder()
        .moveTo(0, 0)
        .lineTo(w / 2, 0)
        .arc(w / 2, h / 2, w / 2, h / 2, 270, 450)
        .lineTo(0, h)
        .close()
        .build();
      return outlineOnly(outline);
    },
  },
  {
    id: "dataStorage",
    label: "資料儲存",
    category: "flow",
    size: { width: 160, height: 100 },
    // 左邊往外凸、右邊往內凹的弧；弧的深度 = 寬的比例
    params: [{ name: "size", label: "弧度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.15 }],
    path: ({ width: w, height: h }, { size }) => {
      // 兩邊各一條對稱的三次曲線，最凸處 = 控制點距離的 3/4，所以控制點離邊 4/3 · s。
      // 控制點放在高的 1/4、3/4（不是 0、h）：曲線和上下邊交成一個角，不會原路折返；
      // 折返時 miter 無限長，畫布、Typst、SVG 各自截斷的方式不同（疊圖比對抓到的）
      const s = size * w;
      const c = (4 / 3) * s;
      const outline = new PathBuilder()
        .moveTo(s, 0)
        .lineTo(w, 0)
        .cubicTo(w - c, h / 4, w - c, (3 * h) / 4, w, h)
        .lineTo(s, h)
        .cubicTo(s - c, (3 * h) / 4, s - c, h / 4, s, 0)
        .close()
        .build();
      return outlineOnly(outline);
    },
  },

  // ── 箭頭 ──
  {
    id: "step",
    label: "步驟",
    category: "arrows",
    size: { width: 160, height: 100 },
    params: [{ name: "size", label: "尖端長度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.2 }],
    path: ({ width: w, height: h }, { size }) => {
      const t = size * w;
      return outlineOnly(polygon([[0, 0], [w - t, 0], [w, h / 2], [w - t, h], [0, h], [t, h / 2]]));
    },
  },
  {
    id: "pentagonArrow",
    label: "五邊形箭頭",
    category: "arrows",
    size: { width: 160, height: 100 },
    params: [{ name: "size", label: "尖端長度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.2 }],
    path: ({ width: w, height: h }, { size }) => {
      const t = size * w;
      return outlineOnly(polygon([[0, 0], [w - t, 0], [w, h / 2], [w - t, h], [0, h]]));
    },
  },
  {
    id: "arrowRight",
    label: "粗箭頭",
    category: "arrows",
    size: { width: 160, height: 80 },
    params: [
      { name: "head", label: "頭部長度", kind: "ratio", min: 0, max: 1, step: 0.01, default: 0.35 },
      { name: "body", label: "箭身粗細", kind: "ratio", min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
    path: ({ width: w, height: h }, { head, body }) => {
      const [hx, by] = [w - head * w, ((1 - body) * h) / 2];
      return outlineOnly(polygon([[0, by], [hx, by], [hx, 0], [w, h / 2], [hx, h], [hx, h - by], [0, h - by]]));
    },
  },
  {
    id: "arrowDouble",
    label: "雙向粗箭頭",
    category: "arrows",
    size: { width: 180, height: 80 },
    params: [
      { name: "head", label: "頭部長度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.25 },
      { name: "body", label: "箭身粗細", kind: "ratio", min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
    path: ({ width: w, height: h }, { head, body }) => {
      const [hl, by] = [head * w, ((1 - body) * h) / 2];
      return outlineOnly(
        polygon([
          [0, h / 2], [hl, 0], [hl, by], [w - hl, by], [w - hl, 0],
          [w, h / 2], [w - hl, h], [w - hl, h - by], [hl, h - by], [hl, h],
        ]),
      );
    },
  },

  // ── 標註與旗幟 ──
  {
    id: "callout",
    label: "對話框",
    category: "callouts",
    size: { width: 160, height: 110 },
    params: CALLOUT_PARAMS,
    path: (box, params) => {
      const { width: w } = box;
      const { left, right, bodyHeight: bh } = calloutTail(box, params, 0);
      return outlineOnly(polygon([[0, 0], [w, 0], [w, bh], [right, bh], [left, box.height], [left, bh], [0, bh]]));
    },
  },
  {
    id: "calloutRound",
    label: "圓角對話框",
    category: "callouts",
    size: { width: 160, height: 110 },
    params: [...CALLOUT_PARAMS, { name: "radius", label: "圓角", kind: "pt", min: 0, max: 1000, step: 1, default: 12 }],
    path: (box, params) => {
      const { width: w, height: h } = box;
      const r = Math.min(params.radius, w / 2, (h - Math.min(params.length, h / 2)) / 2);
      const { left, right, bodyHeight: bh } = calloutTail(box, params, r);
      const outline = new PathBuilder()
        .moveTo(r, 0)
        .lineTo(w - r, 0)
        .arc(w - r, r, r, r, 270, 360)
        .lineTo(w, bh - r)
        .arc(w - r, bh - r, r, r, 0, 90)
        .lineTo(right, bh)
        .lineTo(left, h)
        .lineTo(left, bh)
        .lineTo(r, bh)
        .arc(r, bh - r, r, r, 90, 180)
        .lineTo(0, r)
        .arc(r, r, r, r, 180, 270)
        .close()
        .build();
      return outlineOnly(outline);
    },
  },
  {
    id: "ribbon",
    label: "緞帶橫幅",
    category: "callouts",
    size: { width: 200, height: 70 },
    // 中間的帶子在上，兩端（燕尾）往下錯開 fold，帶子和兩端交界處畫細節線
    params: [
      { name: "size", label: "末端長度", kind: "ratio", min: 0, max: 0.4, step: 0.01, default: 0.15 },
      { name: "fold", label: "折邊", kind: "pt", min: 0, max: 1000, step: 1, default: 10 },
    ],
    path: ({ width: w, height: h }, { size, fold }) => {
      const e = size * w;
      const f = Math.min(fold, h / 2);
      const [n, mid] = [e * 0.4, (f + h) / 2];
      return {
        outline: polygon([
          [e, 0], [w - e, 0], [w - e, f], [w, f], [w - n, mid], [w, h], [w - e, h],
          [w - e, h - f], [e, h - f], [e, h], [0, h], [n, mid], [0, f], [e, f],
        ]),
        details: lines([[[e, f], [e, h - f]], [[w - e, f], [w - e, h - f]]]),
      };
    },
  },
  {
    id: "tag",
    label: "標籤",
    category: "callouts",
    size: { width: 140, height: 80 },
    params: [{ name: "size", label: "尖端長度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.2 }],
    path: ({ width: w, height: h }, { size }) => {
      const t = size * w;
      return outlineOnly(polygon([[t, 0], [w, 0], [w, h], [t, h], [0, h / 2]]));
    },
  },
  {
    id: "banner",
    label: "燕尾旗",
    category: "callouts",
    size: { width: 160, height: 80 },
    params: [{ name: "size", label: "缺口深度", kind: "ratio", min: 0, max: 0.5, step: 0.01, default: 0.15 }],
    path: ({ width: w, height: h }, { size }) => outlineOnly(polygon([[0, 0], [w, 0], [w - size * w, h / 2], [w, h], [0, h]])),
  },
];

const BY_ID = new Map(SHAPE_LIBRARY.map((preset) => [preset.id, preset]));

/**
 * Finds a shape of the library.
 *
 * Args:
 *   id: `ShapeGeometry.preset`.
 *
 * Returns:
 *   The shape, or undefined for an id this version does not know.
 */
export function findShapePreset(id: string): ShapePreset | undefined {
  return BY_ID.get(id);
}

/**
 * Parameter values to draw with: stored values clamped to their range, defaults for missing or
 * non-finite ones; names the shape does not define are dropped.
 *
 * Args:
 *   preset: Library shape.
 *   params: Stored parameters.
 *
 * Returns:
 *   One value per parameter of the shape.
 */
export function resolvePresetParams(preset: ShapePreset, params: Readonly<Record<string, number>>): ResolvedParams {
  return Object.fromEntries(
    preset.params.map(({ name, min, max, default: fallback }) => {
      const value = params[name];
      return [name, typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback];
    }),
  );
}

/**
 * The paths of a shape-library shape stretched to its box.
 *
 * Args:
 *   geometry: The shape's geometry.
 *   width, height: Box size in pt.
 *
 * Returns:
 *   The paths, or null when this version does not know the shape (drawn as a placeholder).
 */
export function presetPath(
  geometry: Extract<ShapeGeometry, { kind: "preset" }>,
  width: number,
  height: number,
): ShapePath | null {
  const preset = findShapePreset(geometry.preset);
  if (!preset) return null;
  return preset.path({ width, height }, resolvePresetParams(preset, geometry.params));
}

/**
 * The number a parameter field shows: % for ratios, pt as stored.
 *
 * Args:
 *   param: Parameter definition.
 *   value: Resolved value.
 *
 * Returns:
 *   Displayed number.
 */
export function presetParamToField(param: ShapePresetParam, value: number): number {
  return param.kind === "ratio" ? value * 100 : value;
}

/**
 * The value to store for a number typed into a parameter field, clamped to the parameter's range.
 *
 * Args:
 *   param: Parameter definition.
 *   field: Number typed (% for ratios, pt otherwise).
 *
 * Returns:
 *   Value to store in `ShapeGeometry.params`.
 */
export function presetParamFromField(param: ShapePresetParam, field: number): number {
  const value = param.kind === "ratio" ? field / 100 : field;
  return Math.min(param.max, Math.max(param.min, value));
}

/** The unit shown after a parameter field. */
export function presetParamUnit(param: ShapePresetParam): string {
  return param.kind === "ratio" ? "%" : "pt";
}

/** How much darker than the fill the details are when the shape has no border. */
const DETAIL_DARKEN = 0.55;
/** Details of a shape without a border or with a fully transparent fill. */
const DETAIL_FALLBACK_COLOR = "#525252";

/**
 * The line style of a shape's details: the border when there is one; otherwise a 1 pt solid line
 * darker than the fill (a cylinder without a border still shows its top), keeping the fill's
 * opacity (user decision Q6).
 *
 * Args:
 *   stroke: The shape's border.
 *   fill: The shape's fill, `#rrggbb` or `#rrggbbaa`.
 *
 * Returns:
 *   Stroke for the details (never linked to a swatch).
 */
export function detailStroke(stroke: Stroke | null, fill: string): Stroke {
  if (stroke) return stroke;
  const alpha = colorAlpha(fill);
  if (alpha === 0) return { color: DETAIL_FALLBACK_COLOR, swatchId: null, width: 1, dash: "solid" };
  const channel = (offset: number) =>
    Math.round(parseInt(fill.slice(offset, offset + 2), 16) * DETAIL_DARKEN)
      .toString(16)
      .padStart(2, "0");
  return { color: withAlpha(`#${channel(1)}${channel(3)}${channel(5)}`, alpha), swatchId: null, width: 1, dash: "solid" };
}
