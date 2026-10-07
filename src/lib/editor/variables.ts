import { displayedPageNumber } from "./page-numbers";
import type { CanvasElement, EditorDocument, PageId } from "./types";

/**
 * Text variables: written into a text element or a shape's text, replaced by each page's value
 * when the page is drawn or exported (master pages show them as written). Only these exact
 * tokens are replaced; any other text in braces stays as it is, so no escaping is needed.
 */
export const TEXT_VARIABLES = [
  { token: "{頁碼}", label: "頁碼", description: "依頁碼設定的數字；沒有設定的頁面用第幾頁" },
  { token: "{總頁數}", label: "總頁數", description: "文件的頁數" },
  { token: "{文件名稱}", label: "文件名稱", description: "上方顯示的文件名稱" },
  { token: "{頁面名稱}", label: "頁面名稱", description: "頁籤上的名稱" },
] as const;

export type TextVariableToken = (typeof TEXT_VARIABLES)[number]["token"];

/** The values of the variables on one page. */
export type VariableValues = { readonly [T in TextVariableToken]: string };

const TOKEN_PATTERN = new RegExp(TEXT_VARIABLES.map((variable) => variable.token).join("|"), "g");

/**
 * The variable values of a page.
 *
 * Args:
 *   document: Document.
 *   pageId: The page; a master page (or an unknown id) has no values.
 *
 * Returns:
 *   Values, or null for a master page (its text shows the variables as written).
 */
export function variableValues(document: EditorDocument, pageId: PageId): VariableValues | null {
  const index = document.pages.findIndex((page) => page.id === pageId);
  if (index === -1) return null;
  return {
    "{頁碼}": String(displayedPageNumber(document.pageNumberRules, index)),
    "{總頁數}": String(document.pages.length),
    "{文件名稱}": document.name,
    "{頁面名稱}": document.pages[index].name,
  };
}

/**
 * Replaces the variables in a text.
 *
 * Args:
 *   text: Text as stored.
 *   values: The page's values.
 *
 * Returns:
 *   Text with every variable replaced.
 */
export function resolveVariables(text: string, values: VariableValues): string {
  return text.replace(TOKEN_PATTERN, (token) => values[token as TextVariableToken]);
}

/**
 * An element as drawn on a page: its text (or its shape's text) with the variables replaced.
 *
 * Args:
 *   element: Element as stored.
 *   values: The page's values.
 *
 * Returns:
 *   The same element when it has no variables, otherwise a copy with the text replaced.
 */
export function resolveElementVariables(element: CanvasElement, values: VariableValues): CanvasElement {
  if (element.type === "text") {
    const text = resolveVariables(element.text, values);
    return text === element.text ? element : { ...element, text };
  }
  if (element.type === "shape" && element.label) {
    const text = resolveVariables(element.label.text, values);
    return text === element.label.text ? element : { ...element, label: { ...element.label, text } };
  }
  return element;
}

/**
 * Elements as drawn on a page (see `resolveElementVariables`).
 *
 * Args:
 *   elements: Elements as stored.
 *   values: The page's values; null (a master page) leaves everything as written.
 *
 * Returns:
 *   The same array when nothing changes, otherwise a new array (unchanged elements keep their reference).
 */
export function resolveElementsVariables(
  elements: readonly CanvasElement[],
  values: VariableValues | null,
): readonly CanvasElement[] {
  if (values === null) return elements;
  const resolved = elements.map((element) => resolveElementVariables(element, values));
  return resolved.some((element, index) => element !== elements[index]) ? resolved : elements;
}
