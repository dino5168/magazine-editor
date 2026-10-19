/**
 * 文字編輯框（`contenteditable="plaintext-only"`）和文件文字之間的換算。
 *
 * Chrome 在最後一個換行後面多放一個 `\n` 當佔位，那一行才畫得出來、游標才放得上去：在「ab」後按
 * Enter 得到 `ab\n\n`；直接放 `a\n` 時最後的空行不會畫出來。所以放進去時補一個、讀出來時去一個
 * （計畫 `docs/07-Plans-物件屬性與事件/02-文字編輯框改成contenteditable-實作.md` 步驟 1 的實測）。
 */

/**
 * The editor's content for a text: one extra trailing newline when it ends with one, so that the
 * empty last line shows (as on the canvas, where `a\n` is two lines).
 *
 * Args:
 *   text: Text of the element.
 *
 * Returns:
 *   What to put into the editor.
 */
export function toEditableText(text: string): string {
  return text.endsWith("\n") ? `${text}\n` : text;
}

/**
 * The text an editor holds: its trailing newline is Chrome's placeholder, not part of the text.
 *
 * Args:
 *   content: The editor's `textContent`.
 *
 * Returns:
 *   Text of the element.
 */
export function fromEditableText(content: string): string {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}
