import type { ComponentType } from "react";
import type { SettingsPageId } from "@/lib/preferences/settings-pages";
import { GridDialog } from "./grid-dialog";
import { PageNumbersDialog } from "./page-numbers-dialog";
import { PageSetupDialog } from "./page-setup-dialog";
import type { SettingsDialogProps } from "./settings-dialog";

/** The dialog of every settings page (設定 → 文件 / 偏好設定); a missing page fails to compile. */
export const SETTINGS_DIALOGS = {
  pageSetup: PageSetupDialog,
  pageNumbers: PageNumbersDialog,
  grid: GridDialog,
} satisfies Record<SettingsPageId, ComponentType<SettingsDialogProps>>;
