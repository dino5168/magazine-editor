import {
  CloudUpload,
  Image,
  LayoutTemplate,
  Layers,
  PaintBucket,
  Pencil,
  Shapes,
  SlidersHorizontal,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PanelId } from "@/lib/dock/panels";

/** Icon of each tool panel; a missing entry is a compile error. */
export const PANEL_ICONS = {
  templates: LayoutTemplate,
  text: Type,
  photos: Image,
  elements: Shapes,
  draw: Pencil,
  upload: CloudUpload,
  background: PaintBucket,
  properties: SlidersHorizontal,
  layers: Layers,
} as const satisfies Record<PanelId, LucideIcon>;
