import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { validateName } from "@/lib/editor/validation";

interface InlineNameInputProps {
  readonly initialValue: string;
  readonly maxLength: number;
  readonly label: string;
  readonly onCommit: (name: string) => void;
  readonly onCancel: () => void;
  readonly className?: string;
}

/**
 * Inline text input for renaming; Enter/blur commits, Esc cancels.
 *
 * Args:
 *   props: Initial value, validation limit and callbacks.
 *
 * Returns:
 *   Auto-focused input.
 */
export function InlineNameInput({ initialValue, maxLength, label, onCommit, onCancel, className }: InlineNameInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  const [value, setValue] = useState(initialValue);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (commit: boolean): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (!commit) {
      onCancel();
      return;
    }
    const result = validateName(value, maxLength);
    if (result.error) {
      toast.error(result.error.message);
      onCancel();
      return;
    }
    onCommit(result.data);
  };

  return (
    <Input
      ref={ref}
      value={value}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") finish(true);
        else if (event.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn("h-7 text-sm", className)}
    />
  );
}
