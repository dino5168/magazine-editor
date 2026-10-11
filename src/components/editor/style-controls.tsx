import type { ReactNode } from "react";
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Italic,
  Strikethrough,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { findFontOption, FONT_OPTIONS } from "@/lib/editor/fonts";
import { loadFontOption } from "@/lib/editor/use-fonts-ready";
import { DEFAULT_STROKE, dashPattern } from "@/lib/editor/stroke";
import {
  DEFAULT_TEXT_SHADOW,
  LETTER_SPACING_MAX,
  LETTER_SPACING_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  clampLetterSpacing,
  clampLineHeight,
  type TextSpacing,
} from "@/lib/editor/text-style";
import type { ShapeLabel, Stroke, TextShadow, TextStyle } from "@/lib/editor/types";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  TEXT_SHADOW_OFFSET_MAX,
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

const DECORATION_TOGGLES: readonly {
  readonly key: "italic" | "underline" | "strikethrough";
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { key: "italic", label: "斜體", icon: Italic },
  { key: "underline", label: "底線", icon: Underline },
  { key: "strikethrough", label: "刪除線", icon: Strikethrough },
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

type FontStyleFields = Omit<TextStyle, "align" | "lineHeight" | "letterSpacing">;

interface TextStyleFieldsProps {
  /** Part of the number fields' keys, so they reset when another element is shown. */
  readonly id: string;
  readonly style: FontStyleFields;
  readonly onChange: (patch: Partial<FontStyleFields>) => void;
  /** Alignment buttons; omitted where the alignment is decided elsewhere (page numbers). */
  readonly align?: { readonly value: TextStyle["align"]; readonly onChange: (value: TextStyle["align"]) => void };
  /** Only for the text inside shapes. */
  readonly verticalAlign?: { readonly value: ShapeLabel["verticalAlign"]; readonly onChange: (value: ShapeLabel["verticalAlign"]) => void };
  /** Line height and letter spacing; omitted for page numbers (they always use the defaults). */
  readonly spacing?: { readonly value: TextSpacing; readonly onChange: (patch: Partial<TextSpacing>) => void };
}

/** 行距的 − / ＋：每按一下 0.1 倍；字距：每按一下 10‰ */
const LINE_HEIGHT_STEP = { size: 0.1, min: LINE_HEIGHT_MIN, max: LINE_HEIGHT_MAX } as const;
const LETTER_SPACING_STEP = { size: 10, min: LETTER_SPACING_MIN, max: LETTER_SPACING_MAX } as const;

/**
 * Font, font size, optional line height / letter spacing, bold / italic / underline /
 * strikethrough, optional alignment, color and shadow.
 *
 * Args:
 *   props: Current style, change callback and the optional alignment controls.
 *
 * Returns:
 *   The controls, without a surrounding section.
 */
export function TextStyleFields({ id, style, onChange, align, verticalAlign, spacing }: TextStyleFieldsProps) {
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
      {spacing && (
        <>
          <NumberField
            key={`${id}-lh-${spacing.value.lineHeight}`}
            label="行距"
            unit="倍"
            value={spacing.value.lineHeight}
            step={LINE_HEIGHT_STEP}
            onCommit={(value) => spacing.onChange({ lineHeight: clampLineHeight(value) })}
          />
          <NumberField
            key={`${id}-ls-${spacing.value.letterSpacing}`}
            label="字距"
            unit="‰"
            value={spacing.value.letterSpacing}
            step={LETTER_SPACING_STEP}
            onCommit={(value) => spacing.onChange({ letterSpacing: clampLetterSpacing(value) })}
          />
        </>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <IconButton
          label="粗體"
          aria-pressed={style.fontStyle === "bold"}
          className={cn(style.fontStyle === "bold" && "bg-muted")}
          onClick={() => onChange({ fontStyle: style.fontStyle === "bold" ? "normal" : "bold" })}
        >
          <Bold />
        </IconButton>
        {DECORATION_TOGGLES.map(({ key, label, icon: Icon }) => (
          <IconButton
            key={key}
            label={label}
            aria-pressed={style[key]}
            className={cn(style[key] && "bg-muted")}
            onClick={() => onChange({ [key]: !style[key] })}
          >
            <Icon />
          </IconButton>
        ))}
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
      <ShadowFields id={id} shadow={style.shadow} onChange={(shadow) => onChange({ shadow })} />
    </>
  );
}

/** 陰影偏移的 − / ＋：每按一下 0.5 pt */
const SHADOW_OFFSET_STEP = { size: 0.5, min: -TEXT_SHADOW_OFFSET_MAX, max: TEXT_SHADOW_OFFSET_MAX } as const;

const clampShadowOffset = (value: number) => clamp(value, -TEXT_SHADOW_OFFSET_MAX, TEXT_SHADOW_OFFSET_MAX);

// 硬陰影：開關 + 顏色 + 水平 / 垂直偏移（方向以頁面為準，物件旋轉時不跟著轉）
function ShadowFields({
  id,
  shadow,
  onChange,
}: {
  readonly id: string;
  readonly shadow: TextShadow | null;
  readonly onChange: (shadow: TextShadow | null) => void;
}) {
  const setShadow = (patch: Partial<TextShadow>) => shadow && onChange({ ...shadow, ...patch });
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <Switch size="sm" checked={shadow !== null} onCheckedChange={(on) => onChange(on ? DEFAULT_TEXT_SHADOW : null)} />
        陰影
      </label>
      {shadow && (
        <>
          <Row label="陰影顏色">
            <ColorPicker value={shadow.color} label="陰影顏色" onCommit={(color) => setShadow({ color })} />
          </Row>
          <NumberField
            key={`${id}-shadow-x-${shadow.offsetX}`}
            label="水平"
            unit="pt"
            value={shadow.offsetX}
            step={SHADOW_OFFSET_STEP}
            onCommit={(offsetX) => setShadow({ offsetX: clampShadowOffset(offsetX) })}
          />
          <NumberField
            key={`${id}-shadow-y-${shadow.offsetY}`}
            label="垂直"
            unit="pt"
            value={shadow.offsetY}
            step={SHADOW_OFFSET_STEP}
            onCommit={(offsetY) => setShadow({ offsetY: clampShadowOffset(offsetY) })}
          />
        </>
      )}
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

/** How the width field of `LineStyleFields` reads and limits its value. */
export interface LineWidthField {
  readonly label: string;
  readonly unit: string;
  /** Turns a typed or stepped value into a valid width (clamp, round). */
  readonly normalize: (width: number) => number;
  /** − / ＋ buttons; omitted = plain input. */
  readonly step?: { readonly size: number; readonly min: number; readonly max: number };
}

interface LineStyleFieldsProps {
  /** Part of the width field's key. */
  readonly id: string;
  /** Color, width and dash of the line (an element border or a canvas guide line). */
  readonly value: Stroke;
  readonly onChange: (next: Stroke) => void;
  /** Accessible name of the color button, e.g. "邊框顏色". */
  readonly colorLabel: string;
  /** Accessible name of the dash menu; give each one its own when a form has several. */
  readonly dashLabel?: string;
  readonly width: LineWidthField;
}

/**
 * Color, width and dash style of a line: element borders (property panel, page numbers) and the
 * canvas guide lines (格線與參考線 dialog) use the same controls.
 *
 * Args:
 *   props: Current style, change callback, control names and the width field settings.
 *
 * Returns:
 *   The controls, without a surrounding section.
 */
export function LineStyleFields({ id, value, onChange, colorLabel, dashLabel = "線條樣式", width }: LineStyleFieldsProps) {
  const set = (patch: Partial<Stroke>) => onChange({ ...value, ...patch });
  return (
    <>
      <Row label="顏色">
        <ColorPicker value={value.color} label={colorLabel} onCommit={(color) => set({ color })} />
      </Row>
      <NumberField
        key={`${id}-width-${value.width}`}
        label={width.label}
        unit={width.unit}
        value={value.width}
        step={width.step}
        onCommit={(next) => set({ width: width.normalize(next) })}
      />
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-xs text-muted-foreground">樣式</span>
        <Select value={value.dash} onValueChange={(dash) => set({ dash: dash as Stroke["dash"] })}>
          <SelectTrigger size="sm" className="h-7 flex-1" aria-label={dashLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DASH_OPTIONS.map(({ value: dash, label }) => (
              <SelectItem key={dash} value={dash}>
                <DashPreview dash={dash} />
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// 物件邊框的線寬：pt，不跟著縮放
const STROKE_WIDTH_FIELD: LineWidthField = {
  label: "線寬",
  unit: "pt",
  normalize: (width) => clamp(width, STROKE_WIDTH_MIN, STROKE_WIDTH_MAX),
};

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
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <Switch size="sm" checked={stroke !== null} onCheckedChange={(on) => onChange(on ? DEFAULT_STROKE : null)} />
        {switchLabel}
      </label>
      {stroke && (
        <LineStyleFields id={`${id}-stroke`} value={stroke} onChange={onChange} colorLabel="邊框顏色" width={STROKE_WIDTH_FIELD} />
      )}
    </>
  );
}
