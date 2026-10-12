import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useEditorState } from "@/lib/editor/editor-context";
import type { Swatch } from "@/lib/editor/types";

/** What a color palette offers besides the Tailwind colors: the document's swatches. */
export interface SwatchChoices {
  readonly swatches: readonly Swatch[];
  /** Opens the swatch dialog; absent = no 「管理色票...」 button. */
  readonly onManage?: () => void;
}

const DocumentSwatchesContext = createContext<SwatchChoices | null>(null);
const ManageSwatchesContext = createContext<(() => void) | undefined>(undefined);

/**
 * Gives the palettes inside the document's swatches. Only colors stored in the document (elements,
 * backgrounds, text styles, page numbers) are wrapped: App preferences such as the guide line
 * colors stay outside, so their palettes never show (or link to) document swatches.
 *
 * Args:
 *   props: Children, and `manage: false` inside dialogs that keep their own draft (page numbers,
 *     text styles): changing swatches under them would leave their draft colors out of date.
 *
 * Returns:
 *   Provider element.
 */
export function DocumentSwatchesProvider({ children, manage = true }: { readonly children: ReactNode; readonly manage?: boolean }) {
  const swatches = useEditorState().history.present.swatches;
  const manageHandler = useContext(ManageSwatchesContext);
  const onManage = manage ? manageHandler : undefined;
  const value = useMemo(() => ({ swatches, onManage }), [swatches, onManage]);
  return <DocumentSwatchesContext.Provider value={value}>{children}</DocumentSwatchesContext.Provider>;
}

/**
 * Supplies how to open the swatch dialog (「管理色票...」 in the palettes below it).
 *
 * Args:
 *   props: Handler and children.
 *
 * Returns:
 *   Provider element.
 */
export function ManageSwatchesProvider({ onManage, children }: { readonly onManage: () => void; readonly children: ReactNode }) {
  return <ManageSwatchesContext.Provider value={onManage}>{children}</ManageSwatchesContext.Provider>;
}

/**
 * The document swatches a palette may offer.
 *
 * Returns:
 *   The swatches and the manage handler, or null outside a `DocumentSwatchesProvider`.
 */
export function useDocumentSwatches(): SwatchChoices | null {
  return useContext(DocumentSwatchesContext);
}
