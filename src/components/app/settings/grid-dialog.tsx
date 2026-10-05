import { useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ptToMm } from "@/lib/editor/units";
import { GRID_SPACING, type Preferences } from "@/lib/preferences/preferences";
import { usePreferences, useSetPreferences } from "@/lib/preferences/preferences-context";
import { SettingsDialog, SettingsDialogFooter, type SettingsDialogProps } from "./settings-dialog";
import { MmField, SwitchRow } from "./settings-fields";

/**
 * 設定 → 偏好設定 → 格線與參考線: grid, snapping and margin guides. App preferences (this computer,
 * not the project, no undo), written on「確定」.
 *
 * Args:
 *   props: Open state and close callback.
 *
 * Returns:
 *   Dialog element.
 */
export function GridDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange}>
      <GridForm onDone={() => onOpenChange(false)} />
    </SettingsDialog>
  );
}

function GridForm({ onDone }: { readonly onDone: () => void }) {
  const setPreferences = useSetPreferences();
  const [draft, setDraft] = useState<Preferences>(usePreferences());
  const setGrid = (patch: Partial<Preferences["grid"]>) => setDraft({ ...draft, grid: { ...draft.grid, ...patch } });

  const apply = (): void => {
    setPreferences(draft);
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>格線與參考線</DialogTitle>
        <DialogDescription>存在這台電腦，不存進專案。</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <SwitchRow label="顯示格線" checked={draft.grid.visible} onChange={(visible) => setGrid({ visible })} />
        <MmField
          label="間距"
          pt={draft.grid.spacing}
          min={GRID_SPACING.min}
          max={GRID_SPACING.max}
          step={{ size: 1, min: ptToMm(GRID_SPACING.min), max: ptToMm(GRID_SPACING.max) }}
          onCommit={(spacing) => setGrid({ spacing })}
        />
        <SwitchRow label="吸附格線" checked={draft.grid.snap} onChange={(snap) => setGrid({ snap })} />
        <SwitchRow
          label="顯示邊界參考線"
          checked={draft.showMargins}
          onChange={(showMargins) => setDraft({ ...draft, showMargins })}
        />
      </div>
      <SettingsDialogFooter onApply={apply} />
    </>
  );
}
