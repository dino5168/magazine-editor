/**
 * 指令能不能用：固定的 `disabledReason`（`COMMANDS`）之外，有些指令看文件決定（例如匯出 PowerPoint 只給簡報尺寸）。
 * 選單、MCP 的 `list_commands` / `run_command` 都問這裡，所以三處的停用一致。
 */
import type { EditorDocument } from "@/lib/editor/types";
import { pptxExportProblem } from "@/lib/export/pptx-export";
import { getCommand, type CommandId } from "./commands";

/** Why a command cannot run now, or undefined when it can. */
export type CommandDisabledReason = (id: CommandId) => string | undefined;

/**
 * Tells why a command cannot run for this document.
 *
 * Args:
 *   id: The command.
 *   document: The document being edited (only its pages are read).
 *
 * Returns:
 *   The reason shown next to the menu label, or undefined when the command can run.
 */
export function commandDisabledReason(id: CommandId, document: Pick<EditorDocument, "pages">): string | undefined {
  const fixed = getCommand(id).disabledReason;
  if (fixed !== undefined) return fixed;
  if (id === "file.exportPptx") return pptxExportProblem(document) ?? undefined;
  return undefined;
}

/** The fixed reasons only (`COMMANDS`); for callers that have no document. */
export const staticDisabledReason: CommandDisabledReason = (id) => getCommand(id).disabledReason;
