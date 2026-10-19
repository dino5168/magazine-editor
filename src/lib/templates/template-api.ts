import { callCommand } from "@/lib/project/project-api";
import type { OpenedProject, ProjectContent } from "@/lib/project/project-types";
import type { SavedTemplate, TemplateEntry, TemplateMeta } from "./types";

/** Thin wrappers around the Rust template commands (`commands/templates.rs`); templates go by id. */
export const templateApi = {
  list: () => callCommand<TemplateEntry[]>("template_list"),
  /** Saves `content` as a new template; font and image files come from the current project. */
  create: (name: string, description: string, content: ProjectContent) =>
    callCommand<SavedTemplate>("template_create", { name, description, content }),
  /** Replaces a template's content with the current project's, keeping its name. */
  replace: (id: string, content: ProjectContent) => callCommand<SavedTemplate>("template_replace", { id, content }),
  updateInfo: (id: string, name: string, description: string) =>
    callCommand<TemplateMeta>("template_update_info", { id, name, description }),
  delete: (id: string) => callCommand<null>("template_delete", { id }),
  /** Creates an untitled project from a template and makes it the current project. */
  newProject: (id: string) => callCommand<OpenedProject>("project_new_from_template", { id }),
};
