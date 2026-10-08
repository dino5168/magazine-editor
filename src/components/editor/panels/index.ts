import type { ComponentType } from "react";
import type { PanelId } from "@/lib/dock/panels";
import { BackgroundPanel } from "./background-panel";
import { ElementsPanel } from "./elements-panel";
import { LayersPanel } from "./layers-panel";
import { LibraryPanel } from "./library-panel";
import { PagesPanel } from "./pages-panel";
import { PhotosPanel } from "./photos-panel";
import { DrawPanel } from "./placeholder-panels";
import { PropertiesPanel } from "./properties-panel";
import { TemplatesPanel } from "./templates-panel";
import { TextPanel } from "./text-panel";

/** Panel content for each tool panel; a missing entry is a compile error. */
export const PANELS = {
  templates: TemplatesPanel,
  text: TextPanel,
  photos: PhotosPanel,
  elements: ElementsPanel,
  draw: DrawPanel,
  // id 沿用 upload，使用者記住的停靠版面不會失效
  upload: LibraryPanel,
  background: BackgroundPanel,
  pages: PagesPanel,
  properties: PropertiesPanel,
  layers: LayersPanel,
} as const satisfies Record<PanelId, ComponentType>;
