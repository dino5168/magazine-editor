/**
 * 執行一次 MCP 工具呼叫：找工具 → 驗證參數 → 執行，結果一律是 `Result`（錯誤訊息給 AI 看）。
 */
import { z } from "zod";
import type { EditorState } from "@/lib/editor/editor-reducer";
import type { Result } from "@/lib/editor/validation";
import { getDocumentSummary, getElement, listElements, listPages } from "./queries";
import { TOOL_DEFINITIONS, isToolName, type ToolArgs, type ToolName } from "./tool-definitions";

/** What a tool can see; grows with the editing / command tools (later steps). */
export interface ToolContext {
  readonly state: EditorState;
}

type ToolHandlers = { readonly [Name in ToolName]: (args: ToolArgs<Name>, context: ToolContext) => Result<unknown> };

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

const HANDLERS: ToolHandlers = {
  get_document: (_args, { state }) => ok(getDocumentSummary(state)),
  list_pages: (_args, { state }) => ok(listPages(state)),
  list_elements: ({ pageId }, { state }) => listElements(state, pageId),
  get_element: ({ id }, { state }) => getElement(state, id),
};

const localeError = z.locales.zhTW().localeError;

/**
 * Turns zod issues into one message per line, prefixed with the argument path.
 *
 * Args:
 *   error: Failed parse.
 *
 * Returns:
 *   Message such as `參數 pageId：…`.
 */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `參數 ${issue.path.join(".")}：${issue.message}` : issue.message))
    .join("\n");
}

/**
 * Runs one tool call.
 *
 * Args:
 *   name: Tool name from the MCP client (untrusted).
 *   args: Arguments from the MCP client (untrusted); `undefined` counts as `{}`.
 *   context: Editor state and app hooks.
 *
 * Returns:
 *   The tool's JSON result, or an error explaining what to fix.
 */
export function runTool(name: string, args: unknown, context: ToolContext): Result<unknown> {
  if (!isToolName(name)) return { data: null, error: new Error(`沒有名為「${name}」的工具`) };
  const parsed = TOOL_DEFINITIONS[name].input.safeParse(args ?? {}, { error: localeError });
  if (!parsed.success) return { data: null, error: new Error(describeIssues(parsed.error)) };
  // name 與 parsed.data 來自同一個工具；TypeScript 無法把兩者關聯起來
  const handler = HANDLERS[name] as (args: unknown, context: ToolContext) => Result<unknown>;
  return handler(parsed.data, context);
}
