/**
 * `batch` 工具：一次呼叫執行多個工具操作，全部成功才套用、任何一個失敗整批退回，成功 = 一筆復原。
 *
 * 做法同 `use-mcp-bridge.ts` 的 apply：先在暫存的 state 上逐一執行（純 reducer），記下每個操作送出的
 * action；全部成功後才用一次 `history/batch` 交給真正的 apply。新 id 在暫存時就寫進 action，
 * reducer 重播得到同一個結果。
 */
import { editorReducer, isBatchableAction, type BatchableAction, type EditorState } from "@/lib/editor/editor-reducer";
import type { Result } from "@/lib/editor/validation";
import { resolveRefs } from "./batch-refs";
import type { ApplyAction } from "./edits";
import type { ToolContext } from "./run-tool";

/** Most operations in one batch. */
export const BATCH_OPS_MAX = 200;

/**
 * Tools that cannot go into a batch: nested batches, history, menu commands and importing into the
 * asset library (side effects outside the document that a failed batch cannot take back; importing
 * is also asynchronous).
 */
export const NOT_IN_BATCH: ReadonlySet<string> = new Set(["batch", "undo", "redo", "run_command", "import_library_item"]);

/** One operation: a tool name and its arguments (may hold `$ref`). */
export interface BatchOp {
  readonly tool: string;
  readonly args?: Record<string, unknown>;
}

export interface BatchResult {
  /** Each operation's result, in order. */
  readonly results: readonly unknown[];
}

/** Runs one tool call (`runTool`, passed in to avoid an import cycle). */
export type RunToolFn = (name: string, args: unknown, context: ToolContext) => Result<unknown>;

/**
 * Runs the operations of one `batch` call.
 *
 * Args:
 *   ops: Operations in order (shape checked by zod; tool names and arguments are not).
 *   context: The real tool context; only `context.apply` changes the document, once, at the end.
 *   run: `runTool`.
 *
 * Returns:
 *   Every operation's result, or the first failure (`ops[N]（tool）：…`) with the document unchanged.
 */
export function runBatch(ops: readonly BatchOp[], context: ToolContext, run: RunToolFn): Result<BatchResult> {
  let state: EditorState = context.state;
  const actions: BatchableAction[] = [];
  const results: unknown[] = [];
  const record: ApplyAction = (action) => {
    if (!isBatchableAction(action)) return null;
    const next = editorReducer(state, action);
    if (next === state) return null;
    state = next;
    actions.push(action);
    return next;
  };
  const fail = (index: number, message: string): Result<never> => ({
    data: null,
    error: new Error(`ops[${index}]（${ops[index].tool}）：${message}\n整批沒有套用，文件沒有改變。`),
  });

  for (const [index, op] of ops.entries()) {
    if (NOT_IN_BATCH.has(op.tool)) return fail(index, `不能放進 batch（${[...NOT_IN_BATCH].join("、")} 要單獨呼叫）`);
    const args = resolveRefs(op.args ?? {}, results);
    if (args.error) return fail(index, args.error.message);
    const result = run(op.tool, args.data, { ...context, state, apply: record });
    if (result.error) return fail(index, result.error.message);
    results.push(result.data);
  }

  if (actions.length > 0 && context.apply({ type: "history/batch", actions }) === null) {
    return { data: null, error: new Error("App 套用批次時沒有產生變更，文件沒有改變（請回報這個問題）。") };
  }
  return { data: { results }, error: null };
}
