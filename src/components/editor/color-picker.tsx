import { useState, type CSSProperties } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { swatchColor } from "@/lib/editor/swatches";
import { useDocumentSwatches } from "./document-swatches";
import {
  FAMILY_PREVIEW_STEP,
  PALETTE_BASICS,
  PALETTE_FAMILIES,
  colorAlpha,
  findPaletteColor,
  getPaletteHex,
  withAlpha,
  type PaletteFamilyId,
} from "@/lib/editor/palette";

interface ColorPaletteProps {
  /** `#rrggbb`, or `#rrggbbaa` when `allowAlpha`. */
  readonly value: string;
  /** Swatch the color is linked to (null / omitted = none). */
  readonly swatchId?: string | null;
  readonly label: string;
  /**
   * Called with the picked color and its swatch link: a document swatch links it, a Tailwind color
   * unlinks it (null), the opacity slider keeps the current link.
   */
  readonly onCommit: (color: string, swatchId: string | null) => void;
  /** Shows the opacity slider. Page backgrounds are paper and stay opaque. */
  readonly allowAlpha?: boolean;
  /** Called with the in-progress color while the opacity slider is dragged (null when released). */
  readonly onPreview?: (color: string | null) => void;
  /** Called right before「管理色票...」opens the swatch dialog (the popover closes itself first). */
  readonly onManageStart?: () => void;
  readonly className?: string;
}

// 半透明顏色底下的棋盤格，讓透明度看得出來
const CHECKERBOARD: CSSProperties = {
  backgroundImage: "repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%)",
  backgroundSize: "8px 8px",
};

const DEFAULT_FAMILY: PaletteFamilyId = "neutral";

function Swatch({
  color,
  label,
  selected,
  onClick,
}: {
  readonly color: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "aspect-square rounded-sm border border-foreground/10 transition-shadow hover:ring-2 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Tailwind palette: color families, their shades, and an optional opacity slider.
 *
 * 點選深淺（或黑、白）就套用，寫入一次復原歷史；透明度 slider 拖曳時只更新預覽，放開才套用
 * （和畫布「dragend 才 dispatch」同一原則）。在 `DocumentSwatchesProvider` 裡時最上面多一區「文件色票」：
 * 點色票 = 連到它（保留目前的透明度），點 Tailwind 色 = 取消連結。自訂顏色只能在色票對話框輸入。
 * 不在色票裡的既有顏色照常顯示，只是不會標示目前位置。顯示的色系在 mount 時取自目前顏色
 * （Popover 每次打開都會重新 mount）。
 *
 * Args:
 *   props: Current color, accessible label, commit callback and whether opacity is editable.
 *
 * Returns:
 *   Palette rows.
 */
export function ColorPalette({
  value,
  swatchId = null,
  label,
  onCommit,
  allowAlpha = true,
  onPreview,
  onManageStart,
  className,
}: ColorPaletteProps) {
  const choices = useDocumentSwatches();
  const linked = choices?.swatches.find((swatch) => swatch.id === swatchId);
  // 連到色票時只標示色票，不標示同色的 Tailwind 格子
  const match = linked ? null : findPaletteColor(value);
  const [family, setFamily] = useState<PaletteFamilyId>(match?.kind === "shade" ? match.family : DEFAULT_FAMILY);
  // 拖曳 slider 期間的透明度（0–100）；null 表示沒有在拖曳，顯示 value 的透明度
  const [draftPercent, setDraftPercent] = useState<number | null>(null);

  const alpha = allowAlpha ? colorAlpha(value) : 1;
  const percent = draftPercent ?? Math.round(alpha * 100);
  const shades = PALETTE_FAMILIES.find((f) => f.id === family)!.shades;

  const commit = (color: string, link: string | null): void => {
    if (color !== value || link !== swatchId) onCommit(color, link);
  };
  const pick = (hex: string): void => commit(allowAlpha ? withAlpha(hex, alpha) : hex, null);

  const matchName = linked
    ? linked.name
    : match === null
      ? "不在色票中"
      : match.kind === "basic"
        ? match.id
        : `${match.family}-${match.step}`;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted-foreground">
          {matchName}
          {allowAlpha && ` · ${percent}%`}
        </span>
      </div>

      {/* ⓪ 文件色票：點選 = 連到它，透明度保留 */}
      {choices && (
        <div className="flex flex-col gap-1.5 border-b pb-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">文件色票</span>
            {choices.onManage && (
              <button
                type="button"
                className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                onClick={() => {
                  onManageStart?.();
                  choices.onManage?.();
                }}
              >
                管理色票...
              </button>
            )}
          </div>
          {choices.swatches.length > 0 ? (
            <div className="grid grid-cols-12 gap-1" role="group" aria-label="文件色票">
              {choices.swatches.map((swatch) => (
                <Swatch
                  key={swatch.id}
                  color={swatch.color}
                  label={swatch.name}
                  selected={swatch.id === swatchId}
                  onClick={() => commit(allowAlpha ? swatchColor(value, swatch) : swatch.color, swatch.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">這份文件還沒有色票。</p>
          )}
        </div>
      )}

      {/* ① 色系：顯示各色系的 500，點選只切換下方的深淺列 */}
      <div className="grid grid-cols-12 gap-1" role="group" aria-label="色系">
        {PALETTE_FAMILIES.map((f) => (
          <Swatch
            key={f.id}
            color={getPaletteHex(f.id, FAMILY_PREVIEW_STEP)}
            label={f.id}
            selected={f.id === family}
            onClick={() => setFamily(f.id)}
          />
        ))}
        {PALETTE_BASICS.map((b) => (
          <Swatch
            key={b.id}
            color={b.hex}
            label={b.id}
            selected={match?.kind === "basic" && match.id === b.id}
            onClick={() => pick(b.hex)}
          />
        ))}
      </div>

      {/* ② 深淺：點選即套用 */}
      <div className="grid grid-cols-11 gap-1" role="group" aria-label={`${family} 深淺`}>
        {shades.map((shade) => (
          <Swatch
            key={shade.step}
            color={shade.hex}
            label={`${family}-${shade.step}`}
            selected={match?.kind === "shade" && match.family === family && match.step === shade.step}
            onClick={() => pick(shade.hex)}
          />
        ))}
      </div>

      {/* ③ 透明度：放開才套用 */}
      {allowAlpha && (
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-xs text-muted-foreground">不透明度</span>
          <Slider
            aria-label="不透明度"
            min={0}
            max={100}
            step={1}
            value={[percent]}
            onValueChange={([next]) => {
              setDraftPercent(next);
              onPreview?.(withAlpha(value, next / 100));
            }}
            onValueCommit={([next]) => {
              setDraftPercent(null);
              onPreview?.(null);
              commit(withAlpha(value, next / 100), swatchId);
            }}
          />
          <span className="w-9 shrink-0 text-right font-mono text-xs text-muted-foreground">{percent}%</span>
        </div>
      )}
    </div>
  );
}

/**
 * Swatch button that opens a `ColorPalette` in a popover (used in the selection toolbar).
 *
 * Args:
 *   props: Same as `ColorPalette`.
 *
 * Returns:
 *   Popover trigger showing the current color.
 */
export function ColorPicker({ className, ...props }: Omit<ColorPaletteProps, "onPreview" | "onManageStart">) {
  // slider 拖曳中的顏色，讓按鈕色塊即時反映；畫布要等放開才改變
  const [preview, setPreview] = useState<string | null>(null);
  // 受控：「管理色票...」開對話框前要先關掉
  const [open, setOpen] = useState(false);
  const shown = preview ?? (props.allowAlpha === false ? props.value.slice(0, 7) : props.value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPreview(null);
      }}
    >
      <PopoverTrigger
        aria-label={props.label}
        title={props.label}
        className={cn(
          "h-7 w-9 cursor-pointer rounded-md border border-border bg-background p-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
          className,
        )}
      >
        <span className="block size-full overflow-hidden rounded-sm" style={CHECKERBOARD}>
          <span className="block size-full" style={{ backgroundColor: shown }} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" aria-label={props.label}>
        <ColorPalette {...props} onPreview={setPreview} onManageStart={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
