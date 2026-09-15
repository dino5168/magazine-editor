import { cn } from "@/lib/utils";
import {
  CloudUpload,
  Image,
  LayoutTemplate,
  Layers,
  PaintBucket,
  Pencil,
  Scaling,
  Shapes,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SiderButton {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

// 按鈕設定為單一資料來源；SiderButtonId 由此推導，面板對應表以 satisfies Record<SiderButtonId, …> 檢查完整性
export const SIDER_BUTTONS = [
  { id: "templates", label: "範本", icon: LayoutTemplate },
  { id: "text", label: "文字", icon: Type },
  { id: "photos", label: "相片", icon: Image },
  { id: "elements", label: "元素", icon: Shapes },
  { id: "draw", label: "繪圖", icon: Pencil },
  { id: "upload", label: "上傳", icon: CloudUpload },
  { id: "background", label: "背景", icon: PaintBucket },
  { id: "layers", label: "圖層", icon: Layers },
  { id: "resize", label: "尺寸", icon: Scaling },
] as const satisfies readonly SiderButton[];

export type SiderButtonId = (typeof SIDER_BUTTONS)[number]["id"];

/**
 * Returns the display label of a sider button.
 *
 * Args:
 *   id: Button id.
 *
 * Returns:
 *   Label text.
 */
export function getSiderButtonLabel(id: SiderButtonId): string {
  return SIDER_BUTTONS.find((button) => button.id === id)?.label ?? id;
}

interface AppSiderButtonProps {
  readonly className?: string;
  readonly activeId: SiderButtonId | null;
  readonly onToggle: (id: SiderButtonId) => void;
}

/**
 * Vertical tool rail (Canva-style) that toggles the side panels.
 *
 * Args:
 *   props.className: Extra classes for grid placement.
 *   props.activeId: Currently open panel, or null.
 *   props.onToggle: Called with the clicked button id.
 *
 * Returns:
 *   Navigation rail.
 */
export function AppSiderButton({ className, activeId, onToggle }: AppSiderButtonProps) {
  return (
    <nav
      aria-label="編輯工具"
      className={cn("flex flex-col gap-1 overflow-y-auto border-r bg-background py-2", className)}
    >
      {SIDER_BUTTONS.map(({ id, label, icon: Icon }) => {
        const active = activeId === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(id)}
            className={cn(
              "mx-1.5 flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-6" strokeWidth={1.5} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
