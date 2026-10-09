import { expect } from "vitest";
import { editorReducer, type EditorState } from "@/lib/editor/editor-reducer";
import { createPlaceholderHandlers } from "@/lib/menu/commands";
import type { CommandAccess } from "../commands";
import { runTool } from "../run-tool";

/** Placeholder handlers everywhere; command tests build their own. */
export const NO_COMMANDS: CommandAccess = { handlers: createPlaceholderHandlers(() => {}), isChecked: () => false };

/**
 * Runs tools against a real reducer, the way `use-mcp-bridge.ts` does (apply = reduce + keep).
 *
 * Args:
 *   initial: Starting editor state.
 *   commands: Menu commands seen by the tools.
 *
 * Returns:
 *   Helpers to call tools and read the current state.
 */
export function toolSession(initial: EditorState, commands: CommandAccess = NO_COMMANDS) {
  let state = initial;
  const apply = (action: Parameters<typeof editorReducer>[1]) => {
    const next = editorReducer(state, action);
    if (next === state) return null;
    state = next;
    return next;
  };
  const call = (name: string, args?: unknown) => runTool(name, args, { state, commands, apply });
  return {
    get state() {
      return state;
    },
    call,
    /** Calls a tool that must succeed; returns its data. */
    ok(name: string, args?: unknown): any {
      const result = call(name, args);
      expect(result.error).toBeNull();
      return result.data;
    },
    /** Calls a tool that must fail; returns the message. */
    error(name: string, args?: unknown): string {
      const result = call(name, args);
      expect(result.data).toBeNull();
      return result.error!.message;
    },
  };
}
