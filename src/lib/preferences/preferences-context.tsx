import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { getBrowserStorage } from "@/lib/dock/dock-storage";
import type { Preferences } from "./preferences";
import { loadPreferences, savePreferences } from "./preferences-storage";

// 和 EditorProvider 相同：值與 setter 分開，只寫入的元件不會因偏好變化而重新 render
const PreferencesContext = createContext<Preferences | null>(null);
const SetPreferencesContext = createContext<Dispatch<SetStateAction<Preferences>> | null>(null);
const SetPreviewContext = createContext<Dispatch<SetStateAction<Preferences | null>> | null>(null);

/**
 * Provides the app preferences (kept in localStorage, not in the project or undo history).
 *
 * A dialog can also set a preview: while it is set, `usePreferences` returns it, so the canvas shows
 * the draft, but it is never saved; clearing it (null) shows the real preferences again.
 *
 * Args:
 *   props.children: Subtree that reads or changes preferences.
 *
 * Returns:
 *   Context providers wrapping the children.
 */
export function PreferencesProvider({ children }: { readonly children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences(getBrowserStorage()));
  const [preview, setPreview] = useState<Preferences | null>(null);
  // 偏好只在對話框按「確定」或按下切換（例如單頁 / 雙頁）時改變，每次變化直接寫入即可；預覽值不寫入
  useEffect(() => savePreferences(getBrowserStorage(), preferences), [preferences]);
  return (
    <SetPreviewContext.Provider value={setPreview}>
      <SetPreferencesContext.Provider value={setPreferences}>
        <PreferencesContext.Provider value={preview ?? preferences}>{children}</PreferencesContext.Provider>
      </SetPreferencesContext.Provider>
    </SetPreviewContext.Provider>
  );
}

/**
 * Reads the app preferences (the preview while a dialog shows one).
 *
 * Returns:
 *   Current preferences.
 *
 * Raises:
 *   Error: When used outside `PreferencesProvider`.
 */
export function usePreferences(): Preferences {
  const preferences = useContext(PreferencesContext);
  if (preferences === null) throw new Error("usePreferences must be used within PreferencesProvider");
  return preferences;
}

/**
 * Reads the setter of the app preferences.
 *
 * Returns:
 *   State setter.
 *
 * Raises:
 *   Error: When used outside `PreferencesProvider`.
 */
export function useSetPreferences(): Dispatch<SetStateAction<Preferences>> {
  const setPreferences = useContext(SetPreferencesContext);
  if (setPreferences === null) throw new Error("useSetPreferences must be used within PreferencesProvider");
  return setPreferences;
}

/**
 * Reads the setter of the unsaved preview (null = no preview). The caller must clear it when done,
 * e.g. when its dialog unmounts.
 *
 * Returns:
 *   State setter.
 *
 * Raises:
 *   Error: When used outside `PreferencesProvider`.
 */
export function useSetPreviewPreferences(): Dispatch<SetStateAction<Preferences | null>> {
  const setPreview = useContext(SetPreviewContext);
  if (setPreview === null) throw new Error("useSetPreviewPreferences must be used within PreferencesProvider");
  return setPreview;
}
