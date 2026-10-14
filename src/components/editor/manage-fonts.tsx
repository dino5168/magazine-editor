import { createContext, useContext, type ReactNode } from "react";

const ManageFontsContext = createContext<(() => void) | undefined>(undefined);

/**
 * Supplies how to open the font dialog (「管理字型...」 at the bottom of the font menus below it).
 * Dialogs that keep their own draft (page numbers, text styles) wrap their content in one without
 * `onManage`: changing the project fonts under them could delete a font their draft still uses.
 *
 * Args:
 *   props: Handler (absent = no 「管理字型...」) and children.
 *
 * Returns:
 *   Provider element.
 */
export function ManageFontsProvider({ onManage, children }: { readonly onManage?: () => void; readonly children: ReactNode }) {
  return <ManageFontsContext.Provider value={onManage}>{children}</ManageFontsContext.Provider>;
}

/**
 * How to open the font dialog from a font menu.
 *
 * Returns:
 *   The handler, or undefined where the menu should not offer it.
 */
export function useManageFonts(): (() => void) | undefined {
  return useContext(ManageFontsContext);
}
