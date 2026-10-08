import { useState } from "react";
import { ChevronDown, Grid3x3, Magnet, SquareDashed, type LucideIcon } from "lucide-react";
import { MmField } from "@/components/app/settings/settings-fields";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/editor/properties";
import { ptToMm } from "@/lib/editor/units";
import { formatShortcut } from "@/lib/menu/shortcut";
import { GRID_SPACING } from "@/lib/preferences/preferences";
import { usePreferences, useSetPreferences } from "@/lib/preferences/preferences-context";
import { getViewToggle, type ViewToggleId } from "@/lib/preferences/view-toggles";
import { IconButton } from "./icon-button";

// TopBar 上的開關（尺規只在「視圖」選單）
const BUTTONS = [
  { id: "grid", icon: Grid3x3 },
  { id: "margins", icon: SquareDashed },
  { id: "snap", icon: Magnet },
] as const satisfies readonly { id: ViewToggleId; icon: LucideIcon }[];

interface ViewToggleButtonsProps {
  /** Opens the 格線與參考線 dialog (「更多設定...」). */
  readonly onOpenGridSettings: () => void;
}

/**
 * Top bar group for the canvas guides: 格線 / 邊界參考線 / 吸附格線 toggles and the grid spacing.
 * Reads and writes the same preferences as the 視圖 menu and the 格線與參考線 dialog, immediately
 * (no confirm, no undo).
 *
 * Args:
 *   props: Callback that opens the grid settings dialog.
 *
 * Returns:
 *   Button group.
 */
export function ViewToggleButtons({ onOpenGridSettings }: ViewToggleButtonsProps) {
  const preferences = usePreferences();
  const setPreferences = useSetPreferences();
  const [spacingOpen, setSpacingOpen] = useState(false);

  return (
    <div role="group" aria-label="格線與參考線" className="flex shrink-0 items-center gap-0.5">
      {BUTTONS.map(({ id, icon: Icon }) => {
        const toggle = getViewToggle(id);
        const on = toggle.read(preferences);
        const shortcut = "shortcut" in toggle ? `（${formatShortcut(toggle.shortcut)}）` : "";
        return (
          <IconButton
            key={id}
            label={`${toggle.title}${shortcut}`}
            aria-pressed={on}
            className={cn(on ? "bg-muted text-foreground" : "text-muted-foreground")}
            onClick={() => setPreferences(toggle.toggle)}
          >
            <Icon />
          </IconButton>
        );
      })}
      <Popover open={spacingOpen} onOpenChange={setSpacingOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-0.5 px-1.5 tabular-nums" aria-label="格線間距">
            {formatNumber(ptToMm(preferences.grid.spacing))} mm
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex w-64 flex-col gap-3"
          aria-label="格線間距"
          // 預設會聚焦第一個按鈕（−），它的提示蓋住欄位；直接聚焦輸入框，打開就能輸入
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <MmField
            label="間距"
            pt={preferences.grid.spacing}
            min={GRID_SPACING.min}
            max={GRID_SPACING.max}
            step={{ size: 1, min: ptToMm(GRID_SPACING.min), max: ptToMm(GRID_SPACING.max) }}
            onCommit={(spacing) => setPreferences((current) => ({ ...current, grid: { ...current.grid, spacing } }))}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSpacingOpen(false);
              onOpenGridSettings();
            }}
          >
            更多設定...
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
