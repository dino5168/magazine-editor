/**
 * MCP 工具的定義：名稱、說明與參數 schema 的單一資料來源。
 *
 * 參數 schema 同時用來產生 MCP 的 JSON Schema（`mcp-tools.ts` → `src-tauri/mcp-tools.json`，
 * 橋接程式內嵌）與執行時驗證（`run-tool.ts`）。說明是寫給 AI 看的，要講清楚單位與限制。
 */
import { z } from "zod";

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
