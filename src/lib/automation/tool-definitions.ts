/**
 * MCP 工具的定義：名稱、說明與參數 schema 的單一資料來源。
 *
 * 參數 schema 同時用來產生 MCP 的 JSON Schema（`mcp-tools.ts` → `src-tauri/mcp-tools.json`，
 * 橋接程式內嵌）與執行時驗證（`run-tool.ts`）。說明是寫給 AI 看的，要講清楚單位與限制。
 */
import { z } from "zod";
import { ADD_PAGES_MAX } from "@/lib/editor/add-pages";
import type { ShapeKind } from "@/lib/editor/element-factory";
import { FONT_OPTIONS } from "@/lib/editor/fonts";
import { MIN_ELEMENT_SIZE_PT } from "@/lib/editor/geometry";
import { MASTER_DEPTH_MAX } from "@/lib/editor/master-pages";
import { SHAPE_LIBRARY } from "@/lib/editor/shape-presets";
import { TEXT_STYLE_NAME_MAX_LENGTH } from "@/lib/editor/style-sheet";
import { TEXT_INDENT_MAX } from "@/lib/editor/text-indent";
import { LETTER_SPACING_MAX, LETTER_SPACING_MIN, LINE_HEIGHT_MAX, LINE_HEIGHT_MIN, TEXT_ALIGNS } from "@/lib/editor/text-style";
import {
  DOCUMENT_NAME_MAX_LENGTH,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  PAGE_NAME_MAX_LENGTH,
  LINE_ARROWHEADS,
  SHAPE_IMAGE_FITS,
  SHAPE_IMAGE_ZOOM_MAX,
  LINE_END_SCALE_MAX,
  LINE_END_SCALE_MIN,
  MAX_LINE_POINTS,
  STROKE_DASHES,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  SWATCH_NAME_MAX_LENGTH,
  TEXT_SHADOW_OFFSET_MAX,
} from "@/lib/editor/validation";
import { ITEM_NAME_MAX_CHARS } from "@/lib/library/types";
import { COMMAND_IDS, type CommandId } from "@/lib/menu/commands";
import { BATCH_OPS_MAX, NOT_IN_BATCH } from "./batch";
import { LAYOUT_ISSUES_MAX } from "./layout-check";

export interface ToolDefinition<Input extends z.ZodType = z.ZodType> {
  /** Short Chinese name shown by MCP clients. */
  readonly title: string;
  /** What the tool does, for the model: units, limits, what it returns. */
  readonly description: string;
  /** Arguments; always a strict object so unknown keys are reported instead of ignored. */
  readonly input: Input;
  /** Does not change the document or the app. */
  readonly readOnly: boolean;
}

const pageId = z.string().min(1).describe("頁面或主頁的 id（由 list_pages 取得）");
const elementId = z.string().min(1).describe("物件 id（由 list_elements 取得）");

/** Furthest an element may be placed or sized by a tool (pt, about 3.5 m); keeps typos out. */
export const COORDINATE_LIMIT_PT = 10000;
/** Longest text a tool may write into one element (characters). */
export const TEXT_MAX_LENGTH = 10000;

// 和 validation.ts 的 isElementColor / isHexColor 同規則；寫成 regex 才會出現在 JSON Schema 的 pattern
const elementColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/, "顏色必須是 #rrggbb 或 #rrggbbaa（aa 是不透明度）")
  .describe("#rrggbb 或 #rrggbbaa（aa = 不透明度，ff 不透明）");
const pageColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "頁面背景必須是 #rrggbb（不能透明）").describe("#rrggbb");
const swatchRef = z.string().min(1).describe("色票的名稱或 id（由 list_swatches 取得）");
// 顏色參數：直接給 hex（不連色票），或連到文件色票（改色票時跟著變）
const colorInput = z
  .union([
    elementColor,
    z.strictObject({
      swatch: swatchRef,
      opacity: z.number().min(0).max(1).optional().describe("不透明度 0–1，預設 1（色票本身不透明）"),
    }),
  ])
  .describe("#rrggbb / #rrggbbaa（不連色票），或 { swatch: 色票名稱或 id, opacity?: 0–1 }（連到文件色票）");
const pageColorInput = z
  .union([pageColor, z.strictObject({ swatch: swatchRef })])
  .describe("#rrggbb（不連色票），或 { swatch: 色票名稱或 id }（連到文件色票；背景不能透明）");
const swatchHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "色票顏色必須是 #rrggbb（不透明）").describe("#rrggbb（不透明）");
const swatchName = z.string().min(1).max(SWATCH_NAME_MAX_LENGTH * 2);

/** A color argument: hex, or a link to a document swatch. */
export type ColorInput = z.output<typeof colorInput>;
export type PageColorInput = z.output<typeof pageColorInput>;
const coordinate = z.number().min(-COORDINATE_LIMIT_PT).max(COORDINATE_LIMIT_PT);
const length = z.number().min(MIN_ELEMENT_SIZE_PT).max(COORDINATE_LIMIT_PT);
const rotation = z.number().min(-360).max(360).describe("旋轉角度（度，順時針，繞外框左上角）");

/** Built-in font names (the property panel's 字體 menu); project fonts are resolved in `edits.ts`. */
export const FONT_NAMES = FONT_OPTIONS.map((option) => option.label) as [string, ...string[]];

export const SHAPE_KINDS = ["rect", "roundedRect", "ellipse", "triangle", "star"] as const satisfies readonly ShapeKind[];

/** Every shape `add_shape` can make: the basic shapes, then the shape library's ids (`list_shapes`). */
export const SHAPE_NAMES = [...SHAPE_KINDS, ...SHAPE_LIBRARY.map((preset) => preset.id)] as [string, ...string[]];

const shapeName = z
  .enum(SHAPE_NAMES)
  .describe("圖形：rect 矩形、roundedRect 圓角矩形、ellipse 橢圓、triangle 三角形、star 星形，或圖形庫的 id（hexagon、cloud、cylinder…；名稱與參數見 list_shapes）");
// 圖片框的照片：素材庫的圖片＋填滿方式、對焦、縮放（同屬性面板的「照片」）
const shapeImage = z
  .strictObject({
    item: z
      .string()
      .min(1)
      .max(ITEM_NAME_MAX_CHARS)
      .optional()
      .describe("素材庫圖片的 id 或名稱（由 list_library_items 取得）；update_element 省略 = 保留目前的照片，只改下面的欄位"),
    fit: z.enum(SHAPE_IMAGE_FITS).optional().describe("cover 填滿（裁掉超出的部分，預設）/ contain 完整顯示（留白處看得到填色）"),
    focusX: z.number().min(0).max(1).optional().describe("照片比框寬時保留哪一段：0 左、0.5 置中（預設）、1 右"),
    focusY: z.number().min(0).max(1).optional().describe("照片比框高時保留哪一段：0 上、0.5 置中（預設）、1 下"),
    zoom: z.number().min(1).max(SHAPE_IMAGE_ZOOM_MAX).optional().describe(`以對焦點為中心放大，1–${SHAPE_IMAGE_ZOOM_MAX}（預設 1）`),
  })
  .describe("圖片框：把素材庫的圖片裁在圖形的外形裡（畫在填色之上、邊框與文字之下）");

const shapeParams = z
  .record(z.string(), z.number())
  .describe("圖形庫圖形的參數（名稱 → 值，見 list_shapes）：ratio 參數是 0–1 的比例、pt 參數是 pt；省略的參數用預設值，超出範圍時夾回");

const textStyleShape = {
  fontSize: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).describe("字級（pt）"),
  font: z
    .string()
    .min(1)
    .describe(`字型：內建的 ${FONT_NAMES.join(" / ")}，或專案字型的名稱或 id（由 list_fonts 取得）`),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  strikethrough: z.boolean(),
  align: z.enum(TEXT_ALIGNS),
  textColor: colorInput.describe("文字顏色：#rrggbb / #rrggbbaa，或 { swatch, opacity? } 連到文件色票"),
  shadow: z
    .strictObject({
      color: colorInput,
      offsetX: z.number().min(-TEXT_SHADOW_OFFSET_MAX).max(TEXT_SHADOW_OFFSET_MAX),
      offsetY: z.number().min(-TEXT_SHADOW_OFFSET_MAX).max(TEXT_SHADOW_OFFSET_MAX),
    })
    .nullable()
    .describe("文字硬陰影（不模糊，偏移以頁面方向為準，pt）；null = 沒有陰影"),
  lineHeight: z
    .number()
    .min(LINE_HEIGHT_MIN)
    .max(LINE_HEIGHT_MAX)
    .describe("行距：行與行基線的距離 ÷ 字級（倍數，例如 1.5）；預設 1.2，內建「內文」樣式 1.5"),
  letterSpacing: z
    .number()
    .min(LETTER_SPACING_MIN)
    .max(LETTER_SPACING_MAX)
    .describe("字距：每個字後面多加的距離，單位是字級的 1/1000（‰，例如 100 = 0.1 個字），可為負；預設 0"),
  indentLeft: z
    .number()
    .min(0)
    .max(TEXT_INDENT_MAX)
    .describe("左縮排：每一行離文字框左緣的距離，單位是「字」（字級的倍數，例如 2 = 兩個字寬）；預設 0"),
  indentRight: z.number().min(0).max(TEXT_INDENT_MAX).describe("右縮排：每一行離文字框右緣的距離（字）；預設 0"),
  indentFirstLine: z
    .number()
    .min(-TEXT_INDENT_MAX)
    .max(TEXT_INDENT_MAX)
    .describe(
      "首行縮排：每一段（以換行分段）第一行再往右移的距離（字），例如 2 = 首行縮排兩字；負值 = 首行突排，不可小於 −indentLeft（首行突排兩字 = indentLeft 2、indentFirstLine −2）；預設 0",
    ),
};

/** Optional text style arguments (text elements, the text inside shapes). */
export const textStyleInput = z.strictObject(textStyleShape).partial();
export type TextStyleInput = z.output<typeof textStyleInput>;

const stroke = z
  .strictObject({
    color: colorInput,
    width: z.number().min(STROKE_WIDTH_MIN).max(STROKE_WIDTH_MAX).describe("線寬（pt），畫在外框線中心"),
    dash: z.enum(STROKE_DASHES).describe("solid 實線、dashed 虛線、dotted 點線、dashDot 點劃線"),
  })
  .nullable()
  .describe("邊框；null = 沒有邊框");

const verticalAlign = z.enum(["top", "middle", "bottom"]).describe("圖形內文字的垂直對齊");

const linePoints = z
  .array(z.strictObject({ x: coordinate, y: coordinate }))
  .min(2)
  .max(MAX_LINE_POINTS)
  .describe(`線條的點（頁面座標 pt），2–${MAX_LINE_POINTS} 個，依序連起來`);
const linePath = z.enum(["straight", "smooth"]).describe("straight = 點與點之間連直線（2 點 = 直線，更多 = 折線）；smooth = 穿過每個點的平滑曲線");
const lineCompound = z.enum(["single", "double"]).describe("double = 雙線（兩條細線各 1/3 線寬、中間留空；只給 straight）");
const lineEnd = z
  .strictObject({
    arrowhead: z.enum(LINE_ARROWHEADS).describe("none 無、open 開放箭頭 >、triangle 實心三角"),
    scale: z.number().min(LINE_END_SCALE_MIN).max(LINE_END_SCALE_MAX).optional().describe("箭頭大小倍數：小 0.7、中 1（預設）、大 1.5"),
  })
  .describe("這一端的箭頭；箭頭永遠是實線，尖端在端點上");
const lineDash = z.enum(STROKE_DASHES).describe("solid 實線、dashed 虛線、dotted 點線、dashDot 點劃線");

const cornerRadiusValue = z.number().min(0).max(COORDINATE_LIMIT_PT);
const styleRef = z.string().min(1).describe("文字樣式的名稱或 id（由 list_text_styles 取得）");
const styleName = z.string().min(1).max(TEXT_STYLE_NAME_MAX_LENGTH * 2);

const STYLE_LINK_HELP =
  "style：連到文字樣式（名稱或 id），文字先取樣式的值，再套用這次給的樣式欄位（和樣式不同的欄位就是覆寫；之後改樣式時覆寫的欄位不跟著變）。";

const STYLE_HELP =
  "文字樣式欄位（都可省略）：fontSize、font（黑體 / 明體 / 楷體 / 圓體，或專案字型的名稱 / id，見 list_fonts）、bold、italic、underline、strikethrough、align（left / center / right / distributed（分散對齊：每一行首字貼左緣、末字貼右緣，含最後一行））、textColor、shadow、lineHeight（行距倍數）、letterSpacing（字距 ‰）、indentLeft / indentRight / indentFirstLine（段落縮排，單位「字」；首行負值 = 首行突排）。";

const COLOR_HELP =
  "顏色參數（textColor、shadow.color、fill、stroke.color）可以是 hex，也可以是 { swatch: 色票名稱或 id, opacity?: 0–1 } 連到文件色票（list_swatches）：連到色票的顏色會在改色票時跟著變。";

/** Every tool, keyed by its MCP name; `satisfies` keeps the literal schema types. */
export const TOOL_DEFINITIONS = {
  get_document: {
    title: "文件摘要",
    description:
      "取得目前在雜誌編輯軟體中開啟的文件摘要：名稱、頁數、主頁數、紙張尺寸、邊界、是否有未存檔變更、使用者正在看的頁面。長度單位一律是 pt（1/72 inch），座標原點是頁面左上角。",
    input: z.strictObject({}),
    readOnly: true,
  },
  list_pages: {
    title: "頁面清單",
    description:
      "列出所有頁面（依頁序，index 從 1 起算）與主頁：id、名稱、尺寸（pt）、背景色、套用的主頁、物件數。主頁是頁面共用的底層內容。",
    input: z.strictObject({}),
    readOnly: true,
  },
  list_elements: {
    title: "物件清單",
    description:
      "列出一個頁面或主頁上的物件，由最底層到最上層：id、類型（text / shape / image / line）、位置與尺寸（pt，外框旋轉前的左上角；線條是點的外框；文字物件沒有存高度，height 是依目前的字型與換行量出來的實際高度，可用來判斷會不會壓到下方物件）、旋轉角度、文字摘要（最多 80 字）。省略 pageId 時是使用者正在看的頁面。不含主頁帶來的物件與頁碼。",
    input: z.strictObject({ pageId: pageId.optional() }),
    readOnly: true,
  },
  get_element: {
    title: "物件內容",
    description: "取得單一物件的完整欄位，以及它所在的頁面 id 與圖層位置（0 = 最底層）。頁面與主頁上的物件都找得到。線條的 points 是相對於 x / y 的座標，另外附 pagePoints（頁面座標，和 add_line / update_element 的 points 同一套）。文字物件另外附 textHeight：依目前的字型與換行量出來的高度（pt；不能直接修改，改文字、width、字級或行高會跟著變）。圖片框（圖形的 image）另外附 photoItem：照片是素材庫的哪一張（id、名稱；素材庫已沒有時為 null）。",
    input: z.strictObject({ id: elementId }),
    readOnly: true,
  },
  check_layout: {
    title: "檢查版面",
    description:
      "檢查一個頁面或主頁的版面問題，文字用和畫布相同的方式量測（不是估計）。做完一頁或改了文字之後先呼叫它，issues 是空陣列就沒有問題。" +
      "問題類型：textOverflow（圖形內文字的行數超出圖形的文字區 direction: \"height\"，或一行比文字區寬 direction: \"width\"；overflowPt = 超出文字區多少 pt；矩形的文字只吃掉內距、還在外框裡時 severity: \"warning\"）；" +
      "overlap（有文字的物件和其他物件的外框重疊，文字只算字實際畫到的範圍、不是整個文字框；ids 是兩個物件、areaPt2 是重疊面積；相鄰不算、文字完全放在圖形或圖片裡面不算、線條不檢查）；" +
      "outOfPage（超出頁面，雙頁的中縫那一側可以越過；蓋滿整頁的背景不算）；outOfMargin（在頁面內但超出邊界，severity: \"warning\"；碰到頁緣的滿版物件不算）。" +
      "主頁帶來的物件、跨頁物件與頁碼也一起檢查：問題牽涉到它們時附 sources（master / facingPage / pageNumber），id 是原物件的（主頁物件要到主頁上改）。" +
      "外框用旋轉後的軸對齊框，旋轉的物件可能多報。最多回 " +
      `${LAYOUT_ISSUES_MAX} 筆（truncated = 沒列出的筆數）。省略 pageId 時是使用者正在看的頁面。不會修改文件，可以放進 batch。`,
    input: z.strictObject({ pageId: pageId.optional() }),
    readOnly: true,
  },
  list_commands: {
    title: "選單指令清單",
    description:
      "列出 App 選單列上的所有指令：id、名稱、在選單中的位置、快捷鍵、勾選項目（視圖、工具面板）目前是否勾選、能不能執行（不能時附原因，例如尚未實作）。",
    input: z.strictObject({}),
    readOnly: true,
  },
  run_command: {
    title: "執行選單指令",
    description:
      "執行一個選單指令，效果和使用者點選單相同（例如 file.save 儲存、view.grid 切換格線、panel.layers 開關圖層面板）。勾選項目會切換並回傳切換後的狀態。會開對話框的指令（開啟、另存、匯出、設定…）只負責打開對話框，由使用者在 App 裡完成，工具不等待結果。不能執行的指令（尚未實作）回傳錯誤、不做任何事。先用 list_commands 查看。",
    input: z.strictObject({
      id: z.enum(COMMAND_IDS as [CommandId, ...CommandId[]]).describe("指令 id（由 list_commands 取得）"),
    }),
    readOnly: false,
  },
  add_text: {
    title: "新增文字",
    description: `在頁面加一個文字物件（放在最上層），回傳新物件的 id。x / y 是文字框左上角（pt），width 是換行寬度（預設 280），高度跟著文字。省略 pageId = 使用者正在看的頁面；指定別頁不會切換使用者的畫面。沒有 style 時的預設：黑體 11 pt、靠左、#171717，不連到樣式。${STYLE_LINK_HELP}${STYLE_HELP}${COLOR_HELP} 一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      pageId: pageId.optional(),
      style: styleRef.optional(),
      text: z.string().min(1).max(TEXT_MAX_LENGTH).describe("文字內容，\\n 換行"),
      x: coordinate,
      y: coordinate,
      width: length.optional().describe("換行寬度（pt），預設 280"),
      rotation: rotation.optional(),
      ...textStyleInput.shape,
    }),
    readOnly: false,
  },
  add_shape: {
    title: "新增圖形",
    description: `在頁面加一個圖形（放在最上層），回傳新物件的 id。shape：rect 矩形、roundedRect 圓角矩形、ellipse 橢圓、triangle 三角形、star 星形，或圖形庫的圖形（六角形、雲、圓柱、箭頭、對話框…共 ${SHAPE_LIBRARY.length} 種，id 與參數用 list_shapes 查）；圖形撐滿 x / y / width / height 指定的外框（pt）。params 是圖形庫圖形的參數（只有圖形庫的圖形能給）。預設填色 #64748b、沒有邊框。text 是圖形內的文字（預設置中、垂直置中），${STYLE_HELP.replace("文字樣式欄位", "它的樣式欄位")} style 讓圖形內文字連到文字樣式（需要同時給 text）。image 把素材庫的圖片放進圖形（圖片框；item 必填）。${COLOR_HELP}省略 pageId = 使用者正在看的頁面。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      pageId: pageId.optional(),
      shape: shapeName,
      image: shapeImage.optional(),
      params: shapeParams.optional(),
      x: coordinate,
      y: coordinate,
      width: length,
      height: length,
      rotation: rotation.optional(),
      fill: colorInput.optional().describe("填色：#rrggbb / #rrggbbaa（#00000000 = 透明），或 { swatch, opacity? } 連到文件色票"),
      stroke: stroke.optional(),
      text: z.string().min(1).max(TEXT_MAX_LENGTH).optional().describe("圖形內的文字，\\n 換行"),
      style: styleRef.optional(),
      verticalAlign: verticalAlign.optional(),
      ...textStyleInput.shape,
    }),
    readOnly: false,
  },
  add_line: {
    title: "新增線條",
    description: `在頁面加一條線條或箭頭（放在最上層），回傳新物件的 id。points 是頁面座標（pt），2 點 = 直線，更多 = 折線；path: "smooth" = 穿過每個點的平滑曲線。start / end 是第一點 / 最後一點那一端的箭頭（預設都沒有）。預設線條：1 pt 實線、#171717（文件有內建「文字」色票時連到它，同使用者用線條工具畫的線）。compound: "double" = 雙線（只給 straight）。水平的分隔線：兩點同 y，要橫跨內容區就用 get_document 的邊界算 x。${COLOR_HELP}省略 pageId = 使用者正在看的頁面。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      pageId: pageId.optional(),
      points: linePoints,
      path: linePath.optional(),
      compound: lineCompound.optional(),
      color: colorInput.optional().describe("線條顏色：hex，或 { swatch, opacity? } 連到文件色票"),
      width: z.number().min(STROKE_WIDTH_MIN).max(STROKE_WIDTH_MAX).optional().describe("線寬（pt），預設 1"),
      dash: lineDash.optional(),
      start: lineEnd.optional(),
      end: lineEnd.optional(),
    }),
    readOnly: false,
  },
  update_element: {
    title: "修改物件",
    description: `修改一個物件（頁面或主頁上的都可以，用 id 找），只改有給的欄位，回傳是否有變更。位置與尺寸：x、y、width、height（文字物件沒有 height）、rotation。文字物件：text 與文字樣式。圖形：fill、stroke、cornerRadius（只有矩形）、shape（換成另一個圖形，位置、大小、樣式、文字不變，參數用新圖形的預設）、params（圖形庫圖形的參數，只改有給的）、text（圖形內文字，空字串 = 移除）、verticalAlign 與文字樣式（套用在圖形內文字）、image（圖片框的照片：給 item 換照片、只給 fit / focusX / focusY / zoom 調整目前的照片、null = 移除照片）。圖片只能改位置與尺寸。線條：x、y、rotation（整條移動 / 轉）、points（換掉所有點，頁面座標；不能同時給 x / y）、path、compound、stroke（不能是 null）、start、end（箭頭；scale 省略時保留原本的大小）。${STYLE_HELP}${COLOR_HELP} 給了不屬於該物件類型的欄位會回錯誤、不做修改。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      id: elementId,
      x: coordinate.optional(),
      y: coordinate.optional(),
      width: length.optional(),
      height: length.optional(),
      rotation: rotation.optional(),
      text: z.string().max(TEXT_MAX_LENGTH).optional().describe("文字內容；圖形的空字串 = 移除圖形內文字"),
      fill: colorInput.optional().describe("圖形填色：hex，或 { swatch, opacity? } 連到文件色票"),
      stroke: stroke.optional(),
      cornerRadius: z
        .union([cornerRadiusValue, z.tuple([cornerRadiusValue, cornerRadiusValue, cornerRadiusValue, cornerRadiusValue])])
        .optional()
        .describe("矩形圓角（pt）：一個數字 = 四個角一樣；四個數字 = [左上, 右上, 右下, 左下] 分別設定。每個角超過短邊一半時取一半"),
      shape: shapeName.optional(),
      params: shapeParams.optional(),
      image: shapeImage.nullable().optional(),
      verticalAlign: verticalAlign.optional(),
      points: linePoints.optional(),
      path: linePath.optional(),
      compound: lineCompound.optional(),
      start: lineEnd.optional(),
      end: lineEnd.optional(),
      ...textStyleInput.shape,
    }),
    readOnly: false,
  },
  delete_elements: {
    title: "刪除物件",
    description: "刪除同一頁（或同一主頁）上的一個或多個物件，回傳刪除的數量。一次呼叫 = 一筆復原紀錄，使用者可以 Ctrl+Z 或呼叫 undo 復原。",
    input: z.strictObject({ ids: z.array(elementId).min(1).max(500) }),
    readOnly: false,
  },
  add_page: {
    title: "新增頁面",
    description: `新增空白頁面，回傳新頁面的 id，並切到第一個新頁面（和使用者在 App 裡新增頁面相同）。省略的欄位用 App 的預設：加在最後一頁之後、1 頁、套用最後一頁的主頁（沒有就不套用）。新頁面的尺寸和插入處旁邊的頁面相同，背景用主頁的背景。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      count: z.int().min(1).max(ADD_PAGES_MAX).optional().describe(`頁數，1–${ADD_PAGES_MAX}`),
      pageNumber: z.int().min(1).optional().describe("插在第幾頁的前面或後面（1 起算），預設最後一頁"),
      side: z.enum(["before", "after"]).optional().describe("插在 pageNumber 那一頁之前或之後，預設 after"),
      masterId: z.string().min(1).nullable().optional().describe("套用的主頁 id；null = 不套用"),
    }),
    readOnly: false,
  },
  add_master: {
    title: "新增主頁",
    description: `新增一個空白主頁，回傳新主頁的 id 與名稱，並切到編輯這個主頁（和使用者在 App 裡新增主頁相同）。主頁放每一頁都要有的內容：之後用 add_text / add_shape 指定 pageId = 主頁 id 加內容，用 add_page 的 masterId 讓新頁面套用它。省略的欄位用 App 的預設：名稱 Master A、B…（第一個沒用過的）；正在編輯某個主頁時以它為基礎，否則不以任何主頁為基礎；背景 #ffffff。尺寸和使用者正在看的頁面相同。名稱最多 ${PAGE_NAME_MAX_LENGTH} 字；以主頁為基礎時，一條鏈最多 ${MASTER_DEPTH_MAX} 層、不能循環。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      name: z.string().min(1).max(PAGE_NAME_MAX_LENGTH * 2).optional().describe("主頁名稱"),
      parentId: z
        .string()
        .min(1)
        .nullable()
        .optional()
        .describe("以哪個主頁為基礎（先畫那個主頁的內容）；null = 不以任何主頁為基礎"),
      background: pageColorInput
        .optional()
        .describe("主頁背景：#rrggbb 或 { swatch } 連到文件色票；只在編輯主頁時看到，也是之後套用它的新頁面的預設背景"),
    }),
    readOnly: false,
  },
  set_page_master: {
    title: "頁面套用主頁",
    description:
      "讓一個或多個頁面套用某個主頁（主頁的內容畫在頁面物件之下），或取消套用（masterId = null）。只能指定頁面，不能指定主頁（主頁以誰為基礎是另一回事）。頁面的背景不變。不會切換使用者的畫面。已經套用該主頁的頁面不變；回傳 changed 表示有沒有任何頁面改變。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({
      pageIds: z.array(z.string().min(1)).min(1).max(500).describe("頁面 id（由 list_pages 的 pages 取得）"),
      masterId: z.string().min(1).nullable().describe("主頁 id（由 list_pages 的 masters 取得）；null = 取消套用"),
    }),
    readOnly: false,
  },
  list_text_styles: {
    title: "文字樣式清單",
    description:
      "列出文件的文字樣式（樣式表）：id、名稱、樣式欄位（同 add_text 的 font / fontSize / bold / italic / underline / strikethrough / align / textColor / shadow / lineHeight / letterSpacing）與連到它的文字數（文字物件與圖形內文字，含主頁）。文字連到樣式後，改樣式時沒被覆寫的欄位會跟著變。",
    input: z.strictObject({}),
    readOnly: true,
  },
  add_text_style: {
    title: "新增文字樣式",
    description: `在樣式表新增一個文字樣式，回傳 id。名稱必填（最多 ${TEXT_STYLE_NAME_MAX_LENGTH} 字、不可和其他樣式同名）；省略的欄位用內建「內文」的值（黑體 11 pt、靠左、#171717）。${STYLE_HELP} 新增後可以用 apply_text_style 或 add_text 的 style 讓文字連到它。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({ name: styleName.describe("樣式名稱"), ...textStyleInput.shape }),
    readOnly: false,
  },
  update_text_style: {
    title: "修改文字樣式",
    description: `修改文字樣式的欄位或名稱，只改有給的欄位。連到它的文字（所有頁面與主頁）會跟著改，但各自覆寫（和舊樣式不同）的欄位不變。${STYLE_HELP} 回傳是否有變更與受影響的文字數。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({ style: styleRef, name: styleName.optional().describe("新名稱"), ...textStyleInput.shape }),
    readOnly: false,
  },
  delete_text_style: {
    title: "刪除文字樣式",
    description: "刪除文字樣式。連到它的文字外觀不變，只是不再連到樣式。回傳取消連結的文字數。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({ style: styleRef }),
    readOnly: false,
  },
  apply_text_style: {
    title: "套用文字樣式",
    description:
      "讓同一頁（或同一主頁）的文字物件與圖形內文字連到文字樣式，並取樣式的所有值（清除覆寫）；style 為 null = 只取消連結、外觀不變。圖片與沒有文字的圖形會略過並列在 skipped。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({
      ids: z.array(elementId).min(1).max(500),
      style: styleRef.nullable().describe("文字樣式的名稱或 id；null = 取消連結"),
    }),
    readOnly: false,
  },
  list_shapes: {
    title: "圖形清單",
    description:
      "列出 add_shape 能建立的所有圖形：id、名稱、分類、點一下建立時的預設大小（pt），以及圖形庫圖形的參數（名稱、說明、ratio = 0–1 的比例 / pt = 固定長度、範圍、預設值）。基本圖形（rect、roundedRect、ellipse、triangle、star）沒有參數，矩形圓角用 update_element 的 cornerRadius。",
    input: z.strictObject({}),
    readOnly: true,
  },
  list_fonts: {
    title: "字型清單",
    description:
      "列出可用的字型：內建字型（黑體 / 明體 / 楷體 / 圓體）與使用者匯入這份文件的專案字型（id、名稱、缺字時用的內建字型種類、有沒有粗體檔、授權、使用數）。文字樣式參數 font 給名稱或 id 就用那套字型。專案字型只能由使用者在 App 的「設定 → 文件 → 字型...」匯入；沒有粗體檔的字型，bold 看起來和一般相同。",
    input: z.strictObject({}),
    readOnly: true,
  },
  list_swatches: {
    title: "色票清單",
    description:
      "列出文件色票（具名、不透明的顏色）：id、名稱、顏色 #rrggbb、連到它的顏色數（物件的文字 / 填色 / 邊框 / 陰影、頁面與主頁背景、文字樣式、頁碼都算）。顏色參數給 { swatch: 名稱或 id } 就連到色票；改色票（update_swatch）時，連到它的地方一起變（各自的不透明度保留）。",
    input: z.strictObject({}),
    readOnly: true,
  },
  add_swatch: {
    title: "新增色票",
    description: `新增一個文件色票，回傳 id。名稱必填（最多 ${SWATCH_NAME_MAX_LENGTH} 字、不可和其他色票同名）；顏色 #rrggbb（不透明，透明度在使用的地方用 opacity 設定）。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({ name: swatchName.describe("色票名稱，例如「品牌紅」"), color: swatchHex }),
    readOnly: false,
  },
  update_swatch: {
    title: "修改色票",
    description:
      "修改色票的名稱或顏色，只改有給的欄位。改顏色時，所有連到它的地方（所有頁面與主頁、文字樣式、頁碼）一起變，各自的不透明度保留。回傳是否有變更與連到它的顏色數。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({ swatch: swatchRef, name: swatchName.optional().describe("新名稱"), color: swatchHex.optional() }),
    readOnly: false,
  },
  delete_swatch: {
    title: "刪除色票",
    description:
      "刪除色票。連到它的地方：給 replaceWith（另一個色票的名稱或 id）時改成那個色票（各自的不透明度保留）；省略或 null 時保留原本的顏色、只取消連結。回傳受影響的顏色數。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({
      swatch: swatchRef,
      replaceWith: swatchRef.nullable().optional().describe("改連到這個色票；省略或 null = 保留顏色、取消連結"),
    }),
    readOnly: false,
  },
  list_library_items: {
    title: "素材清單",
    description:
      "列出專案素材庫（使用者匯入的圖片、文字檔、音訊）的資料夾與素材，新匯入的在前。素材：id、名稱、種類（image / text / audio）、所在資料夾路徑（null = 未分類）、檔案大小（bytes）；圖片另有像素尺寸 width / height，文字檔另有開頭摘錄。可依種類、名稱（包含，不分大小寫）、資料夾（含子資料夾）篩選；垃圾桶裡的素材預設不列，includeTrashed 為 true 時排在最後。新增圖片素材用 import_library_item；刪除、移動素材不能用工具。",
    input: z.strictObject({
      kind: z.enum(["image", "text", "audio"]).optional().describe("只列這一種素材"),
      query: z.string().max(ITEM_NAME_MAX_CHARS).optional().describe("名稱包含這段文字（不分大小寫）"),
      folderId: z.string().min(1).optional().describe("只列這個資料夾（含子資料夾）的素材；id 由本工具回傳的 folders 取得"),
      includeTrashed: z.boolean().optional().describe("也列出垃圾桶裡的素材（預設 false）"),
    }),
    readOnly: true,
  },
  import_library_item: {
    title: "匯入圖片到素材庫",
    description:
      "把這台電腦上的圖片檔匯入專案的素材庫（和使用者在 App 裡匯入相同：檔案複製進專案資料夾），回傳素材的 itemId、名稱、所在資料夾路徑、像素尺寸 width / height 與 status。" +
      "之後用 place_library_item 放到頁面，或用 add_shape / update_element 的 image 放進圖形。" +
      "path 是圖片檔的絕對路徑（例如其他工具產生或下載的圖片）；支援 PNG、JPEG、WebP、GIF、SVG，單檔 20 MB 以內，內容必須是能顯示的圖片。" +
      "folderId 省略 = 未分類（id 由 list_library_items 的 folders 取得）；name 省略 = 檔名（含副檔名，和使用者在 App 匯入相同）。" +
      "內容相同的檔案已經在素材庫時不會重複加入：status 是 duplicate，回傳原本那一筆（資料夾與名稱不變）；它在垃圾桶時還原到 folderId，status 是 restored；其他情況 status 是 new。" +
      "素材庫的變更立即存檔，不能用 undo 復原；這個工具不能放進 batch（先單獨匯入，再把放到頁面的操作放進 batch）。",
    input: z.strictObject({
      path: z.string().min(1).max(4096).describe("圖片檔的絕對路徑，例如 C:\\Users\\me\\Pictures\\cover.png"),
      folderId: z.string().min(1).optional().describe("放進這個資料夾；省略 = 未分類"),
      name: z
        .string()
        .min(1)
        .max(ITEM_NAME_MAX_CHARS * 2)
        .optional()
        .describe(`素材名稱（最多 ${ITEM_NAME_MAX_CHARS} 字）；省略 = 檔名（含副檔名）`),
    }),
    readOnly: false,
  },
  place_library_item: {
    title: "把素材放到頁面",
    description:
      "把素材庫裡的圖片放到頁面或主頁（放在最上層），回傳新物件的 id 與尺寸（pt）。item 是素材 id 或名稱（名稱要完全相符；同名的素材不只一個時請改用 id）。x / y 是圖片外框左上角（pt），省略的那一軸置中於頁面。width 省略時和使用者從素材面板放到頁面相同：原始像素當 pt，太大時縮到頁面寬、高的一半以內；給 width 時高度依原圖比例算（要改比例再用 update_element）。省略 pageId = 使用者正在看的頁面；指定別頁不會切換使用者的畫面。目前只能放圖片：文字檔請讀 list_library_items 的摘錄後用 add_text，音訊不能放到頁面，垃圾桶裡的素材要使用者先還原。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({
      item: z.string().min(1).max(ITEM_NAME_MAX_CHARS).describe("素材 id 或名稱（由 list_library_items 取得）"),
      pageId: pageId.optional(),
      x: coordinate.optional(),
      y: coordinate.optional(),
      width: length.optional().describe("寬度（pt），高度依原圖比例"),
    }),
    readOnly: false,
  },
  rename_page: {
    title: "頁面改名",
    description: `修改頁面或主頁的名稱（最多 ${PAGE_NAME_MAX_LENGTH} 字，前後空白會去掉）。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({ pageId, name: z.string().min(1).max(PAGE_NAME_MAX_LENGTH * 2) }),
    readOnly: false,
  },
  set_page_background: {
    title: "頁面背景色",
    description:
      "設定頁面或主頁的背景色：#rrggbb（不能透明），或 { swatch: 色票名稱或 id } 連到文件色票（改色票時跟著變）。主頁的背景不會套到使用它的頁面上（每頁有自己的背景）。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({ pageId, color: pageColorInput }),
    readOnly: false,
  },
  rename_document: {
    title: "文件改名",
    description: `修改文件名稱（最多 ${DOCUMENT_NAME_MAX_LENGTH} 字）。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({ name: z.string().min(1).max(DOCUMENT_NAME_MAX_LENGTH * 2) }),
    readOnly: false,
  },
  batch: {
    title: "批次執行",
    description:
      `一次執行多個工具操作（最多 ${BATCH_OPS_MAX} 個），省去一個一個呼叫的來回。ops 的每一項是 { tool: 工具名稱, args: 那個工具的參數 }，參數與錯誤訊息和單獨呼叫那個工具完全相同。` +
      "依序執行；任何一個失敗就整批退回、文件不變，錯誤訊息指出是 ops[N]（0 起算）。全部成功才套用，整批是一筆復原（使用者按一次 Ctrl+Z 全部撤銷）。" +
      '引用前面操作的回傳值：參數值寫成 { "$ref": "<第幾個操作>.<欄位路徑>" }，例如第 0 個是 add_page 時用 { "$ref": "0.pages.0.id" }（新頁面的 id）、第 1 個是 add_text 時用 { "$ref": "1.id" }；陣列用數字，只能引用前面的操作。' +
      `查詢工具（list_elements 等）可以放進批次，看到的是批次進行到那一步的文件。${[...NOT_IN_BATCH].join("、")} 不能放進批次。成功時回傳 { results: [每個操作的回傳值] }。`,
    input: z.strictObject({
      ops: z
        .array(
          z.strictObject({
            tool: z.string().min(1).describe("工具名稱，例如 add_text"),
            args: z.record(z.string(), z.unknown()).optional().describe('那個工具的參數；值可以是 { "$ref": "0.id" }'),
          }),
        )
        .min(1)
        .max(BATCH_OPS_MAX)
        .describe("依序執行的操作"),
    }),
    readOnly: false,
  },
  undo: {
    title: "復原",
    description: "復原上一步，和使用者按 Ctrl+Z 相同：復原的是文件最近的一個變更，不論是 AI 還是使用者做的。沒有可以復原的步驟時回錯誤。",
    input: z.strictObject({}),
    readOnly: false,
  },
  redo: {
    title: "重做",
    description: "重做上一個被復原的步驟，和使用者按 Ctrl+Y 相同。沒有可以重做的步驟時回錯誤。",
    input: z.strictObject({}),
    readOnly: false,
  },
} satisfies Record<string, ToolDefinition>;

export type ToolName = keyof typeof TOOL_DEFINITIONS;

export type ToolArgs<Name extends ToolName> = z.output<(typeof TOOL_DEFINITIONS)[Name]["input"]>;

export const TOOL_NAMES = Object.keys(TOOL_DEFINITIONS) as readonly ToolName[];

/**
 * Whether a string is the name of a tool.
 *
 * Args:
 *   name: Tool name from the MCP client.
 *
 * Returns:
 *   True when `TOOL_DEFINITIONS` has it.
 */
export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_DEFINITIONS, name);
}
