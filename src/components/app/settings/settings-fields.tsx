import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NumberField } from "@/components/editor/number-field";
import { formatNumber } from "@/lib/editor/properties";
import { mmToPt, ptToMm } from "@/lib/editor/units";
import { clamp } from "@/lib/editor/validation";

// 設定對話框共用的欄位

interface MmFieldProps {
  readonly label: string;
  /** Current value in pt. */
  readonly pt: number;
  readonly min: number;
  readonly max: number;
  /** Called with the new value in pt, clamped into [min, max]. */
  readonly onCommit: (pt: number) => void;
  /** − / ＋ buttons, in mm. */
  readonly step?: { readonly size: number; readonly min: number; readonly max: number };
}

/** Number field that shows a pt value in millimetres. */
export function MmField({ label, pt, min, max, onCommit, step }: MmFieldProps) {
  const mm = ptToMm(pt);
  return (
    <NumberField
      key={formatNumber(mm)}
      label={label}
      unit="mm"
      value={mm}
      step={step}
      onCommit={(value) => onCommit(clamp(mmToPt(value), min, max))}
    />
  );
}

interface SwitchRowProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/** A label on the left and a switch on the right. */
export function SwitchRow({ label, checked, onChange }: SwitchRowProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
