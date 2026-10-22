/**
 * 執行一次 MCP 工具呼叫：找工具 → 驗證參數 → 執行，結果一律是 `Result`（錯誤訊息給 AI 看）。
 */
import { z } from "zod";
import type { EditorState } from "@/lib/editor/editor-reducer";
import type { Result } from "@/lib/editor/validation";
import type { Library } from "@/lib/library/types";
import type { ImportFileOptions, ImportedItem } from "@/lib/library/use-library-import";
import { runBatch } from "./batch";
import { importLibraryItem } from "./imports";
import { listCommands, runCommand, type CommandAccess } from "./commands";
import {
  addLine,
  addMaster,
  addPage,
  addShape,
  addSwatch,
  addText,
  addTextStyle,
  applyTextStyle,
  deleteElements,
  deleteSwatch,
  deleteTextStyle,
  placeLibraryItem,
  renameDocument,
  renamePage,
  setPageBackground,
  setPageMaster,
  stepHistory,
  updateElement,
  updateSwatch,
  updateTextStyle,
  type ApplyAction,
} from "./edits";
import {
  getDocumentSummary,
  getElementDetail,
  listElements,
  listLibraryItems,
  listPages,
  listFonts,
  listShapes,
  listSwatches,
  listTextStyles,
} from "./queries";
import { TOOL_DEFINITIONS, isToolName, type ToolArgs, type ToolName } from "./tool-definitions";

/** What a tool can see and do. */
export interface ToolContext {
  readonly state: EditorState;
  /** The project's asset library (read only; tools never change it). */
  readonly library: Library;
  readonly commands: CommandAccess;
  /** Dispatches one action (= one undo step) and reports the resulting state. */
  readonly apply: ApplyAction;
  /**
   * The file this call names, read by Rust (`mcp_take_attachment`); only `import_library_item`
   * calls have one. Absent in tests and batches.
   */
  readonly attachedFile?: (() => Promise<Result<File>>) | null;
  readonly importFile?: ImportFileFn;
}

/** Imports one file into the asset library (`useLibraryImport().importFile`). */
export type ImportFileFn = (file: File, options: ImportFileOptions) => Promise<Result<ImportedItem>>;

/** Tools that wait for the app (file I/O); they run through `runToolAsync` only, never in a batch. */
type AsyncToolName = Extract<ToolName, "import_library_item">;
type SyncToolName = Exclude<ToolName, AsyncToolName>;

type ToolHandlers = { readonly [Name in SyncToolName]: (args: ToolArgs<Name>, context: ToolContext) => Result<unknown> };
type AsyncToolHandlers = {
  readonly [Name in AsyncToolName]: (args: ToolArgs<Name>, context: ToolContext) => Promise<Result<unknown>>;
};

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

const HANDLERS: ToolHandlers = {
  get_document: (_args, { state }) => ok(getDocumentSummary(state)),
  list_pages: (_args, { state }) => ok(listPages(state)),
  list_elements: ({ pageId }, { state }) => listElements(state, pageId),
  get_element: ({ id }, { state, library }) => getElementDetail(state, library, id),
  list_commands: (_args, { commands }) => ok(listCommands(commands)),
  run_command: ({ id }, { commands }) => runCommand(commands, id),
  add_text: (args, { state, apply }) => addText(state, apply, args),
  add_shape: (args, { state, library, apply }) => addShape(state, library, apply, args),
  add_line: (args, { state, apply }) => addLine(state, apply, args),
  update_element: (args, { state, library, apply }) => updateElement(state, library, apply, args),
  delete_elements: (args, { state, apply }) => deleteElements(state, apply, args),
  add_page: (args, { state, apply }) => addPage(state, apply, args),
  add_master: (args, { state, apply }) => addMaster(state, apply, args),
  set_page_master: (args, { state, apply }) => setPageMaster(state, apply, args),
  list_text_styles: (_args, { state }) => ok(listTextStyles(state)),
  add_text_style: (args, { state, apply }) => addTextStyle(state, apply, args),
  update_text_style: (args, { state, apply }) => updateTextStyle(state, apply, args),
  delete_text_style: (args, { state, apply }) => deleteTextStyle(state, apply, args),
  apply_text_style: (args, { state, apply }) => applyTextStyle(state, apply, args),
  list_shapes: () => ok(listShapes()),
  list_fonts: (_args, { state }) => ok(listFonts(state)),
  list_swatches: (_args, { state }) => ok(listSwatches(state)),
  add_swatch: (args, { state, apply }) => addSwatch(state, apply, args),
  update_swatch: (args, { state, apply }) => updateSwatch(state, apply, args),
  delete_swatch: (args, { state, apply }) => deleteSwatch(state, apply, args),
  list_library_items: (args, { library }) => listLibraryItems(library, args),
  place_library_item: (args, { state, library, apply }) => placeLibraryItem(state, library, apply, args),
  rename_page: (args, { state, apply }) => renamePage(state, apply, args),
  set_page_background: (args, { state, apply }) => setPageBackground(state, apply, args),
  rename_document: (args, { apply }) => renameDocument(apply, args),
  batch: ({ ops }, context) => runBatch(ops, context, runTool),
  undo: (_args, { apply }) => stepHistory(apply, "undo"),
  redo: (_args, { apply }) => stepHistory(apply, "redo"),
};

const ASYNC_HANDLERS: AsyncToolHandlers = {
  import_library_item: (args, context) => importLibraryItem(context.library, context, args),
};

function isAsyncToolName(name: ToolName): name is AsyncToolName {
  return Object.prototype.hasOwnProperty.call(ASYNC_HANDLERS, name);
}

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
  if (isAsyncToolName(name)) return { data: null, error: new Error(`「${name}」要單獨呼叫，不能放進 batch`) };
  const parsed = parseArgs(name, args);
  if (parsed.error) return parsed;
  // name 與 parsed.data 來自同一個工具；TypeScript 無法把兩者關聯起來
  const handler = HANDLERS[name] as (args: unknown, context: ToolContext) => Result<unknown>;
  return handler(parsed.data, context);
}

/**
 * Runs one tool call from the MCP bridge: tools that wait for the app (`import_library_item`) are
 * awaited, all others run like `runTool`.
 *
 * Args:
 *   name: Tool name from the MCP client (untrusted).
 *   args: Arguments from the MCP client (untrusted); `undefined` counts as `{}`.
 *   context: Editor state and app hooks.
 *
 * Returns:
 *   The tool's JSON result, or an error explaining what to fix.
 */
export async function runToolAsync(name: string, args: unknown, context: ToolContext): Promise<Result<unknown>> {
  if (!isToolName(name) || !isAsyncToolName(name)) return runTool(name, args, context);
  const parsed = parseArgs(name, args);
  if (parsed.error) return parsed;
  const handler = ASYNC_HANDLERS[name] as (args: unknown, context: ToolContext) => Promise<Result<unknown>>;
  return handler(parsed.data, context);
}

function parseArgs(name: ToolName, args: unknown): Result<unknown> {
  const parsed = TOOL_DEFINITIONS[name].input.safeParse(args ?? {}, { error: localeError });
  return parsed.success ? { data: parsed.data, error: null } : { data: null, error: new Error(describeIssues(parsed.error)) };
}
