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
import { TEXT_STYLE_NAME_MAX_LENGTH } from "@/lib/editor/style-sheet";
import {
  DOCUMENT_NAME_MAX_LENGTH,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  PAGE_NAME_MAX_LENGTH,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  TEXT_SHADOW_OFFSET_MAX,
} from "@/lib/editor/validation";
import { COMMAND_IDS, type CommandId } from "@/lib/menu/commands";

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
const coordinate = z.number().min(-COORDINATE_LIMIT_PT).max(COORDINATE_LIMIT_PT);
const length = z.number().min(MIN_ELEMENT_SIZE_PT).max(COORDINATE_LIMIT_PT);
const rotation = z.number().min(-360).max(360).describe("旋轉角度（度，順時針，繞外框左上角）");

/** Font names a tool accepts (the property panel's 字體 menu); mapped to CSS families in `edits.ts`. */
export const FONT_NAMES = FONT_OPTIONS.map((option) => option.label) as [string, ...string[]];

export const SHAPE_KINDS = ["rect", "roundedRect", "ellipse", "triangle", "star"] as const satisfies readonly ShapeKind[];

const textStyleShape = {
  fontSize: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).describe("字級（pt）"),
  font: z.enum(FONT_NAMES).describe("字體"),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  strikethrough: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  textColor: elementColor.describe("文字顏色，#rrggbb 或 #rrggbbaa"),
  shadow: z
    .strictObject({
      color: elementColor,
      offsetX: z.number().min(-TEXT_SHADOW_OFFSET_MAX).max(TEXT_SHADOW_OFFSET_MAX),
      offsetY: z.number().min(-TEXT_SHADOW_OFFSET_MAX).max(TEXT_SHADOW_OFFSET_MAX),
    })
    .nullable()
    .describe("文字硬陰影（不模糊，偏移以頁面方向為準，pt）；null = 沒有陰影"),
};

/** Optional text style arguments (text elements, the text inside shapes). */
export const textStyleInput = z.strictObject(textStyleShape).partial();
export type TextStyleInput = z.output<typeof textStyleInput>;

const stroke = z
  .strictObject({
    color: elementColor,
    width: z.number().min(STROKE_WIDTH_MIN).max(STROKE_WIDTH_MAX).describe("線寬（pt），畫在外框線中心"),
    dash: z.enum(["solid", "dashed", "dotted"]),
  })
  .nullable()
  .describe("邊框；null = 沒有邊框");

const verticalAlign = z.enum(["top", "middle", "bottom"]).describe("圖形內文字的垂直對齊");

const styleRef = z.string().min(1).describe("文字樣式的名稱或 id（由 list_text_styles 取得）");
const styleName = z.string().min(1).max(TEXT_STYLE_NAME_MAX_LENGTH * 2);

const STYLE_LINK_HELP =
  "style：連到文字樣式（名稱或 id），文字先取樣式的值，再套用這次給的樣式欄位（和樣式不同的欄位就是覆寫；之後改樣式時覆寫的欄位不跟著變）。";

const STYLE_HELP =
  "文字樣式欄位（都可省略）：fontSize、font（黑體 / 明體 / 楷體 / 圓體）、bold、italic、underline、strikethrough、align（left / center / right）、textColor、shadow。";

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
      "列出一個頁面或主頁上的物件，由最底層到最上層：id、類型（text / shape / image）、位置與尺寸（pt，外框旋轉前的左上角）、旋轉角度、文字摘要（最多 80 字）。省略 pageId 時是使用者正在看的頁面。不含主頁帶來的物件與頁碼。",
    input: z.strictObject({ pageId: pageId.optional() }),
    readOnly: true,
  },
  get_element: {
    title: "物件內容",
    description: "取得單一物件的完整欄位，以及它所在的頁面 id 與圖層位置（0 = 最底層）。頁面與主頁上的物件都找得到。",
    input: z.strictObject({ id: elementId }),
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
    description: `在頁面加一個文字物件（放在最上層），回傳新物件的 id。x / y 是文字框左上角（pt），width 是換行寬度（預設 280），高度跟著文字。省略 pageId = 使用者正在看的頁面；指定別頁不會切換使用者的畫面。沒有 style 時的預設：黑體 11 pt、靠左、#171717，不連到樣式。${STYLE_LINK_HELP}${STYLE_HELP} 一次呼叫 = 一筆復原紀錄。`,
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
    description: `在頁面加一個圖形（放在最上層），回傳新物件的 id。shape：rect 矩形、roundedRect 圓角矩形、ellipse 橢圓、triangle 三角形、star 星形；圖形撐滿 x / y / width / height 指定的外框（pt）。預設填色 #64748b、沒有邊框。text 是圖形內的文字（預設置中、垂直置中），${STYLE_HELP.replace("文字樣式欄位", "它的樣式欄位")} style 讓圖形內文字連到文字樣式（需要同時給 text）。省略 pageId = 使用者正在看的頁面。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      pageId: pageId.optional(),
      shape: z.enum(SHAPE_KINDS),
      x: coordinate,
      y: coordinate,
      width: length,
      height: length,
      rotation: rotation.optional(),
      fill: elementColor.optional().describe("填色，#rrggbb 或 #rrggbbaa（#00000000 = 透明）"),
      stroke: stroke.optional(),
      text: z.string().min(1).max(TEXT_MAX_LENGTH).optional().describe("圖形內的文字，\\n 換行"),
      style: styleRef.optional(),
      verticalAlign: verticalAlign.optional(),
      ...textStyleInput.shape,
    }),
    readOnly: false,
  },
  update_element: {
    title: "修改物件",
    description: `修改一個物件（頁面或主頁上的都可以，用 id 找），只改有給的欄位，回傳是否有變更。位置與尺寸：x、y、width、height（文字物件沒有 height）、rotation。文字物件：text 與文字樣式。圖形：fill、stroke、cornerRadius（只有矩形）、text（圖形內文字，空字串 = 移除）、verticalAlign 與文字樣式（套用在圖形內文字）。圖片只能改位置與尺寸。${STYLE_HELP} 給了不屬於該物件類型的欄位會回錯誤、不做修改。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({
      id: elementId,
      x: coordinate.optional(),
      y: coordinate.optional(),
      width: length.optional(),
      height: length.optional(),
      rotation: rotation.optional(),
      text: z.string().max(TEXT_MAX_LENGTH).optional().describe("文字內容；圖形的空字串 = 移除圖形內文字"),
      fill: elementColor.optional().describe("圖形填色"),
      stroke: stroke.optional(),
      cornerRadius: z.number().min(0).max(COORDINATE_LIMIT_PT).optional().describe("矩形圓角（pt），超過短邊一半時取一半"),
      verticalAlign: verticalAlign.optional(),
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
      background: pageColor.optional().describe("主頁背景，#rrggbb；只在編輯主頁時看到，也是之後套用它的新頁面的預設背景"),
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
      "列出文件的文字樣式（樣式表）：id、名稱、樣式欄位（同 add_text 的 font / fontSize / bold / italic / underline / strikethrough / align / textColor / shadow）與連到它的文字數（文字物件與圖形內文字，含主頁）。文字連到樣式後，改樣式時沒被覆寫的欄位會跟著變。",
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
  rename_page: {
    title: "頁面改名",
    description: `修改頁面或主頁的名稱（最多 ${PAGE_NAME_MAX_LENGTH} 字，前後空白會去掉）。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({ pageId, name: z.string().min(1).max(PAGE_NAME_MAX_LENGTH * 2) }),
    readOnly: false,
  },
  set_page_background: {
    title: "頁面背景色",
    description: "設定頁面或主頁的背景色（#rrggbb，不能透明）。主頁的背景不會套到使用它的頁面上（每頁有自己的背景）。一次呼叫 = 一筆復原紀錄。",
    input: z.strictObject({ pageId, color: pageColor }),
    readOnly: false,
  },
  rename_document: {
    title: "文件改名",
    description: `修改文件名稱（最多 ${DOCUMENT_NAME_MAX_LENGTH} 字）。一次呼叫 = 一筆復原紀錄。`,
    input: z.strictObject({ name: z.string().min(1).max(DOCUMENT_NAME_MAX_LENGTH * 2) }),
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
