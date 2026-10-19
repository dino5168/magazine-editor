import type { EditorDocument } from "@/lib/editor/types";

// 文件範本（Rust `project/templates.rs` 是權威定義，這裡手寫對應）

/** Longest template name (characters, after trimming); same as Rust `TEMPLATE_NAME_MAX_LENGTH`. */
export const TEMPLATE_NAME_MAX_LENGTH = 50;
/** Longest template description (characters); same as Rust `TEMPLATE_DESCRIPTION_MAX_LENGTH`. */
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 200;

/** `template.json` (`TemplateMeta` in Rust). */
export interface TemplateMeta {
  readonly templateVersion: number;
  readonly name: string;
  readonly description: string;
  /** RFC 3339 UTC timestamps. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Why a listed template cannot be used (`TemplateProblem` in Rust). */
export type TemplateProblem = "unsupportedVersion" | "damaged";

/** One template from `template_list` (`TemplateEntry` in Rust). */
export interface TemplateEntry {
  readonly id: string;
  /** Absolute folder path; only used to build asset URLs for thumbnails. */
  readonly root: string;
  /** Null when `template.json` cannot be read. */
  readonly meta: TemplateMeta | null;
  /** Present only when the template can be used (`problem` is null). */
  readonly document: EditorDocument | null;
  readonly problem: TemplateProblem | null;
}

/** Result of `template_create` / `template_replace` (`SavedTemplate` in Rust). */
export interface SavedTemplate {
  readonly id: string;
  /** Referenced font or image files missing from the current project (skipped). */
  readonly missingFiles: number;
}
