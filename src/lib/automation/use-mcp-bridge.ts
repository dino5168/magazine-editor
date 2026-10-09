import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useEditorState } from "@/lib/editor/editor-context";
import { isDesktop, projectApi, type McpToolResponse } from "@/lib/project/project-api";
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
 *   context: Latest editor state.
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

/**
 * Runs MCP tool calls coming from Claude Code (through `magazine-mcp.exe` and the app's pipe).
 *
 * Starts the pipe only after the event listener is ready, so no request goes unanswered while the
 * window loads. Desktop only; browser mode (`npm run dev`) has no pipe.
 */
export function useMcpBridge(): void {
  const state = useEditorState();
  // 事件處理只註冊一次，用 ref 讀最新的 state
  const contextRef = useRef<ToolContext>({ state });
  useEffect(() => {
    contextRef.current = { state };
  }, [state]);

  useEffect(() => {
    if (!isDesktop) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<McpRequest>(REQUEST_EVENT, ({ payload }) => {
      void projectApi.mcpRespond(payload.id, answer(payload, contextRef.current));
    }).then(async (stop) => {
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      // TODO（步驟 6）：改成依偏好設定開關
      const started = await projectApi.mcpSetEnabled(true);
      if (started.error) console.warn("MCP:", started.error.message);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
