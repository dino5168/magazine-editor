import type { ReactNode } from "react";
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  type LucideIcon,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { findFontOption, FONT_OPTIONS } from "@/lib/editor/fonts";
import { loadFontOption } from "@/lib/editor/use-fonts-ready";
import { DEFAULT_STROKE, dashPattern } from "@/lib/editor/stroke";
import type { ShapeLabel, Stroke, TextStyle } from "@/lib/editor/types";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  clamp,
  clampFontSize,
} from "@/lib/editor/validation";
import { ColorPicker } from "./color-picker";
import { IconButton } from "./icon-button";
import { NumberField } from "./number-field";

// 文字樣式與邊框的編輯控制項：屬性面板與「頁碼管理」對話框共用

/** A label on the left and a control on the right. */
export function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      {children}
    </div>
  );
}

const ALIGN_OPTIONS: readonly { readonly value: TextStyle["align"]; readonly label: string; readonly icon: LucideIcon }[] = [
  { value: "left", label: "靠左對齊", icon: TextAlignStart },
  { value: "center", label: "置中對齊", icon: TextAlignCenter },
  { value: "right", label: "靠右對齊", icon: TextAlignEnd },
];

const VERTICAL_ALIGN_OPTIONS: readonly {
  readonly value: ShapeLabel["verticalAlign"];
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { value: "top", label: "靠上對齊", icon: AlignVerticalJustifyStart },
  { value: "middle", label: "垂直置中", icon: AlignVerticalJustifyCenter },
  { value: "bottom", label: "靠下對齊", icon: AlignVerticalJustifyEnd },
];

/** 文件裡的字型不在 FONT_OPTIONS（舊專案、手改的檔案）時，下拉選單顯示的值 */
const OTHER_FONT = "other";

/**
 * Font menu: the bundled fonts, each label drawn in its own font.
 *
 * The font is loaded before the change is written, so the canvas never measures the new text with
 * a fallback font (and does not blank out while it loads).
 */
export function FontFamilySelect({ value, onChange }: { readonly value: string; readonly onChange: (family: string) => void }) {
  const current = findFontOption(value);
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-8 shrink-0 text-xs text-muted-foreground">字體</span>
      <Select
        value={current?.id ?? OTHER_FONT}
        onValueChange={(id) => {
          const option = FONT_OPTIONS.find((candidate) => candidate.id === id);
          if (option) void loadFontOption(option).then(() => onChange(option.family));
        }}
      >
        <SelectTrigger size="sm" className="h-7 flex-1" aria-label="字型">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_OPTIONS.map((option) => (
            <SelectItem key={option.id} value={option.id} style={{ fontFamily: option.family }}>
              {option.label}
            </SelectItem>
          ))}
          {!current && (
            <SelectItem value={OTHER_FONT} disabled>
              其他字型
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/** 字級的 − / ＋：每按一下 1 pt */
const FONT_SIZE_STEP = { size: 1, min: FONT_SIZE_MIN, max: FONT_SIZE_MAX } as const;

type FontStyleFields = Omit<TextStyle, "align">;

interface TextStyleFieldsProps {
  /** Part of the number fields' keys, so they reset when another element is shown. */
  readonly id: string;
  readonly style: FontStyleFields;
  readonly onChange: (patch: Partial<FontStyleFields>) => void;
  /** Alignment buttons; omitted where the alignment is decided elsewhere (page numbers). */
  readonly align?: { readonly value: TextStyle["align"]; readonly onChange: (value: TextStyle["align"]) => void };
  /** Only for the text inside shapes. */
  readonly verticalAlign?: { readonly value: ShapeLabel["verticalAlign"]; readonly onChange: (value: ShapeLabel["verticalAlign"]) => void };
}

/**
 * Font, font size, bold, optional alignment and color.
 *
 * Args:
 *   props: Current style, change callback and the optional alignment controls.
 *
 * Returns:
 *   The controls, without a surrounding section.
 */
export function TextStyleFields({ id, style, onChange, align, verticalAlign }: TextStyleFieldsProps) {
  return (
    <>
      <FontFamilySelect value={style.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
      <NumberField
        key={`${id}-${style.fontSize}`}
        label="字級"
        unit="pt"
        value={style.fontSize}
        step={FONT_SIZE_STEP}
        onCommit={(size) => onChange({ fontSize: clampFontSize(size) })}
      />
      <div className="flex flex-wrap items-center gap-1">
        <IconButton
          label="粗體"
          aria-pressed={style.fontStyle === "bold"}
          className={cn(style.fontStyle === "bold" && "bg-muted")}
          onClick={() => onChange({ fontStyle: style.fontStyle === "bold" ? "normal" : "bold" })}
        >
          <Bold />
        </IconButton>
        {align && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {ALIGN_OPTIONS.map(({ value, label, icon: Icon }) => (
              <IconButton
                key={value}
                label={label}
                aria-pressed={align.value === value}
                className={cn(align.value === value && "bg-muted")}
                onClick={() => align.onChange(value)}
              >
                <Icon />
              </IconButton>
            ))}
          </>
        )}
        {verticalAlign && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {VERTICAL_ALIGN_OPTIONS.map(({ value, label, icon: Icon }) => (
              <IconButton
                key={value}
                label={label}
                aria-pressed={verticalAlign.value === value}
                className={cn(verticalAlign.value === value && "bg-muted")}
                onClick={() => verticalAlign.onChange(value)}
              >
                <Icon />
              </IconButton>
            ))}
          </>
        )}
      </div>
      <Row label="文字顏色">
        <ColorPicker value={style.fill} label="文字顏色" onCommit={(fill) => onChange({ fill })} />
      </Row>
    </>
  );
}

const DASH_OPTIONS: readonly { readonly value: Stroke["dash"]; readonly label: string }[] = [
  { value: "solid", label: "實線" },
  { value: "dashed", label: "虛線" },
  { value: "dotted", label: "點線" },
];

// 線條樣式的小預覽（用和畫布相同的虛線比例）
function DashPreview({ dash }: { readonly dash: Stroke["dash"] }) {
  const pattern = dashPattern(dash, 2);
  return (
    <svg width="40" height="6" aria-hidden className="shrink-0 text-foreground">
      <line
        x1="2"
        y1="3"
        x2="38"
        y2="3"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={pattern ? `${pattern.dash} ${pattern.gap}` : undefined}
        strokeLinecap={pattern?.roundCap ? "round" : "butt"}
      />
    </svg>
  );
}

interface StrokeFieldsProps {
  /** Part of the width field's key. */
  readonly id: string;
  readonly stroke: Stroke | null;
  readonly onChange: (stroke: Stroke | null) => void;
  /** Text next to the on / off switch. */
  readonly switchLabel: string;
}

/**
 * Border on / off, color, width and dash style.
 *
 * Args:
 *   props: Current stroke (null = none), change callback and the switch label.
 *
 * Returns:
 *   The controls, without a surrounding section.
 */
export function StrokeFields({ id, stroke, onChange, switchLabel }: StrokeFieldsProps) {
  const setStroke = (patch: Partial<Stroke>) => stroke && onChange({ ...stroke, ...patch });
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <Switch size="sm" checked={stroke !== null} onCheckedChange={(on) => onChange(on ? DEFAULT_STROKE : null)} />
        {switchLabel}
      </label>
      {stroke && (
        <>
          <Row label="顏色">
            <ColorPicker value={stroke.color} label="邊框顏色" onCommit={(color) => setStroke({ color })} />
          </Row>
          <NumberField
            key={`${id}-stroke-${stroke.width}`}
            label="線寬"
            unit="pt"
            value={stroke.width}
            onCommit={(width) => setStroke({ width: clamp(width, STROKE_WIDTH_MIN, STROKE_WIDTH_MAX) })}
          />
          <div className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-xs text-muted-foreground">樣式</span>
            <Select value={stroke.dash} onValueChange={(dash) => setStroke({ dash: dash as Stroke["dash"] })}>
              <SelectTrigger size="sm" className="h-7 flex-1" aria-label="線條樣式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DASH_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    <DashPreview dash={value} />
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </>
  );
}
