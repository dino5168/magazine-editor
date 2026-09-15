import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { isHexColor } from "@/lib/editor/validation";

interface ColorInputProps {
  readonly value: string;
  readonly label: string;
  readonly onCommit: (color: string) => void;
  readonly className?: string;
}

/**
 * Native color picker that commits only when the picker is closed.
 *
 * React 的 onChange 對應 input 事件，拖曳選色時會連續觸發並塞滿 undo 歷史；
 * 因此改聽原生 change 事件，只在確定顏色時寫入一次。
 *
 * Args:
 *   props: Current color, accessible label and commit callback.
 *
 * Returns:
 *   Color input element.
 */
export function ColorInput({ value, label, onCommit, className }: ColorInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const handleChange = (): void => {
      if (isHexColor(input.value)) onCommitRef.current(input.value);
    };
    input.addEventListener("change", handleChange);
    return () => input.removeEventListener("change", handleChange);
  }, [value]);

  return (
    <input
      // uncontrolled：外部值改變時以 key 重建，確保顯示最新顏色
      key={value}
      ref={ref}
      type="color"
      defaultValue={value}
      aria-label={label}
      title={label}
      className={cn(
        "h-7 w-9 cursor-pointer rounded-md border border-border bg-background p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0",
        className,
      )}
    />
  );
}
