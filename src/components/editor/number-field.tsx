import { useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatNumber, parseNumberDraft } from "@/lib/editor/properties";
import { clamp } from "@/lib/editor/validation";
import { IconButton } from "./icon-button";

interface NumberFieldStep {
  /** Amount added / subtracted by one click on − / ＋. */
  readonly size: number;
  readonly min: number;
  readonly max: number;
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  /** Unit shown after the field, e.g. "pt" or "°". */
  readonly unit: string;
  /** Called once per edit (Enter or blur) with a finite number different from `value`. */
  readonly onCommit: (value: number) => void;
  /** Shows − / ＋ buttons on both sides of the input; each click commits once (one undo step). */
  readonly step?: NumberFieldStep;
  readonly className?: string;
}

/**
 * Number input that writes only when the edit is finished (Enter or blur), like the canvas
 * writes only on dragend: one edit = one undo step. Esc or invalid text restores the value.
 *
 * 呼叫端以 `key` 帶入目前的值（例如 `${id}-${value}`），復原或切換物件後輸入框才會跟著更新。
 *
 * Args:
 *   props: Label, current value, unit, commit callback and optional − / ＋ step.
 *
 * Returns:
 *   Labelled input.
 */
export function NumberField({ label, value, unit, onCommit, step, className }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(formatNumber(value));
  // Esc 之後的 blur 不寫入：blur 執行時 state 還是舊的草稿，不能靠 setDraft 還原
  const cancelledRef = useRef(false);

  const commit = (): void => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = parseNumberDraft(draft);
    if (next === null) {
      setDraft(formatNumber(value));
      return;
    }
    // 只比較顯示到的位數：沒改內容就離開輸入框，不會因為四捨五入寫入一筆歷史
    if (formatNumber(next) !== formatNumber(value)) onCommit(next);
  };

  // 按鈕寫入的是目前的 value（不是輸入框裡還沒確定的草稿）：按下按鈕時輸入框先 blur，草稿已經寫入
  const stepBy = (direction: 1 | -1): void => {
    if (!step) return;
    const next = clamp(value + direction * step.size, step.min, step.max);
    if (formatNumber(next) !== formatNumber(value)) onCommit(next);
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <label htmlFor={id} className="w-8 shrink-0 text-xs text-muted-foreground">
        {label}
      </label>
      {step && (
        <IconButton label={`${label}減 ${formatNumber(step.size)}`} variant="outline" disabled={value <= step.min} onClick={() => stepBy(-1)}>
          <Minus />
        </IconButton>
      )}
      <Input
        id={id}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            cancelledRef.current = true;
            setDraft(formatNumber(value));
            event.currentTarget.blur();
          }
        }}
        className={cn("h-7 min-w-0 flex-1 px-2 text-sm tabular-nums", step && "text-center")}
      />
      {step && (
        <IconButton label={`${label}加 ${formatNumber(step.size)}`} variant="outline" disabled={value >= step.max} onClick={() => stepBy(1)}>
          <Plus />
        </IconButton>
      )}
      <span className="w-4 shrink-0 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}
