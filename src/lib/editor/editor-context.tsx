import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import {
  createInitialState,
  editorReducer,
  selectActivePage,
  type EditorAction,
  type EditorState,
} from "./editor-reducer";
import type { Sheet } from "./types";

// state 與 dispatch 分開：只 dispatch 的元件（如面板按鈕）不會因狀態變化而重新 render
const EditorStateContext = createContext<EditorState | null>(null);
const EditorDispatchContext = createContext<Dispatch<EditorAction> | null>(null);

interface EditorProviderProps {
  readonly children: ReactNode;
  readonly initialState?: EditorState;
}

/**
 * Provides editor state and dispatch to the subtree.
 *
 * Args:
 *   props.children: Editor UI.
 *   props.initialState: Optional initial state; defaults to the sample document.
 *
 * Returns:
 *   Context providers wrapping the children.
 */
export function EditorProvider({ children, initialState }: EditorProviderProps) {
  const [state, dispatch] = useReducer(editorReducer, initialState, (init) => init ?? createInitialState());
  return (
    <EditorDispatchContext.Provider value={dispatch}>
      <EditorStateContext.Provider value={state}>{children}</EditorStateContext.Provider>
    </EditorDispatchContext.Provider>
  );
}

/**
 * Reads the editor state.
 *
 * Returns:
 *   Current editor state.
 *
 * Raises:
 *   Error: When used outside `EditorProvider`.
 */
export function useEditorState(): EditorState {
  const state = useContext(EditorStateContext);
  if (state === null) throw new Error("useEditorState must be used within EditorProvider");
  return state;
}

/**
 * Reads the editor dispatch function.
 *
 * Returns:
 *   Dispatch for editor actions.
 *
 * Raises:
 *   Error: When used outside `EditorProvider`.
 */
export function useEditorDispatch(): Dispatch<EditorAction> {
  const dispatch = useContext(EditorDispatchContext);
  if (dispatch === null) throw new Error("useEditorDispatch must be used within EditorProvider");
  return dispatch;
}

/**
 * Reads the active page.
 *
 * Returns:
 *   Active page of the document.
 */
export function useActivePage(): Sheet {
  return selectActivePage(useEditorState());
}
