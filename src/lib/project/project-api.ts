import { invoke, isTauri, type InvokeArgs } from "@tauri-apps/api/core";
import type { Result } from "@/lib/editor/validation";
import {
  CommandError,
  ERROR_KINDS,
  type AppErrorKind,
  type OpenedProject,
  type ProjectContent,
  type ProjectInfo,
} from "./project-types";

function isErrorKind(value: string): value is AppErrorKind {
  return (ERROR_KINDS as readonly string[]).includes(value);
}

/**
 * Converts whatever `invoke` rejected with into a `CommandError`.
 *
 * Args:
 *   error: Rejection value; Rust errors arrive as `{ kind, message }`.
 *
 * Returns:
 *   Typed error.
 */
export function toCommandError(error: unknown): CommandError {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    const { kind, message } = error;
    if (typeof kind === "string" && typeof message === "string" && isErrorKind(kind)) {
      return new CommandError(kind, message);
    }
  }
  return new CommandError("tauri", error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: InvokeArgs): Promise<Result<T>> {
  try {
    return { data: await invoke<T>(command, args), error: null };
  } catch (error) {
    return { data: null, error: toCommandError(error) };
  }
}

/** True inside the Tauri window; false in browser-only dev mode (`npm run dev`). */
export const isDesktop: boolean = isTauri();

/** Thin wrappers around the Rust project commands. `null` data means the user cancelled a dialog. */
export const projectApi = {
  create: () => call<ProjectInfo>("project_new"),
  openLast: () => call<OpenedProject | null>("project_open_last"),
  openDialog: () => call<OpenedProject | null>("project_open_dialog"),
  save: (content: ProjectContent) => call<null>("project_save", { content }),
  saveAsDialog: (content: ProjectContent, suggestedName: string) =>
    call<ProjectInfo | null>("project_save_as_dialog", { content, suggestedName }),
  // 以 raw body 傳送位元組，避免 JSON 陣列編碼讓 20 MB 的圖片膨脹數倍
  importAsset: (bytes: Uint8Array) => call<string>("asset_import", bytes),
};

/**
 * Returns a user-facing message for a failed project command.
 *
 * Args:
 *   error: Error from `projectApi`.
 *
 * Returns:
 *   Message in Traditional Chinese.
 */
export function describeCommandError(error: Error): string {
  if (!(error instanceof CommandError)) return error.message;
  switch (error.kind) {
    case "invalidInput":
      // 約定：Rust 端 AppError::InvalidInput 的訊息一律是給使用者看的中文
      return error.message;
    case "unsupportedVersion":
      return "這個專案由較新版本的軟體建立，請更新軟體後再開啟";
    case "invalidProject":
      return `專案檔案已損壞或格式不正確（${error.message}）`;
    case "io":
      return `讀寫檔案失敗（${error.message}）`;
    case "noProject":
      return "目前沒有開啟的專案";
    case "sqlite":
    case "lockPoisoned":
    case "tauri":
      return `發生內部錯誤（${error.message}）`;
    default: {
      const exhaustive: never = error.kind;
      return exhaustive;
    }
  }
}
