import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconButtonProps extends ComponentProps<typeof Button> {
  /** Accessible name, also shown as tooltip. */
  readonly label: string;
}

/**
 * Ghost icon button with a tooltip.
 *
 * Args:
 *   props: Button props plus a required label.
 *
 * Returns:
 *   Button wrapped in a tooltip.
 */
export function IconButton({ label, children, variant = "ghost", size = "icon-sm", ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
