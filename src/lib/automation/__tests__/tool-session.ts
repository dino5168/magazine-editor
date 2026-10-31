import { expect } from "vitest";
import { editorReducer, type EditorState } from "@/lib/editor/editor-reducer";
import { EMPTY_LIBRARY, type Library } from "@/lib/library/types";
import type { TextElement } from "@/lib/editor/types";
import type { TextLayout } from "@/lib/export/export-request";
import { createPlaceholderHandlers } from "@/lib/menu/commands";
import type { CommandAccess } from "../commands";
import { runTool, runToolAsync, type ToolContext } from "../run-tool";

/** Placeholder handlers everywhere; command tests build their own. */
export const NO_COMMANDS: CommandAccess = { handlers: createPlaceholderHandlers(() => {}), isChecked: () => false };

/**
 * Predictable stand-in for `measureTextLayout`: every character is 1 em wide and wraps at the
 * element's width (no letter spacing, no indents); each paragraph takes at least one line.
 */
export function fakeMeasure(element: TextElement): TextLayout {
  const perLine = Math.max(1, Math.floor(element.width / element.fontSize));
  const lines = element.text.split("\n").flatMap((paragraph) => {
    const characters = Array.from(paragraph);
    if (characters.length === 0) return [""];
    const wrapped: string[] = [];
    for (let start = 0; start < characters.length; start += perLine) wrapped.push(characters.slice(start, start + perLine).join(""));
    return wrapped;
  });
  return { lines, baseline: element.fontSize * 0.8, lineWidths: lines.map((line) => Array.from(line).length * element.fontSize) };
}

/** Stand-in for `measureLineWidth`: every character is half an em wide. */
export const fakeMeasureWidth = (text: string, style: { readonly fontSize: number }): number =>
  Array.from(text).length * style.fontSize * 0.5;

/**
 * Runs tools against a real reducer, the way `use-mcp-bridge.ts` does (apply = reduce + keep).
 *
 * Args:
 *   initial: Starting editor state.
 *   commands: Menu commands seen by the tools.
 *   library: Asset library seen by the tools (tools only read it).
 *   hooks: The call's attached file and the asset-library importer (`import_library_item`).
 *
 * Returns:
 *   Helpers to call tools (`call` like `runTool`, `callAsync` like the MCP bridge) and read the
 *   current state.
 */
export function toolSession(
  initial: EditorState,
  commands: CommandAccess = NO_COMMANDS,
  library: Library = EMPTY_LIBRARY,
  hooks: Pick<ToolContext, "attachedFile" | "importFile"> = {},
) {
  let state = initial;
  const apply = (action: Parameters<typeof editorReducer>[1]) => {
    const next = editorReducer(state, action);
    if (next === state) return null;
    state = next;
    return next;
  };
  const context = (): ToolContext => ({ state, library, commands, apply, measure: fakeMeasure, measureWidth: fakeMeasureWidth, ...hooks });
  const call = (name: string, args?: unknown) => runTool(name, args, context());
  const callAsync = (name: string, args?: unknown) => runToolAsync(name, args, context());
  return {
    get state() {
      return state;
    },
    call,
    callAsync,
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
