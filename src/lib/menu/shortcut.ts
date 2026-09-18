/** Keyboard shortcut bound to a physical key. */
export interface Shortcut {
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  /**
   * `KeyboardEvent.code`（實體按鍵，例如 "KeyS"、"Comma"）。
   * 不用 `event.key`：注音等輸入法啟用時 key 可能是 "Process" 或注音符號，快捷鍵會失效。
   */
  readonly code: string;
  /** Key name shown in menus, e.g. "S" or ",". */
  readonly keyLabel: string;
}

/** Subset of `KeyboardEvent` used for matching, so tests don't need a DOM. */
export interface KeyboardEventLike {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/**
 * Checks whether a keyboard event matches a shortcut exactly (extra modifiers do not match).
 *
 * Args:
 *   event: Keyboard event.
 *   shortcut: Shortcut definition.
 *
 * Returns:
 *   True when the key and all modifiers match.
 */
export function matchesShortcut(event: KeyboardEventLike, shortcut: Shortcut): boolean {
  // metaKey 視同 Ctrl，保留跨平台可能且不增加成本
  const ctrl = event.ctrlKey || event.metaKey;
  return (
    event.code === shortcut.code &&
    ctrl === Boolean(shortcut.ctrl) &&
    event.shiftKey === Boolean(shortcut.shift) &&
    event.altKey === Boolean(shortcut.alt)
  );
}

/**
 * Formats a shortcut for display, e.g. "Ctrl+Shift+S".
 *
 * Args:
 *   shortcut: Shortcut definition.
 *
 * Returns:
 *   Human-readable shortcut text.
 */
export function formatShortcut(shortcut: Shortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt) parts.push("Alt");
  parts.push(shortcut.keyLabel);
  return parts.join("+");
}
