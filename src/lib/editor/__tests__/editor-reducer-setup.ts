import { DEFAULT_MARGINS, createPage } from "../element-factory";
import { createInitialState, editorReducer, type EditorAction, type EditorState } from "../editor-reducer";
import type { EditorDocument } from "../types";

export function blankState(): EditorState {
  const document: EditorDocument = {
    name: "測試文件",
    margins: DEFAULT_MARGINS,
    textStyles: [],
    swatches: [], fonts: [],
    pageNumberRules: [],
    masters: [],
    pages: [createPage("Page-1", { width: 595, height: 842 }, "#ffffff")],
  };
  return createInitialState(document);
}

export function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}
