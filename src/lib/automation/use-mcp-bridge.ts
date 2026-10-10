import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { editorReducer } from "@/lib/editor/editor-reducer";
import type { Library } from "@/lib/library/types";
import { describeCommandError, isDesktop, projectApi, type McpToolResponse } from "@/lib/project/project-api";
import type { CommandAccess } from "./commands";
import type { ApplyAction } from "./edits";
import { recordMcpCall, setMcpStatus } from "./mcp-status";
import { runTool, type ToolContext } from "./run-tool";

/** Payload of the `mcp://request` event (`FrontendRequest` in Rust `mcp/bridge.rs`). */
interface McpRequest {
  readonly id: number;
  readonly tool: string;
  readonly args: unknown;
}

const REQUEST_EVENT = "mcp://request";

/**
 * Answers one request; never throws, so the Rust side always gets a response.
 *
 * Args:
 *   request: Tool call from the pipe.
 *   context: Latest editor state, menu commands and `apply`.
 *
 * Returns:
 *   The response to send back.
 */
function answer(request: McpRequest, context: ToolContext): McpToolResponse {
  try {
    const result = runTool(request.tool, request.args, context);
    return result.error ? { status: "error", error: result.error.message } : { status: "ok", data: result.data ?? null };
  } catch (error) {
    return { status: "error", error: `App 執行工具時發生錯誤：${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Answer to calls that were already on their way when the user turned MCP off. */
const DISABLED_MESSAGE = "使用者已在雜誌編輯軟體關閉 Claude Code 連線（設定 → 偏好設定 → Claude Code 連線）";

/**
 * Runs MCP tool calls coming from Claude Code (through `magazine-mcp.exe` and the app's pipe).
 *
 * The pipe is open only while `enabled` (the 偏好設定 switch), and only after the event listener is
 * ready, so no request goes unanswered while the window loads. Desktop only; browser mode
 * (`npm run dev`) has no pipe.
 *
 * Args:
 *   commands: Menu command handlers and checked state, the same the menu bar uses.
 *   enabled: Whether the user allows Claude Code to connect.
 *   getLibrary: The latest asset library (`LibraryControl.getLibrary`, includes changes not rendered yet).
 */
export function useMcpBridge(commands: CommandAccess, enabled: boolean, getLibrary: () => Library): void {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  // 事件處理只註冊一次，用 ref 讀最新的值；layout effect 在 commit 當下同步更新，不會晚於下一個呼叫
  const stateRef = useRef(state);
  const commandsRef = useRef(commands);
  const getLibraryRef = useRef(getLibrary);
  useLayoutEffect(() => {
    getLibraryRef.current = getLibrary;
  }, [getLibrary]);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  useLayoutEffect(() => {
    commandsRef.current = commands;
  }, [commands]);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const [listening, setListening] = useState(false);

  // 開 / 關 pipe：listener 註冊好之後才開
  useEffect(() => {
    if (!isDesktop) {
      setMcpStatus({ state: "unsupported" });
      return;
    }
    if (!listening) return;
    let current = true;
    setMcpStatus(enabled ? { state: "starting" } : { state: "off" });
    void projectApi.mcpSetEnabled(enabled).then((result) => {
      if (!current) return;
      if (result.error) setMcpStatus({ state: "error", message: describeCommandError(result.error) });
      else if (enabled) setMcpStatus({ state: "listening", lastCall: null });
    });
    return () => {
      current = false;
    };
  }, [enabled, listening]);

  useEffect(() => {
    if (!isDesktop) return;
    // reducer 是純函式：先算出結果（工具要回報有沒有變、新的 id），再 dispatch 同一個 action。
    // 下一個呼叫可能在 React 重畫之前就到（新增後立刻修改），所以先把算好的 state 記下來。
    const apply: ApplyAction = (action) => {
      const current = stateRef.current;
      const next = editorReducer(current, action);
      if (next === current) return null;
      dispatch(action);
      stateRef.current = next;
      return next;
    };
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<McpRequest>(REQUEST_EVENT, ({ payload }) => {
      // 關掉之後 pipe 不再接新連線，但已經連上的呼叫仍可能送到
      if (!enabledRef.current) {
        void projectApi.mcpRespond(payload.id, { status: "error", error: DISABLED_MESSAGE });
        return;
      }
      const context: ToolContext = {
        state: stateRef.current,
        library: getLibraryRef.current(),
        commands: commandsRef.current,
        apply,
      };
      const response = answer(payload, context);
      recordMcpCall({ tool: payload.tool, ok: response.status === "ok", at: Date.now() });
      void projectApi.mcpRespond(payload.id, response);
    }).then((stop) => {
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      setListening(true);
    });
    return () => {
      disposed = true;
      unlisten?.();
      setListening(false);
    };
  }, [dispatch]);
}
