/**
 * MCP 連線狀態：`use-mcp-bridge.ts` 寫入，TopBar 的狀態圖示與設定對話框讀取。
 *
 * 只是畫面上的提示，不影響文件，所以放在模組層級的小 store（`useSyncExternalStore`），
 * 不經過 React context，也不讓整個版面重畫。
 */
import { useSyncExternalStore } from "react";

export interface McpLastCall {
  readonly tool: string;
  readonly ok: boolean;
  /** `Date.now()` when the call was answered. */
  readonly at: number;
}

export type McpStatus =
  /** Browser mode (`npm run dev`): there is no pipe. */
  | { readonly state: "unsupported" }
  | { readonly state: "off" }
  | { readonly state: "starting" }
  /** The pipe is open; Claude Code can connect. */
  | { readonly state: "listening"; readonly lastCall: McpLastCall | null }
  | { readonly state: "error"; readonly message: string };

let status: McpStatus = { state: "off" };
const listeners = new Set<() => void>();

/**
 * Replaces the status and notifies the subscribers.
 *
 * Args:
 *   next: New status.
 */
export function setMcpStatus(next: McpStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

/**
 * Records a tool call while listening; ignored in any other state.
 *
 * Args:
 *   call: Tool name, whether it succeeded, and when.
 */
export function recordMcpCall(call: McpLastCall): void {
  if (status.state === "listening") setMcpStatus({ state: "listening", lastCall: call });
}

export function getMcpStatus(): McpStatus {
  return status;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current MCP status; re-renders the caller when it changes. */
export function useMcpStatus(): McpStatus {
  return useSyncExternalStore(subscribe, getMcpStatus);
}
