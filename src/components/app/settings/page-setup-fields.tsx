import type { ReactNode } from "react";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { orientationOf, withOrientation, type Orientation, type PageSetup } from "@/lib/editor/page-setup";
import type { Margins, Size } from "@/lib/editor/types";
import { MARGIN_MAX_PT, PAGE_SIZE_MAX_PT, PAGE_SIZE_MIN_PT } from "@/lib/editor/validation";
import { MmField } from "./settings-fields";

const ORIENTATIONS = [
  { value: "portrait", label: "直式", icon: RectangleVertical },
  { value: "landscape", label: "橫式", icon: RectangleHorizontal },
] as const satisfies readonly { value: Orientation; label: string; icon: unknown }[];

interface PageSetupFieldsProps {
  readonly value: PageSetup;
  readonly onChange: (next: PageSetup) => void;
  /** Heading of the paper section. */
  readonly sizeHeading: string;
  /** Shown before the 直式 / 橫式 buttons on the same row (e.g. the paper menu). */
  readonly paperPicker?: ReactNode;
  /** Shown under the width / height fields. */
  readonly sizeNote?: ReactNode;
  /** Messages from `validatePageSetup`. */
  readonly errors: readonly string[];
}

/**
 * Orientation, width / height and margin fields, shared by the 頁面設定 and 新增文件 dialogs.
 * Controlled: every change calls `onChange` with the whole draft.
 *
 * Args:
 *   props: Draft, change callback, section heading, optional paper picker / note, and errors.
 *
 * Returns:
 *   Form sections.
 */
export function PageSetupFields({ value, onChange, sizeHeading, paperPicker, sizeNote, errors }: PageSetupFieldsProps) {
  const { size, margins } = value;
  const orientation = orientationOf(size);
  const setSize = (next: Size) => onChange({ ...value, size: next });
  const sizeField = (key: keyof Size, label: string) => (
    <MmField label={label} pt={size[key]} min={PAGE_SIZE_MIN_PT} max={PAGE_SIZE_MAX_PT} onCommit={(pt) => setSize({ ...size, [key]: pt })} />
  );
  const marginField = (key: keyof Margins, label: string) => (
    <MmField
      label={label}
      pt={margins[key]}
      min={0}
      max={MARGIN_MAX_PT}
      onCommit={(pt) => onChange({ ...value, margins: { ...margins, [key]: pt } })}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs text-muted-foreground">{sizeHeading}</h3>
        <div className="flex items-center gap-2">
          {paperPicker}
          {ORIENTATIONS.map(({ value: option, label, icon: Icon }) => (
            <Button
              key={option}
              variant="outline"
              size="sm"
              aria-pressed={orientation === option}
              className={cn("h-7", orientation === option && "bg-muted")}
              onClick={() => setSize(withOrientation(size, option))}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {sizeField("width", "寬")}
          {sizeField("height", "高")}
        </div>
        {sizeNote}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs text-muted-foreground">邊界（只顯示參考線，不會輸出）</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {marginField("top", "上")}
          {marginField("bottom", "下")}
          {marginField("left", "左")}
          {marginField("right", "右")}
        </div>
      </section>
      {errors.length > 0 && (
        <ul className="text-xs text-destructive" role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
